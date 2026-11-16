#!/usr/bin/env bash
# The performance budgets, measured on this machine before a push: the same
# journeys and the same check (scripts/perf/check-budgets.ts) that CI's
# performance job runs minutes after one. `npm run perf:code` predicts only the
# code-file counts from dist/; API requests and serial depth need the real
# journeys, which is what this runs. /ship runs it whenever src/ changed.
#
# Local only, like the rest of the harness: it builds into dist-perf/ (so dist/
# is left alone), serves it on 127.0.0.1:4173, measures against the local
# Supabase stack with the synthetic fixture, and stops its server on exit.
# Three runs, as CI: serial depth is judged on the shallowest.
set -euo pipefail
cd "$(dirname "$0")/../.."

PORT=4173
OUT_DIR=dist-perf
RESULT=perf-results/ship.json

if ! supabase status >/dev/null 2>&1; then
  echo "The local Supabase stack is not running. Start it with: npm run db:start" >&2
  exit 1
fi
if lsof -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Port $PORT is in use; stop whatever serves it (an earlier vite preview?) and run again." >&2
  exit 1
fi

# The browser the journeys run in; a no-op once it is installed.
npx playwright install chromium >/dev/null
npm run --silent perf:fixture
# The empty token is required: without it the build uploads source maps to Sentry.
SENTRY_AUTH_TOKEN= npx vite build --mode localdb --outDir "$OUT_DIR" --emptyOutDir --logLevel warn

npx vite preview --mode localdb --outDir "$OUT_DIR" --host 127.0.0.1 --port "$PORT" --strictPort >/dev/null 2>&1 &
PREVIEW=$!
trap 'kill "$PREVIEW" 2>/dev/null || true' EXIT
for _ in $(seq 1 60); do
  curl -sf "http://127.0.0.1:$PORT/" >/dev/null && break
  sleep 0.5
done
curl -sf "http://127.0.0.1:$PORT/" >/dev/null || { echo "vite preview did not come up on 127.0.0.1:$PORT" >&2; exit 1; }

mkdir -p perf-results
npx tsx --tsconfig tsconfig.node.json scripts/perf/run.ts --runs 3 --out "$RESULT"
npx tsx --tsconfig tsconfig.node.json scripts/perf/check-budgets.ts "$RESULT"
