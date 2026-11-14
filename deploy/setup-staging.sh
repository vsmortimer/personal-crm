#!/usr/bin/env bash
# Prepares the server for the test stand https://test-app.example-crm.site. Deploys copy deploy/ to
# the server themselves, but cannot do what needs root; this script does, run by a person:
#   1. DNS: test-app.example-crm.site must already point to this server
#   2. /srv/staging: the stand's own folder, deploy/ and an EMPTY .env (it never writes values there)
#   3. The password that closes the stand: it asks for it, nobody else sees it
#   4. nginx: ADDS its own files for test-app.example-crm.site, the existing config is not changed
#   5. A certificate for test-app.example-crm.site, issued by certbot and renewed with the others
# The stand's address is behind the password, except /health: the deploy checks it from outside.
# Copy this folder to the server, then run: sudo bash setup-staging.sh
# Safe to run again: never overwrites .env, never deletes a database, keeps the password unless
# you run it as: sudo CHANGE_PASSWORD=yes bash setup-staging.sh
set -Eeuo pipefail

DOMAIN=test-app.example-crm.site
# Any name that already points to this server: the stand's name must point to the same address
REFERENCE_DOMAIN=app.example-crm.site
APP_DIR=/srv/staging
APP_PORT=3001
DEPLOY_USER=crmdeploy
NGINX_SITE=/etc/nginx/sites-available/crm-staging.conf
NGINX_ENABLED=/etc/nginx/sites-enabled/crm-staging.conf
NGINX_PROXY_SNIPPET=/etc/nginx/snippets/crm-staging-proxy.conf
NGINX_TLS_SNIPPET=/etc/nginx/snippets/crm-staging-tls.conf
HTPASSWD=/etc/nginx/crm-staging.htpasswd
HTPASSWD_USER=staging
ACME_ROOT=/var/www/letsencrypt
CERT_DIR=/etc/letsencrypt/live/$DOMAIN
SRC=$(cd "$(dirname "$0")" && pwd)

step() { printf '\n=== %s\n' "$*"; }
fail() { echo "ERROR: $*" >&2; exit 1; }

if [ "$(id -u)" -ne 0 ]; then
    echo "Run with sudo: sudo bash $0" >&2
    exit 1
fi
for f in compose.yaml deploy.sh lib.sh restore.sh; do
    [ -s "$SRC/$f" ] || fail "$SRC/$f is missing"
done
id "$DEPLOY_USER" >/dev/null 2>&1 || fail "user $DEPLOY_USER does not exist: run setup-server.sh first"
[ -d "$ACME_ROOT" ] || fail "$ACME_ROOT does not exist: nginx of the app is not set up, run setup-server.sh first"

# Restores the previous nginx files if the new config is rejected; only our own files are touched
backup_dir=$(mktemp -d)
for f in "$NGINX_SITE" "$NGINX_PROXY_SNIPPET" "$NGINX_TLS_SNIPPET"; do
    [ ! -e "$f" ] || cp -p "$f" "$backup_dir/"
done
enabled_before=no
[ ! -e "$NGINX_ENABLED" ] || enabled_before=yes
on_exit() {
    local status=$?
    [ "$status" -ne 0 ] || return 0
    echo
    echo "FAILED with exit code $status, see the lines above"
}
trap on_exit EXIT
trap 'echo "FAILED at line $LINENO: $BASH_COMMAND"' ERR

# Back to the nginx files from before this run, and says why
undo_nginx() {
    local f
    for f in "$NGINX_SITE" "$NGINX_PROXY_SNIPPET" "$NGINX_TLS_SNIPPET"; do
        if [ -e "$backup_dir/$(basename "$f")" ]; then
            cp -p "$backup_dir/$(basename "$f")" "$f"
        else
            rm -f "$f"
        fi
    done
    [ "$enabled_before" = yes ] || rm -f "$NGINX_ENABLED"
    echo "nginx rejected the new config: this script's files are back as they were, the rest was not touched" >&2
}

# Checks the whole nginx config and reloads it; otherwise puts our own files back
reload_nginx() {
    if nginx -t; then
        systemctl reload nginx
    else
        undo_nginx
        exit 1
    fi
}

resolve() { getent ahostsv4 "$1" | awk 'NR == 1 { print $1 }'; }

echo "setup-staging started $(date -Is)"

step "1/5 DNS of $DOMAIN"
stand_ip=$(resolve "$DOMAIN" || true)
server_ip=$(resolve "$REFERENCE_DOMAIN" || true)
[ -n "$server_ip" ] || fail "$REFERENCE_DOMAIN does not resolve: cannot tell this server's address"
if [ -z "$stand_ip" ]; then
    fail "$DOMAIN has no DNS record yet. Add an A record: name test-app, value $server_ip, then run this again (it can take a few minutes to spread)"
fi
[ "$stand_ip" = "$server_ip" ] ||
    fail "$DOMAIN points to $stand_ip, but $REFERENCE_DOMAIN to $server_ip: fix the A record of test-app to $server_ip, then run this again"
echo "$DOMAIN -> $stand_ip, the same as $REFERENCE_DOMAIN"

step "2/5 $APP_DIR"
install -d -m 700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$APP_DIR" "$APP_DIR/deploy"
# Every deploy copies deploy/ here again; this copy lets you run deploy.sh before the first deploy
install -m 644 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$SRC/compose.yaml" "$SRC/deploy.sh" "$SRC/lib.sh" "$SRC/restore.sh" \
    "$APP_DIR/deploy/"
if [ -s "$APP_DIR/.env" ]; then
    echo ".env exists, left as is"
else
    install -m 600 -o "$DEPLOY_USER" -g "$DEPLOY_USER" /dev/null "$APP_DIR/.env"
    echo "empty .env created: the lines to put there are in README.md, section \"Тест-стенд\""
fi
chown "$DEPLOY_USER:$DEPLOY_USER" "$APP_DIR/.env"
chmod 600 "$APP_DIR/.env"
echo ".env: $(stat -c '%A %U' "$APP_DIR/.env")"

step "3/5 Password of the stand"
# The group the nginx workers run as: they read the file when a request comes
nginx_group=$(nginx -T 2>/dev/null | awk '$1 == "user" { gsub(";", "", $NF); print $NF; exit }' || true)
nginx_group=${nginx_group:-www-data}
if [ -s "$HTPASSWD" ] && [ "${CHANGE_PASSWORD:-no}" != yes ]; then
    echo "the password file exists, left as is (to change the password: sudo CHANGE_PASSWORD=yes bash $0)"
else
    [ -t 0 ] || fail "the password is asked for: run it from a terminal, with ssh -t"
    echo "Login: $HTPASSWD_USER. Think of a password of at least 12 characters; nothing is shown as you type"
    read -r -s -p "Password of the stand: " password
    echo
    read -r -s -p "The same once more: " again
    echo
    [ "${#password}" -ge 12 ] || fail "the password is shorter than 12 characters: nothing was changed"
    [ "$password" = "$again" ] || fail "the two passwords differ: nothing was changed"
    # The password goes to openssl on stdin, never on a command line
    hash=$(openssl passwd -apr1 -stdin <<<"$password")
    (umask 027 && printf '%s:%s\n' "$HTPASSWD_USER" "$hash" >"$HTPASSWD")
    unset password again hash
    echo "password saved (only its hash)"
fi
chown "root:$nginx_group" "$HTPASSWD"
chmod 640 "$HTPASSWD"

step "4/5 nginx: $DOMAIN -> 127.0.0.1:$APP_PORT"
cat >"$NGINX_PROXY_SNIPPET" <<CONF
# Managed by setup-staging.sh (personal-crm repo, deploy/): the stand's container on 127.0.0.1:$APP_PORT.
proxy_pass http://127.0.0.1:$APP_PORT;
proxy_http_version 1.1;
proxy_set_header Host \$host;
proxy_set_header X-Forwarded-Host \$host;
proxy_set_header X-Forwarded-Proto \$scheme;
proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
proxy_set_header X-Real-IP \$remote_addr;
# Pages arrive in parts while data loads; buffering would hold them back
proxy_buffering off;
CONF
cat >"$NGINX_TLS_SNIPPET" <<CONF
# Managed by setup-staging.sh: the stand's own certificate, made for $DOMAIN only.
ssl_certificate     $CERT_DIR/fullchain.pem;
ssl_certificate_key $CERT_DIR/privkey.pem;
ssl_session_cache   shared:crm_staging_tls:10m;
ssl_session_timeout 1d;
CONF

http_block() {
    local action=$1
    cat <<CONF
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN;
    location /.well-known/acme-challenge/ { root $ACME_ROOT; }
    location / { $action }
}
CONF
}

if [ ! -s "$CERT_DIR/fullchain.pem" ]; then
    # No certificate yet, so no https block yet: nginx would not start with a missing file.
    # Only the address certbot checks answers for now
    {
        echo "# Managed by setup-staging.sh: the test stand $DOMAIN."
        http_block 'return 404;'
    } >"$NGINX_SITE"
    ln -sf "$NGINX_SITE" "$NGINX_ENABLED"
    reload_nginx
    echo "nginx answers for $DOMAIN on port 80"

    step "5/5 Certificate for $DOMAIN"
    # Its own certificate and its own renewal; the deploy hook makes nginx read the new files
    certbot certonly --webroot -w "$ACME_ROOT" -d "$DOMAIN" --non-interactive --agree-tos \
        --deploy-hook "systemctl reload nginx" ||
        { undo_nginx; fail "certbot could not issue the certificate for $DOMAIN, see its lines above"; }
else
    step "5/5 Certificate for $DOMAIN"
    echo "the certificate exists, nothing to issue"
fi

{
    echo "# Managed by setup-staging.sh: the test stand $DOMAIN, behind a password."
    echo "# The server's other sites are in crm.conf; this file is the only one that belongs to the stand."
    http_block 'return 301 https://$host$request_uri;'
    cat <<CONF

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name $DOMAIN;
    include $NGINX_TLS_SNIPPET;

    # A test stand is not for search engines
    add_header X-Robots-Tag "noindex, nofollow" always;

    auth_basic "Test stand";
    auth_basic_user_file $HTPASSWD;

    # The deploy checks this from GitHub, which has no password. It answers ok and the version
    location = /health {
        auth_basic off;
        include $NGINX_PROXY_SNIPPET;
    }

    location / {
        include $NGINX_PROXY_SNIPPET;
    }
}
CONF
} >"$NGINX_SITE"
ln -sf "$NGINX_SITE" "$NGINX_ENABLED"
reload_nginx
echo "nginx reloaded: $DOMAIN is behind the password, only /health is open"

step "Checks"
echo "certificate: $(openssl x509 -in "$CERT_DIR/fullchain.pem" -noout -enddate)"
code_page=$(curl -s -o /dev/null -m 10 -w '%{http_code}' --resolve "$DOMAIN:443:127.0.0.1" "https://$DOMAIN/" || true)
code_health=$(curl -s -o /dev/null -m 10 -w '%{http_code}' --resolve "$DOMAIN:443:127.0.0.1" "https://$DOMAIN/health" || true)
echo "https://$DOMAIN/        -> $code_page (401 means: the password is asked)"
echo "https://$DOMAIN/health  -> $code_health (502 until the first deploy, then 200)"
echo
echo "ALL DONE $(date -Is)"
