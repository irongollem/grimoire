-- Data-subject request log (#643, Art. 12(3)). The contract this implements is
-- context/compliance/data-subject-rights.md §4f.
--
-- admin_audit_log records *actions the operator took*. This records *requests
-- the operator received*, which is a different fact and the one Art. 12(3)
-- turns on: the month runs from receipt, so a request that arrives by email and
-- is answered by hand leaves no evidence of when the clock started.
--
-- THE CONSTRAINT THAT SHAPES THE SCHEMA: this table must not cascade.
--
-- §4 invariant 1 requires every FK to auth.users in `public` to be `cascade` or
-- `set null`, asserted at push time by 20260808000001. With `cascade`, the
-- erasure request — the single entry you most need to be able to prove you
-- honoured — would delete its own evidence at the moment it was honoured, and
-- the log would be reliably empty of exactly the requests that matter.
--
-- So `user_id` is a bare uuid with NO foreign key, the same shape and for the
-- same reason as admin_audit_log.target_user_id (§2): it survives the account
-- it names, and after erasure it links to nothing, because every row that
-- referenced it has been nulled. It is a receipt, not a re-identification route.
--
-- The column is named `user_id` rather than `subject_user_id` deliberately.
-- data_export.test.sql pins the set of user-keyed tables with no auth.users FK
-- and asserts each is named in BOTH export_user_data and prepare_user_erasure —
-- so this name puts the new table under that assertion instead of outside it,
-- and the test fails until both functions handle it. That is the mechanism
-- working, not an obstacle to route around.

create table public.dsr_requests (
  id uuid primary key default gen_random_uuid(),

  -- One value per right a person can exercise. `access_portability` is its own
  -- value rather than two rows: the self-serve export answers Art. 15 and
  -- Art. 20 with one document, and splitting it would invent a second request
  -- nobody made. The narrower values exist for the email channel, where someone
  -- may ask for only one of them.
  request_type text not null check (request_type in (
    'access', 'portability', 'access_portability',
    'erasure', 'rectification', 'restriction', 'objection'
  )),

  channel text not null check (channel in ('self_serve', 'email')),

  -- The subject. No FK — see the header. Null only once anonymized, or for an
  -- email-channel request from someone with no account.
  user_id uuid,

  -- Only ever set for the email channel, where the requester may have no
  -- account and the address is the only handle on who asked. Cleared by
  -- prepare_user_erasure on match and by the retention purge, so this cannot
  -- become a permanent list of everyone who ever exercised a right.
  subject_email text,

  -- HOW identity was established, not the identity itself: 'authenticated_session'
  -- for self-serve (the session is the proof), or what the operator did for an
  -- emailed request. Art. 12(6) allows asking for more, and if that happened it
  -- belongs in the evidence.
  identity_verification text not null,

  received_at timestamptz not null default now(),
  fulfilled_at timestamptz,
  -- `closed_account_erased` is written only by prepare_user_erasure, for a
  -- request that was still open when the subject erased their account. It is a
  -- real outcome rather than a tidy-up: an access request cannot be answered
  -- once the data is gone, and recording that is more honest than either
  -- claiming it was fulfilled or leaving it open forever against a clock
  -- nobody can now stop.
  outcome text check (outcome in (
    'fulfilled', 'refused', 'partially_fulfilled', 'withdrawn', 'closed_account_erased'
  )),
  notes text,

  anonymized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Mirrors the CHECK on the two evidence tables (§4 invariant 4): a row is
  -- attributable or anonymized, never neither. Without it, a stray insert could
  -- mint a row indistinguishable from erased evidence.
  constraint dsr_requests_attributable_or_anonymized check (
    anonymized_at is not null or user_id is not null or subject_email is not null
  ),

  -- A request is open or answered, never half. An outcome with no date cannot
  -- evidence the 30-day clock, and a date with no outcome does not say what was
  -- done — either alone would look like a complete record and not be one.
  constraint dsr_requests_answered_together check (
    (fulfilled_at is null) = (outcome is null)
  )
);

comment on table public.dsr_requests is
  'Art. 12(3) evidence: data-subject requests received and answered. Companion to admin_audit_log, which records operator actions rather than requests. See data-subject-rights.md §4f.';

create index dsr_requests_user_idx on public.dsr_requests (user_id);
create index dsr_requests_received_idx on public.dsr_requests (received_at desc);
-- Partial: the operational question is "what is still open", and open rows are
-- the small minority once self-serve entries (fulfilled on arrival) dominate.
create index dsr_requests_open_idx on public.dsr_requests (received_at) where fulfilled_at is null;

alter table public.dsr_requests enable row level security;

-- Admin-only, and read-only from PostgREST. There is no INSERT policy and no
-- UPDATE policy: every row is written by a definer function below, so the log
-- cannot be authored or edited from a browser session — the same reasoning as
-- admin_audit_log (§4d).
create policy "dsr_requests_select" on public.dsr_requests
  for select using (private.is_app_admin());

-- Both halves, matching what 20260809214703 had to add to admin_audit_log after
-- the fact: RLS with no write policy already denies, but the blanket grant
-- Supabase gives `authenticated` on a new public table is the other half of the
-- door, and leaving it open means the table is one accidental permissive policy
-- away from being writable from a browser session.
revoke insert, update, delete, truncate on public.dsr_requests from anon, authenticated;

create trigger dsr_requests_updated_at
  before update on public.dsr_requests
  for each row execute procedure update_updated_at();

-- ── Append-mostly guard ─────────────────────────────────────────────────────
-- Not append-only: a request received today is fulfilled later, so the
-- fulfilment fields must be writable exactly once. Everything that establishes
-- WHEN the clock started and WHO asked is immutable, because those are the
-- facts the log exists to evidence and an editable clock evidences nothing.
create or replace function public.dsr_requests_guard_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    -- The 7-year retention purge is the only sanctioned deletion, the same
    -- exception 20260810000004 gave the ledger and the audit log.
    if private.retention_purge_in_progress() then return old; end if;
    raise exception 'dsr_requests is append-only — DELETE on row % is not permitted', old.id;
  end if;

  -- An anonymized row is finished. Allowing edits after that point would let an
  -- erased subject's row be re-attributed to someone, or its outcome rewritten
  -- with nobody left to contradict it.
  if old.anonymized_at is not null then
    raise exception 'dsr_requests row % is anonymized and cannot be modified', old.id;
  end if;

  if new.id           is distinct from old.id
     or new.request_type is distinct from old.request_type
     or new.channel      is distinct from old.channel
     or new.user_id      is distinct from old.user_id
     or new.received_at  is distinct from old.received_at then
    raise exception 'dsr_requests row %: request_type, channel, user_id and received_at are immutable', old.id;
  end if;

  -- Fulfilment is a one-way transition. Re-answering a closed request would
  -- overwrite the evidence that it was answered on time.
  if old.fulfilled_at is not null
     and (new.fulfilled_at is distinct from old.fulfilled_at
          or new.outcome is distinct from old.outcome) then
    raise exception 'dsr_requests row % is already answered', old.id;
  end if;

  return new;
end;
$$;

revoke execute on function public.dsr_requests_guard_write() from public, anon, authenticated;

create trigger dsr_requests_guard_update
  before update on public.dsr_requests
  for each row execute procedure public.dsr_requests_guard_write();

create trigger dsr_requests_guard_delete
  before delete on public.dsr_requests
  for each row execute procedure public.dsr_requests_guard_write();

-- ── Writers ─────────────────────────────────────────────────────────────────
-- private, because these are called from other definer functions rather than
-- by any client. Keeping them out of `public` keeps them off the PostgREST RPC
-- surface entirely (CLAUDE.md → SECURITY DEFINER rules, item 1).
create or replace function private.log_dsr_request(
  p_request_type text,
  p_channel text,
  p_user_id uuid,
  p_identity_verification text,
  p_subject_email text default null,
  p_fulfilled_at timestamptz default null,
  p_outcome text default null,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.dsr_requests (
    request_type, channel, user_id, subject_email,
    identity_verification, fulfilled_at, outcome, notes
  )
  values (
    p_request_type, p_channel, p_user_id, p_subject_email,
    p_identity_verification, p_fulfilled_at, p_outcome, p_notes
  )
  returning id into v_id;
  return v_id;
end;
$$;

comment on function private.log_dsr_request(text, text, uuid, text, text, timestamptz, text, text) is
  'Writes one dsr_requests row. Called only from other SECURITY DEFINER functions; never client-reachable.';

-- ── Extending the pinned admin action vocabulary ────────────────────────────
-- CLAUDE.md: a new action means extending admin_audit_log_action_check in the
-- same migration as its writer, and adding it to ADMIN_AUDIT_ACTIONS so the
-- viewer can name it.
--
-- dsr_requests is append-mostly, which records WHAT was answered but not WHO
-- answered it. Recording a request and closing one are both unilateral operator
-- actions with consequences — "refused" is a decision a person makes — and §4d
-- exists precisely so those are attributable. Without these two entries, the
-- one table in the schema about operator accountability would be the one place
-- an operator acts unrecorded.
alter table public.admin_audit_log drop constraint admin_audit_log_action_check;
alter table public.admin_audit_log add constraint admin_audit_log_action_check
  check (action in (
    'account_erasure', 'plan_change', 'account_freeze', 'account_unfreeze',
    'account_ban', 'account_unban', 'credit_grant', 'credit_pack_refund',
    'dsr_request_logged', 'dsr_request_answered'
  ));

-- ── Admin entry points for the email channel ────────────────────────────────
-- The self-serve rights log themselves (see below). These cover the remainder:
-- a request that arrives by email, where receipt and fulfilment are separate
-- events days apart and only a person can record them.
create or replace function public.admin_log_dsr_request(
  p_request_type text,
  p_identity_verification text,
  p_user_id uuid default null,
  p_subject_email text default null,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := nullif(btrim(coalesce(p_subject_email, '')), '');
  v_user_id uuid := p_user_id;
  v_id uuid;
begin
  -- SECURITY DEFINER rule: authorize first. coalesce'd at the source in
  -- private.is_app_admin() since 20260809144926 — `not null` is null, and a
  -- guard that evaluates to NULL does not fire.
  if not private.is_app_admin() then
    raise exception 'Not authorized';
  end if;

  if v_user_id is null and v_email is null then
    raise exception 'admin_log_dsr_request: a request needs a subject — an account id or an email address';
  end if;

  -- Resolve the address to an account when one exists, so the operator types an
  -- email and the row still links to the person. This is what makes erasure and
  -- the subject's own export reach the entry: both key on user_id, and a row
  -- left holding only an address is reachable by neither until the email
  -- happens to match. The lookup is admin-gated by the check above.
  if v_user_id is null then
    select id into v_user_id from auth.users where lower(email) = lower(v_email);
  end if;

  v_id := private.log_dsr_request(
    p_request_type,
    'email',
    v_user_id,
    p_identity_verification,
    v_email,
    null, null,
    p_notes
  );

  -- Same transaction as the write it describes, so there is no version of this
  -- that records the request without recording who recorded it. The address is
  -- NOT copied into the entry: admin_audit_log holds ids only, so an entry can
  -- outlive the erasure it may later be part of (§4d).
  insert into public.admin_audit_log (admin_user_id, action, target_user_id, details)
  values (
    auth.uid(),
    'dsr_request_logged',
    v_user_id,
    jsonb_build_object('dsr_request_id', v_id, 'request_type', p_request_type)
  );

  return v_id;
end;
$$;

create or replace function public.admin_fulfil_dsr_request(
  p_id uuid,
  p_outcome text,
  p_notes text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  if not private.is_app_admin() then
    raise exception 'Not authorized';
  end if;

  -- `closed_account_erased` is reserved for prepare_user_erasure. Letting an
  -- operator pick it would let a refusal be recorded as though the account had
  -- been erased out from under the request.
  if p_outcome = 'closed_account_erased' then
    raise exception 'admin_fulfil_dsr_request: closed_account_erased is written only by an erasure';
  end if;

  update public.dsr_requests
     set fulfilled_at = now(),
         outcome = p_outcome,
         notes = coalesce(p_notes, notes)
   where id = p_id
  returning user_id into v_user_id;

  if not found then
    raise exception 'admin_fulfil_dsr_request: no such request %', p_id;
  end if;

  insert into public.admin_audit_log (admin_user_id, action, target_user_id, details)
  values (
    auth.uid(),
    'dsr_request_answered',
    v_user_id,
    jsonb_build_object('dsr_request_id', p_id, 'outcome', p_outcome)
  );
end;
$$;

revoke execute on function public.admin_log_dsr_request(text, text, uuid, text, text) from public, anon;
grant  execute on function public.admin_log_dsr_request(text, text, uuid, text, text) to authenticated, service_role;

revoke execute on function public.admin_fulfil_dsr_request(uuid, text, text) from public, anon;
grant  execute on function public.admin_fulfil_dsr_request(uuid, text, text) to authenticated, service_role;

-- ── The self-serve rights log themselves ────────────────────────────────────
-- Written by the function that does the work, in the same transaction, rather
-- than by its caller. This is the §4d lesson: a logging call placed beside the
-- work is a log the actor can decline to write, and a log the edge function
-- writes separately is a log that a failed second request silently skips. Here
-- there is no way to produce an export or an erasure without producing its
-- entry, because the same statement does both.

create or replace function public.export_user_data(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rec record;
  v_rows jsonb;
  v_tables jsonb := '{}'::jsonb;
  v_identity jsonb;
  v_email text;
  v_select text[];
  v_redacted text[] := '{}';
  v_cols text[];
  v_where text;
begin
  -- Service-role only, exactly like prepare_user_erasure: this function reads
  -- every table in the database for an arbitrary uuid, so the browser must have
  -- no path to it at all. `authenticated` holding EXECUTE would also route
  -- around the edge function's rate limit, which is the only bound on how often
  -- a whole-account dump can be built.
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'export_user_data can only be called by service_role';
  end if;

  if p_user_id is null then
    raise exception 'export_user_data: p_user_id is required';
  end if;

  -- Identity comes from the authoritative auth row rather than profiles, and is
  -- deliberately narrow: the columns that answer "who is this account", not the
  -- whole GoTrue record. `encrypted_password` and the recovery/confirmation
  -- token columns on auth.users are credentials by the same reasoning as above.
  select u.email,
         jsonb_build_object(
           'user_id', u.id,
           'email', u.email,
           'created_at', u.created_at,
           'last_sign_in_at', u.last_sign_in_at,
           'email_confirmed_at', u.email_confirmed_at,
           'providers', u.raw_app_meta_data -> 'providers',
           'user_metadata', u.raw_user_meta_data
         )
    into v_email, v_identity
  from auth.users u
  where u.id = p_user_id;

  if v_identity is null then
    raise exception 'export_user_data: no such account';
  end if;

  -- ── 1. Every table reachable through the auth.users FK graph ───────────────
  -- One (table, column) pair per iteration: a table can be keyed to a person by
  -- more than one column and both are that person's data. party_members is the
  -- case that matters — `user_id` is the campaign owner and `owner_user_id` is
  -- the player whose character it is, so a player's own character sheet is
  -- reachable ONLY through the second column. An export keyed on `user_id`
  -- alone would hand a player everything about their account except the
  -- character they actually play, which is the single row they would look for
  -- first.
  --
  -- The columns are grouped into ONE query per table (`col_a = $1 or col_b = $1`)
  -- rather than one query per column. Querying per column and concatenating the
  -- results duplicates any row that matches on both — a DM who also plays their
  -- own character has `user_id` and `owner_user_id` equal, so their character
  -- sheet would appear twice, and a consumer re-importing the document (the
  -- point of Art. 20) would see two characters or a primary-key collision.
  for v_rec in
    with keyed as (
      select cls.relname::text as table_name,
             att.attname::text as column_name
      from pg_constraint con
      join pg_namespace  con_ns on con_ns.oid = con.connamespace
      join pg_class      cls    on cls.oid = con.conrelid
      join unnest(con.conkey) with ordinality k(attnum, ord) on true
      join pg_attribute  att    on att.attrelid = con.conrelid and att.attnum = k.attnum
      where con.contype = 'f'
        and con.confrelid = 'auth.users'::regclass
        and con_ns.nspname = 'public'
        and cls.relkind = 'r'
        -- A composite FK into auth.users would make "the person column"
        -- ambiguous. None exists; this keeps the loop honest if one ever does.
        and array_length(con.conkey, 1) = 1

      union

      -- The user-keyed columns with NO FK, which the graph above cannot see.
      -- This is the half that can rot, so data_export.test.sql pins the set and
      -- asserts each member is named in both this function and
      -- prepare_user_erasure.
      --
      -- admin_audit_log.target_user_id is deliberately FK-less (§2) so the
      -- erasure receipt outlives its subject — which also made it invisible to
      -- an export keyed on the FK graph alone, even though a ban, freeze, plan
      -- change or credit grant recorded against someone is plainly data about
      -- them. `admin_user_id` on the same row is reached by the FK graph and is
      -- withheld by private.is_third_party_column: the operator's own id is not
      -- the subject's to receive.
      select *
      from (values
        ('rate_limit_events', 'user_id'),
        ('admin_audit_log',   'target_user_id')
      ) as extra(table_name, column_name)
    )
    select table_name,
           array_agg(column_name order by column_name) as columns
    from keyed
    group by table_name
    order by table_name
  loop
    -- Build the projection column by column so credential columns can be
    -- replaced in place. `format(%I)` over catalog-sourced identifiers is what
    -- makes the dynamic SQL safe.
    --
    -- Read from pg_attribute rather than information_schema.columns: the
    -- information_schema views filter by the current role's privileges, so a
    -- table the definer could not SELECT would yield no columns and this would
    -- build `select  from ...`. pg_catalog has no such filter, and `attisdropped`
    -- keeps dropped columns out of the projection.
    select array_agg(
             case
               when private.is_withheld_column(a.attname)
                 then format('case when t.%I is null then null else %L end as %I',
                             a.attname, '[redacted]', a.attname)
               else format('t.%I', a.attname)
             end
             order by a.attnum),
           array_agg(a.attname order by a.attnum)
             filter (where private.is_withheld_column(a.attname))
      into v_select, v_cols
    from pg_attribute a
    where a.attrelid = ('public.' || v_rec.table_name)::regclass
      and a.attnum > 0
      and not a.attisdropped;

    select string_agg(format('t.%I = $1', c), ' or ' order by c)
      into v_where
    from unnest(v_rec.columns) c;

    execute format(
      'select coalesce(jsonb_agg(to_jsonb(r)), ''[]''::jsonb)
         from (select %s from public.%I t where %s) r',
      array_to_string(v_select, ', '), v_rec.table_name, v_where
    )
    into v_rows
    using p_user_id;

    if jsonb_array_length(v_rows) > 0 then
      v_tables := jsonb_set(v_tables, array[v_rec.table_name], v_rows);
      -- Recorded only for tables that actually contributed rows, so the list
      -- describes this export rather than the schema's redaction policy in the
      -- abstract.
      if v_cols is not null then
        v_redacted := array(
          select distinct e
          from unnest(v_redacted || array(
            select v_rec.table_name || '.' || c from unnest(v_cols) c
          )) e
          order by e
        );
      end if;
    end if;
  end loop;

  -- The subject's own request history (#643). Their record of what they asked
  -- for and when it was answered is their personal data as much as anyone's,
  -- and it is the one table here whose whole purpose is to be producible.
  --
  -- Matched on user_id OR the address, exactly as prepare_user_erasure matches
  -- it. Keying on user_id alone would leave an email-channel request logged
  -- before the account existed erasable but never exportable — the precise
  -- asymmetry between the two rights that data_export.test.sql exists to rule
  -- out. One query rather than two, so a row matching both conditions still
  -- appears once.
  select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) into v_rows
  from public.dsr_requests r
  where r.user_id = p_user_id
     or (v_email is not null and lower(r.subject_email) = lower(v_email));
  if jsonb_array_length(v_rows) > 0 then
    v_tables := jsonb_set(v_tables, '{dsr_requests}', v_rows);
  end if;

  -- ── 2. Rows keyed by address rather than by id ────────────────────────────
  -- Matched case-insensitively on the address read from auth.users above, the
  -- same match erasure uses. A signup that never became this account keeps its
  -- own consent and retention period and is not this subject's data.
  select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) into v_rows
  from public.pro_waitlist r
  where v_email is not null and lower(r.email) = lower(v_email);
  if jsonb_array_length(v_rows) > 0 then
    v_tables := jsonb_set(v_tables, '{pro_waitlist}', v_rows);
  end if;

  -- ── 3. The request this call answers (#643) ───────────────────────────────
  -- Written here rather than by the edge function so there is no way to produce
  -- an export without producing its evidence. Logged as fulfilled in the same
  -- breath because self-serve access is instantaneous — there is no interval
  -- between receipt and answer to record. Deliberately AFTER the read above, so
  -- an export does not contain the record of itself and every document is a
  -- complete snapshot of the moment before it existed.
  perform private.log_dsr_request(
    'access_portability', 'self_serve', p_user_id, 'authenticated_session',
    null, now(), 'fulfilled',
    'Self-serve export via export-my-data.'
  );

  return jsonb_build_object(
    'identity', v_identity,
    'tables', v_tables,
    'meta', jsonb_build_object(
      'exported_at', now(),
      'format', 'grimoire-account-export',
      'format_version', 1,
      -- Empty tables are omitted rather than emitted as `[]`. A player's export
      -- would otherwise be ~90 empty arrays around the dozen that hold
      -- anything, which makes the document harder to read for the person whose
      -- right it exists to serve. Absence means "no rows", and says so here.
      'omitted_when_empty', true,
      'redacted_columns', to_jsonb(v_redacted),
      'redaction_note',
        'Shown as "[redacted]": bearer credentials (BYOK API keys, invite and calendar-feed tokens), '
        'and identifiers belonging to someone else (which admin acted on an audit entry). '
        'A null stays null, so the export still records whether a value was set.'
    )
  );
end;
$$;

comment on function public.export_user_data(uuid) is
  'GDPR Art. 15/20 account export (#632). service_role only; called by the export-my-data edge function with an id derived from a verified JWT. Logs its own dsr_requests entry (#643).';

revoke execute on function public.export_user_data(uuid) from public, anon, authenticated;
grant  execute on function public.export_user_data(uuid) to service_role;

-- ── prepare_user_erasure: log the request, and spare the log from the erasure ─
-- Restated in full rather than patched; the body is otherwise identical to
-- 20260810000014.
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

  -- The Art. 12(3) side of the same event (#643). admin_audit_log evidences the
  -- action; this evidences the request that prompted it. An admin-initiated
  -- erasure is still logged: the operator acting unilaterally is exactly the
  -- case where evidence of what was done, and on whose say-so, matters most.
  perform private.log_dsr_request(
    'erasure',
    case when p_actor_kind = 'self' then 'self_serve' else 'email' end,
    p_user_id,
    case when p_actor_kind = 'self' then 'authenticated_session' else 'admin_initiated' end,
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

-- ── Retention — 7 years, the accountability clock ───────────────────────────
-- Same period and same reasoning as admin_audit_log: the two describe opposite
-- sides of one event, and splitting their clocks would leave a record of a
-- request whose answer has gone, or the reverse. Restated in full; the rest of
-- the body is identical to 20260810000004.
create or replace function private.purge_expired_retention()
returns void
language plpgsql
as $$
begin
  perform set_config('grimoire.retention_purge', 'on', true);

  delete from public.ai_credit_ledger
   where created_at < private.retention_horizon(7);

  delete from public.purchase_consents
   where created_at < private.retention_horizon(7);

  delete from public.admin_audit_log
   where created_at < private.retention_horizon(7);

  -- #643. Measured from received_at rather than created_at: for the email
  -- channel those differ — a request that arrived last month may be recorded
  -- today — and the clock this table evidences starts on receipt.
  delete from public.dsr_requests
   where received_at < private.retention_horizon(7);

  delete from public.abuse_guard_trips
   where created_at < now() - interval '180 days';

  delete from public.image_generation_jobs
   where created_at < now() - interval '90 days'
     and (status <> 'ready' or image_url is null);

  delete from public.ai_generation_jobs
   where created_at < now() - interval '365 days';

  delete from public.app_invites
   where (expires_at is not null and expires_at < now() - interval '90 days')
      or (max_uses is not null and use_count >= max_uses
          and created_at < now() - interval '90 days');

  delete from public.campaign_invites
   where (expires_at is not null and expires_at < now() - interval '90 days')
      or (max_uses is not null and use_count >= max_uses
          and created_at < now() - interval '90 days');

  delete from public.feature_interest
   where created_at < now() - interval '365 days';

  delete from public.pro_waitlist
   where created_at < now() - interval '365 days';
end;
$$;
