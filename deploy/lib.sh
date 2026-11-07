# Shared by deploy.sh and restore.sh, which source it: where the app lives on the server and
# the steps both of them need. Every deploy copies it to /srv/prod/deploy with the rest of deploy/.
#
# Functions here check every step themselves and return 1 on failure, because callers run them
# as `fn || fail ...`, and bash ignores `set -e` inside a function called that way.

APP_DIR=/srv/prod
IMAGE=ghcr.io/vsmortimer/personal-crm
HEALTH_URL=http://127.0.0.1:3000/health
WAIT_SECONDS=120
# The version that last passed the smoke test, and the one live before the last deploy
LIVE_FILE=$APP_DIR/live-tag
PREVIOUS_FILE=$APP_DIR/previous-tag
# Every deploy and every restore saves the database here first; deploys keep the newest ones
BACKUP_DIR=$APP_DIR/backups
KEEP_BACKUPS=10

step() { printf '\n=== %s\n' "$*"; }
fail() { echo "ERROR: $*" >&2; exit 1; }

# Pass the script's arguments: they go into the hint on how to run it
require_deploy_user() {
    [ "$(id -un)" = crmdeploy ] || fail "run as crmdeploy: sudo -u crmdeploy bash $0 $*"
    cd "$APP_DIR"
    [ -s .env ] || fail "$APP_DIR/.env is empty: put the database settings there first"
}

# One deploy, rollback or restore at a time
lock() {
    exec 9>"$APP_DIR/deploy.lock"
    flock -w 900 9 || fail "another deploy or restore is still running"
}

# compose.yaml needs a tag even for commands that only touch the database
compose_with_stdin() {
    APP_TAG=$1 docker compose -p prod --env-file "$APP_DIR/.env" -f "$APP_DIR/deploy/compose.yaml" "${@:2}"
}
compose() { compose_with_stdin "$@" </dev/null; }

# A command in the running database container. It reads the caller's stdin (pg_restore takes
# the backup from it), so every call says what its stdin is
db_exec() { compose_with_stdin none exec -T db "$@"; }

read_tag() { cat "$1" 2>/dev/null || true; }

check_tag() { [[ $1 =~ ^[0-9a-f]{40}$ ]] || fail "not a full commit hash: '$1'"; }

health_matches() {
    local body
    body=$(curl -fsS -m 10 "$HEALTH_URL") || { echo "health: no answer"; return 1; }
    echo "health: $body"
    [[ $body == *"\"commit\":\"$1\""* ]]
}

# Starts the given version and smoke-tests it
start_app() {
    if compose "$1" up -d --wait --wait-timeout "$WAIT_SECONDS" app && health_matches "$1"; then
        return 0
    fi
    echo "Version $1 did not pass the smoke test. Its last log lines:"
    compose "$1" logs --tail 80 app || true
    return 1
}

# How many tables the backup holds data for; fails if pg_restore cannot read the file
backup_tables() {
    local list
    list=$(db_exec pg_restore --list <"$1") || return 1
    grep -c ' TABLE DATA ' <<<"$list" || true
}

# Saves the database to BACKUP_DIR as <yyyymmdd-hhmmss>-<app version>[-<label>].dump, where the
# version is the one whose data it is. Sets BACKUP_FILE to the file's path.
backup_db() {
    local version=$1 label=${2:-} file tables
    file=$BACKUP_DIR/$(date +%Y%m%d-%H%M%S)-$version${label:+-$label}.dump
    install -d -m 700 "$BACKUP_DIR" || return 1
    # Written under another name first: a half-written file never looks like a backup
    if ! (umask 077 && db_exec sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom' \
        </dev/null >"$file.partial"); then
        rm -f "$file.partial"
        echo "pg_dump failed"
        return 1
    fi
    if ! tables=$(backup_tables "$file.partial"); then
        rm -f "$file.partial"
        echo "pg_restore cannot read the new backup"
        return 1
    fi
    if [ "$tables" -eq 0 ]; then
        rm -f "$file.partial"
        echo "the backup holds no table data"
        return 1
    fi
    mv "$file.partial" "$file" || return 1
    BACKUP_FILE=$file
    echo "saved $file: $(du -h "$file" | cut -f1), tables with data: $tables"
}

# Keeps the newest KEEP_BACKUPS backups. Runs under the lock, so a .partial file is a leftover
prune_backups() {
    local file
    find "$BACKUP_DIR" -maxdepth 1 -type f -name '*.dump' | sort -r | tail -n +$((KEEP_BACKUPS + 1)) |
        while read -r file; do
            rm -f "$file" && echo "removed old backup $(basename "$file")"
        done
    find "$BACKUP_DIR" -maxdepth 1 -type f -name '*.partial' -print -delete | sed 's/^/removed leftover /'
}

list_backups() {
    local files file
    files=$(find "$BACKUP_DIR" -maxdepth 1 -type f -name '*.dump' 2>/dev/null | sort -r)
    if [ -z "$files" ]; then
        echo "no backups in $BACKUP_DIR yet"
        return 0
    fi
    echo "backups in $BACKUP_DIR, newest first:"
    while read -r file; do
        printf '  %-6s %s\n' "$(du -h "$file" | cut -f1)" "$(basename "$file")"
    done <<<"$files"
}

# Rows in every table: shown before and after a restore
row_counts() {
    db_exec sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -AtX -v ON_ERROR_STOP=1' <<'SQL'
select table_schema || '.' || table_name || ' ' ||
  (xpath('/row/n/text()', query_to_xml(format('select count(*) as n from %I.%I', table_schema, table_name), false, true, '')))[1]::text
from information_schema.tables
where table_type = 'BASE TABLE' and table_schema not in ('pg_catalog', 'information_schema')
order by 1;
SQL
}
