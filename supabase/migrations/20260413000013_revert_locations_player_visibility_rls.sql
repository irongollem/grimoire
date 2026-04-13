-- Revert 20260413000012: that policy caused hanging queries for locations
-- with non-empty player_visible_to arrays. The frontend useSharedLocations
-- composable already filters by linkedPartyMemberId, so RLS can be addressed
-- separately once the query-plan issue is diagnosed.

drop policy if exists "locations_player_select" on locations;

-- Restore the original blanket campaign-member read policy.
create policy "Campaign members can read campaign locations"
  on locations for select
  using (is_campaign_member(campaign_id));
