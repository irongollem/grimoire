-- Fix: players who are members of a faction can't see their membership rows
-- or the faction itself in the player view.
--
-- Two gaps:
-- 1. faction_party_members had no player SELECT policy.
-- 2. factions had no policy granting access based on membership (only shared_with_players).

-- Allow players to read their own faction_party_members rows.
create policy "faction_party_members_player_select" on faction_party_members
  for select using (
    exists (
      select 1 from campaign_members cm
      where cm.user_id = auth.uid()
        and cm.role = 'player'
        and cm.party_member_id = faction_party_members.party_member_id
    )
  );

-- Allow players to see any faction they've been added to,
-- regardless of the shared_with_players flag.
create policy "factions_member_select" on factions
  for select using (
    exists (
      select 1
        from faction_party_members fpm
        join campaign_members cm on cm.party_member_id = fpm.party_member_id
       where fpm.faction_id = factions.id
         and cm.user_id = auth.uid()
         and cm.role = 'player'
    )
  );
