-- Migration: party_member_linked_update
-- Let a player edit the character the DM ASSIGNED them (linked via
-- campaign_members.party_member_id), not only one they assumed/own. The SELECT
-- policy (20260519000002) already extends to linked members, but UPDATE stayed
-- owner-or-DM only, so every HP/condition/rest/resource mutation on an assigned
-- character matched 0 rows and .single() threw — the sheet looked dead. (#516)
--
-- Scope is tighter than SELECT: SELECT lets any member see a party_member ANY
-- member is linked to; UPDATE is restricted to the caller's OWN linked character
-- (cm.user_id = auth.uid()).

drop policy if exists "party_members_player_update" on party_members;

create policy "party_members_player_update" on party_members for update using (
  ((select auth.uid()) = owner_user_id)
  or (campaign_id is not null and private.is_campaign_dm(campaign_id))
  or (campaign_id is not null and private.is_campaign_member(campaign_id) and exists (
    select 1 from campaign_members cm
    where cm.party_member_id = party_members.id
      and cm.user_id = (select auth.uid())
  ))
) with check (
  ((select auth.uid()) = owner_user_id)
  or (campaign_id is not null and private.is_campaign_dm(campaign_id))
  or (campaign_id is not null and private.is_campaign_member(campaign_id) and exists (
    select 1 from campaign_members cm
    where cm.party_member_id = party_members.id
      and cm.user_id = (select auth.uid())
  ))
);
