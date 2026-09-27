-- The demo copy has to finish inside the 8-second statement timeout every
-- logged-in PostgREST request runs under (the `authenticated` role's
-- statement_timeout). On 27 Sep 2026 it took 14 seconds cold and 7.4 warm:
-- "Publish demo version" was cancelled mid-copy (its dry run is the same copy),
-- and so, for any new user, was "Load the demo campaign" (#912, #917).
--
-- Measured in production, two steps held nearly all of it:
--   * The embeddings. They are copied on purpose (a new user's dashboard
--     should not call the demo "not indexed for AI search"), but they went
--     through the generic path: every 1,536-float vector serialised to jsonb,
--     scanned by the uuid remap, and retried in every insert pass until its
--     parent existed. item_embeddings alone spent 1.2 seconds on one failed
--     attempt. They now copy table to table after everything else, joined
--     through the id map, which is all they need: their only uuid is the
--     parent's.
--   * information_schema.columns, queried once per catalogued table to ask
--     whether it has a uuid `id` (and in the FK check, a `user_id`). That view
--     is slow on a database with many tables; pg_attribute answers the same
--     question directly.
--
-- Nothing else in the copy changes.

-- Whether a catalogued demo table is an embedding table: it carries a pgvector
-- `embedding` column. Structural rather than name-based, so a table named
-- *_embeddings without vectors, or a vector table named otherwise, is
-- classified by what it holds.
create or replace function private.is_demo_embedding_table(p_table text)
returns boolean
language sql
stable
set search_path = public, private
as $$
  select exists (
    select 1
      from pg_attribute a
      join pg_type t on t.oid = a.atttypid
     where a.attrelid = format('public.%I', p_table)::regclass
       and a.attname = 'embedding'
       and t.typname = 'vector'
       and not a.attisdropped
  );
$$;

revoke execute on function private.is_demo_embedding_table(text) from public, anon, authenticated;

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
  --    author's rather than the campaign's: BYOK keys, the Spotify client, the
  --    iCal feed token (a capability URL), the template flags, and the AI
  --    choice. `ai_enabled` is the owner's consent under the AI Act (see
  --    context/compliance/ai-act.md §4) -- only the owner may give it, so the
  --    copy starts unchosen and asks its new owner, whatever the author picked.
  --    The provider selection goes with it. AI provenance on the content itself
  --    is copied verbatim: that marks what the content is, not who consented.
  v_campaign := v_campaign || jsonb_build_object(
    'id', v_new_campaign,
    'user_id', p_owner,
    'demo_template', false,
    'demo_version', null,
    'demo_source', p_version,
    'is_archived', false,
    'ical_token', gen_random_uuid(),
    'openai_api_key', null,
    'anthropic_api_key', null,
    'gemini_api_key', null,
    'spotify_client_id', null,
    'ai_enabled', null,
    'text_provider', null,
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
      begin
        execute format(
          'insert into public.%I select x.* from pg_temp.demo_rows d cross join lateral jsonb_populate_record(null::public.%I, d.data) x where d.tbl = %L and not d.done',
          r.tbl, r.tbl, r.tbl
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
                'insert into public.%I select * from jsonb_populate_record(null::public.%I, $1)',
                r.tbl, r.tbl
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

  if v_location is not null and v_location <> 'null'::jsonb then
    update public.campaigns set current_location_id = (v_location #>> '{}')::uuid where id = v_new_campaign;
  end if;

  perform set_config('grimoire.copying_campaign', 'off', true);
  perform set_config('grimoire.bypass_quota', 'off', true);

  return v_new_campaign;
end;
$function$;
