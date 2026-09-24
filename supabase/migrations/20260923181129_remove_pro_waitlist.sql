-- Remove the Pro waitlist (23 Sep 2026).
--
-- The waitlist stood in for a Pro checkout that was not open yet: while
-- checkout_config.pro_signup_open was false, the marketing site swapped its
-- Go Pro buttons for a signup form. Checkout opened on 23 Sep 2026 and the
-- list had never held a single row, so the whole apparatus goes rather than
-- lingering as a dormant path:
--
--   pro_waitlist + its withdrawal/removal RPCs      (20260718000006, 20260811221206)
--   disposable_email_domains + its insert guard     (20260720000003) screened
--                                                   waitlist signups and nothing else
--   checkout_config.pro_signup_open + its rebuild   the switch's only "off" state was
--   trigger                                         the waitlist form
--   admin_audit_log action 'waitlist_removal'       never written
--
-- The retention purge, account erasure and data export each carried a
-- waitlist branch; they are redefined verbatim minus that branch. The bodies
-- were taken from production after confirming by md5 that they match the
-- local replay byte for byte.
--
-- The waitlist-unsubscribe Edge Function leaves the repo in the same change.
-- Its deployed copy must be removed with `supabase functions delete`: a
-- deploy never deletes a function that is no longer in the repo.

-- ── Functions that reached into the waitlist ───────────────────────────────

CREATE OR REPLACE FUNCTION private.purge_expired_retention()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
end;
$function$;

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

  if p_actor_kind not in ('self', 'admin') then
    raise exception 'prepare_user_erasure: actor_kind must be self or admin, got %', p_actor_kind;
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

  update storage.objects
  set owner = null, owner_id = null
  where owner = p_user_id or owner_id = p_user_id::text;
end;
$function$;

CREATE OR REPLACE FUNCTION public.export_user_data(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- ── 2. The request this call answers (#643) ───────────────────────────────
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
$function$;

-- ── The waitlist itself ────────────────────────────────────────────────────

drop function public.withdraw_waitlist_consent(uuid);
drop function public.admin_remove_waitlist_email(text);

-- Dropping the table drops its BEFORE INSERT guard trigger with it.
drop table public.pro_waitlist;
drop function public.reject_disposable_waitlist_email();
drop table public.disposable_email_domains;

-- ── The switch that chose between the form and the checkout buttons ────────

drop trigger checkout_config_marketing_rebuild on public.checkout_config;
alter table public.checkout_config drop column pro_signup_open;

-- ── The audit category nothing can produce any more ────────────────────────

alter table public.admin_audit_log drop constraint admin_audit_log_action_check;
alter table public.admin_audit_log add constraint admin_audit_log_action_check
  check (action = any (array[
    'account_erasure', 'plan_change', 'account_freeze', 'account_unfreeze',
    'account_ban', 'account_unban', 'credit_grant', 'credit_pack_refund',
    'dsr_request_logged', 'dsr_request_answered'
  ]));
