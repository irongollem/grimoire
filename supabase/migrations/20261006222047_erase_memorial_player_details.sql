-- Migration: erase_memorial_player_details
-- Clear memorial player details during account erasure, before deleting auth.users.

CREATE OR REPLACE FUNCTION public.prepare_user_erasure(p_user_id uuid, p_actor_id uuid, p_actor_kind text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_erased_email text;
  v_ledger_rows integer;
  v_consent_rows integer;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'prepare_user_erasure can only be called by service_role';
  end if;

  -- coalesce: `NULL not in (...)` is NULL, which `if` treats as false, and a
  -- NULL actor would then slip past every actor check below (CLAUDE.md item 3).
  if coalesce(p_actor_kind, '') not in ('self', 'admin', 'parent') then
    raise exception 'prepare_user_erasure: actor_kind must be self, admin or parent, got %', p_actor_kind;
  end if;

  -- A parent erasing their child's account, which is also how a parent
  -- withdraws consent (#919). Re-checked here, not only in delete-account.
  if p_actor_kind = 'parent' and not exists (
    select 1 from public.child_accounts c
    where c.child_user_id = p_user_id
      and c.parent_user_id = p_actor_id
      and c.adult_on > current_date
  ) then
    raise exception 'prepare_user_erasure: a parent erasure must be performed by the child''s parent';
  end if;

  -- child_accounts.parent_user_id is ON DELETE RESTRICT, so the auth delete
  -- that follows this function would fail for a parent, after the work below
  -- had already committed. Refuse up front instead. A link past its adult_on
  -- no longer protects anyone and only awaits the daily sweep, so it goes now.
  delete from public.child_accounts
   where parent_user_id = p_user_id and adult_on <= current_date;
  if exists (select 1 from public.child_accounts where parent_user_id = p_user_id) then
    raise exception 'prepare_user_erasure: account still manages child accounts';
  end if;

  if p_actor_kind = 'self' and p_actor_id is distinct from p_user_id then
    raise exception 'prepare_user_erasure: a self erasure must be performed by its own account';
  end if;

  -- Read identity only after authorization and only from the authoritative auth
  -- row. A missing target remains safe: NULL cannot match a request address.
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

  -- The Art. 12(3) side of the same event (#643). admin_audit_log evidences the
  -- action; this evidences the request that prompted it. An admin-initiated
  -- erasure is still logged: the operator acting unilaterally is exactly the
  -- case where evidence of what was done, and on whose say-so, matters most.
  perform private.log_dsr_request(
    'erasure',
    case when p_actor_kind in ('self', 'parent') then 'self_serve' else 'email' end,
    p_user_id,
    case p_actor_kind
      when 'self' then 'authenticated_session'
      when 'parent' then 'parent_session'
      else 'admin_initiated'
    end,
    null, now(), 'fulfilled',
    format('Account erasure (%s).', p_actor_kind)
  );

  -- Anonymize this subject's earlier requests, rather than deleting them. Same
  -- reasoning as the ledger and consents (§2): the row keeps its type, its
  -- dates and its outcome — the whole of its evidentiary value — and loses only
  -- the link to a person. Deleting them would destroy the proof that earlier
  -- requests were answered on time at the moment the last one is honoured.
  --
  -- This runs AFTER the insert above, so the erasure entry just written is
  -- anonymized too: its user_id is a bare uuid pointing at an account that is
  -- about to stop existing, exactly like admin_audit_log.target_user_id.
  --
  -- Any request still OPEN is closed in the same statement, and it has to be:
  -- the guard refuses every update to an anonymized row, so stamping one
  -- without answering it would strand it as permanently unanswerable — showing
  -- in the admin tab's "Open" filter, accruing overdue days against a clock
  -- nobody could ever stop, in the one case where the erasure itself is why no
  -- answer is possible. coalesce rather than a blanket assignment so a request
  -- already answered keeps the date and outcome it was actually answered with.
  update public.dsr_requests
     set subject_email = null,
         anonymized_at = now(),
         fulfilled_at = coalesce(fulfilled_at, now()),
         outcome = coalesce(outcome, 'closed_account_erased')
   where anonymized_at is null
     and (user_id = p_user_id
          or (v_erased_email is not null and lower(subject_email) = lower(v_erased_email)));

  delete from public.rate_limit_events where user_id = p_user_id;

  -- Clear player-authored identity before the auth delete nulls owner_user_id.
  -- Keep the memorial and the campaign's account of the character intact.
  update public.character_memorials
     set player_name = null, last_words = null
   where owner_user_id = p_user_id;

  update storage.objects
  set owner = null, owner_id = null
  where owner = p_user_id or owner_id = p_user_id::text;
end;
$function$;

revoke execute on function public.prepare_user_erasure(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.prepare_user_erasure(uuid, uuid, text) to service_role;
