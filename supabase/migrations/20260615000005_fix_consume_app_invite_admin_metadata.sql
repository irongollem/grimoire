-- Migration: fix_consume_app_invite_admin_metadata
-- consume_app_invite() granted the app-admin role by writing to a non-existent
-- `app_metadata` column on auth.users (the real GoTrue column is
-- `raw_app_meta_data`). Redeeming an 'admin'-plan invite therefore threw
-- "column app_metadata does not exist" and the whole redemption failed — admin
-- invites were effectively unusable (fails safe: no role granted). Recreate the
-- function writing the correct column.
--
-- Body is otherwise unchanged from 20260427000002. EXECUTE grants are preserved
-- by `create or replace` (locked to authenticated in 20260615000004).

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

  -- Grant app admin role via auth metadata (raw_app_meta_data is the real
  -- GoTrue column; its contents flow into the signed JWT's app_metadata claim
  -- that is_app_admin() / the admin RLS policies read).
  if v_invite.granted_plan = 'admin' then
    update auth.users
    set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role": "admin"}'::jsonb
    where id = auth.uid();
  end if;

  return true;
end;
$$;
