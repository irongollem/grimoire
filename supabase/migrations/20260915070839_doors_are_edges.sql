-- Doors are edges on the plan's grid (epic #884, decision 5, wave 3).
--
-- A way out was made from a form: pick the other room, set the flags, and the
-- door had no position at all unless a Cartographer publish happened to derive
-- one. #879's second half is the symptom -- "I defined the doors, but I can't
-- set a door on the minimap at all". Now a door is drawn on a cell edge and
-- its two endpoints are *derived* from the traced regions either side of that
-- edge: when room A and room B touch and the DM draws a door on the shared
-- edge, the system knows it joins A and B without being told.
--
-- Three changes, all of which follow from that:
--
-- 1. `source_edge_key` becomes `edge_key`. The old name meant "the Cartographer
--    made this"; the column now means *where the door is*, which is a fact
--    about the door whoever drew it. Its check and its unique index are
--    renamed with it.
-- 2. `derived_from` records provenance instead, exactly as `location_map_regions`
--    already does -- so a re-publish can still tell its own derived doors from
--    a DM's hand-placed ones and hold the latter back.
-- 3. `to_location_id` becomes nullable. A door drawn on an edge with a region
--    on only one side is a way out to untraced space -- the entrance a party
--    came in by, the passage nobody has drawn yet. Refusing it would make the
--    DM trace in a particular order; keeping it lets the plan resolve itself
--    when the other room is traced.

alter table public.location_doors
  rename column source_edge_key to edge_key;

alter table public.location_doors
  rename constraint location_doors_edge_key_format to location_doors_edge_key_shape;

alter index public.location_doors_source_edge_uniq
  rename to location_doors_edge_key_uniq;

alter table public.location_doors
  add column derived_from text not null default 'dm'
    constraint location_doors_derived_from_check check (derived_from in ('dm', 'publish'));

-- Every door carrying an edge key today was written by Publish to Atlas --
-- nothing else has ever set that column. Everything else was typed into a form.
update public.location_doors
   set derived_from = 'publish'
 where edge_key is not null;

alter table public.location_doors
  alter column to_location_id drop not null;

comment on column public.location_doors.edge_key is
  'Where the door sits on the site''s plan ("14,6:W" in the map''s own cell space). Null for a door that has never been placed. Was source_edge_key until epic #884: the column says where the door is, not who made it.';
comment on column public.location_doors.derived_from is
  '''dm'' (drawn or typed by hand) or ''publish'' (derived by Publish to Atlas). A re-publish updates its own derived doors and holds back anything the DM authored -- same rule, and same column name, as location_map_regions.';
comment on column public.location_doors.to_location_id is
  'The space on the far side. Null means the door leads to untraced space -- drawn on an edge with a region on one side only. It resolves itself when the other side is traced.';

-- The endpoint guard, widened for a one-sided door.
--
-- The from side is unchanged: it must be a bindable space (a room, or a nested
-- site with its own floor plan). The to side is now checked only when it is
-- present, and the same-parent rule with it -- there is no second parent to
-- agree with when there is no second space. `private.location_can_hold_rooms`
-- stays the single site-tier predicate; do not re-list types here.
create or replace function public.guard_location_door_endpoints()
returns trigger
language plpgsql
set search_path = public, private
as $$
declare
  v_from_parent uuid;
  v_to_parent   uuid;
  v_from_type   public.location_type_enum;
  v_to_type     public.location_type_enum;
begin
  select parent_id, location_type into v_from_parent, v_from_type
    from public.locations where id = new.from_location_id;

  if not (coalesce(v_from_type = 'room', false) or private.location_can_hold_rooms(v_from_type)) then
    raise exception 'A way out starts in a space: a room, or a nested site with a floor plan'
      using errcode = '23514';
  end if;

  if v_from_parent is null then
    raise exception 'A way out starts in a space that sits inside a place'
      using errcode = '23514';
  end if;

  if new.to_location_id is not null then
    select parent_id, location_type into v_to_parent, v_to_type
      from public.locations where id = new.to_location_id;

    if not (coalesce(v_to_type = 'room', false) or private.location_can_hold_rooms(v_to_type)) then
      raise exception 'A way out connects two spaces: rooms, or nested sites with a floor plan'
        using errcode = '23514';
    end if;

    if v_from_parent is distinct from v_to_parent then
      raise exception 'A way out connects two spaces inside the same place'
        using errcode = '23514';
    end if;
  end if;

  -- The governing feature, when cited, must be the author's own. The RLS
  -- insert policy checks only the originating location, and a feature id
  -- is otherwise a free uuid.
  if new.dungeon_feature_id is not null and not exists (
    select 1 from public.dungeon_features f
     where f.id = new.dungeon_feature_id
       and f.user_id = (select auth.uid())
  ) then
    raise exception 'A way out may only cite a dungeon feature you authored'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

-- The player's composed plan reads the renamed column, and nothing else about
-- it changes: a way is still sent only when one of the two spaces it touches
-- has been explored, a secret door is still filtered out entirely, and the far
-- side is still named only once the party has been there. A one-sided door
-- reaches a player exactly when its one space is explored and arrives with
-- `to_space_id` null, which is what it is. The payload key travels with the
-- column: `ways[].source_edge_key` becomes `ways[].edge_key`, and its only
-- reader is renamed in the same change.
--
-- Body taken verbatim from the deployed definition rather than retyped -- this
-- projection is long, and a reconstruction is how a column quietly changes
-- meaning.
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

revoke execute on function public.get_player_visible_site_state(uuid, uuid) from public, anon;
grant execute on function public.get_player_visible_site_state(uuid, uuid) to authenticated, service_role;
