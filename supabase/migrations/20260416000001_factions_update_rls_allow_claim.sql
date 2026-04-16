-- Migration: factions_update_rls_allow_claim
-- Allow owners to update/delete unclaimed faction rows (campaign_id IS NULL)
-- so the "claim orphaned data" button can assign them to a campaign.
-- The previous factions_update policy only matched is_campaign_dm(campaign_id),
-- which returns false when campaign_id is NULL, silently dropping the UPDATE.

drop policy "factions_update" on factions;
drop policy "factions_delete" on factions;

create policy "factions_update" on factions
  for update using (
    is_campaign_dm(campaign_id)
    or (campaign_id is null and auth.uid() = user_id)
  );

create policy "factions_delete" on factions
  for delete using (
    is_campaign_dm(campaign_id)
    or (campaign_id is null and auth.uid() = user_id)
  );
