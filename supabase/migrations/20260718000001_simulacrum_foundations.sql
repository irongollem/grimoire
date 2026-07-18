-- Migration: simulacrum_foundations
-- Simulacrum (portrait → 3D mini): minis table, feature_interest, simulacrum_config
-- singleton, mini-models bucket (service-role-write-only), mini_sculpt credit cost,
-- realtime publication, and a guarded no-op cron skeleton for the Meshy poller.

-- ── simulacrum_config (singleton) ───────────────────────────────────────────

create table simulacrum_config (
  id         smallint primary key default 1 check (id = 1),
  mode       text not null default 'hidden' check (mode in ('hidden', 'teaser', 'live')),
  updated_at timestamptz not null default now()
);

insert into simulacrum_config (id) values (1) on conflict do nothing;

create trigger simulacrum_config_updated_at
  before update on simulacrum_config
  for each row execute procedure update_updated_at();

alter table simulacrum_config enable row level security;

-- Every authenticated user reads the mode (gates the wizard entry point client-side).
create policy "simulacrum_config_select" on simulacrum_config
  for select using (auth.uid() is not null);

create policy "simulacrum_config_update" on simulacrum_config
  for update using (private.is_app_admin()) with check (private.is_app_admin());

-- No insert/delete policies: this is a singleton seeded above; the row is never
-- added or removed, only its `mode` updated.

-- ── feature_interest (Phase 3.5 demand gate) ────────────────────────────────

create table feature_interest (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  feature    text not null,
  created_at timestamptz not null default now(),
  unique (user_id, feature)
);

-- No updated_at column/trigger: a "notify me" click is a fact, never edited.

alter table feature_interest enable row level security;

-- Admin reads the count too — it's the buy-signal for going live (SIMULACRUM_PLAN.md §7).
create policy "feature_interest_select" on feature_interest
  for select using (auth.uid() = user_id or private.is_app_admin());

create policy "feature_interest_insert" on feature_interest
  for insert with check (auth.uid() = user_id);

create policy "feature_interest_delete" on feature_interest
  for delete using (auth.uid() = user_id);

-- No update policy: rows are immutable, nothing to mutate.

create index feature_interest_feature_idx on feature_interest (feature);

-- ── minis ────────────────────────────────────────────────────────────────────

create table minis (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  campaign_id      uuid references campaigns(id) on delete cascade,
  source_table     text not null check (source_table in ('npcs', 'monsters', 'party_members')),
  source_id        uuid not null,
  format           text not null check (format in ('print', 'vtt')),
  status           text not null default 'stylizing'
                     check (status in ('stylizing', 'image_ready', 'sculpting', 'downloading', 'ready', 'failed')),
  stylized_image_url text,
  meshy_task_id    text,
  provider         text not null default 'meshy',
  glb_path         text,
  stl_path         text,
  extra_paths      jsonb not null default '{}'::jsonb,
  thumbnail_url    text,
  polycount        integer,
  sculpt_count     integer not null default 0,
  credits_spent    numeric not null default 0,
  reservation_ids  jsonb,
  error            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create trigger minis_updated_at
  before update on minis
  for each row execute procedure update_updated_at();

create index minis_user_id_idx on minis (user_id);
create index minis_campaign_id_idx on minis (campaign_id);
create index minis_source_idx on minis (source_table, source_id);
-- Partial: the poller only ever scans in-flight jobs, every minute.
create index minis_active_status_idx on minis (status) where status in ('sculpting', 'downloading');

alter table minis enable row level security;

-- A mini inherits its source entity's portrait visibility: owner, or any member
-- of the campaign it's attached to.
create policy "minis_select" on minis
  for select using (
    auth.uid() = user_id
    or (campaign_id is not null and private.is_campaign_member(campaign_id))
  );

create policy "minis_insert" on minis
  for insert with check (auth.uid() = user_id);

create policy "minis_update" on minis
  for update using (auth.uid() = user_id);

create policy "minis_delete" on minis
  for delete using (auth.uid() = user_id);

do $$
begin
  alter publication supabase_realtime add table minis;
exception when duplicate_object then
  null;
end $$;

-- ── mini-models bucket ───────────────────────────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'mini-models',
  'mini-models',
  true,
  52428800,
  array['model/gltf-binary', 'model/stl', 'application/octet-stream', 'image/webp']
)
on conflict (id) do nothing;

-- Public read only. Models enter storage exclusively through the pipeline
-- (forge-mini edge fn + poll-meshy-jobs, both service-role) — deliberately no
-- client insert/update/delete policy; we do not host user-uploaded 3D files
-- (SIMULACRUM_PLAN.md §3/§8.4).
create policy "Public read for mini models"
  on storage.objects for select
  using (bucket_id = 'mini-models');

-- ── Credit cost ──────────────────────────────────────────────────────────────

insert into ai_generation_credit_costs (generation_type, label, credit_cost, sort_order)
values ('mini_sculpt', 'Mini Sculpt (3D)', 500, 18)
on conflict (generation_type) do nothing;

-- ── Meshy poller cron skeleton ───────────────────────────────────────────────
-- Guarded no-op until Phase 4: nothing fires until BOTH a `simulacrum_poller_url`
-- Vault secret exists (added at go-live, once the Meshy sub is real) AND there's
-- an in-flight mini to poll. Keeps the cron safe to ship years before the Meshy
-- subscription exists.

create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'poll-meshy-jobs') then
    perform cron.unschedule('poll-meshy-jobs');
  end if;
end $$;

select cron.schedule(
  'poll-meshy-jobs',
  '* * * * *',
  $$
    do $poll$
    declare
      hook_url text;
    begin
      select decrypted_secret
        into hook_url
        from vault.decrypted_secrets
       where name = 'simulacrum_poller_url'
       limit 1;

      if hook_url is null then
        return;
      end if;

      if not exists (select 1 from public.minis where status in ('sculpting', 'downloading')) then
        return;
      end if;

      perform net.http_post(
        url     := hook_url,
        headers := jsonb_build_object('Content-Type', 'application/json'),
        body    := '{}'::jsonb
      );
    end
    $poll$;
  $$
);
