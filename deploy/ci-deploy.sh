#!/usr/bin/env bash
# Runs in GitHub Actions once the image is in GHCR (see .github/workflows/deploy.yml):
# copies deploy/ to the server, runs deploy.sh there and smoke-tests the public address.
# Needs DEPLOY_HOST, DEPLOY_KNOWN_HOSTS, DEPLOY_SSH_KEY and the job's GITHUB_TOKEN.
set -Eeuo pipefail

APP_URL=https://app.example-crm.site
REMOTE=crmdeploy@${DEPLOY_HOST:?}
REMOTE_DIR=/srv/prod/deploy

step() { printf '\n=== %s\n' "$*"; }
fail() { echo "ERROR: $*" >&2; exit 1; }

install -d -m 700 ~/.ssh
printf '%s\n' "${DEPLOY_SSH_KEY:?}" >~/.ssh/deploy_key
chmod 600 ~/.ssh/deploy_key
printf '%s\n' "${DEPLOY_KNOWN_HOSTS:?}" >~/.ssh/known_hosts
ssh_options=(-i ~/.ssh/deploy_key -o BatchMode=yes -o StrictHostKeyChecking=yes -o ServerAliveInterval=30)

step "Copying deploy/ to $REMOTE_DIR"
scp -q "${ssh_options[@]}" deploy/* "$REMOTE:$REMOTE_DIR/"

step "Deploying $GITHUB_SHA on the server"
# The registry token goes on stdin: command lines are visible to everyone on the server
ssh -T "${ssh_options[@]}" "$REMOTE" bash "$REMOTE_DIR/deploy.sh" deploy "$GITHUB_SHA" "$GITHUB_ACTOR" \
    <<<"${GITHUB_TOKEN:?}"

step "Smoke test of $APP_URL/health"
body=$(mktemp)
code=$(curl -sS -o "$body" -w '%{http_code}' --retry 5 --retry-delay 3 --retry-all-errors "$APP_URL/health") || true
echo "HTTP ${code:-none}: $(cat "$body")"
[ "$code" = 200 ] || fail "$APP_URL/health did not answer 200"
[ "$(jq -r .commit "$body")" = "$GITHUB_SHA" ] || fail "$APP_URL runs another version, not $GITHUB_SHA"
echo "$GITHUB_SHA is live at $APP_URL"
