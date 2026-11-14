#!/usr/bin/env bash
# Runs in GitHub Actions for one environment (see .github/workflows/deploy.yml and deploy-prod.yml):
#   ci-deploy.sh <staging|prod> deploy <commit>   deploy ghcr.io/vsmortimer/personal-crm:<commit>
#   ci-deploy.sh prod rollback                    start the version prod ran before the current one
# Copies deploy/ to the server, runs deploy.sh there and smoke-tests the public address. The same
# script serves the stand and prod. What was deployed goes to the run summary.
# Needs DEPLOY_HOST, DEPLOY_KNOWN_HOSTS, DEPLOY_SSH_KEY and the job's GITHUB_TOKEN.
set -Eeuo pipefail

step() { printf '\n=== %s\n' "$*"; }
fail() { echo "ERROR: $*" >&2; exit 1; }
summary() { [ -z "${GITHUB_STEP_SUMMARY:-}" ] || printf '%s\n' "$*" >>"$GITHUB_STEP_SUMMARY"; }

ENVIRONMENT=${1:-}
MODE=${2:-}
SHA=${3:-}
case "$ENVIRONMENT" in
    prod) APP_URL=https://app.example-crm.site ;;
    # The stand is behind a password, except /health: this check comes without one
    staging) APP_URL=https://test-app.example-crm.site ;;
    *) fail "usage: ci-deploy.sh <staging|prod> deploy <commit> | ci-deploy.sh prod rollback" ;;
esac
case "$MODE" in
    deploy) [[ $SHA =~ ^[0-9a-f]{40}$ ]] || fail "deploy needs a full commit hash, got '$SHA'" ;;
    rollback) [ "$ENVIRONMENT" = prod ] || fail "rollback from here is for prod only" ;;
    *) fail "usage: ci-deploy.sh <staging|prod> deploy <commit> | ci-deploy.sh prod rollback" ;;
esac
REMOTE=crmdeploy@${DEPLOY_HOST:?}
REMOTE_DIR=/srv/$ENVIRONMENT/deploy

install -d -m 700 ~/.ssh
printf '%s\n' "${DEPLOY_SSH_KEY:?}" >~/.ssh/deploy_key
chmod 600 ~/.ssh/deploy_key
printf '%s\n' "${DEPLOY_KNOWN_HOSTS:?}" >~/.ssh/known_hosts
ssh_options=(-i ~/.ssh/deploy_key -o BatchMode=yes -o StrictHostKeyChecking=yes -o ServerAliveInterval=30)

# The version the server runs as the environment's live one: empty if nothing is deployed yet
live_version() { ssh -T "${ssh_options[@]}" "$REMOTE" cat "/srv/$ENVIRONMENT/live-tag" 2>/dev/null || true; }

step "Copying deploy/ to $REMOTE_DIR"
scp -q "${ssh_options[@]}" deploy/* "$REMOTE:$REMOTE_DIR/"

before=$(live_version)
if [ "$MODE" = deploy ]; then
    step "Deploying $SHA to $ENVIRONMENT on the server"
    # The registry token goes on stdin: command lines are visible to everyone on the server
    ssh -T "${ssh_options[@]}" "$REMOTE" bash "$REMOTE_DIR/deploy.sh" "$ENVIRONMENT" deploy "$SHA" "$GITHUB_ACTOR" \
        <<<"${GITHUB_TOKEN:?}"
    expected=$SHA
else
    step "Rolling $ENVIRONMENT back to the version before the current one"
    ssh -T "${ssh_options[@]}" "$REMOTE" bash "$REMOTE_DIR/deploy.sh" "$ENVIRONMENT" rollback </dev/null
    expected=$(live_version)
    [[ $expected =~ ^[0-9a-f]{40}$ ]] || fail "cannot read the version $ENVIRONMENT runs after the rollback"
fi

step "Smoke test of $APP_URL/health"
body=$(mktemp)
code=$(curl -sS -o "$body" -w '%{http_code}' --retry 5 --retry-delay 3 --retry-all-errors "$APP_URL/health") || true
echo "HTTP ${code:-none}: $(cat "$body")"
[ "$code" = 200 ] || fail "$APP_URL/health did not answer 200"
[ "$(jq -r .commit "$body")" = "$expected" ] || fail "$APP_URL runs another version, not $expected"
echo "$expected is live at $APP_URL"

commit_url=${GITHUB_SERVER_URL:-https://github.com}/${GITHUB_REPOSITORY:-}/commit
summary "## $ENVIRONMENT: $MODE done"
summary ""
summary "- Now live: [\`$expected\`]($commit_url/$expected), $APP_URL"
summary "- Was live: \`${before:-nothing}\`"
if [ "$MODE" = rollback ]; then
    summary "- Rolled back. To go forward again, run Deploy prod with the sha field empty or a commit that passed the test stand"
fi
