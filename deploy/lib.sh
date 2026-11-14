# Shared by deploy.sh and restore.sh, which source it: where the app lives on the server and
# the steps both of them need. Every deploy copies it to /srv/<environment>/deploy with the rest
# of deploy/.
#
# Two environments run on the server from this same code: "prod" and "staging" (the test stand).
# A script picks one with use_environment before anything else; everything that differs between
# them is set in that one function.
#
# Functions here check every step themselves and return 1 on failure, because callers run them
# as `fn || fail ...`, and bash ignores `set -e` inside a function called that way.

IMAGE=ghcr.io/vsmortimer/personal-crm
WAIT_SECONDS=120
# Backups kept of each kind: the daily ones (-daily.dump) and the ones taken before a deploy or a
# restore (everything else)
KEEP_BACKUPS=7
# Images of other versions are removed once they are older than this (days since they were built)
KEEP_IMAGE_DAYS=14
ENVIRONMENTS="staging prod"

step() { printf '\n=== %s\n' "$*"; }
fail() { echo "ERROR: $*" >&2; exit 1; }

# Sets everything that depends on the environment: folder, compose project, port, address,
# whether deploys back the database up and the memory limits of the containers.
# Prod has no memory limits: it runs as it always did. The stand shares a small server with it,
# so its containers are capped and can never take the memory prod needs.
use_environment() {
    ENVIRONMENT=${1:-}
    case "$ENVIRONMENT" in
        prod)
            APP_PORT=3000
            APP_DOMAIN=app.example-crm.site
            BACKUP=yes
            APP_MEM_LIMIT=0
            DB_MEM_LIMIT=0
            ;;
        staging)
            APP_PORT=3001
            APP_DOMAIN=test-app.example-crm.site
            BACKUP=no
            APP_MEM_LIMIT=320m
            DB_MEM_LIMIT=192m
            ;;
        *) fail "unknown environment '$ENVIRONMENT': use one of: $ENVIRONMENTS" ;;
    esac
    APP_DIR=/srv/$ENVIRONMENT
    HEALTH_URL=http://127.0.0.1:$APP_PORT/health
    # The version that last passed the smoke test, and the one live before the last deploy
    LIVE_FILE=$APP_DIR/live-tag
    PREVIOUS_FILE=$APP_DIR/previous-tag
    # Prod's database is saved here every night, before every deploy and before every restore.
    # The stand has no backups of its own: its database is a copy of prod's
    BACKUP_DIR=$APP_DIR/backups
}

# Pass the script's arguments, the environment first: they go into the hint on how to run it
require_deploy_user() {
    [ "$(id -un)" = crmdeploy ] || fail "run as crmdeploy: sudo -u crmdeploy bash $0 $*"
    cd "$APP_DIR"
    [ -s .env ] || fail "$APP_DIR/.env is empty: put the database settings there first"
}

# One deploy, rollback or restore at a time in each environment. GitHub Actions also runs the
# deploys of one environment one after another; this lock covers a person's commands too
lock() {
    exec 9>"$APP_DIR/deploy.lock"
    flock -w 900 9 || fail "another deploy or restore of $ENVIRONMENT is still running"
}

# compose.yaml needs a tag even for commands that only touch the database. Everything that
# differs between the environments is passed here, in the process environment, which wins over
# the same name in .env: a stale line there cannot move the stand onto prod's port
compose_with_stdin() {
    APP_TAG=$1 COMPOSE_PROJECT_NAME=$ENVIRONMENT APP_PORT=$APP_PORT \
        APP_MEM_LIMIT=$APP_MEM_LIMIT DB_MEM_LIMIT=$DB_MEM_LIMIT \
        docker compose -p "$ENVIRONMENT" --env-file "$APP_DIR/.env" -f "$APP_DIR/deploy/compose.yaml" "${@:2}"
}
compose() { compose_with_stdin "$@" </dev/null; }

# A command in the running database container. It reads the caller's stdin (pg_restore takes
# the backup from it), so every call says what its stdin is
db_exec() { compose_with_stdin none exec -T db "$@"; }

read_tag() { cat "$1" 2>/dev/null || true; }

check_tag() { [[ $1 =~ ^[0-9a-f]{40}$ ]] || fail "not a full commit hash: '$1'"; }

# The value of NAME in a .env file, without quotes and a trailing slash; empty if there is none.
# Read as text: the file is never sourced
env_value() {
    local value
    value=$(grep -E "^$2=" "$1" 2>/dev/null | tail -n 1) || true
    value=${value#*=}
    value=${value#[\"\']}
    value=${value%[\"\']}
    printf '%s' "${value%/}"
}

# Stops a deploy before it changes anything if this environment's .env belongs to another one:
# the sign-in link in the email is built from BETTER_AUTH_URL, so it must lead to this
# environment, and the two environments must not share the secret that signs their sessions
check_env_file() {
    local url secret other other_secret
    url=$(env_value "$APP_DIR/.env" BETTER_AUTH_URL)
    [ "$url" = "https://$APP_DOMAIN" ] ||
        fail "BETTER_AUTH_URL in $APP_DIR/.env is '$url': it must be https://$APP_DOMAIN, so that the sign-in link leads to $ENVIRONMENT. Nothing was changed"
    secret=$(env_value "$APP_DIR/.env" BETTER_AUTH_SECRET)
    for other in $ENVIRONMENTS; do
        [ "$other" != "$ENVIRONMENT" ] && [ -r "/srv/$other/.env" ] || continue
        other_secret=$(env_value "/srv/$other/.env" BETTER_AUTH_SECRET)
        [ -z "$secret" ] || [ "$secret" != "$other_secret" ] ||
            fail "BETTER_AUTH_SECRET in $APP_DIR/.env is the same as in /srv/$other/.env: each environment needs its own. Nothing was changed"
    done
}

# Versions that stay on the server whatever their age: the live and the previous version of prod
# (rollback goes to the previous one) and the live version of the stand. The image is shared by
# the environments of this server, so cleaning up after one must not take the other's version away
kept_tags() {
    printf '%s\n%s\n%s\n' "$(read_tag /srv/prod/live-tag)" "$(read_tag /srv/prod/previous-tag)" \
        "$(read_tag /srv/staging/live-tag)"
}

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

# Keeps the newest KEEP_BACKUPS backups of each kind: the daily ones and the rest. Runs under the
# lock, so a .partial file is a leftover
prune_backups() {
    local file
    {
        find "$BACKUP_DIR" -maxdepth 1 -type f -name '*-daily.dump' | sort -r | tail -n +$((KEEP_BACKUPS + 1))
        find "$BACKUP_DIR" -maxdepth 1 -type f -name '*.dump' ! -name '*-daily.dump' | sort -r |
            tail -n +$((KEEP_BACKUPS + 1))
    } | while read -r file; do
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
