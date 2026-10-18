#!/usr/bin/env bash
# Prepares the server for automatic deploys of the app from GitHub Actions:
#   1. /srv/crm-app: compose.yaml (the app and its own Postgres) and .env for the database settings
#   2. /usr/local/sbin/crm-app-deploy: the deploy script
#   3. User crmdeploy: logs in only with the GitHub Actions key and can only run the deploy script
#   4. nginx: app.example-crm.site goes to the app on 127.0.0.1:3000
# deploy-key.pub is the public part of the key GitHub Actions logs in with.
# Copy this folder to the server, then run: sudo bash setup-server.sh
# Safe to run again: updates the files, never touches .env or the database.
set -Eeuo pipefail

APP_DOMAIN=app.example-crm.site
APP_DIR=/srv/crm-app
DEPLOY_SCRIPT=/usr/local/sbin/crm-app-deploy
DEPLOY_USER=crmdeploy
DEPLOY_HOME=/var/lib/crmdeploy
SUDOERS_FILE=/etc/sudoers.d/crm-app-deploy
NGINX_SITE=/etc/nginx/sites-available/crm.conf
NGINX_APP_SNIPPET=/etc/nginx/snippets/crm-app-proxy.conf
SRC=$(cd "$(dirname "$0")" && pwd)
LOG=$SRC/setup-server.log

step() { printf '\n=== %s\n' "$*"; }

if [ "$(id -u)" -ne 0 ]; then
    echo "Run with sudo: sudo bash $0" >&2
    exit 1
fi
for f in compose.yaml crm-app-deploy.sh deploy-key.pub; do
    [ -s "$SRC/$f" ] || { echo "$SRC/$f is missing" >&2; exit 1; }
done

exec > >(tee -a "$LOG") 2>&1
trap 'echo; echo "FAILED at line $LINENO: $BASH_COMMAND"' ERR
echo "setup-server started $(date -Is)"

step "1/5 $APP_DIR"
install -d -m 700 -o root -g root "$APP_DIR"
install -m 644 -o root -g root "$SRC/compose.yaml" "$APP_DIR/compose.yaml"
if [ -e "$APP_DIR/.env" ]; then
    echo ".env exists, left as is"
else
    install -m 600 -o root -g root /dev/null "$APP_DIR/.env"
    echo "empty .env created: only root can read it"
fi
chmod 600 "$APP_DIR/.env"

step "2/5 Deploy script $DEPLOY_SCRIPT"
install -m 755 -o root -g root "$SRC/crm-app-deploy.sh" "$DEPLOY_SCRIPT"
bash -n "$DEPLOY_SCRIPT"
echo "installed"

step "3/5 User $DEPLOY_USER for GitHub Actions"
if id "$DEPLOY_USER" >/dev/null 2>&1; then
    echo "user exists"
else
    useradd --system --home-dir "$DEPLOY_HOME" --shell /bin/sh --comment "GitHub Actions deploys" "$DEPLOY_USER"
    echo "user created"
fi
# No password, and not "locked" either: sshd lets it in with the key only
usermod -p '*' "$DEPLOY_USER"
# Owned by root, so the account cannot change its own key or its forced command
install -d -m 755 -o root -g root "$DEPLOY_HOME" "$DEPLOY_HOME/.ssh"
pubkey=$(head -n 1 "$SRC/deploy-key.pub")
[[ $pubkey == ssh-ed25519\ * ]] || { echo "deploy-key.pub is not an ed25519 public key" >&2; exit 1; }
# restrict: no shell, no port forwarding; the key can only start the deploy
printf 'restrict,command="sudo -n %s" %s\n' "$DEPLOY_SCRIPT" "$pubkey" >"$DEPLOY_HOME/.ssh/authorized_keys"
chmod 644 "$DEPLOY_HOME/.ssh/authorized_keys"
echo "deploy key installed: $(ssh-keygen -lf "$DEPLOY_HOME/.ssh/authorized_keys")"

sudoers_tmp=$(mktemp)
cat >"$sudoers_tmp" <<SUDO
# Managed by setup-server.sh: GitHub Actions may run the deploy script, without arguments only.
$DEPLOY_USER ALL=(root) NOPASSWD: $DEPLOY_SCRIPT ""
SUDO
visudo -cf "$sudoers_tmp"
install -m 440 -o root -g root "$sudoers_tmp" "$SUDOERS_FILE"
rm -f "$sudoers_tmp"
echo "sudo rule:"; sudo -l -U "$DEPLOY_USER" | tail -n 2

step "4/5 nginx: $APP_DOMAIN -> 127.0.0.1:3000"
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
backup=$NGINX_SITE.bak-$(date +%Y%m%d-%H%M%S)
cp -p "$NGINX_SITE" "$backup"
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
    echo "nginx reloaded, previous config saved as $backup"
else
    cp -p "$backup" "$NGINX_SITE"
    echo "nginx rejected the new config, restored the previous one" >&2
    exit 1
fi

step "5/5 Checks"
cd "$APP_DIR"
APP_TAG=none docker compose config --quiet 2>/dev/null && echo "compose.yaml is valid" ||
    echo "compose.yaml needs .env with POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB (expected right after the first run)"
echo "pulling the Postgres image:"
docker pull -q "$(sed -n 's/^ *image: *\(postgres:[^ ]*\).*/\1/p' compose.yaml)"
sshd -t && echo "sshd config is valid"
echo "sshd settings for $DEPLOY_USER:"
sshd -T -C "user=$DEPLOY_USER,host=github.com,addr=192.0.2.1" | grep -E '^(pubkeyauthentication|passwordauthentication|permitrootlogin) '
curl -s -o /dev/null -m 10 -w "https://$APP_DOMAIN -> %{http_code} (502 until the first deploy)\n" "https://$APP_DOMAIN/"
chown "${SUDO_USER:-root}:" "$LOG" 2>/dev/null || true
echo
echo "ALL DONE $(date -Is)"
