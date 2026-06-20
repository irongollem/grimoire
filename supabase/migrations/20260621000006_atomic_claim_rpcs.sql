-- Migration: atomic_claim_rpcs
-- Close a claim-stealing / race hole. claimVendorOffer / claimCurrencyDrop /
-- claimItemDrop did the "already claimed?" check client-side then a plain
-- UPDATE on campaign_messages.metadata — so a player could overwrite another
-- player's claim (or race two concurrent claims). Convert each to a row-locked
-- SECURITY DEFINER RPC that re-checks the claimed flag under FOR UPDATE, verifies
-- campaign membership, and stamps the claimer from auth.uid() (not client input).
-- Mirrors the existing grab_item_drop / claim_loot_chest_atom pattern.

create or replace function public.claim_vendor_offer(
  p_message_id     uuid,
  p_payer_name     text,
  p_party_member_id uuid
) returns jsonb
  language plpgsql security definer set search_path = public
as $$
declare
  v_msg  public.campaign_messages;
  v_meta jsonb;
begin
  select * into v_msg from public.campaign_messages
  where id = p_message_id and type = 'vendor_offer'
  for update;

  if v_msg is null then raise exception 'Offer not found'; end if;
  if not public.is_campaign_member(v_msg.campaign_id) then
    raise exception 'Not a campaign member';
  end if;

  v_meta := coalesce(v_msg.metadata, '{}'::jsonb);
  if v_meta->>'paid_by_user_id' is not null then
    raise exception 'Already paid';
  end if;

  v_meta := v_meta || jsonb_build_object(
    'paid_by_user_id',      auth.uid()::text,
    'paid_by_name',         p_payer_name,
    'paid_party_member_id', p_party_member_id
  );
  update public.campaign_messages set metadata = v_meta where id = p_message_id;
  return v_meta;
end;
$$;

create or replace function public.claim_currency_drop(
  p_message_id      uuid,
  p_claimer_name    text,
  p_party_member_id uuid
) returns jsonb
  language plpgsql security definer set search_path = public
as $$
declare
  v_msg  public.campaign_messages;
  v_meta jsonb;
begin
  select * into v_msg from public.campaign_messages
  where id = p_message_id and type = 'currency_drop'
  for update;

  if v_msg is null then raise exception 'Drop not found'; end if;
  if not public.is_campaign_member(v_msg.campaign_id) then
    raise exception 'Not a campaign member';
  end if;

  v_meta := coalesce(v_msg.metadata, '{}'::jsonb);
  if v_meta->>'claimed_by_user_id' is not null then
    raise exception 'Already claimed';
  end if;

  v_meta := v_meta || jsonb_build_object(
    'claimed_by_user_id',      auth.uid()::text,
    'claimed_by_name',         p_claimer_name,
    'claimed_party_member_id', p_party_member_id
  );
  update public.campaign_messages set metadata = v_meta where id = p_message_id;
  return v_meta;
end;
$$;

create or replace function public.claim_item_drop(
  p_message_id      uuid,
  p_claimer_name    text,
  p_party_member_id uuid,
  p_npc_id          uuid
) returns jsonb
  language plpgsql security definer set search_path = public
as $$
declare
  v_msg  public.campaign_messages;
  v_meta jsonb;
begin
  select * into v_msg from public.campaign_messages
  where id = p_message_id and type = 'item_drop'
  for update;

  if v_msg is null then raise exception 'Drop not found'; end if;
  if not public.is_campaign_member(v_msg.campaign_id) then
    raise exception 'Not a campaign member';
  end if;

  v_meta := coalesce(v_msg.metadata, '{}'::jsonb);
  if v_meta->>'claimed_by_user_id' is not null then
    raise exception 'Already claimed';
  end if;

  v_meta := v_meta || jsonb_build_object(
    'claimed_by_user_id',      auth.uid()::text,
    'claimed_by_name',         p_claimer_name,
    'claimed_party_member_id', p_party_member_id,
    'npc_id',                  p_npc_id
  );
  update public.campaign_messages set metadata = v_meta where id = p_message_id;
  return v_meta;
end;
$$;

grant execute on function public.claim_vendor_offer(uuid, text, uuid)   to authenticated;
grant execute on function public.claim_currency_drop(uuid, text, uuid)  to authenticated;
grant execute on function public.claim_item_drop(uuid, text, uuid, uuid) to authenticated;
