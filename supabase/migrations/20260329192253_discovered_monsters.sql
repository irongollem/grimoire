-- Remove the column approach in favour of a proper per-campaign, per-player table
drop policy if exists "monsters_player_select" on monsters;
alter table monsters drop column if exists is_player_visible;

-- ── discovered_monsters ───────────────────────────────────────────────────────
-- Tracks which monsters a campaign has "discovered" and who can see them.
-- monster_id  = FK for custom (DB) monsters
-- srd_slug    = stable string id (e.g. "srd_aboleth") for in-memory SRD monsters
-- visible_to  = NULL means the whole party; a uuid[] of party_member_ids restricts
--               to specific players (for per-player wildshape knowledge, etc.)

create table discovered_monsters (
  id            uuid primary key default gen_random_uuid(),
  campaign_id   uuid not null references campaigns(id) on delete cascade,
  monster_id    uuid references monsters(id) on delete cascade,
  srd_slug      text,
  monster_name  text not null,
  image_url     text,
  visible_to    uuid[],   -- null = whole party; array = specific party_member_ids
  discovered_at timestamptz not null default now(),
  constraint dm_has_source check (monster_id is not null or srd_slug is not null)
);

-- One record per campaign per source
create unique index dm_custom_uniq on discovered_monsters (campaign_id, monster_id)
  where monster_id is not null;
create unique index dm_srd_uniq on discovered_monsters (campaign_id, srd_slug)
  where srd_slug is not null;

alter table discovered_monsters enable row level security;

-- DM: full control over their campaign's discoveries
create policy "dm_full" on discovered_monsters
  for all
  using (is_campaign_dm(campaign_id))
  with check (is_campaign_dm(campaign_id));

-- Players: see discoveries shared with the whole party or specifically with them
create policy "player_select" on discovered_monsters
  for select
  using (
    is_campaign_member(campaign_id)
    and (
      visible_to is null
      or exists (
        select 1
        from campaign_members cm
        where cm.campaign_id = discovered_monsters.campaign_id
          and cm.user_id     = auth.uid()
          and cm.party_member_id = any(visible_to)
      )
    )
  );

create trigger discovered_monsters_updated_at
  before update on discovered_monsters
  for each row execute procedure update_updated_at();
