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

Check both local files **and** `origin/main` to avoid branch divergence collisions:

```bash
today=$(date +%Y%m%d)
# Local sequences for today
local_max=$(ls supabase/migrations/ | grep "^${today}" | sed "s/^${today}//" | cut -c1-6 | sort -n | tail -1)
# origin/main sequences for today (catches migrations merged to main while on a branch)
main_max=$(git ls-tree -r origin/main --name-only -- supabase/migrations/ 2>/dev/null | grep "^supabase/migrations/${today}" | sed "s|supabase/migrations/${today}||" | cut -c1-6 | sort -n | tail -1)
# Take the higher of the two
echo -e "${local_max}\n${main_max}" | sort -n | tail -1
```

If no files exist for today in either location, the sequence starts at `000001`.
If the highest is e.g. `000003`, use `000004`.

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
