#!/usr/bin/env bash
# Runs the app on the server as user crmdeploy, compose project "prod". Every deploy copies
# deploy/ to /srv/prod/deploy and runs this script from there (see ci-deploy.sh).
#
#   deploy.sh deploy <commit> <registry user>   deploy ghcr.io/vsmortimer/personal-crm:<commit>;
#                                               the registry token comes on stdin
#   deploy.sh rollback [<commit>]               start the previous version again (by hand only)
#   deploy.sh status                            show the containers, the running version, backups
#   deploy.sh seed                              fill an empty database with test data
#
# A deploy backs up the database, pulls the image, applies migrations in a one-off container
# from it, starts it and smoke-tests /health. A failed step stops the deploy, and nothing is
# rolled back automatically: a person looks at the failure and decides whether to run `rollback`.
# Restoring a backup is restore.sh, also by hand only.
set -Eeuo pipefail

# shellcheck source=lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
require_deploy_user "$@"

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

    step "Backup of the database"
    compose "$tag" up -d --wait --wait-timeout "$WAIT_SECONDS" db
    if [ -n "$live" ]; then
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
        fail "deploy of $tag failed and nothing was rolled back. To start the previous version: deploy.sh rollback"
    echo "$tag" >"$LIVE_FILE"

    step "Removing old images"
    remove_old_images "$tag" "$(read_tag "$PREVIOUS_FILE")"

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

status() {
    local live
    live=$(read_tag "$LIVE_FILE")
    echo "live:     ${live:-nothing}"
    echo "previous: $(read_tag "$PREVIOUS_FILE")"
    compose "${live:-none}" ps
    docker image ls "$IMAGE"
    curl -sS -m 10 "$HEALTH_URL" || true
    echo
    list_backups
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
