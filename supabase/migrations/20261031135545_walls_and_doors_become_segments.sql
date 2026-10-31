-- Walls and doors become segments (#1125 decision 5).
--
-- Until now a wall in the live battle map was a grid edge, "x,y:N" (the top edge of cell x,y) or "x,y:W" (its left
-- edge), and sight and light walked the grid testing those edges. The maintainer's direction (31 Oct 2026): "all maps
-- should be graphs/vectors", so a wall imported from a Universal VTT file can run at any angle. A wall is now a segment
-- between two points in image cells, `{ id, a: [x, y], b: [x, y] }`. A wall that lies on a grid line keeps its edge key
-- as its id, so nothing keyed on a door's edge changes meaning: `location_doors.edge_key` still names the same door,
-- and so does every entry of `encounter_state.door_states`, whose field is renamed from `edge` to `id` because an
-- angled door has no edge key at all (its id is a uuid).
--
-- Two stored shapes move, once, here:
--   locations.map_live (version 2 -> 3): walls "x,y:N|W" -> { id, a, b }; doors { edge, open, leaf } ->
--     { id, a, b, open, leaf }. Version 1 snapshots were already unreadable (the client accepts one version) and are
--     left as they are; a re-publish replaces them.
--   encounter_state.door_states: [{ edge, open }] -> [{ id, open }].

-- An edge key's segment: N runs east along the top of the cell, W runs south along its left side.
create function pg_temp.edge_segment(p_key text)
 returns jsonb
 language sql
 immutable
as $$
  select case split_part(p_key, ':', 2)
    when 'N' then jsonb_build_object(
      'a', jsonb_build_array(split_part(split_part(p_key, ':', 1), ',', 1)::numeric, split_part(split_part(p_key, ':', 1), ',', 2)::numeric),
      'b', jsonb_build_array(split_part(split_part(p_key, ':', 1), ',', 1)::numeric + 1, split_part(split_part(p_key, ':', 1), ',', 2)::numeric))
    when 'W' then jsonb_build_object(
      'a', jsonb_build_array(split_part(split_part(p_key, ':', 1), ',', 1)::numeric, split_part(split_part(p_key, ':', 1), ',', 2)::numeric),
      'b', jsonb_build_array(split_part(split_part(p_key, ':', 1), ',', 1)::numeric, split_part(split_part(p_key, ':', 1), ',', 2)::numeric + 1))
  end;
$$;

update public.locations
set map_live = map_live
  || jsonb_build_object(
    'version', 3,
    'walls', coalesce(
      (select jsonb_agg(jsonb_build_object('id', w) || pg_temp.edge_segment(w))
       from jsonb_array_elements_text(map_live -> 'walls') w),
      '[]'::jsonb),
    'doors', coalesce(
      (select jsonb_agg((d - 'edge') || jsonb_build_object('id', d ->> 'edge') || pg_temp.edge_segment(d ->> 'edge'))
       from jsonb_array_elements(map_live -> 'doors') d),
      '[]'::jsonb))
where map_live ->> 'version' = '2';

-- The door-state list's shape check moves to ids. An id is an edge key (a door on a grid line) or a uuid (an angled
-- door). Still total: anything else is false, never NULL.
alter table public.encounter_state drop constraint encounter_state_door_states_shape;

update public.encounter_state
set door_states = (
  select coalesce(jsonb_agg(jsonb_build_object('id', door ->> 'edge', 'open', door -> 'open')), '[]'::jsonb)
  from jsonb_array_elements(door_states) door)
where jsonb_array_length(door_states) > 0;

create or replace function private.is_door_state_list(p_doors jsonb)
 returns boolean
 language sql
 immutable
 set search_path to ''
as $function$
  select case when jsonb_typeof(p_doors) is distinct from 'array' then false else
    jsonb_array_length(p_doors) <= 1000
    and coalesce(
      (select bool_and(
          jsonb_typeof(door) = 'object'
          and jsonb_typeof(door -> 'id') = 'string'
          and ((door ->> 'id') ~ '^-?[0-9]{1,5},-?[0-9]{1,5}:[NW]$'
            or (door ->> 'id') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
          and jsonb_typeof(door -> 'open') = 'boolean'
          and (door - 'id' - 'open') = '{}'::jsonb)
        from jsonb_array_elements(p_doors) door),
      true)
  end;
$function$;

alter table public.encounter_state
  add constraint encounter_state_door_states_shape check (private.is_door_state_list(door_states));

comment on column public.encounter_state.door_states is
  'Doors the DM has opened or shut during the fight (#1073, #1125): [{ id, open }] over the drawn state in locations.map_live.doors. id is the door''s edge key in image cells ("x,y:N" or "x,y:W") for a door on a grid line, or a uuid for an angled door.';
