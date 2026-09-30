-- #936: claim_player_offer trusted every id in the offer message's metadata.
-- Any campaign member may insert a player_offer message with arbitrary
-- metadata, so the claim could credit a character from another campaign,
-- move or delete an inventory row that belongs to someone else (even in
-- another campaign), and accept a negative price that debits the seller and
-- pays the buyer. The claim now validates, before any write, that the coins
-- are non-negative whole numbers, that the seller is a character of the
-- offer's campaign controlled by the offer's author, that the item is in that
-- campaign and carried by that seller, and that the buyer is a different
-- character of the same campaign. The rest of the body is unchanged.
CREATE OR REPLACE FUNCTION public.claim_player_offer(p_message_id uuid, p_buyer_name text, p_party_member_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  v_coin        text;
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

  -- Every coin field must be a non-negative whole number. A negative price
  -- would debit the seller and credit the buyer.
  foreach v_coin in array array['pp', 'gp', 'ep', 'sp', 'cp'] loop
    if v_meta ? v_coin and v_meta->v_coin <> 'null'::jsonb then
      if jsonb_typeof(v_meta->v_coin) is distinct from 'number'
         or (v_meta->>v_coin)::numeric < 0
         or (v_meta->>v_coin)::numeric <> trunc((v_meta->>v_coin)::numeric) then
        raise exception 'Invalid offer price';
      end if;
    end if;
  end loop;

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

  -- The offer message is member-authored, so none of its ids can be trusted.
  -- The seller must be a character of this campaign that the offer's author
  -- controls (owns, is linked to, or is the campaign DM), and the item must
  -- be in this campaign and carried by that seller.
  if v_seller.campaign_id is distinct from v_msg.campaign_id then
    raise exception 'Seller is not in this campaign';
  end if;
  -- coalesce: a DM-managed seller has no owner, and a NULL here would make
  -- the whole guard NULL, which "if not" lets through.
  if not coalesce((
    v_seller.owner_user_id = v_msg.user_id
    or exists (
      select 1 from public.campaign_members cm
      where cm.campaign_id = v_msg.campaign_id
        and cm.user_id = v_msg.user_id
        and (cm.party_member_id = v_seller_pmid or cm.role = 'dm')
    )
  ), false) then
    raise exception 'Seller is not controlled by the offer author';
  end if;
  if not exists (
    select 1 from public.party_inventory pi
    where pi.id = v_inv_id
      and pi.campaign_id = v_msg.campaign_id
      and pi.carried_by = v_seller_pmid
  ) then
    raise exception 'Item is not carried by the seller';
  end if;
  if p_party_member_id is not null then
    select * into v_buyer from public.party_members where id = p_party_member_id;
    -- found, not 'is not null': a row value is only 'not null' when every
    -- column is non-null, and most characters have some null columns.
    if found then
      if v_buyer.owner_user_id is distinct from v_uid then
        raise exception 'Cannot spend from a character you do not own';
      end if;
      if p_party_member_id = v_seller_pmid then
        raise exception 'Cannot buy from yourself';
      end if;
      if v_buyer.campaign_id is distinct from v_msg.campaign_id then
        raise exception 'Buyer is not in this campaign';
      end if;
    end if;
  end if;

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
$function$;
