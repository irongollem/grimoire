-- Migration: factions_update_explicit_with_check
-- Fix: implicit WITH CHECK on factions_update was blocking the claim-orphaned-data
-- flow. When no WITH CHECK is specified, PostgreSQL evaluates the USING expression
-- on NEW row values — after setting campaign_id to the target UUID, it required
-- is_campaign_dm(target_uuid) to pass, which silently returned 0 rows instead of
-- an error. Add an explicit WITH CHECK that simply requires the user to still own
-- the row after the update.

drop policy "factions_update" on factions;

create policy "factions_update" on factions
  for update
  using (
    is_campaign_dm(campaign_id)
    or (campaign_id is null and auth.uid() = user_id)
  )
  with check (
    auth.uid() = user_id
  );
