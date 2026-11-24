-- #1260: bring your own key is gone. Every AI request runs on the platform's keys and is paid in credits.
--
-- Production on 23 Nov 2026 held no row in campaign_api_keys, and the ledger had no own-key row since 28 May 2026.
-- The admin's platform keys (platform_api_keys) are unaffected: they are still encrypted by the api-key-vault
-- function, which is now admin-only.

-- 1. The stored keys, and everything that guarded them.
drop trigger if exists campaigns_clear_api_keys_on_owner_change on public.campaigns;
drop function if exists private.clear_campaign_api_keys_on_owner_change();

delete from private.demo_campaign_tables where table_name = 'campaign_api_keys';
drop table public.campaign_api_keys;
drop function if exists public.enforce_byok_pro_only();

-- 2. campaigns.text_provider only ever chose between a DM's own keys: without one, the platform picks the first text
--    provider the admin offers (chooseTextProvider in supabase/functions/_shared/providerChoice.ts). image_provider
--    stays: it is the DM's Quick / Detailed choice for pictures.
create or replace function private.guard_campaign_owner_columns()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  if (select auth.uid()) is null or old.user_id = (select auth.uid()) then
    return new;
  end if;
  -- spotify_client_id is not here: it is a public OAuth client id and travels
  -- with the campaign (#180).
  if new.user_id           is distinct from old.user_id
     or new.image_provider    is distinct from old.image_provider
     or new.ai_enabled        is distinct from old.ai_enabled
     or new.ical_token        is distinct from old.ical_token
     or new.is_archived       is distinct from old.is_archived
     or new.opening_quest_id  is distinct from old.opening_quest_id then
    raise exception 'Only the campaign''s owner can change that'
      using errcode = '42501';
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION private.copy_demo_template(p_template uuid, p_owner uuid, p_version text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
declare
  c_uuid constant text := '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
  v_template_owner uuid;
  v_new_campaign   uuid := gen_random_uuid();
  v_campaign       jsonb;
  v_location       jsonb;
  v_bad            text;
  v_count          bigint;
  v_cols           text;
  v_ins            text;
  v_sel            text;
  v_progress       boolean;
  r                record;
  m                record;
begin
  select user_id into v_template_owner from public.campaigns where id = p_template;
  if v_template_owner is null then
    raise exception 'The demo template does not exist';
  end if;

  perform set_config('grimoire.bypass_quota', 'on', true);
  perform set_config('grimoire.copying_campaign', 'on', true);

  drop table if exists pg_temp.demo_rows;
  drop table if exists pg_temp.demo_map;
  create temp table demo_rows (
    seq      bigserial primary key,
    tbl      text not null,
    old_id   uuid,
    new_id   uuid,
    data     jsonb not null,
    deferred jsonb not null default '{}',
    done     boolean not null default false,
    err      text
  ) on commit drop;
  create temp table demo_map (old_id uuid primary key, new_id uuid not null) on commit drop;

  -- 1. Collect. Tier 1 by campaign, then tier 2 through its parent.
  for r in
    select d.table_name,
           exists (select 1 from pg_attribute a
                    where a.attrelid = format('public.%I', d.table_name)::regclass
                      and a.attname = 'id' and a.atttypid = 'uuid'::regtype
                      and not a.attisdropped) as has_id
      from private.demo_campaign_tables d
     where d.tier = 1 and d.copy
     order by d.table_name
  loop
    execute format(
      'insert into pg_temp.demo_rows (tbl, old_id, data) select %L, %s, to_jsonb(x) from public.%I x where x.campaign_id = $1',
      r.table_name, case when r.has_id then 'x.id' else 'null::uuid' end, r.table_name
    ) using p_template;
  end loop;

  insert into pg_temp.demo_map (old_id, new_id)
  select old_id, gen_random_uuid() from pg_temp.demo_rows where old_id is not null;

  for r in
    select d.table_name, d.parent_column,
           exists (select 1 from pg_attribute a
                    where a.attrelid = format('public.%I', d.table_name)::regclass
                      and a.attname = 'id' and a.atttypid = 'uuid'::regtype
                      and not a.attisdropped) as has_id
      from private.demo_campaign_tables d
     where d.tier = 2 and d.copy and not private.is_demo_embedding_table(d.table_name)
     order by d.table_name
  loop
    execute format(
      'insert into pg_temp.demo_rows (tbl, old_id, data) select %L, %s, to_jsonb(x) from public.%I x where x.%I in (select old_id from pg_temp.demo_map)',
      r.table_name, case when r.has_id then 'x.id' else 'null::uuid' end, r.table_name, r.parent_column
    );
  end loop;

  insert into pg_temp.demo_map (old_id, new_id)
  select old_id, gen_random_uuid() from pg_temp.demo_rows where old_id is not null
  on conflict (old_id) do nothing;

  insert into pg_temp.demo_map (old_id, new_id) values (p_template, v_new_campaign), (v_template_owner, p_owner)
  on conflict (old_id) do nothing;

  select to_jsonb(c) into v_campaign from public.campaigns c where c.id = p_template;

  -- 2. Validate. The template becomes readable by every user who loads it, so
  --    it must not carry anyone else's identity or point into the author's
  --    other content. Both checks fail loudly, and publish_demo_version() runs
  --    this copy as a dry run, so a bad template is refused at publish time
  --    rather than discovered by the next new user.
  select count(*) into v_count
    from (select data from pg_temp.demo_rows union all select v_campaign) d
   cross join lateral regexp_matches(d.data::text, c_uuid, 'g') x
    join auth.users u on u.id = x[1]::uuid
   where not exists (select 1 from pg_temp.demo_map mm where mm.old_id = u.id);
  if v_count > 0 then
    raise exception 'The demo template references another account; remove its players and invites first';
  end if;

  -- A reference into a table the demo copies must be to a row the demo copies.
  select string_agg(distinct d.tbl || '.' || a.attname, ', ') into v_bad
    from pg_temp.demo_rows d
    join pg_class cl on cl.relname = d.tbl and cl.relnamespace = 'public'::regnamespace
    join pg_constraint con on con.conrelid = cl.oid and con.contype = 'f'
    join pg_class ref on ref.oid = con.confrelid and ref.relnamespace = 'public'::regnamespace
    join pg_attribute a on a.attrelid = cl.oid and a.attnum = any (con.conkey) and a.atttypid = 'uuid'::regtype
   where (ref.relname = 'campaigns'
          or ref.relname in (select table_name from private.demo_campaign_tables where copy))
     and d.data ->> a.attname is not null
     and not exists (select 1 from pg_temp.demo_map mm where mm.old_id = (d.data ->> a.attname)::uuid);
  if v_bad is not null then
    raise exception 'The demo template points at rows outside itself (%)', v_bad;
  end if;

  -- And a reference to a user-owned table the demo does not copy (a Scriptorium
  -- document, a tile pack) would hand the loader an id they cannot read.
  for r in
    select distinct cl.relname as tbl, a.attname as col, ref.relname as ref_tbl
      from pg_constraint con
      join pg_class cl on cl.oid = con.conrelid and cl.relnamespace = 'public'::regnamespace
      join pg_class ref on ref.oid = con.confrelid and ref.relnamespace = 'public'::regnamespace
      join pg_attribute a on a.attrelid = cl.oid and a.attnum = any (con.conkey) and a.atttypid = 'uuid'::regtype
     where con.contype = 'f'
       and cl.relname in (select table_name from private.demo_campaign_tables where copy)
       and ref.relname <> 'campaigns'
       and ref.relname not in (select table_name from private.demo_campaign_tables where copy)
       and exists (select 1 from pg_attribute ua
                    where ua.attrelid = ref.oid and ua.attname = 'user_id' and not ua.attisdropped)
  loop
    execute format(
      'select count(*) from pg_temp.demo_rows d join public.%I t on t.id = (d.data ->> %L)::uuid where d.tbl = %L and t.user_id is not null',
      r.ref_tbl, r.col, r.tbl
    ) into v_count;
    if v_count > 0 then
      raise exception 'The demo template points at its author''s own content outside the campaign (%.%)', r.tbl, r.col;
    end if;
  end loop;

  -- 3. Remap every copied row, and the campaign row, through the id map.
  update pg_temp.demo_rows d set new_id = mm.new_id
    from pg_temp.demo_map mm where mm.old_id = d.old_id;

  for r in select seq, data from pg_temp.demo_rows loop
    update pg_temp.demo_rows
       set data = private.remap_demo_ids(r.data::text, v_template_owner)::jsonb
     where seq = r.seq;
  end loop;

  v_campaign := private.remap_demo_ids(v_campaign::text, v_template_owner)::jsonb;
  v_location := v_campaign -> 'current_location_id';

  -- Stamp provenance, restart the clocks, and set the cycle-breaking columns
  -- aside to restore once every row exists.
  update pg_temp.demo_rows d
     set data = d.data
                || case when d.data ? 'demo_source' then jsonb_build_object('demo_source', p_version) else '{}'::jsonb end
                || case when d.data ? 'created_at' then jsonb_build_object('created_at', now()) else '{}'::jsonb end
                || case when d.data ? 'updated_at' then jsonb_build_object('updated_at', now()) else '{}'::jsonb end
   -- Every row, but a WHERE is still required: PostgREST sessions load
   -- pg_safeupdate, which rejects an UPDATE without one -- even on a temp table.
   where d.seq is not null;

  update pg_temp.demo_rows d
     set deferred = (select coalesce(jsonb_object_agg(col, d.data -> col), '{}'::jsonb)
                       from unnest(t.defer_columns) col
                      where d.data ->> col is not null),
         data = d.data || (select coalesce(jsonb_object_agg(col, null), '{}'::jsonb)
                             from unnest(t.defer_columns) col
                            where d.data ->> col is not null)
    from private.demo_campaign_tables t
   where t.table_name = d.tbl and cardinality(t.defer_columns) > 0;

  -- 4. The campaign row. Built from the template, minus everything that is the
  --    author's rather than the campaign's: the Spotify client, the
  --    iCal feed token (a capability URL), the template flags, and the AI
  --    choice. `ai_enabled` is the owner's consent under the AI Act (see
  --    context/compliance/ai-act.md §4) -- only the owner may give it, so the
  --    copy starts unchosen and asks its new owner, whatever the author picked.
  --    The picture provider choice goes with it. AI provenance on the content itself
  --    is copied verbatim: that marks what the content is, not who consented.
  v_campaign := v_campaign || jsonb_build_object(
    'id', v_new_campaign,
    'user_id', p_owner,
    'demo_template', false,
    'demo_version', null,
    'demo_source', p_version,
    'is_archived', false,
    'ical_token', gen_random_uuid(),
    'spotify_client_id', null,
    'ai_enabled', null,
    'image_provider', null,
    'current_location_id', null,
    'created_at', now(),
    'updated_at', now()
  );
  insert into public.campaigns
  select * from jsonb_populate_record(null::public.campaigns, v_campaign);

  -- The campaigns insert trigger enables the default sources; the template's
  -- own set is copied below instead.
  delete from public.campaign_enabled_sources where campaign_id = v_new_campaign;

  -- 5. Insert in passes until every row lands.
  loop
    v_progress := false;
    for r in
      select d.tbl,
             exists (select 1 from pg_constraint con
                      where con.contype = 'f'
                        and con.conrelid = format('public.%I', d.tbl)::regclass
                        and con.confrelid = con.conrelid) as self_ref
        from pg_temp.demo_rows d
       where not d.done
       group by d.tbl
       order by d.tbl
    loop
      -- The columns a row may be written with: never a generated column (world_links' from_id/to_id) or an identity
      -- column the table generates itself. `select x.*` wrote them too, and Postgres refuses that.
      select string_agg(quote_ident(a.attname), ', ' order by a.attnum),
             string_agg('x.' || quote_ident(a.attname), ', ' order by a.attnum)
        into v_ins, v_sel
        from pg_attribute a
       where a.attrelid = format('public.%I', r.tbl)::regclass and a.attnum > 0 and not a.attisdropped
         and a.attgenerated = '' and a.attidentity <> 'a';
      begin
        execute format(
          'insert into public.%I (%s) select %s from pg_temp.demo_rows d cross join lateral jsonb_populate_record(null::public.%I, d.data) x where d.tbl = %L and not d.done',
          r.tbl, v_ins, v_sel, r.tbl, r.tbl
        );
        update pg_temp.demo_rows set done = true, err = null where tbl = r.tbl and not done;
        v_progress := true;
      exception when others then
        update pg_temp.demo_rows set err = sqlerrm where tbl = r.tbl and not done;
        -- A table that references itself cannot go in one statement when a
        -- child precedes its parent; take it a row at a time.
        if r.self_ref then
          for m in select seq, data from pg_temp.demo_rows where tbl = r.tbl and not done order by seq loop
            begin
              execute format(
                'insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I, $1) x',
                r.tbl, v_ins, v_sel, r.tbl
              ) using m.data;
              update pg_temp.demo_rows set done = true, err = null where seq = m.seq;
              v_progress := true;
            exception when others then
              update pg_temp.demo_rows set err = sqlerrm where seq = m.seq;
            end;
          end loop;
        end if;
      end;
    end loop;

    exit when not exists (select 1 from pg_temp.demo_rows where not done);

    if not v_progress then
      raise exception 'The demo template could not be copied: %',
        (select string_agg(distinct tbl || ': ' || err, '; ') from pg_temp.demo_rows where not done);
    end if;
  end loop;

  -- 6. Restore the deferred references.
  for r in select tbl, new_id, deferred from pg_temp.demo_rows where deferred <> '{}'::jsonb loop
    select string_agg(format('%I = src.%I', k, k), ', ') into v_cols
      from jsonb_object_keys(r.deferred) k;
    execute format(
      'update public.%I t set %s from jsonb_populate_record(null::public.%I, $1) src where t.id = $2',
      r.tbl, v_cols, r.tbl
    ) using r.deferred, r.new_id;
  end loop;

  -- 7. The embeddings, table to table. They hold nothing to remap but their
  --    parent's id, and routing 1,536-float vectors through jsonb and the text
  --    remap above was most of the copy's time: 7 to 14 seconds against the
  --    8-second statement timeout every logged-in request runs under (#917).
  for r in
    select d.table_name, d.parent_column
      from private.demo_campaign_tables d
     where d.tier = 2 and d.copy and private.is_demo_embedding_table(d.table_name)
     order by d.table_name
  loop
    execute format(
      'insert into public.%1$I (%2$I, embedding, embedding_model, source_hash) '
      'select mm.new_id, e.embedding, e.embedding_model, e.source_hash '
      'from public.%1$I e join pg_temp.demo_map mm on mm.old_id = e.%2$I',
      r.table_name, r.parent_column
    );
  end loop;

  -- 8. The Open Book (#1085), when the template has one: its settings and the author's per-entry choices, so a
  --    new user can open a book that is already laid out. Never its releases, and never public: the copy starts
  --    closed, with no release, unindexed, under an address of its own (the template's is unique and is the
  --    author's). Releasing it is the new owner's act. An entry choice about a row the copy left out is dropped.
  insert into public.open_books (campaign_id, slug, title, subtitle, cover_art, cover_image_url, leather, chapters,
                                 include_shared, allow_pdf, indexable, is_open, live_release_id)
  select v_new_campaign,
         'demo-' || left(replace(v_new_campaign::text, '-', ''), 12),
         b.title, b.subtitle, b.cover_art, b.cover_image_url, b.leather, b.chapters,
         b.include_shared, b.allow_pdf, false, false, null
    from public.open_books b
   where b.campaign_id = p_template;

  insert into public.open_book_entries (campaign_id, entity_type, entity_id, included)
  select v_new_campaign, e.entity_type, mm.new_id, e.included
    from public.open_book_entries e
    join pg_temp.demo_map mm on mm.old_id = e.entity_id
   where e.campaign_id = p_template
     and exists (select 1 from public.open_books b where b.campaign_id = v_new_campaign);

  if v_location is not null and v_location <> 'null'::jsonb then
    update public.campaigns set current_location_id = (v_location #>> '{}')::uuid where id = v_new_campaign;
  end if;

  perform set_config('grimoire.copying_campaign', 'off', true);
  perform set_config('grimoire.bypass_quota', 'off', true);

  return v_new_campaign;
end;
$function$;

alter table public.campaigns drop column text_provider;

-- 3. An async job's billing no longer carries is_byok: every settlement spends credits.
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

-- 4. is_byok stays, as history: a row before #1260 may record a generation the DM paid the provider for, and the cost
--    reports (get_credit_calibration_hints, ai_generation_costs) must keep leaving those out. Nothing writes true now.
comment on column public.ai_credit_ledger.is_byok is
  'History only (#1260): true on rows from before bring-your-own-key was removed, where the DM paid the provider. Nothing writes true now.';

-- 5. The data export no longer names own API keys among the credentials it withholds.
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
