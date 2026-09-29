-- #936: claim_vendor_offer recorded whichever character id the caller passed as
-- the payer, without checking the caller owns it. Nothing debited that
-- character (the client pays from its own linked character, through RLS), so
-- the harm was a false "paid by" line, but it is the same rule its sibling
-- claim_player_offer enforces, found while proving every definer refuses the
-- wrong caller. The body is otherwise unchanged.
create or replace function public.claim_vendor_offer(p_message_id uuid, p_payer_name text, p_party_member_id uuid)
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
  where id = p_message_id and type = 'vendor_offer'
  for update;

  if v_msg is null then raise exception 'Offer not found'; end if;
  if not private.is_campaign_member(v_msg.campaign_id) then
    raise exception 'Not a campaign member';
  end if;

  -- The payer is the caller's own character, or nobody for the DM (the same
  -- rule as claim_player_offer).
  if p_party_member_id is null then
    if not private.is_campaign_dm(v_msg.campaign_id) then
      raise exception 'Only the DM can buy without a character';
    end if;
  elsif not exists (
    select 1 from public.party_members pm
     where pm.id = p_party_member_id and pm.owner_user_id = auth.uid()
  ) then
    raise exception 'Cannot spend from a character you do not own';
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
$function$;

-- #936, likewise: the shapeshifter pair answered the wrong caller with a silent
-- no-op (an UPDATE whose WHERE matched nothing), so a refusal looked exactly
-- like success and could only be proven by reading the row back. They now raise
-- 'Access denied', as the rest of the character spell functions do. Who may
-- call them is unchanged: the character's owner, or the player linked to it.
create or replace function public.set_shapeshifter_appearance(member_id uuid, target_species uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  update party_members
     set disguise_species_id = target_species,
         disguise_race       = (select name from species where id = target_species)
   where id = member_id
     and (
       user_id = auth.uid()
       or exists (
         select 1 from campaign_members cm
          where cm.user_id = auth.uid()
            and cm.party_member_id = member_id
       )
     );
  if not found then
    raise exception 'Access denied';
  end if;
end;
$function$;

create or replace function public.clear_shapeshifter_appearance(member_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  update party_members
     set disguise_species_id = null,
         disguise_race       = null,
         disguise_subrace    = null
   where id = member_id
     and (
       user_id = auth.uid()
       or exists (
         select 1 from campaign_members cm
          where cm.user_id = auth.uid()
            and cm.party_member_id = member_id
       )
     );
  if not found then
    raise exception 'Access denied';
  end if;
end;
$function$;
