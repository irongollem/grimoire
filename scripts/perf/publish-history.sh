#!/bin/sh
# Appends one history line to history.jsonl on the orphan `perf-history` branch.
#
# Usage: scripts/perf/publish-history.sh <entry-file>
#
# Runs inside a checkout (CI's), through a throwaway worktree, because the
# checkout step's push credentials live in that repo's own git config and a
# fresh clone would not have them. The branch is created orphan the first time
# (it shares no history with the code: it is a data log, and keeping it out of
# main's history keeps `git log` readable). Concurrent releases race on the
# push; a rejected push is refetched and retried, never forced.
set -eu

entry_file=${1:?usage: publish-history.sh <entry-file>}
remote=${PERF_HISTORY_REMOTE:-origin}
branch=perf-history
work=$(mktemp -d)
wt="$work/wt"
cleanup() { git worktree remove --force "$wt" >/dev/null 2>&1 || true; rm -rf "$work"; }
trap cleanup EXIT

identity="-c user.name=github-actions[bot] -c user.email=41898282+github-actions[bot]@users.noreply.github.com"

attempt=1
while [ "$attempt" -le 5 ]; do
  git worktree remove --force "$wt" >/dev/null 2>&1 || true
  if git fetch --no-tags --depth=1 "$remote" "$branch" >/dev/null 2>&1; then
    git worktree add --detach "$wt" FETCH_HEAD >/dev/null
  else
    # Not there yet: start an empty orphan history.
    git worktree add --detach "$wt" HEAD >/dev/null
    git -C "$wt" checkout --orphan "$branch-new" >/dev/null 2>&1
    git -C "$wt" rm -rf -q . >/dev/null
  fi
  touch "$wt/history.jsonl"
  # Guarantee the previous last line ended in a newline before appending.
  if [ -s "$wt/history.jsonl" ] && [ "$(tail -c1 "$wt/history.jsonl" | wc -l)" -eq 0 ]; then echo >> "$wt/history.jsonl"; fi
  cat "$entry_file" >> "$wt/history.jsonl"
  echo >> "$wt/history.jsonl"
  git -C "$wt" add history.jsonl
  # shellcheck disable=SC2086
  git -C "$wt" $identity commit -q -m "perf: history for ${GITHUB_SHA:-local}"
  if git -C "$wt" push -q "$remote" "HEAD:refs/heads/$branch"; then
    echo "history appended to $remote/$branch (attempt $attempt)"
    exit 0
  fi
  echo "push rejected (attempt $attempt); refetching" >&2
  attempt=$((attempt + 1))
  sleep $((attempt * 2))
done
echo "could not append to $branch after 5 attempts" >&2
exit 1
