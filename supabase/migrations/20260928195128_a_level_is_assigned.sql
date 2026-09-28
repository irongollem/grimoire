-- Migration: a_level_is_assigned
-- A site's levels are the nested sites its DM has said are floors of it, not
-- whatever the tree, the plan or the type suggests.
--
-- WHY. Frame 06 of the site design ("Levels, wings and sub-sites") read a level
-- off the tree: every child of a site that is itself a site. That listed a
-- shop off a lane as a dungeon's fourth floor (Fondant's Window under the
-- Well, 27 Sep 2026). Two rules were tried to infer the difference and both
-- were guesses: "a level is never drawn on the floor above it" (0af338eb),
-- which the same frame contradicts, since its levels are entered by clicking
-- their polygon on the floor above; and "a store, tavern or inn is never a
-- level" (7db5602c), which a department store's floors break. The maintainer,
-- 28 Sep 2026: "shouldn't levels just be formally assigned as such rather than
-- drawing arbitrary conclusions?" So the DM says it, and nothing infers it.
-- This overrides frame 06's "'Level' is a reading of the existing tree" line;
-- the rest of the frame (the rail, the descent, stairs as location_doors)
-- stands.
--
-- A column rather than a table: a place is a level of exactly one site, its
-- parent, and the rail orders levels by the sort_order the tree already has.

alter table public.locations
  add column is_level boolean not null default false;

comment on column public.locations.is_level is
  'This place is a floor of its parent site, as its DM assigned it: listed in the parent''s levels rail rather than among the places on its floor. Only a site-tier place inside another can be one (guard_location_room_parent).';

-- ── The guard ─────────────────────────────────────────────────────────────────
-- Production's guard_location_room_parent from 20260916001210, unchanged but
-- for two additions: a place holding levels cannot become a type without a
-- floor plan, and the level flag itself is judged.
create or replace function public.guard_location_room_parent()
returns trigger
language plpgsql
set search_path to 'public', 'private'
as $function$
begin
  -- An interior space needs a parent that can hold it -- on insert, and on the
  -- edits that could actually break it. See the header: an unchanged value must
  -- not be re-judged against a rule that has since narrowed.
  if private.location_is_interior(new.location_type)
     and (tg_op = 'INSERT'
          or old.parent_id is distinct from new.parent_id
          or old.location_type is distinct from new.location_type)
  then
    if new.parent_id is null then
      raise exception 'A % must sit inside a place that can hold it; % has no parent', new.location_type, new.name
        using errcode = '23514';
    end if;
    if not exists (
      select 1 from public.locations p
      where p.id = new.parent_id
        and private.location_can_hold_rooms(p.location_type)
    ) then
      raise exception 'A room or grounds must sit inside a building, dungeon, store, tavern, inn or wilds'
        using errcode = '23514';
    end if;
  end if;

  -- A child may not belong to a DIFFERENT campaign than its parent (#827).
  --
  -- Applies to every child, not only interiors: the exploit that found this
  -- used a room, but nothing about the hole is room-specific. A DM running two
  -- campaigns could reparent a campaign-B room under a campaign-A site with two
  -- individually legal writes, and get_player_visible_site_state then served
  -- B's room name and looted state to A's players.
  --
  -- NULL on either side is allowed, deliberately and with the data in hand.
  -- Production holds rows shaped campaign-parent to global-child and the
  -- reverse: a DM reusing personal content inside a campaign. A plain equality
  -- check would reject all of them and, because this trigger fires on UPDATE OF
  -- -- which fires when a column is in the SET list whether or not it changed --
  -- would leave those rows uneditable through the app with no way to fix them
  -- from the UI. That is the #793 stranding exactly. What is forbidden is only
  -- the case nothing can justify: two different campaigns.
  if new.parent_id is not null
     and (tg_op = 'INSERT'
          or old.parent_id is distinct from new.parent_id
          or old.campaign_id is distinct from new.campaign_id)
     and exists (
       select 1 from public.locations p
       where p.id = new.parent_id
         and p.campaign_id is not null
         and new.campaign_id is not null
         and p.campaign_id <> new.campaign_id
     )
  then
    raise exception 'A place cannot sit inside a place from another campaign'
      using errcode = '23514';
  end if;

  -- And a place that already holds interior spaces -- or carries traced regions
  -- -- may not become something that can hold neither.
  --
  -- The regions half is #810's. Without it an *unbound* region strands: the
  -- region guard fires only on insert and on rebinding, so retyping the site
  -- afterwards left a shape on a place with no floor plan -- a row no screen
  -- can render, and one that is then partly frozen, since any later write
  -- touching `site_location_id` raises. Unbound is the normal mid-trace state
  -- ("draw the shapes, then say which room each one is"), so the gap sat
  -- precisely on the workflow the table exists for.
  --
  -- Known limit, stated rather than implied: this function is SECURITY INVOKER
  -- and `location_map_regions` is owner-scoped, so it cannot see regions traced
  -- by a *co-DM* on a site they do not own -- which `location_map_regions_insert`
  -- does permit. Closing that would mean a SECURITY DEFINER trigger, and a
  -- definer earning its keep on an integrity check that already covers every
  -- single-owner case is a poor trade. The co-DM case strands as before.
  if tg_op = 'UPDATE'
     and old.location_type is distinct from new.location_type
     and not private.location_can_hold_rooms(new.location_type)
     and (
       exists (
         select 1 from public.locations c
         where c.parent_id = new.id and private.location_is_interior(c.location_type)
       )
       or exists (
         select 1 from public.location_map_regions r
         where r.site_location_id = new.id
       )
       or exists (
         select 1 from public.locations c
         where c.parent_id = new.id and c.is_level
       )
     )
  then
    raise exception '% holds rooms, levels or traced regions, so it cannot become a %', new.name, new.location_type
      using errcode = '23514';
  end if;

  -- A level is a floor of the site it sits in: both ends have a floor plan.
  --
  -- Setting the flag is judged and refused when it cannot hold. Moving or
  -- retyping a level is not refused: a floor of the Well moved under a city
  -- is no longer a floor of anything, so the flag goes with the relationship
  -- it described. Refusing there would strand the move behind a flag the
  -- LocationEditor's parent picker does not show. A move between two sites
  -- keeps it, since the DM is re-filing a floor, not demoting one.
  if new.is_level and (tg_op = 'INSERT' or not old.is_level) then
    if not private.location_can_hold_rooms(new.location_type)
       or new.parent_id is null
       or not exists (
         select 1 from public.locations p
         where p.id = new.parent_id
           and private.location_can_hold_rooms(p.location_type)
       )
    then
      raise exception 'Only a building, dungeon, store, tavern, inn or wilds inside another can be one of its levels; % cannot', new.name
        using errcode = '23514';
    end if;
  elsif new.is_level
     and (old.parent_id is distinct from new.parent_id or old.location_type is distinct from new.location_type)
     and (
       not private.location_can_hold_rooms(new.location_type)
       or new.parent_id is null
       or not exists (
         select 1 from public.locations p
         where p.id = new.parent_id
           and private.location_can_hold_rooms(p.location_type)
       )
     )
  then
    new.is_level := false;
  end if;

  return new;
end;
$function$;

drop trigger if exists locations_room_parent_guard on public.locations;
create trigger locations_room_parent_guard
  before insert or update of parent_id, location_type, campaign_id, is_level on public.locations
  for each row execute function guard_location_room_parent();

-- ── The players' projection ───────────────────────────────────────────────────
-- It returns setof locations, so it must name the new column. Production's
-- body from 20260925002215 with one trailing column.
CREATE OR REPLACE FUNCTION public.get_player_visible_locations(p_campaign_id uuid DEFAULT NULL::uuid, p_location_id uuid DEFAULT NULL::uuid)
 RETURNS SETOF locations
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    l.id,
    l.user_id,
    l.campaign_id,
    l.parent_id,
    l.name,
    l.location_type,
    case when l.is_description_shared then l.description else null::text end,
    null::text,                                                               -- notes (DM-only)
    l.tags,
    l.image_url,
    l.created_at,
    l.updated_at,
    case when l.is_map_shared then l.map_url else null::text end,
    coalesce((
      select jsonb_agg(pin)
      from jsonb_array_elements(coalesce(l.map_pins, '[]'::jsonb)) pin
      where coalesce((pin->>'visible_to_players')::boolean, false)
    ), '[]'::jsonb),
    l.is_map_shared,
    l.player_summary,
    l.is_description_shared,
    l.is_npcs_shared,
    l.player_visible_to,
    l.is_inventory_shared,
    l.npc_owner_id,
    l.related_location_ids,
    l.source_map_id,
    l.grid_calibration,
    l.is_battle_map,
    l.era_start,
    l.era_end,
    null::text,                                                               -- audio_theme (DM-only)
    l.ai_provenance,
    l.setting_source,
    l.sort_order,
    null::integer,                                                            -- map_published_rev (DM tooling)
    case when l.is_map_shared then l.map_layer_url else null::text end,
    case when l.is_map_shared then l.map_layer_calibration else null::jsonb end,
    case when l.is_map_shared then l.plan_size else null::jsonb end,
    null::text,                                                               -- demo_source (#912): a quota marker, nothing for players
    l.is_level                                                                -- which nested sites are floors: structure, like parent_id
  from locations l
  where l.campaign_id is not null
    and (p_campaign_id is null or l.campaign_id = p_campaign_id)
    and (p_location_id is null or l.id = p_location_id)
    and exists (
      select 1 from campaign_members cm
      where cm.user_id = (select auth.uid())
        and cm.campaign_id = l.campaign_id
    )
    and (
      exists (
        select 1 from campaign_members cm
        where cm.user_id = (select auth.uid())
          and cm.campaign_id = l.campaign_id
          and cm.party_member_id = any (l.player_visible_to)
      )
      or (p_location_id is not null and l.is_map_shared = true)
    )
$function$
;

-- ── Existing data ─────────────────────────────────────────────────────────────
-- Until now every nested site was shown as a level, so that is what carries
-- over, bar one reading: a store, tavern or inn becomes a place on its parent's
-- floor, which is what the one such row in production is. A one-time
-- translation of the old reading, not a rule: the DM changes either from the
-- place's own pane.
update public.locations c
   set is_level = true
  from public.locations p
 where p.id = c.parent_id
   and private.location_can_hold_rooms(p.location_type)
   and private.location_can_hold_rooms(c.location_type)
   and c.location_type not in ('store', 'tavern', 'inn');
