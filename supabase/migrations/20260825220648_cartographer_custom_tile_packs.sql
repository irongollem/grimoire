-- Cartographer M7 (#384): private custom packs, campaign sharing, and durable
-- schema-derived generation runs. The canonical asset shape remains
-- src/cartographer/packSchema.ts; these tables store its manifest and #772 plan.

create table public.user_tile_packs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  pack_id text not null check (pack_id ~ '^custom-[a-z0-9]+(?:-[a-z0-9]+)*$'),
  pack_version integer not null default 1 check (pack_version > 0),
  name text not null check (char_length(name) between 1 and 100),
  description text not null default '' check (char_length(description) <= 1000),
  schema_version integer not null,
  manifest jsonb not null,
  source text not null check (source in ('upload', 'generated')),
  status text not null default 'draft' check (status in ('draft', 'ready', 'failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- DungeonMap PackRef contains pack_id + version (not owner id), so this
  -- identity must be globally unambiguous across bundled and user packs.
  unique (pack_id, pack_version)
);

create table public.campaign_tile_packs (
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  tile_pack_id uuid not null references public.user_tile_packs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (campaign_id, tile_pack_id)
);

create table public.tile_pack_generation_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  tile_pack_id uuid not null references public.user_tile_packs(id) on delete cascade,
  status text not null default 'proof_pending' check (status in (
    'proof_pending', 'awaiting_approval', 'generating', 'cancelling',
    'cancelled', 'completed', 'failed'
  )),
  plan jsonb not null,
  cancel_requested boolean not null default false,
  error text,
  completed_jobs integer not null default 0 check (completed_jobs >= 0),
  total_jobs integer not null check (total_jobs > 0),
  charged_credits numeric not null default 0 check (charged_credits >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create table public.tile_pack_generation_jobs (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.tile_pack_generation_runs(id) on delete cascade,
  ordinal integer not null check (ordinal >= 0),
  slot_id text not null,
  phase text not null check (phase in ('proof', 'pack')),
  job jsonb not null,
  status text not null default 'pending' check (status in (
    'pending', 'generating', 'generated', 'normalized', 'rejected', 'failed', 'cancelled'
  )),
  attempts jsonb not null default '[]'::jsonb,
  raw_path text,
  normalized_path text,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (run_id, slot_id)
);

create index user_tile_packs_user_idx on public.user_tile_packs (user_id, updated_at desc);
create index campaign_tile_packs_pack_idx on public.campaign_tile_packs (tile_pack_id);
create index campaign_tile_packs_user_idx on public.campaign_tile_packs (user_id);
create index tile_pack_generation_runs_user_idx on public.tile_pack_generation_runs (user_id, updated_at desc);
create index tile_pack_generation_runs_campaign_idx on public.tile_pack_generation_runs (campaign_id);
create index tile_pack_generation_jobs_run_status_idx on public.tile_pack_generation_jobs (run_id, status, ordinal);

create trigger user_tile_packs_updated_at
  before update on public.user_tile_packs
  for each row execute procedure update_updated_at();
create trigger campaign_tile_packs_updated_at
  before update on public.campaign_tile_packs
  for each row execute procedure update_updated_at();
create trigger tile_pack_generation_runs_updated_at
  before update on public.tile_pack_generation_runs
  for each row execute procedure update_updated_at();
create trigger tile_pack_generation_jobs_updated_at
  before update on public.tile_pack_generation_jobs
  for each row execute procedure update_updated_at();

alter table public.user_tile_packs enable row level security;
alter table public.campaign_tile_packs enable row level security;
alter table public.tile_pack_generation_runs enable row level security;
alter table public.tile_pack_generation_jobs enable row level security;

-- is_user_pro(uuid) is intentionally service-role-only. This private wrapper
-- exposes only the caller-scoped boolean needed by RLS and cannot inspect an
-- arbitrary account.
create or replace function private.can_manage_custom_tile_packs()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.is_user_pro(auth.uid()), false)
$$;

revoke all on function private.can_manage_custom_tile_packs() from public;
grant execute on function private.can_manage_custom_tile_packs() to authenticated, service_role;

create policy "user_tile_packs_select" on public.user_tile_packs for select using (
  auth.uid() = user_id
  or exists (
    select 1 from public.campaign_tile_packs ctp
    where ctp.tile_pack_id = user_tile_packs.id
      and private.is_campaign_member(ctp.campaign_id)
  )
);
create policy "user_tile_packs_insert" on public.user_tile_packs for insert with check (
  auth.uid() = user_id and private.can_manage_custom_tile_packs()
);
create policy "user_tile_packs_update" on public.user_tile_packs for update using (
  auth.uid() = user_id and private.can_manage_custom_tile_packs()
) with check (
  auth.uid() = user_id and private.can_manage_custom_tile_packs()
);
create policy "user_tile_packs_delete" on public.user_tile_packs for delete using (auth.uid() = user_id);

create policy "campaign_tile_packs_select" on public.campaign_tile_packs for select using (
  auth.uid() = user_id or private.is_campaign_member(campaign_id)
);
create policy "campaign_tile_packs_insert" on public.campaign_tile_packs for insert with check (
  auth.uid() = user_id
  and private.is_campaign_dm(campaign_id)
  and private.can_manage_custom_tile_packs()
  and exists (
    select 1 from public.user_tile_packs p
    where p.id = tile_pack_id and p.user_id = auth.uid()
  )
);
create policy "campaign_tile_packs_update" on public.campaign_tile_packs for update using (
  auth.uid() = user_id and private.is_campaign_dm(campaign_id)
) with check (
  auth.uid() = user_id and private.is_campaign_dm(campaign_id) and private.can_manage_custom_tile_packs()
);
create policy "campaign_tile_packs_delete" on public.campaign_tile_packs for delete using (
  auth.uid() = user_id and private.is_campaign_dm(campaign_id)
);

create policy "tile_pack_generation_runs_select" on public.tile_pack_generation_runs
  for select using (auth.uid() = user_id);
create policy "tile_pack_generation_jobs_select" on public.tile_pack_generation_jobs
  for select using (
    exists (
      select 1 from public.tile_pack_generation_runs r
      where r.id = run_id and r.user_id = auth.uid()
    )
  );

-- Storage is genuinely private. Consumers obtain signed URLs after the pack row
-- proves ownership or campaign membership; a guessable object URL is not access.
update storage.buckets set public = false where id = 'tile-packs';
drop policy if exists "tile_packs_public_select" on storage.objects;
drop policy if exists "tile_packs_authenticated_insert" on storage.objects;
drop policy if exists "tile_packs_authenticated_update" on storage.objects;
drop policy if exists "tile_packs_authenticated_delete" on storage.objects;
drop policy if exists "tile_packs_owner_insert" on storage.objects;
drop policy if exists "tile_packs_owner_update" on storage.objects;
drop policy if exists "tile_packs_owner_delete" on storage.objects;

create or replace function private.can_read_tile_pack(
  p_user_id uuid,
  p_pack_id text,
  p_pack_version integer
) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(exists (
    select 1
    from public.user_tile_packs p
    where p.user_id = p_user_id
      and p.pack_id = p_pack_id
      and p.pack_version = p_pack_version
      and (
        p.user_id = auth.uid()
        or exists (
          select 1
          from public.campaign_tile_packs ctp
          join public.campaign_members cm on cm.campaign_id = ctp.campaign_id
          where ctp.tile_pack_id = p.id and cm.user_id = auth.uid()
        )
      )
  ), false)
$$;

revoke all on function private.can_read_tile_pack(uuid, text, integer) from public;
grant execute on function private.can_read_tile_pack(uuid, text, integer) to authenticated, service_role;

create policy "tile_packs_private_select" on storage.objects for select to authenticated using (
  bucket_id = 'tile-packs'
  and case
    when (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      and (storage.foldername(name))[3] ~ '^v[1-9][0-9]*$'
    then private.can_read_tile_pack(
      ((storage.foldername(name))[1])::uuid,
      (storage.foldername(name))[2],
      substring((storage.foldername(name))[3] from 2)::integer
    )
    else false
  end
);

create policy "tile_packs_owner_insert" on storage.objects for insert to authenticated with check (
  bucket_id = 'tile-packs'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and private.can_manage_custom_tile_packs()
);
create policy "tile_packs_owner_update" on storage.objects for update to authenticated using (
  bucket_id = 'tile-packs'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and private.can_manage_custom_tile_packs()
) with check (
  bucket_id = 'tile-packs'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and private.can_manage_custom_tile_packs()
);
-- Owners may still remove their data after downgrading from Pro.
create policy "tile_packs_owner_delete" on storage.objects for delete to authenticated using (
  bucket_id = 'tile-packs'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

-- One low-quality gpt-image-2 slot. Admin calibration can change the credit
-- price without changing orchestration code.
insert into public.ai_generation_credit_costs (generation_type, label, credit_cost, sort_order)
values ('tile_pack_generation', 'Tile Pack Asset', 1, 14)
on conflict (generation_type) do update
set label = excluded.label, sort_order = excluded.sort_order;

grant select, insert, update, delete on public.user_tile_packs to authenticated;
grant select, insert, update, delete on public.campaign_tile_packs to authenticated;
grant select on public.tile_pack_generation_runs to authenticated;
grant select on public.tile_pack_generation_jobs to authenticated;
