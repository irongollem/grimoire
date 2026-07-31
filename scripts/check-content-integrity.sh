#!/bin/sh
# Local mirror of the "Verify content referential integrity" step in
# .github/workflows/test.yml, which runs this same SQL against PRODUCTION
# immediately after `supabase db push` and fails the release on any returned
# row. Running it locally first means a migration that strands text-id
# references to shared content is caught before it can fail a deploy — and a
# failed deploy strands every *other* migration queued behind it.
#
# Not vacuous locally, despite the caveat in the check file's header: this
# repo's supabase/seed.sql is a production data dump (`npm run db:pull`), so a
# freshly reset local DB carries real referrer data.
#
# Semantics match CI exactly: zero rows = pass, any row = fail.
set -eu

DB_URL="${SUPABASE_DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"

if ! command -v psql >/dev/null 2>&1; then
  echo "check-content-integrity: psql not found on PATH" >&2
  exit 1
fi

rows=$(psql "$DB_URL" -tA -v ON_ERROR_STOP=1 -f supabase/checks/content_integrity.sql)

if [ -n "$rows" ]; then
  echo "$rows"
  echo "" >&2
  echo "Dangling shared-content references (check|count above)." >&2
  echo "See supabase/checks/content_integrity.sql — this is what fails the production deploy." >&2
  exit 1
fi

echo "content integrity: clean"
