#!/bin/bash
# SessionStart hook — installs Node dependencies so `npm run build`, `npm run
# lint`, and `npm run dev` are ready when the Claude Code session begins.
#
# Grimoire is Vue + Vite + Supabase; the repo is all JS/TS — no Python, no
# Rust, no Go. `npm install` is the only setup step needed for a working
# agent environment. Supabase CLI operations (`supabase db push`, function
# deploys) happen on the user's machine, not here, so the CLI isn't
# provisioned from this hook.
#
# Remote-only: we short-circuit on local runs so maintainers don't get a
# surprise `npm install` every session.

set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

echo "[session-start] installing npm dependencies…"
# `npm ci`, not `npm install`. This used to be `npm install` on the reasoning
# that it reuses node_modules incrementally and is "a no-op when the lockfile
# is already satisfied". The second half was not true here: this image runs
# npm 10.9.x while package.json pins `engines.node ^24`, and the older npm does
# not understand the `libc` field the newer one writes — so every session start
# silently rewrote package-lock.json, stripping `libc` from 42 optional
# platform binaries and reclassifying 56 packages as `dev`. No version,
# resolved or integrity line moved, which is what made it look like harmless
# churn rather than what it was: a lockfile downgrade, offered up for commit on
# whatever branch the session happened to be on.
#
# `npm ci` never writes the lockfile, and it installs exactly the tree CI does
# (.github/workflows/test.yml runs `npm ci` too), so a suite that passes here
# passed against the same dependencies. It costs ~17s on a warm container
# against ~1s for an incremental install — cheap once per session for a tree
# that matches CI and a lockfile that cannot drift.
#
# The fallback matters: `npm ci` fails outright when package.json and the
# lockfile disagree, and under `set -e` that would abort the hook and leave the
# session with no dependencies at all. `--no-save` installs without writing the
# lockfile either, so neither path can reintroduce the downgrade.
if ! npm ci --no-audit --no-fund --loglevel=error; then
  echo "[session-start] npm ci failed — package-lock.json may be out of sync with package.json."
  echo "[session-start] falling back to a non-writing install so the session still has dependencies."
  npm install --no-save --no-audit --no-fund --loglevel=error
fi
echo "[session-start] done"
