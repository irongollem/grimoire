-- #1260: bring your own key is gone. Every AI request runs on the platform's keys and is paid in credits.
--
-- Production on 23 Nov 2026 held no row in campaign_api_keys, and the ledger had no own-key row since 28 May 2026.
-- The admin's platform keys (platform_api_keys) are unaffected: they are still encrypted by the api-key-vault
-- function, which is now admin-only.
--
-- This migration changes nothing the code before #1260 still reads: CI applies migrations before it deploys the edge
-- functions, and Vercel ships the frontend on its own, so for a while the old functions and open tabs still select
-- campaigns.text_provider and campaign_api_keys. Those are dropped by 20261124133123, in a later release.

-- 1. An async job's billing no longer carries is_byok: every settlement spends credits.
create or replace function public.settle_ai_generation_job(p_job_id uuid, p_result_json jsonb)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_job public.ai_generation_jobs%rowtype;
  v_reservation_ids uuid[];
  v_billing jsonb;
  v_spend jsonb;
begin
  select * into v_job from public.ai_generation_jobs where id = p_job_id for update;
  if not found then
    raise exception 'AI generation job not found';
  end if;
  if v_job.status = 'ready' then
    return;
  end if;
  if v_job.status <> 'settling' then
    raise exception 'AI generation job is not ready to settle';
  end if;
  if v_job.artifact_url is null and v_job.artifact_storage_path is null then
    raise exception 'AI generation job has no persisted artifact';
  end if;

  v_billing := coalesce(v_job.billing_context, '{}'::jsonb);
  select coalesce(array_agg(value::uuid), '{}'::uuid[])
    into v_reservation_ids
    from jsonb_array_elements_text(coalesce(v_billing->'reservation_ids', '[]'::jsonb));

  if coalesce((v_billing->>'cost')::numeric, 0) > 0 then
    v_spend := public.spend_credits(
      v_job.user_id,
      coalesce(v_billing->>'generation_type', v_job.generator_type),
      (v_billing->>'cost')::numeric,
      coalesce(v_billing->'log', '{}'::jsonb),
      true
    );
    if not coalesce((v_spend->>'ok')::boolean, false) then
      raise exception 'Could not settle AI generation credits';
    end if;
  end if;

  if cardinality(v_reservation_ids) > 0 then
    perform public.release_credits(v_reservation_ids);
  end if;

  update public.ai_generation_jobs
  set status = 'ready',
      result_json = p_result_json,
      error = null,
      completed_at = now(),
      billing_context = v_billing || jsonb_build_object('settlement', 'recorded')
  where id = p_job_id;
end;
$function$;

-- 2. is_byok stays, as history: a row before #1260 may record a generation the DM paid the provider for, and the cost
--    reports (get_credit_calibration_hints, ai_generation_costs) must keep leaving those out. Nothing writes true now.
comment on column public.ai_credit_ledger.is_byok is
  'History only (#1260): true on rows from before bring-your-own-key was removed, where the DM paid the provider. Nothing writes true now.';

-- 3. The data export no longer names own API keys among the credentials it withholds.
CREATE OR REPLACE FUNCTION public.export_user_data(p_user_id uuid, p_parent_user_id uuid DEFAULT NULL::uuid)
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

  -- A parent exporting their child's account (#919). The edge function has
  -- already checked the link; this re-checks it so the parent path cannot be
  -- reached by passing a parent id the function did not verify.
  if p_parent_user_id is not null and not exists (
    select 1 from public.child_accounts c
    where c.child_user_id = p_user_id
      and c.parent_user_id = p_parent_user_id
      and c.adult_on > current_date
  ) then
    raise exception 'export_user_data: not this account''s parent';
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
    'access_portability', 'self_serve', p_user_id,
    case when p_parent_user_id is null then 'authenticated_session' else 'parent_session' end,
    null, now(), 'fulfilled',
    case when p_parent_user_id is null
      then 'Self-serve export via export-my-data.'
      else 'Parent export of a child account via export-my-data.'
    end
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
        'Shown as "[redacted]": bearer credentials (invite and calendar-feed tokens), '
        'and identifiers belonging to someone else (which admin acted on an audit entry). '
        'A null stays null, so the export still records whether a value was set.'
    )
  );
end;
$function$;
