#!/usr/bin/env bash
# Prepares the server for deploys of the app from GitHub Actions. Deploys copy deploy/ to the
# server themselves, but cannot do what needs root; this script does, run by a person:
#   1. Backup of the app database, before anything changes
#   2. User crmdeploy: GitHub Actions logs in with its key, copies deploy/ and runs deploy.sh
#   3. /srv/prod: .env with the database settings and deploy/
#   4. Once: moves the app and its database from compose project crm-app to prod
#   5. nginx: app.example-crm.site goes to the app on 127.0.0.1:3000
# deploy-key.pub is the public part of the key GitHub Actions logs in with.
# Copy this folder to the server, then run: sudo bash setup-server.sh
# Safe to run again: never overwrites .env and never deletes a database.
set -Eeuo pipefail

APP_DOMAIN=app.example-crm.site
APP_DIR=/srv/prod
PROJECT=prod
IMAGE=ghcr.io/vsmortimer/personal-crm
BACKUP_DIR=/var/backups/personal-crm
DEPLOY_USER=crmdeploy
DEPLOY_HOME=/var/lib/crmdeploy
NGINX_SITE=/etc/nginx/sites-available/crm.conf
NGINX_APP_SNIPPET=/etc/nginx/snippets/crm-app-proxy.conf
# The first version ran as compose project crm-app from /srv/crm-app and was deployed by a fixed
# root script. Its folder and database volume are kept as they are, as a fallback copy.
OLD_DIR=/srv/crm-app
OLD_PROJECT=crm-app
OLD_IMAGE=personal-crm
OLD_DEPLOY_SCRIPT=/usr/local/sbin/crm-app-deploy
OLD_SUDOERS=/etc/sudoers.d/crm-app-deploy
SRC=$(cd "$(dirname "$0")" && pwd)
LOG=$SRC/setup-server.log

step() { printf '\n=== %s\n' "$*"; }
fail() { echo "ERROR: $*" >&2; exit 1; }

if [ "$(id -u)" -ne 0 ]; then
    echo "Run with sudo: sudo bash $0" >&2
    exit 1
fi
for f in compose.yaml deploy.sh deploy-key.pub; do
    [ -s "$SRC/$f" ] || fail "$SRC/$f is missing"
done

exec > >(tee -a "$LOG") 2>&1
moving=no
backup=none
on_exit() {
    local status=$?
    [ "$status" -ne 0 ] || return 0
    echo
    echo "FAILED with exit code $status, see the lines above"
    if [ "$moving" = yes ]; then
        echo "The old database is untouched in volume ${OLD_PROJECT}_db-data, its backup: $backup"
        echo "Nothing was switched back automatically. To start the old version again:"
        echo "  sudo APP_TAG=none docker compose -p $PROJECT -f $APP_DIR/deploy/compose.yaml --env-file $APP_DIR/.env down"
        echo "  sudo sh -c 'cd $OLD_DIR && APP_TAG=\$(cat deployed-tag) docker compose up -d'"
    fi
}
trap on_exit EXIT
trap 'echo "FAILED at line $LINENO: $BASH_COMMAND"' ERR
echo "setup-server started $(date -Is)"

old_compose() { (cd "$OLD_DIR" && APP_TAG=$(cat deployed-tag 2>/dev/null || echo none) docker compose -p "$OLD_PROJECT" "$@"); }
new_compose() { APP_TAG=$1 docker compose -p "$PROJECT" --env-file "$APP_DIR/.env" -f "$APP_DIR/deploy/compose.yaml" "${@:2}"; }
volume_exists() { docker volume inspect "$1" >/dev/null 2>&1; }
db_container() {
    docker ps -q --filter "label=com.docker.compose.project=$1" --filter label=com.docker.compose.service=db
}
# Runs a command in the running database container of compose project $1
db_exec() {
    local container
    container=$(db_container "$1")
    [ -n "$container" ] || fail "the database of compose project $1 is not running"
    docker exec -i "$container" "${@:2}"
}
# Rows in every table: the same numbers before and after the move mean nothing was lost
row_counts() {
    db_exec "$1" sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -AtX -v ON_ERROR_STOP=1' <<'SQL'
select table_schema || '.' || table_name || ' ' ||
  (xpath('/row/n/text()', query_to_xml(format('select count(*) as n from %I.%I', table_schema, table_name), false, true, '')))[1]::text
from information_schema.tables
where table_type = 'BASE TABLE' and table_schema not in ('pg_catalog', 'information_schema')
order by 1;
SQL
}

# live-tag appears once the app runs as project prod: after the move or the first deploy
if [ ! -s "$APP_DIR/live-tag" ] && volume_exists "${OLD_PROJECT}_db-data"; then
    move=yes
    live_project=$OLD_PROJECT
else
    move=no
    live_project=$PROJECT
fi

step "1/6 Backup of the database"
install -d -m 700 -o root -g root "$BACKUP_DIR"
if [ "$move" = yes ] && [ -z "$(db_container "$OLD_PROJECT")" ]; then
    old_compose up -d --wait --wait-timeout 120 db
fi
if [ -n "$(db_container "$live_project")" ]; then
    backup=$BACKUP_DIR/$(date +%Y%m%d-%H%M%S)-$live_project.dump
    db_exec "$live_project" sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom' >"$backup"
    chmod 600 "$backup"
    tables=$(db_exec "$live_project" pg_restore --list <"$backup" | grep -c ' TABLE DATA ' || true)
    [ "$tables" -gt 0 ] || fail "the backup $backup lists no table data"
    echo "saved $backup: $(du -h "$backup" | cut -f1), tables with data: $tables"
    echo "only root can read it; restore with pg_restore"
else
    echo "no database is running: nothing to back up"
fi

step "2/6 User $DEPLOY_USER for GitHub Actions"
if id "$DEPLOY_USER" >/dev/null 2>&1; then
    echo "user exists"
else
    useradd --system --home-dir "$DEPLOY_HOME" --shell /bin/sh --comment "GitHub Actions deploys" "$DEPLOY_USER"
    echo "user created"
fi
# No password, and not "locked" either: sshd lets it in with the key only
usermod -p '*' "$DEPLOY_USER"
# Deploys run docker compose with the scripts they bring, so the user is in the docker group.
# That is root's level of access: whoever holds the deploy key controls the server.
usermod -aG docker "$DEPLOY_USER"
# Owned by root, so the account cannot change its own key
install -d -m 755 -o root -g root "$DEPLOY_HOME" "$DEPLOY_HOME/.ssh"
pubkey=$(head -n 1 "$SRC/deploy-key.pub")
[[ $pubkey == ssh-ed25519\ * ]] || fail "deploy-key.pub is not an ed25519 public key"
# restrict: no terminal, no port forwarding; commands and file copies work
printf 'restrict %s\n' "$pubkey" >"$DEPLOY_HOME/.ssh/authorized_keys"
chmod 644 "$DEPLOY_HOME/.ssh/authorized_keys"
echo "deploy key installed: $(ssh-keygen -lf "$DEPLOY_HOME/.ssh/authorized_keys")"
# The first version let this key run only a fixed root script, which deploy.sh replaces
for f in "$OLD_SUDOERS" "$OLD_DEPLOY_SCRIPT"; do
    if [ -e "$f" ]; then
        rm -f "$f"
        echo "removed the old deploy entry point $f"
    fi
done

step "3/6 $APP_DIR"
install -d -m 700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$APP_DIR" "$APP_DIR/deploy"
# Every deploy copies deploy/ here again; this copy is for the move below
install -m 644 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$SRC/compose.yaml" "$SRC/deploy.sh" "$APP_DIR/deploy/"
if [ -s "$APP_DIR/.env" ]; then
    echo ".env exists, left as is"
elif [ -s "$OLD_DIR/.env" ]; then
    install -m 600 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$OLD_DIR/.env" "$APP_DIR/.env"
    echo ".env copied from $OLD_DIR: the same database settings"
else
    install -m 600 -o "$DEPLOY_USER" -g "$DEPLOY_USER" /dev/null "$APP_DIR/.env"
    echo "empty .env created: put POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB there"
fi
chown "$DEPLOY_USER:$DEPLOY_USER" "$APP_DIR/.env"
chmod 600 "$APP_DIR/.env"
echo ".env: $(stat -c '%A %U' "$APP_DIR/.env")"

step "4/6 Moving the app from compose project $OLD_PROJECT to $PROJECT"
if [ "$move" = yes ]; then
    old_tag=$(cat "$OLD_DIR/deployed-tag" 2>/dev/null || true)
    [[ $old_tag =~ ^[0-9a-f]{40}$ ]] || fail "no deployed version in $OLD_DIR/deployed-tag"
    docker image inspect "$OLD_IMAGE:$old_tag" >/dev/null || fail "image $OLD_IMAGE:$old_tag is missing"
    # A person decides what to do with a volume left by an unfinished move
    ! volume_exists "${PROJECT}_db-data" ||
        fail "volume ${PROJECT}_db-data is left from an unfinished move: nothing changed, ask before removing it"
    pg_image=$(sed -n 's/^ *image: *\(postgres:[^ ]*\).*/\1/p' "$APP_DIR/deploy/compose.yaml")
    moving=yes

    echo "stopping the old app: the site answers 502 until the new one starts"
    old_compose stop app
    before=$(row_counts "$OLD_PROJECT")
    printf 'rows before the move:\n%s\n' "$before"
    # Containers only: the volume ${OLD_PROJECT}_db-data stays
    old_compose down --timeout 60

    # A new volume that compose knows as its own. It may hold the image's empty folders;
    # they make way for an exact copy of the old files
    new_compose "$old_tag" create db
    docker run --rm --network none --entrypoint sh \
        -v "${OLD_PROJECT}_db-data:/from:ro" -v "${PROJECT}_db-data:/to" "$pg_image" \
        -c 'find /to -mindepth 1 -delete && cp -a /from/. /to/'
    new_compose "$old_tag" up -d --wait --wait-timeout 120 db
    after=$(row_counts "$PROJECT")
    printf 'rows after the move:\n%s\n' "$after"
    [ "$before" = "$after" ] || fail "row counts differ after the move"
    echo "row counts match"

    # The running version gets the name new deploys use, so rollback can return to it
    docker tag "$OLD_IMAGE:$old_tag" "$IMAGE:$old_tag"
    new_compose "$old_tag" up -d --wait --wait-timeout 120 app
    body=$(curl -fsS -m 10 --retry 5 --retry-delay 2 --retry-all-errors http://127.0.0.1:3000/health)
    echo "health: $body"
    [[ $body == *"\"commit\":\"$old_tag\""* ]] || fail "the app does not answer with version $old_tag"
    install -m 644 -o "$DEPLOY_USER" -g "$DEPLOY_USER" /dev/null "$APP_DIR/live-tag"
    echo "$old_tag" >"$APP_DIR/live-tag"
    moving=no

    # From now on deploy.sh keeps the live and the previous image under the new name
    docker image ls "$OLD_IMAGE" --format '{{.Repository}}:{{.Tag}}' | xargs -r docker image rm ||
        echo "could not remove the images named $OLD_IMAGE"
    echo "moved: $old_tag runs as compose project $PROJECT"
    echo "kept as a fallback: $OLD_DIR and volume ${OLD_PROJECT}_db-data"
else
    echo "nothing to move: the app already runs as project $PROJECT, or there is no old database"
fi

step "5/6 nginx: $APP_DOMAIN -> 127.0.0.1:3000"
cat >"$NGINX_APP_SNIPPET" <<'CONF'
# Managed by setup-server.sh (personal-crm repo, deploy/): the app container on 127.0.0.1:3000.
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Real-IP $remote_addr;
    # Pages arrive in parts while data loads; buffering would hold them back
    proxy_buffering off;
}
CONF
echo "written $NGINX_APP_SNIPPET"

# The app's server block served a placeholder page; it now includes the proxy snippet
nginx_backup=$NGINX_SITE.bak-$(date +%Y%m%d-%H%M%S)
cp -p "$NGINX_SITE" "$nginx_backup"
python3 - "$NGINX_SITE" "$APP_DOMAIN" "$NGINX_APP_SNIPPET" <<'PY'
import re
import sys

path, domain, snippet = sys.argv[1:]
text = open(path).read()
include = f"    include {snippet};\n"
if include in text:
    print(f"{path}: already proxies {domain}")
    sys.exit(0)
placeholder = (
    f"    root /var/www/{domain};\n"
    "    index index.html;\n"
    "    location / { try_files $uri $uri/ =404; }\n"
)
block = re.compile(
    r"(    server_name " + re.escape(domain) + r";\n    include [^\n]+;\n)" + re.escape(placeholder)
)
text, count = block.subn(lambda m: m.group(1) + include, text)
if count != 1:
    sys.exit(f"{path}: the https block of {domain} is not the expected placeholder, not changed")
open(path, "w").write(text)
print(f"{path}: {domain} now proxies to the app")
PY
if nginx -t; then
    systemctl reload nginx
    echo "nginx reloaded, previous config saved as $nginx_backup"
else
    cp -p "$nginx_backup" "$NGINX_SITE"
    echo "nginx rejected the new config, restored the previous one" >&2
    exit 1
fi

step "6/6 Checks"
echo "docker for $DEPLOY_USER: $(sudo -u "$DEPLOY_USER" docker version --format 'server {{.Server.Version}}')"
sshd -t && echo "sshd config is valid"
echo "sshd settings for $DEPLOY_USER:"
sshd -T -C "user=$DEPLOY_USER,host=github.com,addr=192.0.2.1" | grep -E '^(pubkeyauthentication|passwordauthentication|permitrootlogin) '
if [ -s "$APP_DIR/live-tag" ]; then
    sudo -u "$DEPLOY_USER" bash "$APP_DIR/deploy/deploy.sh" status
fi
curl -s -o /dev/null -m 10 -w "https://$APP_DOMAIN/health -> %{http_code} (502 until the first deploy)\n" "https://$APP_DOMAIN/health"
chown "${SUDO_USER:-root}:" "$LOG" 2>/dev/null || true
echo
echo "ALL DONE $(date -Is)"
