# Grimoire — Claude Code Instructions

## Supabase Migration Rules

**CRITICAL — updated_at trigger pattern:**

Every new table needs an `updated_at` trigger. Always use this exact form:

```sql
create trigger <table>_updated_at
  before update on <table>
  for each row execute procedure update_updated_at();
```

- Function name: `update_updated_at()` — defined in the initial schema migration
- Keyword: `execute procedure` (not `execute function`)
- Wrong (DO NOT USE): `update_updated_at_column()`, `set_updated_at()`, `moddatetime()`

**RLS pattern** — every table also needs RLS enabled + four policies:

```sql
alter table <table> enable row level security;

create policy "<table>_select" on <table> for select using (auth.uid() = user_id);
create policy "<table>_insert" on <table> for insert with check (auth.uid() = user_id);
create policy "<table>_update" on <table> for update using (auth.uid() = user_id);
create policy "<table>_delete" on <table> for delete using (auth.uid() = user_id);
```

Migration files live in `supabase/migrations/` with timestamp prefix `YYYYMMDDNNNNNN_name.sql`.

**CRITICAL — migration workflow (prevents timestamp mismatch):**

NEVER use `mcp__supabase__apply_migration` for schema changes. It auto-generates its own timestamp that will never match the local file's timestamp, causing `supabase db push` to diverge every time.

**CRITICAL — always use `/new-migration` to create migration files (prevents sequence collisions):**

NEVER pick a migration sequence number manually. Always invoke the `/new-migration` skill first to get the correct next filename — it checks both local files and `origin/main` to avoid collisions when working on branches.

Always follow this exact workflow:

1. Invoke `/new-migration <name>` — this creates the file with the correct collision-free timestamp
2. Write the SQL body into the created file
3. Apply it to the remote DB via Bash: `supabase db push`

This ensures a single timestamp (the filename) is used for both local tracking and remote history.

## Post-Mutation Navigation

After any create, save, or delete operation, always navigate back to the list view — this confirms the action succeeded.

- **Create** → `router.push('/resource-list')`
- **Save (edit)** → `router.push('/resource-list')`
- **Delete** → `router.push('/resource-list')`

Never stay on the detail/editor page or navigate to the newly created resource's detail page. The list view is the success feedback. In the case of nested resources (e.g. locations), navigate to the parent resource's detail page instead unless its the top of the hierarchy.

## Roadmap & Bug Tracking

Open work is tracked as GitHub issues on `irongollem/grimoire`. Do NOT add new `[ ]` items to `ROADMAP.md` or `BUGS.md` — open a GitHub issue instead.

**CRITICAL — when you implement a feature or fix a bug, always do both:**

1. Add a `[x]` entry to the relevant local file with a brief description of what was done and why:
   - `ROADMAP.md` — for completed features
   - `BUGS.md` — for resolved bugs
2. Close the corresponding GitHub issue (if one exists) using `mcp__github__update_issue` with `state: closed`

The local files are a curated history log. GitHub issues are the source of truth for what needs doing.

## Storage Path Convention — Shared vs. Private Entities

Images for entities that are **shared/canonical** (SRD content managed by admin) and **private** (user-created content) live under different prefixes in the same bucket. Mixing them up risks wiping all canonical art when clearing a user's files, or exposing a user's private art to everyone.

| Entity type                         | Storage prefix | `is_canonical` | Example path                          |
| ----------------------------------- | -------------- | -------------- | ------------------------------------- |
| Canonical/SRD (admin-managed)       | `srd/`         | `true`         | `monster-images/srd/{uuid}.webp`      |
| DM personal override of SRD content | `{userId}/`    | `false`        | `monster-images/{userId}/{uuid}.webp` |
| User-created private entity         | `{userId}/`    | n/a            | `monster-images/{userId}/{uuid}.webp` |

A DM can replace a canonical SRD image with their own — that override lives in `srd_monster_art` / `srd_spell_art` under their `user_id` with `is_canonical: false`. It does **not** touch the `srd/` canonical file and does not affect other users.

**Rules:**

- Admin canonical uploads → `folderPrefix: "srd"`, `is_canonical: true`. Use the admin panel only.
- DM overrides of SRD content → default `{userId}/` folder, `is_canonical: false`. Never write to `srd/`.
- User-created entities → default `{userId}/` folder, no art table override needed.
- Every bucket that holds canonical art needs a storage policy for the `srd/` prefix gated on `is_app_admin()`. See migrations `20260514000003` (monster-images) and `20260514000004` (spell-images) as the reference pattern.
- Never store canonical art under a user UUID — if that account changes, every canonical URL in the DB breaks.
- When adding a new entity type that will have SRD defaults and user overrides, add the `srd/` storage policy to its bucket in the same migration that creates the entity table.

## Component Granularity

**CRITICAL — extract shared UI, never duplicate it:**

If two pieces of UI share structure and differ only in a few values, the structure becomes a component and the diff becomes props. Identify this _before_ writing a second copy, not after.

- A list row with an image and action buttons → component
- A staging card with preview + search + checkboxes → component
- A collapsible panel with tabs → component

**Hard rules:**

- Template >300 lines is a signal to split, not a sign of completeness
- **Soft file max: 600 lines total.** If a file exceeds 600 lines, evaluate whether splitting is warranted before adding more code. If the file is already over 600 lines and you are about to add non-trivial code, propose a split first. Exceptions: pure data files (`src/data/*.ts`), generated types, and files where the size is intrinsic to the domain (e.g. a canvas renderer that cannot be meaningfully split). Always call out the exception explicitly.
- If two files share >30% of their markup, the shared part belongs in a component
- The parent (page/panel) wires data and config; the child owns layout and interaction
- Never create two half-baked copies that will silently diverge — one component with props beats two files every time
- We leave our plate clean. We never say "we'll refactor later" or "we'll extract this when we do the next one". We don't defer hard topics unless verified by the user as a preference. We don't knowingly add technical debt. We never say "this wasn't part of our work" and fix bugs we encounter instead

## Filter State Pattern

Any list view with filters **must** store its state in `useUiStore` (`src/stores/ui.ts`) — not in local `ref`s, not in `useLocalStorage`. This ensures filters survive navigation within a session without permanently polluting localStorage.

**Required for every filter set:**

1. Add state refs + a `hasActiveFilters` computed + a `reset*Filters()` function to `useUiStore`
2. Wire the view/component to the store via writable `computed` getters/setters
3. Show a **Clear** button (visible only when `hasActiveFilters` is true) that calls `reset*Filters()`
