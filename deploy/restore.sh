#!/usr/bin/env bash
# Replaces the production database with a backup. Only a person runs it, from a terminal:
#
#   ssh -t crm sudo -u crmdeploy bash /srv/prod/deploy/restore.sh <backup>
#
# <backup> is a file name from /srv/prod/backups or a full path. Without it the script lists
# the backups and changes nothing.
#
# It shows the backup and the database it replaces and waits for "yes". Then it saves the current
# database to /srv/prod/backups, stops the app, drops the database, creates it again, loads the
# backup, applies the running version's migrations and starts that same version again: the app
# version never changes. A failed step stops the script and nothing is undone automatically:
# it says what it left behind and where the saved copy of the database is.
set -Eeuo pipefail

# shellcheck source=lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
require_deploy_user "$@"

# What a failure at the current step leaves behind; empty while nothing has changed
left=""
saved=""
on_exit() {
    local status=$?
    [ "$status" -ne 0 ] && [ -n "$left" ] || return 0
    echo
    echo "RESTORE FAILED: $left"
    echo "Nothing was undone automatically."
    echo "The database as it was before this restore: $saved"
    echo "To load it back: restore.sh $(basename "$saved")"
}
trap on_exit EXIT

file=${1:-}
if [ -z "$file" ]; then
    echo "usage: restore.sh <backup>, a file name from $BACKUP_DIR or a full path"
    echo
    list_backups
    exit 1
fi
[[ $file == */* ]] || file=$BACKUP_DIR/$file
[ -f "$file" ] && [ -r "$file" ] || fail "cannot read the backup $file"
[ -t 0 ] || fail "restore asks for confirmation: run it from a terminal, with ssh -t"

lock
live=$(read_tag "$LIVE_FILE")
[ -n "$live" ] || fail "nothing is deployed: no app version to start after the restore"
docker image inspect "$IMAGE:$live" >/dev/null 2>&1 ||
    fail "$IMAGE:$live, the live version, is not on the server"

step "Checking the backup"
compose "$live" up -d --wait --wait-timeout "$WAIT_SECONDS" db
tables=$(backup_tables "$file") || fail "pg_restore cannot read $file: it is not a database backup"
[ "$tables" -gt 0 ] || fail "$file holds no table data"
if [[ $(basename "$file") =~ [0-9a-f]{40} ]]; then
    made_with=${BASH_REMATCH[0]}
else
    made_with="not in the file name"
fi
database=$(db_exec sh -c 'printf %s "$POSTGRES_DB"' </dev/null)
rows=$(row_counts) || fail "cannot count the rows of the current database"

step "Restore replaces the whole production database"
echo "backup:          $file"
echo "                 $(du -h "$file" | cut -f1), saved $(date -r "$file" '+%Y-%m-%d %H:%M'), tables with data: $tables"
echo "data of version: $made_with"
echo "replaces:        database $database of compose project prod: it is dropped and created again"
echo "rows in it now:"
sed 's/^/                 /' <<<"$rows"
echo "app version:     $live, stays the same; its migrations run after the backup is loaded"
echo "before anything changes, the current database is saved to $BACKUP_DIR"
echo
read -r -p 'Type yes to replace the database, anything else to stop: ' answer
if [ "$answer" != yes ]; then
    echo "Nothing changed"
    exit 1
fi

step "Saving the current database"
backup_db "$live" before-restore ||
    fail "could not save the current database: nothing changed, $live keeps running"
saved=$BACKUP_FILE

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
left="the app is stopped, the database holds the backup, but the migrations of $live failed on it"
compose "$live" run --rm -T app node db-scripts/migrate.cjs

step "Starting $live again"
left="the database holds the backup and the migrations of $live, but $live did not pass the smoke test"
start_app "$live" || fail "$live did not start"
left=""

step "Rows after the restore"
row_counts | sed 's/^/  /' || echo "could not count the rows"

step "Done: the database holds $(basename "$file"), $live is live"
