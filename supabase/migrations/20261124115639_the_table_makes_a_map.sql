-- The AI table makes a map for a place that has none (#1021 row 17).
--
-- The maintainer, 15 Nov 2026: most maps arrive as a picture from somewhere else; when a scene has no map at all,
-- the AI DM makes one that fits the story. It writes the plan (rooms, doors, what stands where) as a Cartographer
-- drawing, so the walls are exact, and the picture is painted from it; the picture is never the source of the walls.
-- `agent-turn` builds everything from the Narrator's plan in code (`_shared/agent/mapPlan.ts`: the walls-only drawing,
-- the exact `map_live`, the rooms' cells) and draws a plain picture of it; this function writes it all in one
-- transaction, so a map is never half made: the drawing, the place's picture and snapshot, a room per part of the
-- plan, the room's region on the grid, and the doors between rooms.
--
-- The shape is `save_styled_site_picture`'s (20261109181107): security invoker, so RLS decides what the caller may
-- write (the DM of the campaign), and idempotent on a request key kept in the drawing's metadata, so a retried call
-- returns the place instead of making a second map. Two rules of its own:
--   1. It never replaces a map. A place that already has a picture, a drawing, a blank grid or a source map, or sits
--      under a place that has one, is refused: the DM's own map always wins, and the Narrator is only offered the
--      tool where the place has none.
--   2. A room the place already has under the same name is used, not duplicated: the DM may have named the rooms
--      before anything drew them. A region it kept from a map the place no longer has is replaced. Rooms are made only where the place may hold rooms
--      (`private.location_can_hold_rooms`); elsewhere the map is open ground with exact walls and no rooms.
--   3. Rooms are records that count against the account's plan. When they do not fit (`quota_exceeded`, a free plan at
--      its limit; seen live on the fixture, 24 Nov 2026) the map is still made, as open ground: the walls and doors are
--      exact either way, and no room is half made (all of them or none).
-- The regions are `floodfill`, the provenance a publish from the drawing gives, so the Cartographer can re-derive
-- them; the doors are `publish` for the same reason.

create or replace function public.make_place_map(
  p_location_id uuid,
  p_request_id uuid,
  p_map_url text,
  p_calibration jsonb,
  p_map_live jsonb,
  p_drawing jsonb,
  p_rooms jsonb,
  p_doors jsonb
)
returns jsonb
language plpgsql
set search_path = ''
as $function$
declare
  v_uid uuid := (select auth.uid());
  v_place public.locations;
  v_map_id uuid;
  v_map_rev integer;
  v_room jsonb;
  v_door jsonb;
  v_room_id uuid;
  v_rooms jsonb := '{}'::jsonb;
  v_holds_rooms boolean;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_request_id is null or p_drawing is null or nullif(p_drawing ->> 'name', '') is null
     or nullif(p_map_url, '') is null or p_calibration is null or p_map_live is null
     or jsonb_typeof(coalesce(p_rooms, 'null'::jsonb)) <> 'array' or jsonb_typeof(coalesce(p_doors, 'null'::jsonb)) <> 'array' then
    raise exception 'A map needs a request key, a named drawing, a picture, a calibration, a snapshot, rooms and doors'
      using errcode = '22023';
  end if;

  -- Locked, so a second call for the same place waits here and then sees the map the first one made (#1271 review).
  select * into v_place from public.locations where id = p_location_id for update;
  if v_place.id is null then
    raise exception 'Place not found' using errcode = 'P0002';
  end if;

  -- A retry of the same request: the map was made, so the place is returned as it stands.
  select m.id into v_map_id
    from public.dungeon_maps m
   where m.user_id = v_uid and m.metadata ->> 'table_map_request' = p_request_id::text
   limit 1;
  if v_map_id is not null then
    return to_jsonb(v_place);
  end if;

  -- Every map the app reads as one (`hasAnyMapLayer`: a picture, a published drawing, a blank grid), on the place or a
  -- place above it within the six steps the table walks (`MAX_ANCESTOR_STEPS`), and a drawing bound to the place itself.
  if v_place.source_map_id is not null or exists (
    with recursive up (id, parent_id, mapped, depth) as (
      select l.id, l.parent_id, (l.map_url is not null or l.map_layer_url is not null or l.plan_size is not null), 0
        from public.locations l where l.id = p_location_id
      union all
      select l.id, l.parent_id, (l.map_url is not null or l.map_layer_url is not null or l.plan_size is not null), up.depth + 1
        from public.locations l join up on l.id = up.parent_id
       where up.depth < 6
    )
    select 1 from up where up.mapped
  ) then
    raise exception 'This place already has a map' using errcode = '23505';
  end if;

  insert into public.dungeon_maps (user_id, name, description, layers, metadata, darkness, campaign_id)
  values (
    v_uid,
    p_drawing ->> 'name',
    p_drawing ->> 'description',
    coalesce(p_drawing -> 'layers', '{}'::jsonb),
    coalesce(p_drawing -> 'metadata', '{}'::jsonb) || jsonb_build_object('table_map_request', p_request_id),
    coalesce(p_drawing ->> 'darkness', 'daylight'),
    v_place.campaign_id
  )
  returning id, rev into v_map_id, v_map_rev;

  update public.locations
     set map_url = p_map_url,
         grid_calibration = p_calibration,
         map_live = p_map_live,
         source_map_id = v_map_id,
         -- The snapshot is exactly what the drawing holds, so the place is not behind it.
         map_published_rev = v_map_rev
   where id = p_location_id
  returning * into v_place;
  -- A place the caller may not update undoes the drawing with it.
  if v_place.id is null then
    raise exception 'Place not yours to change' using errcode = '42501';
  end if;

  v_holds_rooms := private.location_can_hold_rooms(v_place.location_type);
  if v_holds_rooms then
    -- One block, so a plan limit met halfway through the rooms undoes all of them and keeps the map (rule 3).
    begin
    for v_room in select * from jsonb_array_elements(p_rooms) loop
      select l.id into v_room_id
        from public.locations l
       where l.parent_id = p_location_id and l.location_type = 'room'
         and lower(l.name) = lower(v_room ->> 'name')
         -- A room already given to another part of this plan is not given twice.
         and not exists (select 1 from jsonb_each_text(v_rooms) taken where taken.value = l.id::text)
       order by l.created_at
       limit 1;
      if v_room_id is null then
        insert into public.locations (user_id, campaign_id, parent_id, name, location_type, description)
        values (v_uid, v_place.campaign_id, p_location_id, v_room ->> 'name', 'room', nullif(v_room ->> 'about', ''))
        returning id into v_room_id;
      end if;
      -- A room the DM named may hold a region from a map the place no longer has: the new map's region replaces it
      -- (a room holds one region; #1271 review).
      insert into public.location_map_regions (user_id, site_location_id, space_location_id, cells, region_role, derived_from, cell_signature)
      values (v_uid, p_location_id, v_room_id, v_room -> 'cells', 'space', 'floodfill', v_room ->> 'signature')
      on conflict (space_location_id) where space_location_id is not null do update
        set site_location_id = excluded.site_location_id, cells = excluded.cells, region_role = excluded.region_role,
            derived_from = excluded.derived_from, cell_signature = excluded.cell_signature;
      v_rooms := v_rooms || jsonb_build_object(v_room ->> 'key', v_room_id);
    end loop;

    for v_door in select * from jsonb_array_elements(p_doors) loop
      insert into public.location_doors (user_id, from_location_id, to_location_id, door_kind, edge_key, derived_from)
      values (
        v_uid,
        (v_rooms ->> (v_door ->> 'from'))::uuid,
        case when v_door ->> 'to' is null then null else (v_rooms ->> (v_door ->> 'to'))::uuid end,
        'door',
        v_door ->> 'edgeKey',
        'publish'
      );
    end loop;
    exception when raise_exception then
      if sqlerrm <> 'quota_exceeded' then
        raise;
      end if;
    end;
  end if;

  return to_jsonb(v_place);
end;
$function$;

revoke execute on function public.make_place_map(uuid, uuid, text, jsonb, jsonb, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.make_place_map(uuid, uuid, text, jsonb, jsonb, jsonb, jsonb, jsonb) to authenticated, service_role;
