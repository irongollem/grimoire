-- Character spell tracking: learned spells per party member
create table if not exists character_spells (
  id              uuid        primary key default gen_random_uuid(),
  party_member_id uuid        not null references party_members(id) on delete cascade,
  spell_id        uuid        not null references spells(id) on delete cascade,
  is_known        boolean     not null default true,
  is_prepared     boolean     not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (party_member_id, spell_id)
);

create trigger character_spells_updated_at
  before update on character_spells
  for each row execute procedure update_updated_at();

alter table character_spells enable row level security;

-- Player linked to this party member can CRUD their own spells
create policy "character_spells_select" on character_spells
  for select using (
    exists (
      select 1 from campaign_members
      where party_member_id = character_spells.party_member_id
        and user_id = auth.uid()
    )
    or
    -- DM of the same campaign can read (needed for Phase 4 encounter view)
    exists (
      select 1 from campaign_members cm_player
      join campaign_members cm_dm
        on cm_dm.campaign_id = cm_player.campaign_id
       and cm_dm.role = 'dm'
       and cm_dm.user_id = auth.uid()
      where cm_player.party_member_id = character_spells.party_member_id
    )
  );

create policy "character_spells_insert" on character_spells
  for insert with check (
    exists (
      select 1 from campaign_members
      where party_member_id = character_spells.party_member_id
        and user_id = auth.uid()
    )
  );

create policy "character_spells_update" on character_spells
  for update using (
    exists (
      select 1 from campaign_members
      where party_member_id = character_spells.party_member_id
        and user_id = auth.uid()
    )
  );

create policy "character_spells_delete" on character_spells
  for delete using (
    exists (
      select 1 from campaign_members
      where party_member_id = character_spells.party_member_id
        and user_id = auth.uid()
    )
  );
