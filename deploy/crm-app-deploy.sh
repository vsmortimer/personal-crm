#!/usr/bin/env bash
# Runs the app on the server. setup-server.sh installs it as /usr/local/sbin/crm-app-deploy.
#
#   crm-app-deploy          deploy the image read from stdin (docker save | gzip).
#                           GitHub Actions runs it over SSH as crmdeploy: the only command
#                           that user may run, and only without arguments.
#   crm-app-deploy seed     fill an empty database with test data
#   crm-app-deploy status   show the containers and the running version
#
# A deploy starts the database, applies migrations, starts the new version and waits for
# /health. If the new version does not come up, the previous one is started again.
set -Eeuo pipefail

APP_DIR=/srv/crm-app
TAG_FILE=$APP_DIR/deployed-tag
IMAGE=personal-crm
HEALTH_URL=http://127.0.0.1:3000/health
MAX_UPLOAD_BYTES=$((1024 * 1024 * 1024))
WAIT_SECONDS=120

step() { printf '\n=== %s\n' "$*"; }
fail() { echo "ERROR: $*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || fail "run as root: sudo crm-app-deploy $*"
cd "$APP_DIR"
[ -s .env ] || fail "$APP_DIR/.env is empty: put the database settings there first"

# One deploy at a time
exec 9>/run/lock/crm-app-deploy.lock
flock -w 900 9 || fail "another deploy is still running"

# compose.yaml needs a tag even for commands that only touch the database
compose() { APP_TAG=$1 docker compose "${@:2}" </dev/null; }

deployed_tag() { cat "$TAG_FILE" 2>/dev/null || true; }

# Prints the commit of the loaded image. Accepts exactly one image named personal-crm:<commit>.
load_image() {
    local output tag
    output=$(head -c "$MAX_UPLOAD_BYTES" | gzip -dc | docker load) || fail "could not load the image from stdin"
    echo "$output" >&2
    [ "$(grep -c '^Loaded image' <<<"$output")" -eq 1 ] || fail "expected exactly one image"
    tag=$(sed -n "s/^Loaded image: $IMAGE:\([0-9a-f]\{40\}\)$/\1/p" <<<"$output")
    [ -n "$tag" ] || fail "the image must be tagged $IMAGE:<full commit hash>"
    echo "$tag"
}

health_matches() {
    local body
    body=$(curl -fsS -m 10 "$HEALTH_URL") || return 1
    echo "health: $body"
    [[ $body == *"\"commit\":\"$1\""* ]]
}

# Removes images of older versions, keeping the ones passed as arguments
remove_old_images() {
    local tag
    docker image ls "$IMAGE" --format '{{.Tag}}' | while read -r tag; do
        [[ $tag =~ ^[0-9a-f]{40}$ ]] || continue
        case " $* " in *" $tag "*) continue ;; esac
        docker image rm "$IMAGE:$tag" >/dev/null && echo "removed $IMAGE:$tag"
    done
    docker image prune -f >/dev/null
}

deploy() {
    local tag previous
    step "Receiving the image"
    tag=$(load_image)
    previous=$(deployed_tag)
    echo "new version: $tag"
    echo "running now: ${previous:-nothing}"

    step "Starting the database"
    compose "$tag" up -d --wait --wait-timeout "$WAIT_SECONDS" db

    step "Applying migrations"
    compose "$tag" run --rm -T app node db-scripts/migrate.cjs

    step "Starting the new version"
    if ! compose "$tag" up -d --wait --wait-timeout "$WAIT_SECONDS" app || ! health_matches "$tag"; then
        echo "The new version did not become healthy. Its last log lines:"
        compose "$tag" logs --tail 80 app || true
        if [ -n "$previous" ]; then
            # Migrations stay applied: they must keep working with the previous version
            step "Rolling back to $previous"
            compose "$previous" up -d --wait --wait-timeout "$WAIT_SECONDS" app || true
        fi
        fail "deploy of $tag failed"
    fi
    echo "$tag" >"$TAG_FILE"

    step "Removing old images"
    remove_old_images "$tag" "$previous"

    step "Done: $tag is live"
}

seed() {
    local tag
    tag=$(deployed_tag)
    [ -n "$tag" ] || fail "nothing is deployed yet"
    compose "$tag" run --rm -T app node db-scripts/seed.cjs
}

status() {
    local tag
    tag=$(deployed_tag)
    echo "deployed: ${tag:-nothing}"
    compose "${tag:-none}" ps
    curl -sS -m 10 "$HEALTH_URL" || true
    echo
}

case "${1:-deploy}" in
    deploy) deploy ;;
    seed) seed ;;
    status) status ;;
    *) fail "usage: crm-app-deploy [deploy|seed|status]" ;;
esac
