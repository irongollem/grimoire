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
# `npm install` (not `npm ci`) so the container cache can incrementally reuse
# node_modules across sessions. Idempotent — no-op when the lockfile is
# already satisfied.
npm install --no-audit --no-fund --loglevel=error
echo "[session-start] done"
