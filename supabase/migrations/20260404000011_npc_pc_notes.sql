-- Per-PC relation notes on NPCs.
-- DM writes a short note describing how a specific party member knows this NPC.
-- The relevant player can read only their own note.

create table npc_pc_notes (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id),
  campaign_id      uuid not null references campaigns(id) on delete cascade,
  npc_id           uuid not null references npcs(id) on delete cascade,
  party_member_id  uuid not null references party_members(id) on delete cascade,
  notes            text not null default '',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (npc_id, party_member_id)
);

create index npc_pc_notes_npc_idx          on npc_pc_notes(npc_id);
create index npc_pc_notes_party_member_idx on npc_pc_notes(party_member_id);

create trigger npc_pc_notes_updated_at
  before update on npc_pc_notes
  for each row execute procedure update_updated_at();

alter table npc_pc_notes enable row level security;

-- DM: full control
create policy "npc_pc_notes_dm_all" on npc_pc_notes
  for all
  using (is_campaign_dm(campaign_id))
  with check (is_campaign_dm(campaign_id));

-- Player: read only their own note (where party_member_id matches their linked member)
create policy "npc_pc_notes_player_select" on npc_pc_notes
  for select using (
    exists (
      select 1 from campaign_members cm
      where cm.user_id          = auth.uid()
        and cm.party_member_id  = npc_pc_notes.party_member_id
        and cm.role             = 'player'
    )
  );
