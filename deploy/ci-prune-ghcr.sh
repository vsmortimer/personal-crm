#!/usr/bin/env bash
# Runs in the Deploy prod workflow after a successful deploy: ci-prune-ghcr.sh <deployed commit>.
# GHCR keeps the 10 newest builds of the app image (versions tagged with a full commit hash);
# older ones are deleted, except the commit that was just deployed. Untagged versions are left
# alone: they may belong to a tagged one.
# Needs GH_TOKEN with packages: write and GITHUB_REPOSITORY. DRY_RUN=yes only lists what would go.
set -Eeuo pipefail

KEEP=10

fail() { echo "ERROR: $*" >&2; exit 1; }

deployed=${1:-}
[[ $deployed =~ ^[0-9a-f]{40}$ ]] || fail "usage: ci-prune-ghcr.sh <full commit hash>"
owner=${GITHUB_REPOSITORY:?}
package=${owner#*/}
owner=${owner%%/*}
api=/users/$owner/packages/container/$package/versions

versions=$(gh api --paginate "$api?per_page=100" | jq -s 'add // []')
tagged=$(jq '[.[] | select(any(.metadata.container.tags[]?; test("^[0-9a-f]{40}$")))] | length' <<<"$versions")
echo "$tagged builds in GHCR, keeping the newest $KEEP and $deployed"

doomed=$(jq -r --argjson keep "$KEEP" --arg deployed "$deployed" '
    [.[] | select(any(.metadata.container.tags[]?; test("^[0-9a-f]{40}$")))]
    | sort_by(.created_at) | reverse | .[$keep:]
    | map(select((.metadata.container.tags | index($deployed)) | not))
    | .[] | "\(.id) \(.metadata.container.tags | join(","))"' <<<"$versions")

if [ -z "$doomed" ]; then
    echo "nothing to delete"
    exit 0
fi
while read -r id tags; do
    if [ "${DRY_RUN:-no}" = yes ]; then
        echo "would delete version $id ($tags)"
    else
        gh api -X DELETE "$api/$id" --silent
        echo "deleted version $id ($tags)"
    fi
done <<<"$doomed"
