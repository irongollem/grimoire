-- Migration: claim_currency_drop_credits_wallet
-- claim_currency_drop stamped the drop claimed but left the wallet credit to a
-- post-hoc client write — a tab close / network drop between the two marked the
-- drop claimed while the coins were never delivered (lost money), and the
-- stale-cache client credit could clobber a concurrent purse edit. Fold the
-- credit into the RPC so stamping + crediting happen in one transaction. (#527)
--
-- Stays SECURITY DEFINER + row-locked on the drop. The credit is gated so the
-- caller can only pay THEIR OWN member (owned or linked via campaign_members),
-- and each coin is clamped to a non-negative integer (defense in depth vs a
-- negative/fractional drop that slipped past the client clamp).

create or replace function public.claim_currency_drop(p_message_id uuid, p_claimer_name text, p_party_member_id uuid)
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
  where id = p_message_id and type = 'currency_drop'
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
    'claimed_party_member_id', p_party_member_id
  );
  update public.campaign_messages set metadata = v_meta where id = p_message_id;

  -- Credit the claimer's own linked/owned member atomically (a null member is a
  -- DM claim — no purse to credit). Clamp each coin to a non-negative integer.
  if p_party_member_id is not null then
    if not exists (
      select 1 from public.party_members pm
      where pm.id = p_party_member_id
        and pm.campaign_id = v_msg.campaign_id
        and (
          pm.owner_user_id = auth.uid()
          or exists (
            select 1 from public.campaign_members cm
            where cm.campaign_id = v_msg.campaign_id
              and cm.user_id = auth.uid()
              and cm.party_member_id = p_party_member_id
          )
        )
    ) then
      raise exception 'Cannot claim currency to a member you do not control';
    end if;

    update public.party_members set
      pp = pp + greatest(0, floor(coalesce((v_meta->>'pp')::numeric, 0)))::int,
      gp = gp + greatest(0, floor(coalesce((v_meta->>'gp')::numeric, 0)))::int,
      ep = ep + greatest(0, floor(coalesce((v_meta->>'ep')::numeric, 0)))::int,
      sp = sp + greatest(0, floor(coalesce((v_meta->>'sp')::numeric, 0)))::int,
      cp = cp + greatest(0, floor(coalesce((v_meta->>'cp')::numeric, 0)))::int
    where id = p_party_member_id;
  end if;

  return v_meta;
end;
$function$;
