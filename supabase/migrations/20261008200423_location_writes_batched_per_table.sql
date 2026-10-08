-- Publishing a Cartographer map writes its regions, doors and placements in one
-- request per table instead of one per row, and all or nothing.
--
-- useMapPublish sent one PATCH per changed region, door and placement, in
-- parallel (updateLocationMapRegions / updateLocationDoors /
-- updateLocationPlacements): a 40-room dungeon was dozens of requests, and a
-- failure on one left the others written. A bulk upsert cannot replace them,
-- for the reason src/lib/reorder.ts gives: a partial row violates NOT NULL on
-- the insert path, and it needs an INSERT policy an update has no business
-- holding. So, like the reorder RPCs, an UPDATE-only function per table.
--
-- Each takes [{ "id": uuid, "update": { column: value, ... } }, ...]. Each row
-- gets its own UPDATE naming only the columns in its patch, exactly as the
-- PATCH it replaces did: a column-specific trigger (`UPDATE OF ...`) fires for
-- a column named in SET whether or not its value changes, so setting every
-- column would run the endpoint and space guards on rows they never ran on.
-- They run in one transaction, so a row that is missing or not the caller's
-- (RLS hides it, and the UPDATE touches nothing) refuses the whole batch.
--
-- SECURITY INVOKER: each table's own UPDATE policy is the authorization, as for
-- the reorder RPCs. The column lists are the client's *Update types; a key
-- outside them (user_id, site_location_id, ...) is refused, not ignored.

create function private.update_rows_by_id(p_table text, p_updates jsonb, p_columns text[])
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_item jsonb;
  v_patch jsonb;
  v_sets text;
  v_stray text;
  v_done integer;
begin
  if (select auth.uid()) is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if jsonb_typeof(p_updates) is distinct from 'array' then
    raise exception 'update_%: updates must be an array', p_table;
  end if;

  for v_item in select value from jsonb_array_elements(p_updates) loop
    v_patch := v_item -> 'update';
    if jsonb_typeof(v_item -> 'id') is distinct from 'string' or jsonb_typeof(v_patch) is distinct from 'object' then
      raise exception 'update_%: each entry is { id, update }', p_table;
    end if;
    select string_agg(key, ', ') into v_stray
      from jsonb_object_keys(v_patch) key where not (key = any (p_columns));
    if v_stray is not null then
      raise exception 'update_%: % cannot be changed here', p_table, v_stray;
    end if;
    select string_agg(format('%I = patch.%I', key, key), ', ') into v_sets from jsonb_object_keys(v_patch) key;
    if v_sets is null then
      continue;
    end if;

    execute format(
      'update public.%I target set %s from jsonb_populate_record(null::public.%I, $1) patch where target.id = $2',
      p_table, v_sets, p_table)
    using v_patch, (v_item ->> 'id')::uuid;
    get diagnostics v_done = row_count;
    if v_done <> 1 then
      raise exception 'update_%: % does not exist or is not yours', p_table, v_item ->> 'id'
        using errcode = '42501';
    end if;
  end loop;
end;
$$;

create function public.update_location_map_regions(p_updates jsonb)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.update_rows_by_id('location_map_regions', p_updates, array[
    'space_location_id', 'cells', 'label', 'sort_order', 'region_role', 'zone_kind',
    'zone_payload', 'derived_from', 'cell_signature', 'vertices']);
$$;

create function public.update_location_doors(p_updates jsonb)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.update_rows_by_id('location_doors', p_updates, array[
    'from_location_id', 'to_location_id', 'label', 'is_one_way', 'starts_locked', 'lock_note',
    'is_secret', 'sort_order', 'door_kind', 'edge_key', 'derived_from', 'dungeon_feature_id']);
$$;

create function public.update_location_placements(p_updates jsonb)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.update_rows_by_id('location_placements', p_updates, array[
    'note', 'sort_order', 'source_cell_key', 'location_id']);
$$;

-- The wrappers run as their caller, so the caller needs the helper too. The
-- private schema is not exposed by PostgREST, so this adds no endpoint.
revoke execute on function private.update_rows_by_id(text, jsonb, text[]) from public, anon;
grant execute on function private.update_rows_by_id(text, jsonb, text[]) to authenticated, service_role;

revoke execute on function public.update_location_map_regions(jsonb) from public, anon;
revoke execute on function public.update_location_doors(jsonb) from public, anon;
revoke execute on function public.update_location_placements(jsonb) from public, anon;
grant execute on function public.update_location_map_regions(jsonb) to authenticated, service_role;
grant execute on function public.update_location_doors(jsonb) to authenticated, service_role;
grant execute on function public.update_location_placements(jsonb) to authenticated, service_role;
