---
name: new-migration
description: Create a new Supabase migration file with the correct next sequence number for today, avoiding timestamp collisions when multiple migrations are written on the same day.
user-invocable: true
allowed-tools:
  - Bash
  - Glob
  - Write
---

# /new-migration — Create a Supabase Migration File

Arguments: `<name>` (required) — a short snake_case description of what the migration does, e.g. `add_quest_tags` or `drop_faction_color`.

---

## What this skill does

Migration files use the format `YYYYMMDDNNNNNN_name.sql` where `NNNNNN` is a 6-digit sequence padded to 6 digits. When multiple migrations are created on the same day, collisions happen if the sequence isn't incremented.

This skill:

1. Reads today's date in `YYYYMMDD` format
2. Scans `supabase/migrations/` for files matching today's date prefix
3. Picks the next available sequence number (max existing + 1, starting at `000001`)
4. Creates the file at `supabase/migrations/<timestamp>_<name>.sql` with a standard template
5. Reports the full filename so you can immediately start writing SQL into it

---

## Step 1 — Determine next sequence number

Check local files, `origin/main`, **and every unmerged remote branch**. The
third one is not optional: a migration sitting on an open PR branch is invisible
to the first two, and the collision only appears after that PR merges and your
work rebases on top of it — by which point both files are in `main` with the
same version and `supabase db push` dies on
`duplicate key value violates unique constraint "schema_migrations_pkey"`.
That is not hypothetical; it happened on 5 Aug 2026 when #602's migration and
PR #615's `notification_preferences` both claimed `20260805000002`, and it took
a red CI plus a rename-and-fix-every-reference commit to undo.

```bash
today=$(date +%Y%m%d)
git fetch --all --quiet 2>/dev/null
# Local sequences for today
local_max=$(ls supabase/migrations/ | grep "^${today}" | sed "s/^${today}//" | cut -c1-6 | sort -n | tail -1)
# Every remote branch, not just main — catches migrations on open PR branches
# that have not merged yet. `git ls-tree` per branch is the only way to see a
# file that exists on a ref you have not checked out.
remote_max=$(for ref in $(git for-each-ref --format='%(refname)' refs/remotes/ 2>/dev/null); do
    git ls-tree -r "$ref" --name-only -- supabase/migrations/ 2>/dev/null
  done | grep "^supabase/migrations/${today}" | sed "s|supabase/migrations/${today}||" | cut -c1-6 | sort -n | tail -1)
# Take the highest of them all
printf '%s\n%s\n' "${local_max}" "${remote_max}" | sort -n | tail -1
```

If no files exist for today anywhere, the sequence starts at `000001`.
If the highest is e.g. `000003`, use `000004`.

**Skipping a number is free; reusing one is not.** When in doubt, take the next
number after the highest you saw anywhere — gaps in the sequence are harmless
(nothing reads them as consecutive), while a duplicate blocks every deploy until
someone renames a file and chases down every reference to it in comments, docs
and closed issues.

## Step 2 — Construct filename

```
<YYYYMMDD><NNNNNN>_<name>.sql
```

Example: if today is 2026-04-11, 3 migrations already exist for today, and name is `add_quest_tags`:
→ `20260411000004_add_quest_tags.sql`

## Step 3 — Write the template

Create the file at `supabase/migrations/<filename>` with this content:

```sql
-- Migration: <name>
-- <one-line description of what this migration does>

```

Leave the body empty after the header comment — the user will fill in the SQL.

## Step 4 — Report

Tell the user the exact filename that was created so they can navigate to it and start writing.

Do NOT run `supabase db push` — that's the user's job after they've written the SQL.
