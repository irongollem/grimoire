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
