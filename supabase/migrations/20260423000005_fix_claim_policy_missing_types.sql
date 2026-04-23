-- Migration: fix_claim_policy_missing_types
-- Restore currency_drop, vendor_offer, and player_offer to the claim UPDATE policy
-- (they were accidentally dropped by the loot_chest migration 20260414000013)

drop policy if exists "campaign_messages_claim" on public.campaign_messages;

create policy "campaign_messages_claim" on public.campaign_messages
  for update using (
    type in ('item_drop', 'currency_drop', 'vendor_offer', 'player_offer', 'loot_chest')
    and public.is_campaign_member(campaign_id)
  );
