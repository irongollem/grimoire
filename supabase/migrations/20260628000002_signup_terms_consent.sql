-- Migration: signup_terms_consent
-- Record clickwrap consent (Terms of Service + Privacy Policy) captured at signup.
--
-- The signup form now requires an explicit checkbox; the client stamps
-- terms_accepted_at + terms_version into signup metadata, and the on-insert
-- subscription trigger copies them into user_subscriptions (server-side, not
-- client-editable) so we have a provable record of who accepted which version
-- and when. Versioning lets us re-prompt on a material Terms change later.

alter table user_subscriptions
  add column if not exists terms_accepted_at timestamptz,
  add column if not exists terms_version text;

-- Extend the existing on-signup trigger to persist the consent from metadata.
-- (Body mirrors 20260608000001; only the consent parsing + insert columns are new.)
create or replace function public.create_free_subscription()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_token     uuid;
  v_invite    public.app_invites;
  v_plan      text := 'free';
  v_terms_at  timestamptz;
  v_terms_ver text := nullif(new.raw_user_meta_data->>'terms_version', '');
begin
  -- Invite token rides through signup metadata; ignore anything unparseable.
  begin
    v_token := nullif(new.raw_user_meta_data->>'invite_token', '')::uuid;
  exception when others then
    v_token := null;
  end;

  -- Consent timestamp likewise rides in metadata; ignore anything unparseable.
  begin
    v_terms_at := nullif(new.raw_user_meta_data->>'terms_accepted_at', '')::timestamptz;
  exception when others then
    v_terms_at := null;
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

  insert into public.user_subscriptions (user_id, plan_id, status, terms_accepted_at, terms_version)
  values (new.id, v_plan, 'active', v_terms_at, v_terms_ver)
  on conflict (user_id) do update
    set plan_id = excluded.plan_id, status = 'active'
    -- Only ever upgrade an existing free row; never downgrade a tester/pro.
    where user_subscriptions.plan_id = 'free';

  return new;
end;
$function$;
