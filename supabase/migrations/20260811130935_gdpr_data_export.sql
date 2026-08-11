-- GDPR access & portability export (#632, Art. 15/20). The contract this
-- implements is context/compliance/data-subject-rights.md §4e.
--
-- WHY THIS ENUMERATES TABLES INSTEAD OF LISTING THEM
--
-- The obvious shape is a hand-written manifest: `jsonb_build_object('notes',
-- (select ... from notes where user_id = ...), ...)`, one line per table. That
-- shape is wrong here for the same reason #640 was wrong — a manifest only
-- covers what someone remembered to add to it, and a table added by a later
-- migration is missing from the export with nothing failing. An export that
-- silently omits a table is not a broken feature; it is an unlawful response to
-- an Art. 15 request, and it looks exactly like a working one.
--
-- So the set is *derived*, from the same two sources erasure uses:
--
--   1. Every column in `public` with a foreign key to `auth.users`. Migration
--      20260808000001 asserts at push time that no such FK exists without
--      `cascade`/`set null`, so this graph is the definition of "rows that
--      belong to a person" — it is already load-bearing for deletion, and it is
--      maintained because deletion would break otherwise.
--   2. The rows no FK reaches, which `prepare_user_erasure` clears by hand:
--      `rate_limit_events` (no FK) and a `pro_waitlist` row matching the
--      account's address (keyed by email, predates the account).
--
-- Symmetry with erasure is the invariant, and it runs both ways: a table this
-- function cannot see is a table deletion cannot reach either. Asserted by
-- supabase/tests/data_export.test.sql.
--
-- Storage objects are NOT here — the objects live outside Postgres, so the edge
-- function enumerates them from the same shared listing `delete-account` purges
-- with (supabase/functions/_shared/storage-inventory.ts).

-- ── Columns that are credentials, not personal data ──────────────────────────
-- A BYOK key and an invite/feed token are bearer credentials: whoever holds the
-- string can spend the user's model budget, join their campaign, or read their
-- calendar. Encryption at rest does not help — `campaigns.gemini_api_key` holds
-- `enc:v1:...` which the app decrypts on use, so exporting it exports the
-- capability. They are replaced by a marker rather than dropped, because "you
-- had a key configured" is itself information the subject is entitled to; only
-- the secret is withheld.
--
-- EVERY term is anchored to a whole word, and that is load-bearing in both
-- directions. `input_tokens`, `output_tokens` and `input_image_tokens` on
-- ai_credit_ledger are billing counts and among the most useful numbers in the
-- export, so a naive `%token%` would redact the usage history to protect
-- nothing. The same trap runs the other way in this domain: `%secret%` would
-- match `npcs.secrets` or `quests.secret_hook` — perfectly ordinary campaign
-- prose — and return it as "[redacted]" in the subject's Art. 15 document,
-- which is an incomplete answer to an access request that looks like a working
-- export. `password` is the one unanchored term, because a column with that
-- word anywhere in its name is a credential in every form it takes
-- (`encrypted_password`, `password_hash`).
create or replace function private.is_credential_column(p_column text)
returns boolean
language sql
immutable
as $$
  select p_column ~* '(^|_)(api_key|secret_key|access_key|private_key|secret|credential|token)$'
      or p_column ~* 'password';
$$;

comment on function private.is_credential_column(text) is
  'True for column names holding a bearer credential (BYOK key, invite/feed token). Redacted from GDPR exports — see 20260811130935.';

-- Identifiers that belong to someone other than the subject. Art. 15(4): the
-- right to a copy "shall not adversely affect the rights and freedoms of
-- others". `admin_audit_log.admin_user_id` is the operator who acted — in a
-- single-operator app, exporting it to every requester hands out the founder's
-- own account id. The action, its target, its details and its timestamp are all
-- the subject's data and are exported in full; only who pressed the button is
-- withheld.
create or replace function private.is_third_party_column(p_column text)
returns boolean
language sql
immutable
as $$
  select p_column = 'admin_user_id';
$$;

-- The one predicate the projection actually asks. Kept separate from its two
-- halves so each keeps its own reason, and so the credential rule stays
-- independently testable.
create or replace function private.is_withheld_column(p_column text)
returns boolean
language sql
immutable
as $$
  select private.is_credential_column(p_column) or private.is_third_party_column(p_column);
$$;

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
  'GDPR Art. 15/20 account export (#632). service_role only; called by the export-my-data edge function with an id derived from a verified JWT.';

revoke execute on function public.export_user_data(uuid) from public, anon, authenticated;
grant  execute on function public.export_user_data(uuid) to service_role;

-- ── Rate-limit vocabulary ────────────────────────────────────────────────────
-- check_rate_limit() takes the action as a free-text argument, so nothing to
-- migrate; the budget lives beside the others in _shared/rate-limit.ts. Noted
-- here only so a reader of this migration knows where the bound is.
