#!/usr/bin/env bash
# Runs the app on the server as user crmdeploy, compose project "prod". Every deploy copies
# deploy/ to /srv/prod/deploy and runs this script from there (see ci-deploy.sh).
#
#   deploy.sh deploy <commit> <registry user>   deploy ghcr.io/vsmortimer/personal-crm:<commit>;
#                                               the registry token comes on stdin
#   deploy.sh rollback [<commit>]               start the previous version again (by hand only)
#   deploy.sh status                            show the containers and the running version
#   deploy.sh seed                              fill an empty database with test data
#
# A deploy pulls the image, applies migrations in a one-off container from it, starts it and
# smoke-tests /health. A failed step stops the deploy, and nothing is rolled back automatically:
# a person looks at the failure and decides whether to run `rollback`.
set -Eeuo pipefail

APP_DIR=/srv/prod
IMAGE=ghcr.io/vsmortimer/personal-crm
IMAGE_SOURCE=https://github.com/vsmortimer/personal-crm
HEALTH_URL=http://127.0.0.1:3000/health
WAIT_SECONDS=120
# The version that last passed the smoke test, and the one live before the last deploy
LIVE_FILE=$APP_DIR/live-tag
PREVIOUS_FILE=$APP_DIR/previous-tag

step() { printf '\n=== %s\n' "$*"; }
fail() { echo "ERROR: $*" >&2; exit 1; }

[ "$(id -un)" = crmdeploy ] || fail "run as crmdeploy: sudo -u crmdeploy bash $0 $*"
cd "$APP_DIR"
[ -s .env ] || fail "$APP_DIR/.env is empty: put the database settings there first"

# One deploy or rollback at a time
lock() {
    exec 9>"$APP_DIR/deploy.lock"
    flock -w 900 9 || fail "another deploy is still running"
}

# compose.yaml needs a tag even for commands that only touch the database
compose() {
    APP_TAG=$1 docker compose -p prod --env-file "$APP_DIR/.env" -f "$APP_DIR/deploy/compose.yaml" "${@:2}" </dev/null
}

read_tag() { cat "$1" 2>/dev/null || true; }

check_tag() { [[ $1 =~ ^[0-9a-f]{40}$ ]] || fail "not a full commit hash: '$1'"; }

# The token is the GitHub Actions job's own: it expires with the job and is never saved here
pull_image() {
    local tag=$1 user=$2 token=$3 config status=0
    config=$(mktemp -d)
    { docker --config "$config" login ghcr.io -u "$user" --password-stdin <<<"$token" >/dev/null &&
        docker --config "$config" pull -q "$IMAGE:$tag"; } || status=$?
    rm -rf "$config"
    return "$status"
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

# Removes images of other versions, keeping the ones passed as arguments
remove_old_images() {
    local tag
    docker image ls "$IMAGE" --format '{{.Tag}}' | while read -r tag; do
        [[ $tag =~ ^[0-9a-f]{40}$ ]] || continue
        case " $* " in *" $tag "*) continue ;; esac
        docker image rm "$IMAGE:$tag" >/dev/null && echo "removed $IMAGE:$tag" || echo "could not remove $IMAGE:$tag"
    done
    # Untagged leftovers of this app only: other images on the server are not ours
    docker image prune -f --filter "label=org.opencontainers.image.source=$IMAGE_SOURCE" >/dev/null
}

deploy() {
    local tag=${1:-} user=${2:-} token live
    check_tag "$tag"
    [ -n "$user" ] || fail "usage: deploy.sh deploy <commit> <registry user>, the token on stdin"
    IFS= read -r token || true
    [ -n "$token" ] || fail "no registry token on stdin"
    live=$(read_tag "$LIVE_FILE")
    echo "new version: $tag"
    echo "live now:    ${live:-nothing}"

    step "Pulling $IMAGE:$tag"
    pull_image "$tag" "$user" "$token"

    step "Starting the database"
    compose "$tag" up -d --wait --wait-timeout "$WAIT_SECONDS" db

    step "Applying migrations in a one-off container"
    compose "$tag" run --rm -T app node db-scripts/migrate.cjs ||
        fail "migrations failed: the new version was not started, ${live:-nothing} keeps running"

    step "Starting the new version"
    # From here on `rollback` returns to the version that was live before this deploy
    if [ -n "$live" ] && [ "$live" != "$tag" ]; then
        echo "$live" >"$PREVIOUS_FILE"
    fi
    start_app "$tag" ||
        fail "deploy of $tag failed and nothing was rolled back. To start the previous version: deploy.sh rollback"
    echo "$tag" >"$LIVE_FILE"

    step "Removing old images"
    remove_old_images "$tag" "$(read_tag "$PREVIOUS_FILE")"

    step "Done: $tag is live"
}

# Migrations stay applied: the previous version must keep working with the newer schema
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

status() {
    local live
    live=$(read_tag "$LIVE_FILE")
    echo "live:     ${live:-nothing}"
    echo "previous: $(read_tag "$PREVIOUS_FILE")"
    compose "${live:-none}" ps
    docker image ls "$IMAGE"
    curl -sS -m 10 "$HEALTH_URL" || true
    echo
}

seed() {
    local live
    live=$(read_tag "$LIVE_FILE")
    [ -n "$live" ] || fail "nothing is deployed yet"
    compose "$live" run --rm -T app node db-scripts/seed.cjs
}

command=${1:-}
shift || true
case "$command" in
    deploy) lock; deploy "$@" ;;
    rollback) lock; rollback "$@" ;;
    seed) lock; seed ;;
    status) status ;;
    *) fail "usage: deploy.sh deploy <commit> <registry user> | rollback [<commit>] | status | seed" ;;
esac
