-- Waitlist consent withdrawal (#638). Art. 7(3) — withdrawing consent must be
-- as easy as giving it — plus the unsubscribe duty the Telecommunicatiewet puts
-- on any mail actually sent to the list.
--
-- 20260718000006 created pro_waitlist insert-only on purpose: "rows are
-- immutable facts". That is right about editing and wrong about leaving. Giving
-- consent here is one field and one click from a logged-out visitor; the only
-- exits were an account erasure that happens to match the address
-- (20260810000014) and the 365-day backstop (20260810000004), neither of which
-- a person who never signed up can reach. The privacy policy's answer — email
-- info@ and we will remove you — is a promise with no mechanism behind it.
--
-- Two routes, because there are two kinds of asking:
--
--   withdraw_waitlist_consent(token)     the link in the mail. service_role
--                                        only; the waitlist-unsubscribe Edge
--                                        Function is its one caller.
--   admin_remove_waitlist_email(email)   someone wrote to info@ instead.
--
-- WHAT IS DELIBERATELY NOT HERE: a record of who left. dsr_requests logs
-- requests under the Art. 12(3) clock, which covers Arts. 15–22; consent
-- withdrawal is Art. 7(3), is immediate, and has no month to evidence. Logging
-- each unsubscribe would rebuild — permanently, in a table with a seven-year
-- period — the address the unsubscribe just deleted. The absence of the row IS
-- the record. The admin route logs the operator's action but not the address,
-- for the same reason (§4d: internal identifiers only).

-- ── The token ────────────────────────────────────────────────────────────────
-- Opaque and per-row rather than an HMAC over the address, so the address never
-- travels in a URL — mail clients, proxies and server logs all see the link.
-- Being stored rather than derived also means it dies with the row: someone who
-- unsubscribes and later signs up again gets a new token, and the old link
-- cannot silently unsubscribe them a second time.
--
-- Same shape and entropy as campaigns.ical_token, the other capability URL in
-- this schema (20260426000099).
alter table public.pro_waitlist
  add column unsubscribe_token uuid not null default gen_random_uuid();

create unique index pro_waitlist_unsubscribe_token_key
  on public.pro_waitlist (unsubscribe_token);

comment on column public.pro_waitlist.unsubscribe_token is
  'Capability token for the one-click unsubscribe link. Every mailing to this list must carry it — see waitlist-unsubscribe Edge Function and context/compliance/retention.md.';

-- ── The link route ───────────────────────────────────────────────────────────
-- Not anon-executable: PostgREST cannot serve RFC 8058 anyway (a mail client's
-- one-click POST carries no apikey header), so the Edge Function has to front
-- it, and the function holds the service role. Keeping this off the anon
-- surface leaves the five sanctioned entries in anon_rpc_surface.test.sql
-- untouched.
--
-- Returns whether a row matched so the page can tell "you're off the list" from
-- "that link is not valid" — an honest difference to a person who mangled a URL
-- in a copy-paste. It is not an oracle worth worrying about: guessing a v4 uuid
-- to learn that an address you cannot see was on a list is not an attack.
create or replace function public.withdraw_waitlist_consent(p_token uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'withdraw_waitlist_consent can only be called by service_role';
  end if;

  if p_token is null then
    return false;
  end if;

  delete from public.pro_waitlist where unsubscribe_token = p_token;
  get diagnostics v_deleted = row_count;

  return v_deleted > 0;
end;
$$;

comment on function public.withdraw_waitlist_consent(uuid) is
  'Removes one pro_waitlist row by its unsubscribe token. Called only by the waitlist-unsubscribe Edge Function; returns true if a row matched.';

revoke execute on function public.withdraw_waitlist_consent(uuid) from public, anon, authenticated;
grant execute on function public.withdraw_waitlist_consent(uuid) to service_role;

-- ── The email route ──────────────────────────────────────────────────────────
-- Extending the pinned action vocabulary in the same migration as its writer,
-- per CLAUDE.md and 20260811152817. Removing someone from a list is a unilateral
-- operator action taken on request, and §4d exists so those are attributable —
-- but the details carry a count and the operator's stated reason, never the
-- address. An audit entry naming the address would outlive the deletion by seven
-- years and hand the erasure back.
alter table public.admin_audit_log drop constraint admin_audit_log_action_check;
alter table public.admin_audit_log add constraint admin_audit_log_action_check
  check (action in (
    'account_erasure', 'plan_change', 'account_freeze', 'account_unfreeze',
    'account_ban', 'account_unban', 'credit_grant', 'credit_pack_refund',
    'dsr_request_logged', 'dsr_request_answered', 'waitlist_removal'
  ));

-- Case-insensitive to match pro_waitlist_email_key, so the address an operator
-- copies out of a mail removes the row however it was capitalised on the way in.
create or replace function public.admin_remove_waitlist_email(
  p_email text,
  p_reason text default 'requested_by_email'
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email  text := lower(trim(coalesce(p_email, '')));
  v_reason text := coalesce(nullif(trim(p_reason), ''), 'requested_by_email');
  v_deleted integer;
begin
  if not private.is_app_admin() then
    raise exception 'Not authorized';
  end if;

  -- An empty address would match nothing and report success, which reads to the
  -- operator as "they were not on the list" when nothing was actually asked.
  if v_email = '' then
    raise exception 'admin_remove_waitlist_email: an address is required';
  end if;

  delete from public.pro_waitlist where lower(email) = v_email;
  get diagnostics v_deleted = row_count;

  insert into public.admin_audit_log (admin_user_id, action, target_user_id, details)
  values (
    auth.uid(),
    'waitlist_removal',
    null,  -- a waitlist address predates any account; there is no user to name
    jsonb_build_object('rows_removed', v_deleted, 'reason', v_reason)
  );

  return v_deleted;
end;
$$;

comment on function public.admin_remove_waitlist_email(text, text) is
  'Removes a pro_waitlist address on direct request (info@). Admin-gated; audit-logged with a count and reason but never the address.';

revoke execute on function public.admin_remove_waitlist_email(text, text) from public, anon;
grant execute on function public.admin_remove_waitlist_email(text, text) to authenticated, service_role;
