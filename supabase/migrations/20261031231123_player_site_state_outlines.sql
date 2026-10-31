-- A room's outline reaches the players (#1125). Rooms found from the walls now
-- carry the wall line itself as `vertices`, so a curved or angled room is no
-- longer a staircase of squares, and the DM's surfaces draw it. The player's
-- site plan read only `cells`, so an explored or glimpsed room still reached a
-- player as squares. Each explored space and each glimpsed footprint now also
-- carries its `vertices` (null for a room traced as squares); nothing else in
-- the projection changes, and the admission rules are restated unchanged from
-- the live definition. Zones stay clipped to explored squares: a zone's shape
-- beyond what the party has seen is not the players' to know, so it gets no
-- outline here and the client clips it to the room it lies in.
create or replace function public.get_player_visible_site_state(p_site_location_id uuid, p_preview_party_member_id uuid DEFAULT NULL::uuid)
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
    select d.id, d.from_location_id, d.to_location_id, d.door_kind, d.edge_key
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
               'edge_key', w.edge_key
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
