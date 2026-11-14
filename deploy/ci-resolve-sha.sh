#!/usr/bin/env bash
# Runs in the Deploy prod workflow: decides what that run does and writes it to the step outputs
# (mode: deploy or rollback; sha: the commit to deploy, empty for a rollback).
# Reads INPUT_SHA and INPUT_ROLLBACK (the workflow inputs), GH_TOKEN and GITHUB_REPOSITORY.
#
# Prod only gets a commit that went through the test stand: one with a green run of the Deploy
# staging workflow (.github/workflows/deploy.yml) on main. A green run means the image was built,
# deployed to the stand and passed the smoke test there. A rollback is the way back, so it skips
# this check: the version it returns to ran on prod before.
set -Eeuo pipefail

fail() { echo "ERROR: $*" >&2; exit 1; }

output() { echo "$1=$2" >>"${GITHUB_OUTPUT:?}"; }

if [ "${INPUT_ROLLBACK:-false}" = true ]; then
    if [ -n "${INPUT_SHA:-}" ]; then
        echo "::warning::The sha field is ignored: a rollback goes to the version before the current one"
    fi
    echo "Rollback: the version before the current one, the server knows which. The test stand is not checked"
    output mode rollback
    output sha ""
    exit 0
fi

# Newest first. Green runs are picked here, not with `gh run list --status success`: that filter
# is applied by GitHub, and it left out a finished green run for over half an hour, so the script
# quietly chose an older commit and prod got an old version.
green=$(gh run list --repo "${GITHUB_REPOSITORY:?}" --workflow deploy.yml --branch main \
    --limit 100 --json headSha,conclusion \
    --jq '.[] | select(.conclusion == "success") | .headSha')
[ -n "$green" ] || fail "no green deploy to the test stand in the last 100 runs of Deploy staging: nothing to deploy"

if [ -z "${INPUT_SHA:-}" ]; then
    sha=$(head -n 1 <<<"$green")
    echo "The sha field is empty: the last green deploy to the test stand, $sha"
else
    sha=$INPUT_SHA
    [[ $sha =~ ^[0-9a-f]{40}$ ]] || fail "sha must be a full commit hash, 40 characters 0-9 a-f: '$sha'"
    grep -qx "$sha" <<<"$green" ||
        fail "$sha has no green deploy to the test stand among the last 100 runs of Deploy staging: prod only gets what passed the stand"
    echo "Manual sha $sha: it has a green deploy to the test stand"
fi
output mode deploy
output sha "$sha"
