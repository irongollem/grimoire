-- Players who are members of a faction can see the NPC memberships in that same faction.
-- This allows the player portal to show "fellow faction members" when viewing a faction
-- the player belongs to.
create policy "faction_npcs_shared_faction_member_select" on faction_npcs
  for select using (
    exists (
      select 1
      from faction_party_members fpm
      join campaign_members cm on cm.party_member_id = fpm.party_member_id
      where fpm.faction_id = faction_npcs.faction_id
        and cm.user_id = auth.uid()
        and cm.role = 'player'
    )
  );
