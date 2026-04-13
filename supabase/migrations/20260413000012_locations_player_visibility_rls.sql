-- Fix locations RLS so players only see locations where their linked
-- party_member_id is in player_visible_to, consistent with the pattern
-- used for notes, quests, and factions in 20260413000003.
--
-- The blanket "Campaign members can read campaign locations" policy was
-- originally added so the player portal could resolve location names on NPCs,
-- but it allowed players to read ALL campaign locations regardless of
-- player_visible_to, including DM-only content.

drop policy if exists "Campaign members can read campaign locations" on locations;

create policy "locations_player_select" on locations for select using (
  auth.uid() = user_id
  or (
    campaign_id is not null
    and exists (
      select 1 from campaign_members cm
      where cm.user_id = auth.uid()
        and cm.campaign_id = locations.campaign_id
        and cm.party_member_id = any(locations.player_visible_to)
    )
  )
);
