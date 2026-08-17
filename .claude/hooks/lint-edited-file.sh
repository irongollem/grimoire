#!/bin/bash
# PostToolUse hook — runs oxlint on the single file that was just written.
#
# Why this exists: `npm run lint` only runs in CI and in the pre-push gate, so a
# lint error introduced at 10% into a session is discovered at 100% of it, after
# forty tool calls have been built on top. oxlint is Rust — a single file takes
# roughly 20ms — so there is no reason to wait.
#
# Warnings block too, not just errors. The repo's whole-tree lint is currently
# silent (zero warnings, zero errors), and CLAUDE.md's bar is that the baseline
# is green and stays green. A `no-explicit-any` warning is a documented rule
# violation, not background noise, and treating it as one is only affordable
# because the baseline really is clean. If that ever stops being true, fix the
# tree rather than softening this hook — a warning tolerated here is a warning
# that becomes permanent, which is exactly the mechanism CLAUDE.md describes.
#
# Exit 2 feeds stderr back to Claude as a blocking error. The edit has already
# landed at PostToolUse time, so this is a correction prompt, not a veto.

set -uo pipefail

payload=$(cat)

file=$(printf '%s' "$payload" | jq -r '.tool_input.file_path // empty' 2>/dev/null)
[ -n "$file" ] || exit 0
[ -f "$file" ] || exit 0

case "$file" in
  *.ts | *.tsx | *.vue | *.js | *.mjs) ;;
  *) exit 0 ;;
esac

project="${CLAUDE_PROJECT_DIR:-}"
[ -n "$project" ] || exit 0
cd "$project" || exit 0

# Only the paths `npm run lint` covers. Linting outside them would report
# problems that CI does not gate on, which trains the reader to ignore this.
rel="${file#"$project"/}"
case "$rel" in
  src/* | scripts/* | supabase/functions/* | infra/*) ;;
  *) exit 0 ;;
esac

[ -x ./node_modules/.bin/oxlint ] || exit 0

out=$(./node_modules/.bin/oxlint --config oxlint.json "$rel" 2>&1)
status=$?

# oxlint exits 1 for errors and 0 for warnings-only, so the exit code alone
# would let every warning through. Check the text as well.
if [ "$status" -eq 0 ] && ! printf '%s' "$out" | grep -qE '^\S+:[0-9]+:[0-9]+: (error|warning)'; then
  exit 0
fi

{
  echo "oxlint is not clean on ${rel}:"
  echo
  printf '%s\n' "$out"
  echo
  echo "Fix this now — see CLAUDE.md 'Leave the Plate Clean'. Do not explain it as pre-existing;"
  echo "the whole-tree lint is green, so anything here arrived with an edit in this session."
} >&2

exit 2
