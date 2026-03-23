-- ── Factions ──────────────────────────────────────────────────────────────────

create table factions (
  id                 uuid        primary key default gen_random_uuid(),
  user_id            uuid        not null references auth.users(id) on delete cascade,
  name               text        not null,
  faction_type       text,
  description        text,       -- Tiptap JSON string
  emblem_url         text,
  alignment          text,
  is_player_visible  boolean     not null default false,
  tags               text[]      not null default '{}',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create trigger factions_updated_at
  before update on factions
  for each row execute procedure update_updated_at();

alter table factions enable row level security;
create policy "factions_select" on factions for select using (auth.uid() = user_id);
create policy "factions_insert" on factions for insert with check (auth.uid() = user_id);
create policy "factions_update" on factions for update using (auth.uid() = user_id);
create policy "factions_delete" on factions for delete using (auth.uid() = user_id);
-- Players can see DM's player-visible factions
create policy "factions_player_select" on factions for select using (
  is_player_visible = true AND user_id IN (
    SELECT cm_dm.user_id FROM campaign_members cm_player
    JOIN campaign_members cm_dm
      ON cm_player.campaign_id = cm_dm.campaign_id AND cm_dm.role = 'dm'
    WHERE cm_player.user_id = auth.uid() AND cm_player.role = 'player'
  )
);

-- ── NPC membership (many-to-many with optional role) ──────────────────────────

create table faction_npcs (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users(id) on delete cascade,
  faction_id  uuid        not null references factions(id) on delete cascade,
  npc_id      uuid        not null references npcs(id) on delete cascade,
  role        text,
  created_at  timestamptz not null default now(),
  unique(faction_id, npc_id)
);

alter table faction_npcs enable row level security;
create policy "faction_npcs_select" on faction_npcs for select using (auth.uid() = user_id);
create policy "faction_npcs_insert" on faction_npcs for insert with check (auth.uid() = user_id);
create policy "faction_npcs_update" on faction_npcs for update using (auth.uid() = user_id);
create policy "faction_npcs_delete" on faction_npcs for delete using (auth.uid() = user_id);

-- ── Location associations (managed from faction board) ────────────────────────

create table faction_locations (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null references auth.users(id) on delete cascade,
  faction_id   uuid        not null references factions(id) on delete cascade,
  location_id  uuid        not null references locations(id) on delete cascade,
  notes        text,
  created_at   timestamptz not null default now(),
  unique(faction_id, location_id)
);

alter table faction_locations enable row level security;
create policy "faction_locations_select" on faction_locations for select using (auth.uid() = user_id);
create policy "faction_locations_insert" on faction_locations for insert with check (auth.uid() = user_id);
create policy "faction_locations_update" on faction_locations for update using (auth.uid() = user_id);
create policy "faction_locations_delete" on faction_locations for delete using (auth.uid() = user_id);

-- ── Item associations (guild sigils, artifacts, etc.) ─────────────────────────

create table faction_items (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users(id) on delete cascade,
  faction_id  uuid        not null references factions(id) on delete cascade,
  item_id     uuid        not null references items(id) on delete cascade,
  notes       text,
  created_at  timestamptz not null default now(),
  unique(faction_id, item_id)
);

alter table faction_items enable row level security;
create policy "faction_items_select" on faction_items for select using (auth.uid() = user_id);
create policy "faction_items_insert" on faction_items for insert with check (auth.uid() = user_id);
create policy "faction_items_update" on faction_items for update using (auth.uid() = user_id);
create policy "faction_items_delete" on faction_items for delete using (auth.uid() = user_id);

-- ── Directional inter-faction relations ───────────────────────────────────────

create table faction_relations (
  id                uuid        primary key default gen_random_uuid(),
  user_id           uuid        not null references auth.users(id) on delete cascade,
  faction_id        uuid        not null references factions(id) on delete cascade,
  target_faction_id uuid        not null references factions(id) on delete cascade,
  relation_type     text        not null default 'neutral',
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique(faction_id, target_faction_id),
  check (faction_id <> target_faction_id)
);

create trigger faction_relations_updated_at
  before update on faction_relations
  for each row execute procedure update_updated_at();

alter table faction_relations enable row level security;
create policy "faction_relations_select" on faction_relations for select using (auth.uid() = user_id);
create policy "faction_relations_insert" on faction_relations for insert with check (auth.uid() = user_id);
create policy "faction_relations_update" on faction_relations for update using (auth.uid() = user_id);
create policy "faction_relations_delete" on faction_relations for delete using (auth.uid() = user_id);

-- ── Generic entity notes (private or party-shared) ────────────────────────────

create table entity_notes (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null references auth.users(id) on delete cascade,
  entity_type  text        not null,  -- 'faction' | 'npc' | 'location' | 'item' | ...
  entity_id    uuid        not null,
  content      text,                  -- Tiptap JSON string
  is_private   boolean     not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create trigger entity_notes_updated_at
  before update on entity_notes
  for each row execute procedure update_updated_at();

alter table entity_notes enable row level security;
-- Own notes (always visible to the author)
create policy "entity_notes_own" on entity_notes for select using (auth.uid() = user_id);
-- Party notes visible to players: non-private notes written by the campaign DM
create policy "entity_notes_party_to_player" on entity_notes for select using (
  is_private = false AND user_id IN (
    SELECT cm_dm.user_id FROM campaign_members cm_player
    JOIN campaign_members cm_dm
      ON cm_player.campaign_id = cm_dm.campaign_id AND cm_dm.role = 'dm'
    WHERE cm_player.user_id = auth.uid() AND cm_player.role = 'player'
  )
);
-- DM can see non-private notes written by their players
create policy "entity_notes_party_to_dm" on entity_notes for select using (
  is_private = false AND EXISTS (
    SELECT 1 FROM campaign_members cm_dm
    JOIN campaign_members cm_player
      ON cm_dm.campaign_id = cm_player.campaign_id
     AND cm_player.role = 'player'
     AND cm_player.user_id = entity_notes.user_id
    WHERE cm_dm.user_id = auth.uid() AND cm_dm.role = 'dm'
  )
);
create policy "entity_notes_insert" on entity_notes for insert with check (auth.uid() = user_id);
create policy "entity_notes_update" on entity_notes for update using (auth.uid() = user_id);
create policy "entity_notes_delete" on entity_notes for delete using (auth.uid() = user_id);
