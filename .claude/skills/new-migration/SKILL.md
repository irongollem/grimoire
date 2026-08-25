---
name: new-migration
description: Create a Supabase migration file with a collision-free version, using the CLI's own UTC timestamp format. Use whenever a schema or data change needs a migration.
user-invocable: true
allowed-tools:
  - Bash
  - Glob
  - Write
---

# /new-migration — Create a Supabase Migration File

Arguments: `<name>` (required) — a short snake_case description of what the migration does, e.g. `add_quest_tags` or `drop_faction_color`.

---

## The format is `YYYYMMDDHHMMSS`, and it is not ours

`supabase migration new` stamps a **14-digit UTC timestamp to the second**. That is the format this repo now uses, because it is the one the CLI, the docs and `schema_migrations` all assume.

It replaced a hand-picked `YYYYMMDD` + 6-digit counter. Same width, so old files sort correctly against new ones and none of them needed renaming — but a counter has to be *chosen*, and choosing it means reading the current state of a repo that several sessions are writing to at once. Two agents reading the same state pick the same number. A timestamp to the second is not chosen, so it does not collide.

## Step 1 — Create the file

Let the CLI do it:

```bash
supabase migration new <name>
```

It prints the path it created. If the CLI is unavailable, the equivalent is:

```bash
printf 'supabase/migrations/%s_%s.sql\n' "$(date -u +%Y%m%d%H%M%S)" "<name>"
```

`date -u` matters — a local-time stamp from a machine behind UTC can land *before* a migration written earlier elsewhere.

## Step 2 — Check it lands after main

A unique version is not sufficient. `supabase db push` also refuses any migration dated **before the newest one already applied**, with:

```text
Found local migration files to be inserted before the last migration on remote database.
```

That is not a theoretical failure: it killed the #649 release on 9 Aug 2026. The migration had been authored a day earlier, something else merged and deployed in between, and by the time it landed its version was in the past. The release failed *after* Vercel had already shipped the frontend, leaving production running new code against a schema that never got the change.

So a migration that has sat on a branch for a while must be **renamed forward before merging**, not merged and hoped for. Verify with:

```bash
node scripts/migration-rebase/cli.mjs --check
```

It checks both failure modes — duplicate versions, and versions at or below the newest on `origin/main` — and runs in CI's `spell-database` job, so a mistake fails the PR rather than the release. Run it yourself before opening the PR; it is instant.

## Step 3 — Write the body

Start the file with:

```sql
-- Migration: <name>
-- <one-line description of what this migration does>
```

Then the SQL. Follow the repo's rules in `CLAUDE.md` — `update_updated_at()` triggers, RLS policies, `SECURITY DEFINER` placement, and the advisor check afterwards.

## Step 4 — Report

Tell the user the exact filename created.

Do NOT run `supabase db push` — migrations auto-apply on push to main.

---

## If you rename a migration

Grep the repo for the old version string first. Migrations, feature docs and function comments all cite version numbers, and a rename that leaves those pointing at a file that no longer exists is worse than the collision it fixed.
