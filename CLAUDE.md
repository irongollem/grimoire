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

Always follow this exact workflow:

1. Write the SQL to `supabase/migrations/YYYYMMDDNNNNNN_name.sql` using the Write tool
2. Apply it to the remote DB via Bash: `supabase db push`

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

## Filter State Pattern

Any list view with filters **must** store its state in `useUiStore` (`src/stores/ui.ts`) — not in local `ref`s, not in `useLocalStorage`. This ensures filters survive navigation within a session without permanently polluting localStorage.

**Required for every filter set:**

1. Add state refs + a `hasActiveFilters` computed + a `reset*Filters()` function to `useUiStore`
2. Wire the view/component to the store via writable `computed` getters/setters
3. Show a **Clear** button (visible only when `hasActiveFilters` is true) that calls `reset*Filters()`
