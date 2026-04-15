-- Migration: grab_item_drop_rpc
-- Atomic RPC that decrements quantity_remaining on an item_drop chat message.
-- Uses FOR UPDATE row lock so concurrent clicks serialise and cannot over-claim.
--
-- p_qty = -1 means "grab all remaining"
-- Returns: { qty_grabbed: int, quantity_remaining: int }

create or replace function grab_item_drop(
  p_message_id      uuid,
  p_qty             int,       -- how many to take; -1 = grab all remaining
  p_claimer_user_id uuid,
  p_claimer_name    text,
  p_party_member_id uuid       -- null = into party stash
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_meta      jsonb;
  v_qty_orig  int;
  v_qty_rem   int;
  v_to_grab   int;
  v_new_claim jsonb;
  v_new_meta  jsonb;
begin
  -- Lock the row to serialise concurrent grabs
  select metadata into v_meta
  from public.campaign_messages
  where id = p_message_id
  for update;

  if v_meta is null then
    raise exception 'message not found';
  end if;

  -- quantity_remaining falls back to quantity for messages created before this migration
  v_qty_orig := coalesce((v_meta->>'quantity')::int, 1);
  v_qty_rem  := coalesce((v_meta->>'quantity_remaining')::int, v_qty_orig);

  if v_qty_rem <= 0 then
    raise exception 'stack exhausted';
  end if;

  -- -1 (or any value >= remaining) means "grab all"
  if p_qty < 0 or p_qty >= v_qty_rem then
    v_to_grab := v_qty_rem;
  else
    v_to_grab := p_qty;
  end if;

  v_new_claim := jsonb_build_object(
    'user_id',          p_claimer_user_id,
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

  update public.campaign_messages
  set metadata = v_new_meta
  where id = p_message_id;

  return jsonb_build_object(
    'qty_grabbed',        v_to_grab,
    'quantity_remaining', v_qty_rem - v_to_grab
  );
end;
$$;

-- Players and DMs can call this RPC (RLS on campaign_messages already scopes visibility)
grant execute on function grab_item_drop(uuid, int, uuid, text, uuid) to authenticated;
