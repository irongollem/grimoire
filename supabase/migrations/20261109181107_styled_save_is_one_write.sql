-- Saving an AI-styled render to a site is one write (#1169).
--
-- The save makes a walls-only `dungeon_maps` row and points the place at it (useSaveStyledSitePicture). It used to
-- be two requests, so a failure between them left the new map in the Cartographer library linked to nothing, and
-- saving again made another. Here both happen in one transaction: if the place cannot be updated, the map is not
-- made either.
--
-- A retry of the same render must not make a second map when the first save did commit but its answer was lost
-- (a dropped connection). The client sends one key per render, and the map it makes carries that key in
-- `metadata.styled_save_request`; a call whose key already names one of the caller's maps reuses that map. The key
-- lives in `metadata`, not a column with a unique index: the demo copy and dev:campaigns copy `dungeon_maps` rows
-- whole, and a unique column would make every copy collide.
--
-- SECURITY INVOKER: both writes are ones the client already made under its own RLS (`dungeon_maps_insert`,
-- `locations_update`), so the function needs no privilege of its own and adds no definer to the registry.

create function public.save_styled_site_picture(
  p_location_id uuid,
  p_request_id uuid,
  p_map_url text,
  p_calibration jsonb,
  p_map_live jsonb,
  p_drawing jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_map_id uuid;
  v_map_rev integer;
  v_location public.locations;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_request_id is null or p_drawing is null or nullif(p_drawing ->> 'name', '') is null then
    raise exception 'A styled save needs a request key and a named drawing' using errcode = '22023';
  end if;

  select m.id, m.rev into v_map_id, v_map_rev
  from public.dungeon_maps m
  where m.user_id = v_uid and m.metadata ->> 'styled_save_request' = p_request_id::text
  limit 1;

  if v_map_id is null then
    insert into public.dungeon_maps (user_id, name, description, layers, metadata, default_pack_id, darkness, tags, notes, campaign_id)
    values (
      v_uid,
      p_drawing ->> 'name',
      p_drawing ->> 'description',
      coalesce(p_drawing -> 'layers', '{}'::jsonb),
      coalesce(p_drawing -> 'metadata', '{}'::jsonb) || jsonb_build_object('styled_save_request', p_request_id),
      p_drawing ->> 'default_pack_id',
      coalesce(p_drawing ->> 'darkness', 'daylight'),
      coalesce((select array_agg(t) from jsonb_array_elements_text(coalesce(p_drawing -> 'tags', '[]'::jsonb)) t), '{}'),
      nullif(p_drawing -> 'notes', 'null'::jsonb),
      (p_drawing ->> 'campaign_id')::uuid
    )
    returning id, rev into v_map_id, v_map_rev;
  end if;

  update public.locations
  set map_url = p_map_url,
      grid_calibration = p_calibration,
      map_layer_url = null,
      map_layer_stand_url = null,
      map_layer_stand_live_url = null,
      map_layer_calibration = null,
      map_live = p_map_live,
      source_map_id = v_map_id,
      -- The walls drawing is exactly what the snapshot came from, so the site is not behind it.
      map_published_rev = v_map_rev
  where id = p_location_id
  returning * into v_location;

  -- A place the caller may not update (or that does not exist) undoes the map insert with it.
  if v_location.id is null then
    raise exception 'Place not found or not yours to change' using errcode = '42501';
  end if;

  return to_jsonb(v_location);
end;
$$;

comment on function public.save_styled_site_picture(uuid, uuid, text, jsonb, jsonb, jsonb) is
  'An AI-styled render becomes a site''s Picture and a new walls-only drawing its Drawing, in one transaction; a repeated request key reuses its map (#1169).';

revoke execute on function public.save_styled_site_picture(uuid, uuid, text, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.save_styled_site_picture(uuid, uuid, text, jsonb, jsonb, jsonb) to authenticated, service_role;
