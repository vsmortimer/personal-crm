#!/usr/bin/env bash
# Runs the app on the server as user crmdeploy, in one of two environments: "prod" (compose project
# prod, /srv/prod) and "staging", the test stand (project staging, /srv/staging). It is one script
# and one compose.yaml for both; the environment is the first argument. Every deploy copies
# deploy/ to /srv/<environment>/deploy and runs this script from there (see ci-deploy.sh).
#
#   deploy.sh <env> deploy <commit> <registry user>   deploy ghcr.io/vsmortimer/personal-crm:<commit>;
#                                                     the registry token comes on stdin
#   deploy.sh <env> rollback [<commit>]               start the previous version again (by hand only)
#   deploy.sh prod backup                             back up the database (the nightly timer runs it)
#   deploy.sh <env> status                            show the containers, the running version, backups
#   deploy.sh <env> seed                              fill an empty database with test data
#   deploy.sh staging refresh-db                      replace the stand's database with a copy of
#                                                     prod's newest backup (by hand only)
#
# A deploy checks the environment's .env, backs up the database (prod only), pulls the image,
# applies migrations in a one-off container from it, starts it and smoke-tests /health; on prod it
# then removes images older than two weeks. A failed step stops the deploy, and nothing is rolled
# back automatically: a person looks at the failure and decides whether to run `rollback`.
# Restoring a backup of prod is restore.sh, also by hand only.
set -Eeuo pipefail

# shellcheck source=lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
use_environment "${1:-}"
shift
require_deploy_user "$ENVIRONMENT" "$@"

IMAGE_SOURCE=https://github.com/vsmortimer/personal-crm

# The token is the GitHub Actions job's own: it expires with the job and is never saved here
pull_image() {
    local tag=$1 user=$2 token=$3 config status=0
    config=$(mktemp -d)
    { docker --config "$config" login ghcr.io -u "$user" --password-stdin <<<"$token" >/dev/null &&
        docker --config "$config" pull -q "$IMAGE:$tag"; } || status=$?
    rm -rf "$config"
    return "$status"
}

# Removes images of other versions that were built more than KEEP_IMAGE_DAYS days ago, except the
# live and previous versions of prod and the live version of the stand (kept_tags). Only after a
# successful prod deploy: that is when the next rollback target is known
remove_old_images() {
    local tag created
    docker image ls "$IMAGE" --format '{{.Tag}}' | while read -r tag; do
        [[ $tag =~ ^[0-9a-f]{40}$ ]] || continue
        case " $* $(kept_tags | tr '\n' ' ') " in *" $tag "*) continue ;; esac
        created=$(date -d "$(docker image inspect --format '{{.Created}}' "$IMAGE:$tag")" +%s) || continue
        [ $(($(date +%s) - created)) -ge $((KEEP_IMAGE_DAYS * 86400)) ] || continue
        docker image rm "$IMAGE:$tag" >/dev/null && echo "removed $IMAGE:$tag" || echo "could not remove $IMAGE:$tag"
    done
    # Untagged leftovers of this app only: other images on the server are not ours
    docker image prune -f --filter "label=org.opencontainers.image.source=$IMAGE_SOURCE" >/dev/null
}

deploy() {
    local tag=${1:-} user=${2:-} token live
    check_tag "$tag"
    [ -n "$user" ] || fail "usage: deploy.sh <env> deploy <commit> <registry user>, the token on stdin"
    IFS= read -r token || true
    [ -n "$token" ] || fail "no registry token on stdin"
    live=$(read_tag "$LIVE_FILE")
    echo "environment: $ENVIRONMENT"
    echo "new version: $tag"
    echo "live now:    ${live:-nothing}"

    step "Checking $APP_DIR/.env"
    check_env_file

    step "Backup of the database"
    compose "$tag" up -d --wait --wait-timeout "$WAIT_SECONDS" db
    if [ "$BACKUP" != yes ]; then
        echo "no backup in $ENVIRONMENT: its database is a copy of prod's, see refresh-db"
    elif [ -n "$live" ]; then
        # Named after the version live now: its data, before the new version's migrations
        backup_db "$live" || fail "backup failed: nothing changed, $live keeps running"
        prune_backups
    else
        echo "nothing is live yet: no data to back up"
    fi

    step "Pulling $IMAGE:$tag"
    pull_image "$tag" "$user" "$token"

    step "Applying migrations in a one-off container"
    compose "$tag" run --rm -T app node db-scripts/migrate.cjs ||
        fail "migrations failed: the new version was not started, ${live:-nothing} keeps running"

    step "Starting the new version"
    # From here on `rollback` returns to the version that was live before this deploy
    if [ -n "$live" ] && [ "$live" != "$tag" ]; then
        echo "$live" >"$PREVIOUS_FILE"
    fi
    start_app "$tag" ||
        fail "deploy of $tag failed and nothing was rolled back. To start the previous version: deploy.sh $ENVIRONMENT rollback"
    echo "$tag" >"$LIVE_FILE"

    if [ "$ENVIRONMENT" = prod ]; then
        step "Removing images older than $KEEP_IMAGE_DAYS days"
        remove_old_images "$tag" "$(read_tag "$PREVIOUS_FILE")"
    fi

    step "Done: $tag is live"
}

# Migrations stay applied: the previous version must keep working with the newer schema.
# That is not so for the deploy of the sign-in (migrations 0003 and 0004): the previous version
# does not know `user_id`, which is NOT NULL now, so it cannot add a contact. After that deploy,
# roll back only together with the database: first this command, then restore.sh with the backup
# made before that deploy. The steps are in README.md, "Откат выкатки входа".
rollback() {
    local tag=${1:-$(read_tag "$PREVIOUS_FILE")}
    [ -n "$tag" ] || fail "no previous version recorded: pass a commit"
    check_tag "$tag"
    docker image inspect "$IMAGE:$tag" >/dev/null 2>&1 ||
        fail "$IMAGE:$tag is not on the server: only the live and the previous versions are kept"

    step "Starting $tag again"
    start_app "$tag" || fail "rollback to $tag failed"
    echo "$tag" >"$LIVE_FILE"
    step "Done: $tag is live"
}

# Daily backup of prod's database, started by the systemd timer crm-backup (setup-daily-backup.sh).
# It does not start anything: with the database not running there is nothing to back up, and the
# failure is in the journal and in the date of the newest backup in `status`
daily_backup() {
    [ "$BACKUP" = yes ] || fail "backup is only for prod: the stand's database is a copy of prod's"
    local live
    live=$(read_tag "$LIVE_FILE")
    [ -n "$live" ] || fail "nothing is deployed yet: no data to back up"
    step "Daily backup of the database of $ENVIRONMENT"
    backup_db "$live" daily || fail "daily backup failed"
    prune_backups
}

status() {
    local live
    live=$(read_tag "$LIVE_FILE")
    echo "environment: $ENVIRONMENT, $APP_DOMAIN"
    echo "live:     ${live:-nothing}"
    echo "previous: $(read_tag "$PREVIOUS_FILE")"
    compose "${live:-none}" ps
    docker image ls "$IMAGE"
    curl -sS -m 10 "$HEALTH_URL" || true
    echo
    if [ "$BACKUP" = yes ]; then
        list_backups
    fi
}

seed() {
    local live
    live=$(read_tag "$LIVE_FILE")
    [ -n "$live" ] || fail "nothing is deployed yet"
    compose "$live" run --rm -T app node db-scripts/seed.cjs
}

# What a failure of refresh-db leaves behind; empty while nothing has changed
left=""
on_exit() {
    local status=$?
    [ "$status" -ne 0 ] && [ -n "$left" ] || return 0
    echo
    echo "REFRESH FAILED: $left"
    echo "Nothing was undone automatically. The stand holds no data worth saving: run refresh-db again"
}
trap on_exit EXIT

# Replaces the stand's database with prod's newest backup: the stand shows what prod would look
# like. It only ever reads prod's backups; prod's database and app are not touched. The app
# version stays, and its migrations run after the backup is loaded, as in restore.sh
refresh_db() {
    [ "$ENVIRONMENT" = staging ] || fail "refresh-db is only for staging: it never replaces the prod database"
    local live file tables database rows answer
    live=$(read_tag "$LIVE_FILE")
    [ -n "$live" ] || fail "nothing is deployed on the stand yet: wait for its first deploy, then run refresh-db"
    docker image inspect "$IMAGE:$live" >/dev/null 2>&1 || fail "$IMAGE:$live, the live version, is not on the server"
    [ -t 0 ] || fail "refresh-db asks for confirmation: run it from a terminal, with ssh -t"

    file=$(find /srv/prod/backups -maxdepth 1 -type f -name '*.dump' 2>/dev/null | sort | tail -n 1)
    [ -n "$file" ] && [ -r "$file" ] || fail "no readable backup of prod in /srv/prod/backups: nothing changed"

    step "Checking the backup"
    compose "$live" up -d --wait --wait-timeout "$WAIT_SECONDS" db
    tables=$(backup_tables "$file") || fail "pg_restore cannot read $file: it is not a database backup"
    [ "$tables" -gt 0 ] || fail "$file holds no table data"
    database=$(db_exec sh -c 'printf %s "$POSTGRES_DB"' </dev/null)
    rows=$(row_counts) || fail "cannot count the rows of the current database"

    step "refresh-db replaces the whole database of the stand"
    echo "backup of prod:  $file"
    echo "                 $(du -h "$file" | cut -f1), saved $(date -r "$file" '+%Y-%m-%d %H:%M'), tables with data: $tables"
    echo "replaces:        database $database of compose project staging: it is dropped and created again"
    echo "rows in it now:"
    sed 's/^/                 /' <<<"$rows"
    echo "app version:     $live, stays the same; its migrations run after the backup is loaded"
    echo "prod:            is not touched"
    echo
    read -r -p 'Type yes to replace the database of the stand, anything else to stop: ' answer
    if [ "$answer" != yes ]; then
        echo "Nothing changed"
        exit 1
    fi

    step "Stopping the app"
    left="the app may be stopped, the database is as it was"
    compose "$live" stop app

    step "Dropping database $database and creating it again"
    left="the app is stopped, the database $database may be gone or empty"
    # Connected to template1: the database being dropped must have no sessions
    db_exec sh -c 'psql -U "$POSTGRES_USER" -d template1 -X -q -v ON_ERROR_STOP=1 -v db="$POSTGRES_DB" -v owner="$POSTGRES_USER"' <<'SQL'
drop database if exists :"db" with (force);
create database :"db" owner :"owner" template template0;
SQL

    step "Loading the backup"
    left="the app is stopped, the database $database is empty: the backup did not load"
    # One transaction: the backup loads in full or not at all
    db_exec sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --exit-on-error --single-transaction' <"$file"

    step "Applying migrations of $live in a one-off container"
    left="the app is stopped, the database holds the copy, but the migrations of $live failed on it"
    compose "$live" run --rm -T app node db-scripts/migrate.cjs

    step "Starting $live again"
    left="the database holds the copy and the migrations of $live, but $live did not pass the smoke test"
    start_app "$live" || fail "$live did not start"
    left=""

    step "Rows after the refresh"
    row_counts | sed 's/^/  /' || echo "could not count the rows"
    step "Done: the stand holds the copy of $(basename "$file"), $live is live"
}

command=${1:-}
shift || true
case "$command" in
    deploy) lock; deploy "$@" ;;
    rollback) lock; rollback "$@" ;;
    seed) lock; seed ;;
    backup) lock; daily_backup ;;
    refresh-db) lock; refresh_db ;;
    status) status ;;
    *) fail "usage: deploy.sh <staging|prod> deploy <commit> <registry user> | rollback [<commit>] | status | seed | backup (prod) | refresh-db (staging)" ;;
esac
