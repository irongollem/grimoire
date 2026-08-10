-- A waitlist signup predates an account and therefore has no auth.users FK.
-- Once that same email belongs to an account, an account-erasure request must
-- reach the marketing row too. The trusted function reads the address from
-- auth.users after authorizing service_role; callers cannot supply or override
-- the identifier used for the match.

create or replace function public.prepare_user_erasure(
  p_user_id uuid,
  p_actor_id uuid,
  p_actor_kind text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_erased_email text;
  v_ledger_rows integer;
  v_consent_rows integer;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'prepare_user_erasure can only be called by service_role';
  end if;

  if p_actor_kind not in ('self', 'admin') then
    raise exception 'prepare_user_erasure: actor_kind must be self or admin, got %', p_actor_kind;
  end if;

  if p_actor_kind = 'self' and p_actor_id is distinct from p_user_id then
    raise exception 'prepare_user_erasure: a self erasure must be performed by its own account';
  end if;

  -- Read identity only after authorization and only from the authoritative auth
  -- row. A missing target remains safe: NULL cannot match a waitlist address.
  select email into v_erased_email
  from auth.users
  where id = p_user_id;

  -- Counted before the auth delete, which is what actually nulls them.
  select count(*) into v_ledger_rows
  from public.ai_credit_ledger where user_id = p_user_id;

  select count(*) into v_consent_rows
  from public.purchase_consents where user_id = p_user_id;

  -- Written before the destructive work: a later failure rolls the audit row
  -- and every deletion back together.
  insert into public.admin_audit_log (admin_user_id, action, target_user_id, details)
  values (
    p_actor_id,
    'account_erasure',
    p_user_id,
    jsonb_build_object(
      'actor_kind', p_actor_kind,
      'ledger_rows_anonymized', v_ledger_rows,
      'consent_rows_anonymized', v_consent_rows
    )
  );

  delete from public.rate_limit_events where user_id = p_user_id;

  delete from public.pro_waitlist
  where v_erased_email is not null
    and lower(email) = lower(v_erased_email);

  update storage.objects
  set owner = null, owner_id = null
  where owner = p_user_id or owner_id = p_user_id::text;
end;
$$;

revoke execute on function public.prepare_user_erasure(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.prepare_user_erasure(uuid, uuid, text) to service_role;
