-- Allow DMs to also insert/update/delete character spells
-- (needed for DM preview mode and for DMs to manage player spellbooks)

drop policy if exists "character_spells_insert" on character_spells;
drop policy if exists "character_spells_update" on character_spells;
drop policy if exists "character_spells_delete" on character_spells;

create policy "character_spells_insert" on character_spells
  for insert with check (
    exists (
      select 1 from campaign_members
      where party_member_id = character_spells.party_member_id
        and user_id = auth.uid()
    )
    or exists (
      select 1 from campaign_members cm_player
      join campaign_members cm_dm
        on cm_dm.campaign_id = cm_player.campaign_id
       and cm_dm.role = 'dm'
       and cm_dm.user_id = auth.uid()
      where cm_player.party_member_id = character_spells.party_member_id
    )
  );

create policy "character_spells_update" on character_spells
  for update using (
    exists (
      select 1 from campaign_members
      where party_member_id = character_spells.party_member_id
        and user_id = auth.uid()
    )
    or exists (
      select 1 from campaign_members cm_player
      join campaign_members cm_dm
        on cm_dm.campaign_id = cm_player.campaign_id
       and cm_dm.role = 'dm'
       and cm_dm.user_id = auth.uid()
      where cm_player.party_member_id = character_spells.party_member_id
    )
  );

create policy "character_spells_delete" on character_spells
  for delete using (
    exists (
      select 1 from campaign_members
      where party_member_id = character_spells.party_member_id
        and user_id = auth.uid()
    )
    or exists (
      select 1 from campaign_members cm_player
      join campaign_members cm_dm
        on cm_dm.campaign_id = cm_player.campaign_id
       and cm_dm.role = 'dm'
       and cm_dm.user_id = auth.uid()
      where cm_player.party_member_id = character_spells.party_member_id
    )
  );
