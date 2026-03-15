-- ── Phase 2: Player portal data layer ────────────────────────────────────────
-- Adds visibility flags to notes + quests, party_inventory table, and RLS
-- policies so campaign members can read the data they're entitled to see.

-- ── 1. Visibility flags ───────────────────────────────────────────────────────

alter table public.notes  add column if not exists is_player_visible boolean not null default false;
alter table public.quests add column if not exists is_player_visible boolean not null default false;


-- ── 2. Updated RLS: notes ─────────────────────────────────────────────────────
-- Players can SELECT notes the DM has marked visible in their campaign.

drop policy if exists "Users see own notes" on public.notes;

create policy "notes_select" on public.notes for select using (
  auth.uid() = user_id
  or (
    is_player_visible = true
    and campaign_id is not null
    and is_campaign_member(campaign_id)
  )
);


-- ── 3. Updated RLS: quests ────────────────────────────────────────────────────

drop policy if exists "quests_select" on public.quests;

create policy "quests_select" on public.quests for select using (
  auth.uid() = user_id
  or (
    is_player_visible = true
    and campaign_id is not null
    and is_campaign_member(campaign_id)
  )
);


-- ── 4. Updated RLS: party_members ────────────────────────────────────────────
-- All campaign members can read the full party list.

drop policy if exists "party_members_select" on public.party_members;

create policy "party_members_select" on public.party_members for select using (
  auth.uid() = user_id
  or (
    campaign_id is not null
    and is_campaign_member(campaign_id)
  )
);


-- ── 5. Updated RLS: companions ───────────────────────────────────────────────
-- Players can see companions in their campaign.

drop policy if exists "companions_select" on public.companions;

create policy "companions_select" on public.companions for select using (
  auth.uid() = user_id
  or (
    campaign_id is not null
    and is_campaign_member(campaign_id)
  )
);


-- ── 6. party_inventory ───────────────────────────────────────────────────────

create table if not exists public.party_inventory (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  user_id     uuid not null references auth.users(id),   -- DM who added it
  item_id     uuid references public.items(id) on delete set null,
  name        text not null,   -- denormalised; stays even if item is deleted
  quantity    int not null default 1,
  carried_by  uuid references public.party_members(id) on delete set null,
  is_attuned  boolean not null default false,
  notes       text,
  updated_at  timestamptz not null default now()
);

create index if not exists party_inventory_campaign_idx on public.party_inventory(campaign_id);

alter table public.party_inventory enable row level security;

-- DM: full control
create policy "party_inventory_dm_all" on public.party_inventory
  for all using (is_campaign_dm(campaign_id))
  with check (is_campaign_dm(campaign_id));

-- All members: read
create policy "party_inventory_member_select" on public.party_inventory
  for select using (is_campaign_member(campaign_id));

-- Players: update quantity + carried_by on any row
create policy "party_inventory_member_update" on public.party_inventory
  for update using (is_campaign_member(campaign_id));

create trigger party_inventory_updated_at
  before update on public.party_inventory
  for each row execute procedure update_updated_at();
