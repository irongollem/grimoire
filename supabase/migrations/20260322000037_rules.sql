-- ── SRD rules (shared, no user_id, populated by edge function) ──────────────

create table srd_rules (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        text not null,
  content     text not null default '',
  parent_slug text,
  doc_slug    text not null default 'wotc-srd',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index srd_rules_parent_slug_idx on srd_rules (parent_slug);

create trigger srd_rules_updated_at
  before update on srd_rules
  for each row execute procedure update_updated_at();

-- All authenticated users can read; no client writes (edge function uses service role)
alter table srd_rules enable row level security;
create policy "srd_rules_select" on srd_rules for select using (auth.uid() is not null);

-- ── Custom rules (per-user, full RLS) ────────────────────────────────────────

create table rules (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  title       text not null,
  content     jsonb,
  category    text,
  tags        text[] not null default '{}',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger rules_updated_at
  before update on rules
  for each row execute procedure update_updated_at();

alter table rules enable row level security;
create policy "rules_select" on rules for select using (auth.uid() = user_id);
create policy "rules_insert" on rules for insert with check (auth.uid() = user_id);
create policy "rules_update" on rules for update using (auth.uid() = user_id);
create policy "rules_delete" on rules for delete using (auth.uid() = user_id);

-- ── pg_cron weekly sync (runs every Sunday at 03:00 UTC) ─────────────────────
-- Calls the edge function via pg_net. URL will be set after first deploy.
-- Uncomment and fill in the URL after deploying the edge function:
--
-- select cron.schedule(
--   'sync-srd-rules-weekly',
--   '0 3 * * 0',
--   $$
--     select net.http_post(
--       url := 'https://<project-ref>.supabase.co/functions/v1/sync-srd-rules',
--       headers := '{"Authorization": "Bearer <anon-key>"}'::jsonb
--     );
--   $$
-- );
