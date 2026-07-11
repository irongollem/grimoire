-- Migration: invite_use_count_only_on_insert
-- join_campaign_via_invite only increments use_count when the insert actually
-- created a membership row, so re-joins / page remounts by existing members no
-- longer burn a capped invite's remaining uses (#536).

create or replace function public.join_campaign_via_invite(p_token uuid)
  returns uuid
  language plpgsql
  security definer
  set search_path to 'public'
as $function$
declare
  v_invite public.campaign_invites%rowtype;
  v_inserted integer;
begin
  select * into v_invite
  from public.campaign_invites
  where token = p_token
    and (expires_at is null or expires_at > now())
    and (max_uses is null or use_count < max_uses);

  if not found then
    raise exception 'Invalid or expired invite token';
  end if;

  if v_invite.role = 'player' and exists (
    select 1 from public.campaigns
    where id = v_invite.campaign_id and user_id = auth.uid()
  ) then
    raise exception 'Campaign owner cannot join as player';
  end if;

  insert into public.campaign_members (campaign_id, user_id, role, display_name)
  values (
    v_invite.campaign_id,
    auth.uid(),
    v_invite.role,
    coalesce(
      (select username from public.profiles where user_id = auth.uid()),
      nullif(trim((select raw_user_meta_data->>'display_name' from auth.users where id = auth.uid())), ''),
      (select email from auth.users where id = auth.uid())
    )
  )
  on conflict (campaign_id, user_id) do nothing;

  -- Only count a use when a new membership row was actually created; a no-op
  -- re-join (existing member re-opening the link, or a page remount) must not
  -- decrement a capped invite's remaining uses.
  get diagnostics v_inserted = row_count;

  if v_inserted > 0 then
    update public.campaign_invites
    set use_count = use_count + 1
    where id = v_invite.id;
  end if;

  return v_invite.campaign_id;
end;
$function$;
