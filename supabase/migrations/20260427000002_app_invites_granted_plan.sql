-- Migration: app_invites_granted_plan
-- Add granted_plan to app_invites and update consume_app_invite to apply it on signup

alter table public.app_invites
  add column granted_plan text not null default 'free'
  constraint app_invites_granted_plan_check check (granted_plan in ('free', 'tester', 'admin'));

create or replace function public.consume_app_invite(p_token uuid) returns boolean
  language plpgsql security definer
  set search_path to 'public'
  as $$
declare
  v_invite public.app_invites;
begin
  select * into v_invite
  from public.app_invites
  where token = p_token
    and (expires_at is null or expires_at > now())
    and (max_uses is null or use_count < max_uses);

  if not found then
    raise exception 'Invalid or expired invite';
  end if;

  update public.app_invites
  set use_count = use_count + 1
  where id = v_invite.id;

  -- Apply granted plan to the signing-up user's subscription
  if v_invite.granted_plan in ('tester', 'admin') then
    update public.user_subscriptions
    set plan_id = 'tester', status = 'active'
    where user_id = auth.uid();
  end if;

  -- Grant app admin role via auth metadata
  if v_invite.granted_plan = 'admin' then
    update auth.users
    set app_metadata = app_metadata || '{"role": "admin"}'::jsonb
    where id = auth.uid();
  end if;

  return true;
end;
$$;
