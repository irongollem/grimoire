-- Migration: claim_player_offer_atomic
-- Player-to-player sales were done entirely client-side by the buyer: after
-- stamping the offer sold via a direct campaign_messages UPDATE, the buyer's
-- client tried to CREDIT the seller by UPDATEing the seller's party_members row.
-- party_members UPDATE RLS only allows the row's owner_user_id or the campaign DM,
-- so a fellow player's write matched 0 rows and the seller was NEVER PAID — while
-- the buyer had already been charged and the item transferred (issue #512). The
-- claim itself was also a client-side check-then-write race (two buyers could both
-- pass the local `sold_to_user_id is null` check), and the buyer deduction used
-- `Math.max(0, wallet - price)`, clamping a stale-cache overspend to 0.
--
-- This replaces the whole exchange with one row-locked SECURITY DEFINER RPC that,
-- under FOR UPDATE on the offer row:
--   * authorizes via auth.uid() + private.is_campaign_member(campaign_id);
--   * validates the offer is still unclaimed (closes the double-claim race);
--   * checks buyer funds and REJECTS if insufficient (no clamp) — closes #527 M1;
--   * debits the buyer, credits the seller, transfers the item row with
--     is_attuned=false (attunement never carries to a new owner) — closes #527 M2;
--   * stamps sold_to_user_id = auth.uid() (never a client-supplied id).
-- A null p_party_member_id means a DM purchase (money from thin air, item deleted);
-- that branch requires the caller to actually be the campaign DM.
--
-- Mirrors claim_vendor_offer / claim_item_drop (20260621000006) and grab_item_drop
-- (20260629000002). private.is_campaign_member / private.is_campaign_dm live in the
-- non-exposed `private` schema as of 20260629000002.
--
-- Coin math mirrors src/rules/currency.ts toCP/fromCP: value in copper is
-- pp*1000 + gp*100 + ep*50 + sp*10 + cp, and greedy reconversion is PP→GP→SP→CP
-- with EP folded into the total (ep always resolves to 0), exactly as the old
-- client path did.

create or replace function public.claim_player_offer(
  p_message_id      uuid,
  p_buyer_name      text,
  p_party_member_id uuid   -- null => DM purchase (money from thin air, item deleted)
) returns jsonb
  language plpgsql security definer set search_path = public
as $$
declare
  v_uid         uuid := auth.uid();
  v_msg         public.campaign_messages;
  v_meta        jsonb;
  v_price_cp    int;
  v_seller_pmid uuid;
  v_inv_id      uuid;
  v_seller      public.party_members;
  v_buyer       public.party_members;
  v_new_cp      int;
begin
  -- Lock the offer row so concurrent buyers serialise.
  select * into v_msg from public.campaign_messages
  where id = p_message_id and type = 'player_offer'
  for update;

  if v_msg is null then raise exception 'Offer not found'; end if;
  if not private.is_campaign_member(v_msg.campaign_id) then
    raise exception 'Not a campaign member';
  end if;

  v_meta := coalesce(v_msg.metadata, '{}'::jsonb);
  if v_meta->>'sold_to_user_id' is not null then
    raise exception 'Already sold';
  end if;

  v_price_cp := coalesce((v_meta->>'pp')::int, 0) * 1000
              + coalesce((v_meta->>'gp')::int, 0) * 100
              + coalesce((v_meta->>'ep')::int, 0) * 50
              + coalesce((v_meta->>'sp')::int, 0) * 10
              + coalesce((v_meta->>'cp')::int, 0);
  v_seller_pmid := (v_meta->>'seller_party_member_id')::uuid;
  v_inv_id      := (v_meta->>'inventory_item_id')::uuid;

  -- Credit the seller under a row lock.
  select * into v_seller from public.party_members where id = v_seller_pmid for update;
  if v_seller is null then raise exception 'Seller not found'; end if;

  v_new_cp := v_seller.pp * 1000 + v_seller.gp * 100 + v_seller.ep * 50
            + v_seller.sp * 10 + v_seller.cp + v_price_cp;
  update public.party_members set
    pp = v_new_cp / 1000,
    gp = (v_new_cp % 1000) / 100,
    ep = 0,
    sp = (v_new_cp % 100) / 10,
    cp = v_new_cp % 10
  where id = v_seller_pmid;

  if p_party_member_id is null then
    -- DM purchase: money materialises, item is removed from play. Guard so a
    -- player can't pass null to grab an item without paying.
    if not private.is_campaign_dm(v_msg.campaign_id) then
      raise exception 'Only the DM can buy without a character';
    end if;
    delete from public.party_inventory where id = v_inv_id;
  else
    -- Player purchase: buyer must own the buying character; check funds; debit;
    -- transfer the item (attunement never carries to a new owner).
    select * into v_buyer from public.party_members where id = p_party_member_id for update;
    if v_buyer is null then raise exception 'Buyer not found'; end if;
    if v_buyer.owner_user_id is distinct from v_uid then
      raise exception 'Cannot spend from a character you do not own';
    end if;

    v_new_cp := v_buyer.pp * 1000 + v_buyer.gp * 100 + v_buyer.ep * 50
              + v_buyer.sp * 10 + v_buyer.cp;
    if v_new_cp < v_price_cp then
      raise exception 'Insufficient funds';
    end if;
    v_new_cp := v_new_cp - v_price_cp;
    update public.party_members set
      pp = v_new_cp / 1000,
      gp = (v_new_cp % 1000) / 100,
      ep = 0,
      sp = (v_new_cp % 100) / 10,
      cp = v_new_cp % 10
    where id = p_party_member_id;

    update public.party_inventory set
      carried_by  = p_party_member_id,
      user_id     = v_uid,
      location    = 'backpack',
      slot        = null,
      is_equipped = false,
      is_attuned  = false
    where id = v_inv_id;
  end if;

  -- Stamp the sale (claimer derived from auth.uid(), not client input).
  v_meta := v_meta || jsonb_build_object(
    'sold_to_user_id',        v_uid::text,
    'sold_to_name',           p_buyer_name,
    'sold_to_party_member_id', p_party_member_id
  );
  update public.campaign_messages set metadata = v_meta where id = p_message_id;
  return v_meta;
end;
$$;

revoke execute on function public.claim_player_offer(uuid, text, uuid) from public, anon;
grant  execute on function public.claim_player_offer(uuid, text, uuid) to authenticated, service_role;

-- The one remaining direct-UPDATE claim path (20260711000002) is now obsolete:
-- claimPlayerOffer routes through this RPC, so members no longer need to PATCH
-- campaign_messages.metadata directly. Drop the policy to close the last hole
-- where a member could rewrite an offer's sold_to_* / price fields via PostgREST.
drop policy if exists "campaign_messages_claim" on public.campaign_messages;
