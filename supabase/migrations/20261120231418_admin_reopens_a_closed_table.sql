-- A human reopens an AI table the screen closed (#1021 row 18).
--
-- The AI table closes for an account after five refused messages in thirty days (`STRIKES_BEFORE_CLOSED`,
-- `_shared/agent/conduct.ts`); the count is read from `prompt_screenings`, which is also the threshold calibration
-- evidence and must never be deleted. So a reopening is not a delete: an admin records it, with a reason, as an
-- `admin_audit_log` row (`table_reopen`), and the turn counts only refusals made after the newest such row. Nothing a user
-- can write moves the count: the audit log has no user write policy, and this function refuses anyone but an admin.

alter table public.admin_audit_log drop constraint admin_audit_log_action_check;
alter table public.admin_audit_log add constraint admin_audit_log_action_check check (
  action = any (array[
    'account_erasure', 'plan_change', 'account_freeze', 'account_unfreeze', 'account_ban', 'account_unban', 'credit_grant',
    'credit_pack_refund', 'dsr_request_logged', 'dsr_request_answered', 'terms_notice_sent', 'inactivity_notice_sent',
    'table_reopen'
  ]::text[])
);

create function public.admin_reopen_table(p_user_id uuid, p_reason text)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_at timestamptz := now();
begin
  -- Authorize first (CLAUDE.md, SECURITY DEFINER rule 2): the helper is total, never NULL.
  if not private.is_app_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  -- A reopening is a judgment someone has to own: it always says why.
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'admin_reopen_table: a reason is required' using errcode = '22023';
  end if;
  if not exists (select 1 from auth.users u where u.id = p_user_id) then
    raise exception 'admin_reopen_table: no account %', p_user_id using errcode = 'P0002';
  end if;

  insert into public.admin_audit_log (admin_user_id, action, target_user_id, details, created_at)
  values (auth.uid(), 'table_reopen', p_user_id, jsonb_build_object('reason', trim(p_reason)), v_at);

  return v_at;
end;
$$;

revoke execute on function public.admin_reopen_table(uuid, text) from public, anon;
grant execute on function public.admin_reopen_table(uuid, text) to authenticated, service_role;

comment on function public.admin_reopen_table(uuid, text) is
  'An admin reopens an account''s AI table after the screen closed it (#1021 row 18): an audit row with a reason; the turn '
  'counts only refusals after the newest one.';
