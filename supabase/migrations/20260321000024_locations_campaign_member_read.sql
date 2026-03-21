-- Allow campaign members to read locations in their campaign.
-- Required so the player portal can resolve location_id → location name on NPCs.
create policy "Campaign members can read campaign locations"
  on locations for select
  using (is_campaign_member(campaign_id));
