-- The player plan is composed, not masked. Epic #868, frame 16 of
-- `atlas/Sites & Cartographer.html`.
--
-- 20260906131403 (#798) gave players `get_player_visible_site_state`: the
-- rooms the party has explored, as rows. That was the right cut for a list.
-- It is not enough for a plan, and the sheet says why: "masking is not the
-- same as withholding -- draw the map and then shade it, and everything drawn
-- after the shade leaks: every door, the secret one included, and the walls of
-- rooms nobody has entered." So the projection now returns everything the
-- player's plan is allowed to be made of, and nothing else, in one document:
--
--   spaces     explored rooms: cells, name, cleared/looted. As before.
--   glimpsed   DERIVED, not stored: a space that shares a non-secret (or found)
--              way out with an explored space, and is not itself explored. Its
--              footprint only -- no id, no name, no contents. "A room, that
--              way." The same shape as the token layer's `unseen` versus
--              `hidden`: "there is something there" is a legitimate thing to
--              tell a player.
--   ways       doors the party has stood beside (one endpoint explored), never
--              a secret one unless it has been `found` (20260908215644). Locked
--              is drawn as a plain door: `starts_locked`, `lock_note` and
--              `is_one_way` are withheld -- the map does not do the party's
--              rattling for them. An endpoint id is sent only when that space
--              is explored; a way into the unknown ends at its edge.
--   zones      only those the DM marked `visible_to_players`, and only the
--              part inside explored cells. "The water is waist-deep" does not
--              have to reveal how far it goes.
--
-- Never in the payload: unexplored geometry, secret ways out, lock notes,
-- hazard glyphs, trap DCs, room notes, the door graph, or any region the
-- party has not stood in. Filtered here, in the RPC, not hidden in the
-- component: a thing absent from the payload cannot leak through a re-render,
-- a zoom, or a curious devtools panel.
--
-- Return type changes from `setof record` to `jsonb`, which needs a drop. A
-- `drop function` + `create` resets the ACL to the PUBLIC default, and PUBLIC
-- includes anon -- that is exactly how #650 happened -- so the revoke below is
-- explicit, and anon_rpc_surface.test.sql pins it.

drop function if exists public.get_player_visible_site_state(uuid, uuid);

create function public.get_player_visible_site_state(
  p_site_location_id uuid,
  p_preview_party_member_id uuid default null
)
returns jsonb
language sql
stable
security definer
set search_path = public, private
as $$
  with target as (
    -- A beat may now be staged at a ROOM (#868 S12: "Opens at"), and the
    -- player's quest page hands this function whatever the beat names. A
    -- room has no plan of its own; its site does. Resolve here, once, rather
    -- than in every caller: the room's parent is the site, and the parent's
    -- own admission below still applies in full.
    select case when l.location_type = 'room' then l.parent_id else l.id end as site_id
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
    select r.id as region_id, r.space_location_id, sp.name, r.cells, r.label, r.sort_order,
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
    select d.id, d.from_location_id, d.to_location_id, d.door_kind, d.source_edge_key
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
    select distinct s.region_id, s.cells
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
               'label', e.label,
               'sort_order', e.sort_order,
               'is_cleared', e.is_cleared,
               'is_looted', e.is_looted
             ) order by e.sort_order nulls last, e.name)
        from explored e
    ), '[]'::jsonb),
    'glimpsed', coalesce((
      select jsonb_agg(jsonb_build_object('cells', g.cells))
        from glimpsed g
    ), '[]'::jsonb),
    'ways', coalesce((
      select jsonb_agg(jsonb_build_object(
               'from_space_id', case when exists (select 1 from explored e where e.space_location_id = w.from_location_id) then w.from_location_id end,
               'to_space_id',   case when exists (select 1 from explored e where e.space_location_id = w.to_location_id)   then w.to_location_id   end,
               'door_kind', w.door_kind,
               'source_edge_key', w.source_edge_key
             ))
        from ways_visible w
    ), '[]'::jsonb),
    'zones', coalesce((
      select jsonb_agg(jsonb_build_object('zone_kind', z.zone_kind, 'label', z.label, 'cells', z.cells))
        from zones_visible z
       where jsonb_array_length(z.cells) > 0
    ), '[]'::jsonb)
  )
$$;

comment on function public.get_player_visible_site_state(uuid, uuid) is
  'The composed player plan of a site: explored spaces, glimpsed footprints, known ways out, player-visible zones clipped to explored cells. Everything else is absent, not hidden.';

-- Login-only. anon reaches a fresh function through the PUBLIC default.
revoke execute on function public.get_player_visible_site_state(uuid, uuid) from public, anon;
grant execute on function public.get_player_visible_site_state(uuid, uuid) to authenticated, service_role;
