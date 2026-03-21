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

- Roadmap is in `ROADMAP.md` — use checkboxes to track progress on features, organized by phase
- Bugs are tracked in `BUGS.md` — add new bugs as they arise, check off when resolved
- After completing a feature make sure the roadmap is updated and any relevant bugs are marked as resolved
