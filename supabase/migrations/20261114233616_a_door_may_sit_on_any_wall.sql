-- A door may sit on any wall (#1197, story 3).
--
-- A way out was placed by `edge_key`, a horizontal or vertical grid edge
-- ("14,6:W"). The Drawing's walls have been one vector graph since #1125: a
-- wall on a grid line is keyed by that edge, an angled or curved wall by a
-- uuid, and either can be a door. Such a door opens, shuts and blocks sight
-- at the table (`map_memory.door_states` has accepted both key shapes since
-- 20261103093422), but it could never be a way out, because this column
-- refused its key. So a door on a slanted wall, a round tower or a cave
-- mouth had no row: no lock, no secret, no place in the room graph.
--
-- `edge_key` now also takes a wall's uuid, the same two shapes
-- `private.is_door_state_list` accepts. A grid edge says where it is; a uuid
-- does not, and the Atlas plan and the players' plan draw a way without the
-- Drawing to hand, so a uuid-keyed door carries its line in `segment`: two
-- points in the plan's cell space, [[ax, ay], [bx, by]]. A grid-edge door
-- leaves it null, since its key already is its line and a second copy could
-- only disagree with it. One check holds the two together.
--
-- The unique index on (from_location_id, edge_key) is plain text equality
-- and needs no change.

alter table public.location_doors
  drop constraint location_doors_edge_key_shape;

alter table public.location_doors
  add column segment jsonb;

alter table public.location_doors
  add constraint location_doors_edge_key_shape check (
    edge_key is null
    or edge_key ~ '^-?[0-9]+,-?[0-9]+:[NW]$'
    or edge_key ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  );

-- `segment` is two points of two numbers each. Each arm is coalesced, so the
-- check is true or false for any jsonb value and never null (a null check
-- passes).
alter table public.location_doors
  add constraint location_doors_segment_shape check (
    segment is null
    or coalesce(
      jsonb_typeof(segment) = 'array'
      and jsonb_array_length(segment) = 2
      and jsonb_typeof(segment -> 0) = 'array'
      and jsonb_typeof(segment -> 1) = 'array'
      and jsonb_array_length(segment -> 0) = 2
      and jsonb_array_length(segment -> 1) = 2
      and jsonb_typeof(segment -> 0 -> 0) = 'number'
      and jsonb_typeof(segment -> 0 -> 1) = 'number'
      and jsonb_typeof(segment -> 1 -> 0) = 'number'
      and jsonb_typeof(segment -> 1 -> 1) = 'number',
      false
    )
  );

-- A wall-keyed door has its line; a grid-edge door and an unplaced one have none.
alter table public.location_doors
  add constraint location_doors_segment_with_wall_key check (
    (segment is not null) = coalesce(edge_key ~ '^[0-9a-f]{8}-', false)
  );

comment on column public.location_doors.edge_key is
  'Where the door sits on the site''s plan: a grid edge ("14,6:W", in the map''s own cell space) or the uuid of the angled or curved wall it is. Null for a door that has never been placed.';
comment on column public.location_doors.segment is
  'The line of a door keyed by a wall''s uuid, [[ax, ay], [bx, by]] in the plan''s cell space. Null for a grid-edge door (its key is its line) and for an unplaced one.';

-- `update_location_doors` writes only the columns it lists. A door's line
-- changes with its key, so `segment` joins the list; nothing else changes.
CREATE OR REPLACE FUNCTION public.update_location_doors(p_updates jsonb)
 RETURNS void
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select private.update_rows_by_id('location_doors', p_updates, array[
    'from_location_id', 'to_location_id', 'label', 'is_one_way', 'starts_locked', 'lock_note',
    'is_secret', 'sort_order', 'door_kind', 'edge_key', 'segment', 'derived_from', 'dungeon_feature_id',
    'library_dungeon_feature_id']);
$function$;


-- The players' plan draws a way from its line, so the projection carries
-- `segment` beside `edge_key`. Nothing else changes: the admission rules and
-- every other field are restated from the live definition.
CREATE OR REPLACE FUNCTION public.get_player_visible_site_state(p_site_location_id uuid, p_preview_party_member_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
  with target as (
    -- A beat may now be staged at a ROOM (#868 S12: "Opens at"), and the
    -- player's quest page hands this function whatever the beat names. A
    -- room has no plan of its own; its site does. Resolve here, once, rather
    -- than in every caller: the room's parent is the site, and the parent's
    -- own admission below still applies in full.
    select case when private.location_is_interior(l.location_type) then l.parent_id else l.id end as site_id
      from public.locations l
     where l.id = p_site_location_id
  ),
  site as (
    -- The same admission as before (#798): a member of the site's campaign,
    -- the map shared, and the site visible to this character -- or, for a
    -- preview, a DM of THIS campaign asking about a character who is in it.
    -- Both preview checks coalesced: a missing membership row must deny.
    select s.id, s.campaign_id
      from public.locations s
     where s.id = (select site_id from target)
       and s.campaign_id is not null
       and s.is_map_shared
       and exists (
         select 1 from public.campaign_members cm
          where cm.user_id = (select auth.uid())
            and cm.campaign_id = s.campaign_id
       )
       and case
         when p_preview_party_member_id is null then exists (
           select 1 from public.campaign_members cm
            where cm.user_id = (select auth.uid())
              and cm.campaign_id = s.campaign_id
              and cm.party_member_id = any (s.player_visible_to)
         )
         else coalesce(private.is_campaign_dm(s.campaign_id), false)
              and exists (
                select 1 from public.party_members pm
                 where pm.id = p_preview_party_member_id
                   and pm.campaign_id = s.campaign_id
              )
              and p_preview_party_member_id = any (s.player_visible_to)
       end
  ),
  -- Every bound space region on this site whose space belongs to the SAME
  -- campaign (the #827 cross-campaign guard, restated for the read path).
  spaces_all as (
    select r.id as region_id, r.space_location_id, sp.name, r.cells, r.vertices, r.label, r.sort_order,
           coalesce((select st.value from public.location_state st
                      where st.location_id = r.space_location_id and st.door_id is null and st.fact = 'explored'), false) as is_explored,
           coalesce((select st.value from public.location_state st
                      where st.location_id = r.space_location_id and st.door_id is null and st.fact = 'cleared'), false) as is_cleared,
           coalesce((select st.value from public.location_state st
                      where st.location_id = r.space_location_id and st.door_id is null and st.fact = 'looted'), false) as is_looted
      from site
      join public.location_map_regions r on r.site_location_id = site.id
      join public.locations sp on sp.id = r.space_location_id
     where r.region_role = 'space'
       and r.space_location_id is not null
       and (sp.campaign_id = site.campaign_id or sp.campaign_id is null)
  ),
  explored as (
    select * from spaces_all where is_explored
  ),
  explored_cells as (
    select distinct c.value as cell
      from explored, jsonb_array_elements_text(explored.cells) c
  ),
  -- Ways out of this site that a player may know about: not secret, or found.
  ways_known as (
    select d.id, d.from_location_id, d.to_location_id, d.door_kind, d.edge_key, d.segment
      from site
      join public.location_doors d on true
      join public.locations f on f.id = d.from_location_id
     where f.parent_id = site.id
       and (
         not d.is_secret
         or coalesce((select st.value from public.location_state st
                       where st.door_id = d.id and st.fact = 'found'), false)
       )
  ),
  -- ...and stood beside: one of the two spaces it joins is explored.
  ways_visible as (
    select w.*
      from ways_known w
     where exists (select 1 from explored e where e.space_location_id in (w.from_location_id, w.to_location_id))
  ),
  glimpsed as (
    select distinct s.region_id, s.cells, s.vertices
      from spaces_all s
      join ways_visible w on s.space_location_id in (w.from_location_id, w.to_location_id)
     where not s.is_explored
  ),
  zones_visible as (
    select r.zone_kind, r.label,
           (select coalesce(jsonb_agg(c.value), '[]'::jsonb)
              from jsonb_array_elements_text(r.cells) c
             where c.value in (select cell from explored_cells)) as cells
      from site
      join public.location_map_regions r on r.site_location_id = site.id
     where r.region_role = 'zone'
       and coalesce((r.zone_payload->>'visible_to_players')::boolean, false)
  )
  select jsonb_build_object(
    'spaces', coalesce((
      select jsonb_agg(jsonb_build_object(
               'space_location_id', e.space_location_id,
               'name', e.name,
               'cells', e.cells,
               'vertices', e.vertices,
               'label', e.label,
               'sort_order', e.sort_order,
               'is_cleared', e.is_cleared,
               'is_looted', e.is_looted
             ) order by e.sort_order nulls last, e.name)
        from explored e
    ), '[]'::jsonb),
    'glimpsed', coalesce((
      select jsonb_agg(jsonb_build_object('cells', g.cells, 'vertices', g.vertices))
        from glimpsed g
    ), '[]'::jsonb),
    'ways', coalesce((
      select jsonb_agg(jsonb_build_object(
               'from_space_id', case when exists (select 1 from explored e where e.space_location_id = w.from_location_id) then w.from_location_id end,
               'to_space_id',   case when exists (select 1 from explored e where e.space_location_id = w.to_location_id)   then w.to_location_id   end,
               'door_kind', w.door_kind,
               'edge_key', w.edge_key,
               'segment', w.segment
             ))
        from ways_visible w
    ), '[]'::jsonb),
    'zones', coalesce((
      select jsonb_agg(jsonb_build_object('zone_kind', z.zone_kind, 'label', z.label, 'cells', z.cells))
        from zones_visible z
       where jsonb_array_length(z.cells) > 0
    ), '[]'::jsonb)
  )
$function$;
