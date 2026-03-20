-- Backfill display_name for all existing campaign_members that have none.
update public.campaign_members cm
set display_name = u.email
from auth.users u
where u.id = cm.user_id
  and cm.display_name is null
  and u.email is not null;

-- Update create_dm_membership trigger to include display_name
create or replace function public.create_dm_membership()
returns trigger language plpgsql security definer
set search_path = public as $$
begin
  insert into public.campaign_members (campaign_id, user_id, role, display_name)
  values (
    new.id,
    new.user_id,
    'dm',
    (select email from auth.users where id = new.user_id)
  )
  on conflict (campaign_id, user_id) do nothing;
  return new;
end;
$$;

-- Update join_campaign_via_invite to also set display_name
create or replace function public.join_campaign_via_invite(p_token uuid)
returns uuid language plpgsql security definer
set search_path = public as $$
declare
  v_invite public.campaign_invites%rowtype;
begin
  -- Fetch and validate invite
  select * into v_invite
  from public.campaign_invites
  where token = p_token
    and (expires_at is null or expires_at > now())
    and (max_uses is null or use_count < max_uses);

  if not found then
    raise exception 'Invalid or expired invite token';
  end if;

  -- Prevent joining own campaign as player
  if v_invite.role = 'player' and exists (
    select 1 from public.campaigns
    where id = v_invite.campaign_id and user_id = auth.uid()
  ) then
    raise exception 'Campaign owner cannot join as player';
  end if;

  -- Create membership (idempotent)
  insert into public.campaign_members (campaign_id, user_id, role, display_name)
  values (
    v_invite.campaign_id,
    auth.uid(),
    v_invite.role,
    (select email from auth.users where id = auth.uid())
  )
  on conflict (campaign_id, user_id) do nothing;

  -- Consume one use
  update public.campaign_invites
  set use_count = use_count + 1
  where id = v_invite.id;

  return v_invite.campaign_id;
end;
$$;
