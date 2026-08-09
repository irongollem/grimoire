#!/bin/sh
# Guard the migration version space against the two ways parallel sessions
# break it. Both have hit production; neither is visible to the author at the
# time they pick a number, which is why this runs in CI rather than living in a
# convention.
#
#   1. COLLISION. Two files claim one version. `supabase db push` dies on
#      schema_migrations_pkey and every later migration is stranded behind it.
#      Hit on 5 Aug 2026 (#602 vs PR #615) and again on 9 Aug 2026
#      (bug_report_privacy vs confine_campaign_delete_disposition_to_owner).
#
#   2. OUT OF ORDER. A migration is authored, then something else merges and
#      deploys first, so by the time it lands its version is in the past.
#      `db push` refuses it with "Found local migration files to be inserted
#      before the last migration on remote database" — and because Vercel
#      deploys off the same push but through a different pipeline, the frontend
#      ships anyway and runs against a schema that never got the change. That is
#      exactly what happened to #649 on 9 Aug 2026.
#
# Both are cheap to fix at PR time (rename the file, update its references) and
# expensive after merge (a red release, a schema/code skew in production).
#
# Run with no arguments to check the working tree against origin/main.
set -eu

MIGRATIONS_DIR="supabase/migrations"
BASE_REF="${1:-origin/main}"
status=0

# ── Filename shape ──────────────────────────────────────────────────────────
# 14 digits, matching `supabase migration new`'s YYYYMMDDHHMMSS. The older
# YYYYMMDD + 6-digit counter files are the same width and sort correctly
# against it, which is why the switch needed no renaming of history.
for path in "$MIGRATIONS_DIR"/*.sql; do
  name=$(basename "$path")
  case "$name" in
    [0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]_*.sql) ;;
    *)
      echo "ERROR: $name is not <14-digit version>_<name>.sql"
      echo "       Use \`supabase migration new <name>\` (or /new-migration) to get a valid one."
      status=1
      ;;
  esac
done

# ── 1. Collisions ───────────────────────────────────────────────────────────
duplicates=$(
  for path in "$MIGRATIONS_DIR"/*.sql; do
    basename "$path" | cut -c1-14
  done | sort | uniq -d
)
if [ -n "$duplicates" ]; then
  echo "ERROR: two or more migrations share a version — \`supabase db push\` will fail on"
  echo "       schema_migrations_pkey and strand everything queued behind them:"
  for version in $duplicates; do
    for path in "$MIGRATIONS_DIR/$version"*.sql; do
      echo "         $(basename "$path")"
    done
  done
  echo "       Renumber the one with the FEWER references (grep the repo for the version"
  echo "       string) to the next free version, and update those references."
  status=1
fi

# ── 2. Out of order against the base branch ─────────────────────────────────
# Skipped when the base ref is unavailable — a shallow clone or a local run
# without a remote should not fail the build for lacking a comparison.
if git rev-parse --verify --quiet "$BASE_REF" >/dev/null; then
  base_versions=$(
    git ls-tree -r "$BASE_REF" --name-only -- "$MIGRATIONS_DIR" 2>/dev/null |
      sed "s|.*/||" | cut -c1-14 | sort
  )
  base_max=$(printf '%s\n' "$base_versions" | sort -n | tail -1)
  if [ -n "$base_max" ]; then
    # Compared from the FILESYSTEM rather than `git diff HEAD`, so an
    # uncommitted rename is caught when you run this locally — the moment it is
    # cheapest to fix — and not only once it has been committed.
    for path in "$MIGRATIONS_DIR"/*.sql; do
      version=$(basename "$path" | cut -c1-14)
      # Already on the base branch: not this change's problem, and possibly
      # already applied to production, where renaming it would re-run it.
      if printf '%s\n' "$base_versions" | grep -qx "$version"; then continue; fi
      # -le, not -lt: an equal version is the collision case above, and it is
      # just as fatal when the twin is on the base branch rather than beside it.
      if [ "$version" -le "$base_max" ]; then
        echo "ERROR: $(basename "$path") is dated at or before the newest migration on $BASE_REF ($base_max)."
        echo "       \`supabase db push\` refuses migrations inserted before the last applied one,"
        echo "       so this fails the release AFTER the frontend has already deployed."
        echo "       Rename it to a version above $base_max and update any references to it."
        status=1
      fi
    done
  fi
fi

if [ "$status" -eq 0 ]; then
  echo "Migration versions OK: unique, well-formed, and newer than $BASE_REF."
fi
exit $status
