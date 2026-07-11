-- Migration: claim_item_drop_folds_inventory
-- The item-drop claim RPCs stamped the drop claimed but left the party_inventory
-- (or npc_inventory) insert to a post-hoc client write — a tab close / network
-- drop between the two marked the drop claimed while the item was never delivered
-- (lost item). Fold the insert into the claim so stamping + delivery happen in one
-- transaction, mirroring the claim_currency_drop fix (20260711000025) and the
-- claim_player_offer pattern. (#527 item 6)
--
-- Both stay SECURITY DEFINER + row-locked. The insert authorization is the same
-- the client relied on: party_inventory_member_insert = is_campaign_member (already
-- checked), npc_inventory_insert = user_id must equal auth.uid(). Identification
-- and container flags are derived from the drop metadata (per #520): a non-mundane
-- item lands UNIDENTIFIED, and is_container comes from the metadata captured at drop.

-- ── claim_item_drop: whole-stack claim → party_inventory (or npc_inventory) ──────
create or replace function public.claim_item_drop(p_message_id uuid, p_claimer_name text, p_party_member_id uuid, p_npc_id uuid)
  returns jsonb
  language plpgsql
  security definer
  set search_path to 'public'
as $function$
declare
  v_msg  public.campaign_messages;
  v_meta jsonb;
begin
  select * into v_msg from public.campaign_messages
  where id = p_message_id and type = 'item_drop'
  for update;

  if v_msg is null then raise exception 'Drop not found'; end if;
  if not private.is_campaign_member(v_msg.campaign_id) then
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

  -- Deliver the item in the same transaction. NPC claim → npc_inventory; a
  -- party-member or stash (null member) claim → party_inventory.
  if p_npc_id is not null then
    insert into public.npc_inventory (campaign_id, user_id, npc_id, item_id, name, quantity, notes)
    values (
      v_msg.campaign_id, auth.uid(), p_npc_id,
      nullif(v_meta->>'item_id', '')::uuid,
      v_meta->>'item_name',
      coalesce((v_meta->>'quantity')::int, 1),
      null
    );
  else
    insert into public.party_inventory
      (campaign_id, user_id, item_id, name, quantity, carried_by, location,
       is_container, is_identified)
    values (
      v_msg.campaign_id, auth.uid(),
      nullif(v_meta->>'item_id', '')::uuid,
      v_meta->>'item_name',
      coalesce((v_meta->>'quantity')::int, 1),
      p_party_member_id, 'backpack',
      coalesce((v_meta->>'is_container')::boolean, false),
      (v_meta->>'item_rarity') = 'mundane'
    );
  end if;

  return v_meta;
end;
$function$;

-- ── grab_item_drop: partial grab → party_inventory, auto-stacking ────────────────
create or replace function public.grab_item_drop(p_message_id uuid, p_qty integer, p_claimer_user_id uuid, p_claimer_name text, p_party_member_id uuid)
  returns jsonb
  language plpgsql
  security definer
  set search_path to 'public'
as $function$
declare
  v_meta        jsonb;
  v_campaign_id uuid;
  v_qty_orig    int;
  v_qty_rem     int;
  v_to_grab     int;
  v_new_claim   jsonb;
  v_new_meta    jsonb;
  v_item_id     uuid;
  v_existing    uuid;
begin
  select metadata, campaign_id into v_meta, v_campaign_id
  from public.campaign_messages
  where id = p_message_id
  for update;

  if v_meta is null then raise exception 'message not found'; end if;
  if not private.is_campaign_member(v_campaign_id) then
    raise exception 'Not a campaign member';
  end if;

  v_qty_orig := coalesce((v_meta->>'quantity')::int, 1);
  v_qty_rem  := coalesce((v_meta->>'quantity_remaining')::int, v_qty_orig);

  if v_qty_rem <= 0 then raise exception 'stack exhausted'; end if;

  if p_qty < 0 or p_qty >= v_qty_rem then
    v_to_grab := v_qty_rem;
  else
    v_to_grab := p_qty;
  end if;

  v_new_claim := jsonb_build_object(
    'user_id',          auth.uid(),
    'name',             p_claimer_name,
    'party_member_id',  p_party_member_id,
    'qty',              v_to_grab,
    'at',               to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
  );

  v_new_meta := v_meta
    || jsonb_build_object('quantity_remaining', v_qty_rem - v_to_grab)
    || jsonb_build_object(
         'claims',
         coalesce(v_meta->'claims', '[]'::jsonb) || jsonb_build_array(v_new_claim)
       );

  update public.campaign_messages set metadata = v_new_meta where id = p_message_id;

  -- Deliver the grabbed quantity in the same transaction. Auto-stack onto an
  -- existing carried, non-equipped, non-ruined backpack/belt row of the same item
  -- (never an equipped/stored/ruined/container row); otherwise insert a new row.
  v_item_id := nullif(v_meta->>'item_id', '')::uuid;

  if v_item_id is not null then
    select id into v_existing from public.party_inventory
    where campaign_id = v_campaign_id
      and item_id = v_item_id
      and carried_by is not distinct from p_party_member_id
      and container_id is null
      and location in ('backpack', 'belt')
      and not is_ruined
      and not is_equipped
    limit 1;
  end if;

  if v_existing is not null then
    update public.party_inventory
    set quantity = quantity + v_to_grab
    where id = v_existing;
  else
    insert into public.party_inventory
      (campaign_id, user_id, item_id, name, quantity, carried_by, location,
       is_container, is_identified)
    values (
      v_campaign_id, auth.uid(), v_item_id,
      v_meta->>'item_name', v_to_grab, p_party_member_id, 'backpack',
      coalesce((v_meta->>'is_container')::boolean, false),
      (v_meta->>'item_rarity') = 'mundane'
    );
  end if;

  return jsonb_build_object(
    'qty_grabbed',        v_to_grab,
    'quantity_remaining', v_qty_rem - v_to_grab
  );
end;
$function$;
