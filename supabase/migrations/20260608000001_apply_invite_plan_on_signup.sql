-- Migration: apply_invite_plan_on_signup
--
-- Fixes tester/admin invites never granting their plan. The old flow had the
-- client call consume_app_invite() right after signUp(), but with email
-- confirmation enabled there is no session yet, so auth.uid() is null and the
-- "update user_subscriptions ... where user_id = auth.uid()" matched zero rows
-- while still bumping use_count — every invite redeemed as free (0/3 in prod).
--
-- New flow: the client passes the invite token through signup metadata
-- (raw_user_meta_data.invite_token). The on-insert subscription trigger — which
-- runs with the real new.id and needs no session — reads it, consumes the
-- invite, and provisions the subscription at the granted plan directly.

create or replace function public.create_free_subscription()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_token  uuid;
  v_invite public.app_invites;
  v_plan   text := 'free';
begin
  -- Invite token rides through signup metadata; ignore anything unparseable.
  begin
    v_token := nullif(new.raw_user_meta_data->>'invite_token', '')::uuid;
  exception when others then
    v_token := null;
  end;

  if v_token is not null then
    select * into v_invite
    from public.app_invites
    where token = v_token
      and (expires_at is null or expires_at > now())
      and (max_uses is null or use_count < max_uses);

    if found then
      update public.app_invites
      set use_count = use_count + 1
      where id = v_invite.id;

      -- 'admin' invites also get the tester (PRO-equivalent) plan; the admin
      -- role itself is granted separately and is not provisioned here.
      if v_invite.granted_plan in ('tester', 'admin') then
        v_plan := 'tester';
      end if;
    end if;
  end if;

  insert into public.user_subscriptions (user_id, plan_id, status)
  values (new.id, v_plan, 'active')
  on conflict (user_id) do update
    set plan_id = excluded.plan_id, status = 'active'
    -- Only ever upgrade an existing free row; never downgrade a tester/pro.
    where user_subscriptions.plan_id = 'free';

  return new;
end;
$function$;
