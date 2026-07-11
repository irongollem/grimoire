-- Tighten two legacy permissive RLS UPDATE policies that were left in place after
-- their exploit was closed only at the RPC layer (issue #491). The sanctioned
-- write path for both is now SECURITY DEFINER RPCs, which bypass RLS and so do
-- not depend on these member-level UPDATE policies. Left permissive, the policies
-- are still-open direct PostgREST write paths that defeat the RPC guards.
--
-- Helper predicates live in the non-exposed `private` schema as of migration
-- 20260629000002, so this migration references `private.is_campaign_member`.

-- 1. campaign_messages_claim -----------------------------------------------------
--    Original: FOR UPDATE USING (type IN (item_drop, currency_drop, vendor_offer,
--    player_offer, loot_chest) AND is_campaign_member(campaign_id)), NO WITH CHECK.
--    The loot/claim economy was rebuilt as atomic, row-locked SECURITY DEFINER
--    RPCs (claim_item_drop, grab_item_drop, claim_currency_drop, claim_vendor_offer,
--    claim_loot_chest_atom) specifically to stop a member overwriting another
--    member's claim via a plain UPDATE. Those RPCs bypass RLS, so the four loot
--    types no longer need any direct member UPDATE path — and leaving one open let
--    any member PATCH campaign_messages.metadata to reset quantity_remaining or
--    rewrite claimed_by_user_id/paid_by_user_id and steal loot/currency/purchases.
--
--    player_offer is the one type with no atomic RPC: claimPlayerOffer()
--    (src/composables/useCampaignMessages.ts) still writes metadata directly, so a
--    member UPDATE path must remain for it. We narrow the policy to player_offer
--    only and add a matching WITH CHECK (the original had none) so the post-image
--    is validated and a row cannot be type-punned into/out of player_offer.
--    (A future atomic RPC for player_offer would let this policy be dropped too.)
drop policy if exists "campaign_messages_claim" on public.campaign_messages;

create policy "campaign_messages_claim" on public.campaign_messages
  for update
  using (
    ("type" = 'player_offer'::text)
    and private.is_campaign_member(campaign_id)
  )
  with check (
    ("type" = 'player_offer'::text)
    and private.is_campaign_member(campaign_id)
  );

-- 2. encounter_state_member_update ----------------------------------------------
--    Original: FOR UPDATE USING (is_campaign_member(campaign_id))
--    WITH CHECK (is_campaign_member(campaign_id)) — every member could PATCH the
--    whole encounter_state row (combatants_live, HP, initiative, turn order),
--    bypassing update_combatant_position (SECURITY DEFINER, 20260512000003), which
--    lets a player move only their own token. There is no legitimate direct member
--    write: DM writes (goLive/pushState/endLive, stop-other-encounter) are covered
--    by encounter_state_dm_all, and players go exclusively through the RPC. The
--    policy is redundant for every sanctioned write, so it is dropped.
drop policy if exists "encounter_state_member_update" on public.encounter_state;
