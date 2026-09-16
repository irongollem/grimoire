-- Migration: grounds_is_an_outdoor_room
-- `grounds` drops from the site tier to the interior tier: it is the outdoor
-- sibling of `room`, not a container. `wilds` (added by the companion
-- migration) takes over the container role for natural places.
--
-- WHY, in the maintainer's own words (16 Sep 2026): "grounds was created for
-- this express purpose, a grounds is an outdoor area inside a site. so if it
-- currently is not, that's just a bug." It was filed at site tier because
-- sites can contain sites -- which remains true and is untouched here; the
-- error was only that `grounds` was the wrong type to nest WITH, because its
-- meaning was always the leaf.
--
-- What this is NOT: a reversal of #810. Pins stay the large-scale mechanism and
-- `wilderness` stays exactly where #810 put it. The ladder is still rungs of
-- map kind. All that changes is which rung `grounds` sits on, and the arrival
-- of a site-tier natural place (`wilds`) that had no representative before --
-- so a DM drawing a wood had to call it a Dungeon, and its glades Rooms.
--
-- ── Where the tiers land after this ──────────────────────────────────────────
--   land      wilderness            pins, large scale        (unchanged, #810)
--   site      building, dungeon,    traced regions
--             store, tavern, inn,
--             wilds  (new)
--   interior  room, grounds (moved) bound to a region
--
-- ── Data ─────────────────────────────────────────────────────────────────────
-- Measured against production 16 Sep 2026: exactly ONE `grounds` row exists --
-- "Palace Gardens", inside a building, holding four children, all typed `room`
-- (Hedge Maze, Fountain Clearing, Terrace, Rose Bench). It is behaving as a
-- site and its children are precisely what `grounds` is now for, so it retypes
-- to `wilds` and they retype to `grounds`. Zero traced regions and zero maps on
-- it, so nothing geometric moves.
--
-- Retyping is the maintainer's explicit call. #810 set the opposite precedent
-- ("do not retype them by migration -- the intent is guessable but not
-- knowable. Owner's call") and that precedent is honoured rather than ignored:
-- the owner was asked and said yes. Without the move those four strand under a
-- parent that can no longer hold them.
--
-- The moves are written as predicates, not as hardcoded ids, so a local stack
-- or a branch with different seed data converges on the same shape instead of
-- silently no-op'ing on a uuid it does not have.
--
-- ── Advisor ──────────────────────────────────────────────────────────────────
-- The baseline (106) does not move, and that is checked rather than assumed.
-- The one new function, `private.location_is_interior`, lives in `private`,
-- which PostgREST does not expose, and is SECURITY INVOKER besides -- so it
-- joins neither the definer count nor the anon-reachable five. Everything else
-- here is `create or replace` over an existing function, which preserves grants
-- and properties; verified after applying locally that the two RPCs below are
-- still SECURITY DEFINER with `search_path` pinned and still granted only to
-- `authenticated` and `service_role`, and that the three trigger functions are
-- still revoked from `public, anon, authenticated`. Both predicates pin
-- `search_path` to '' so `function_search_path.test.sql` stays green.

-- ── The interior predicate ───────────────────────────────────────────────────
-- `coalesce` at the SOURCE, for the reason `location_can_hold_rooms` documents
-- and CLAUDE.md item 3 spells out: this is consumed NEGATED below, and
-- `not NULL` is NULL, which skips the guard entirely. `locations.location_type`
-- happens to be NOT NULL, but that guarantee lives in a different object.
create or replace function private.location_is_interior(p_type public.location_type_enum)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_type in (
    'room',       -- walled and roofed
    'grounds'     -- and the open-air one: a glade, a grave plot, a hedge maze
  ), false);
$$;

comment on function private.location_is_interior(public.location_type_enum) is
  'The interior tier: a leaf space bound to a region on its parent site''s plan. `room` is walled, `grounds` is open air. Deliberately NOT a list of types repeated at call sites -- see guard_location_room_parent and guard_location_map_region_space.';

-- ── A site is what can hold a plan ───────────────────────────────────────────
-- `grounds` leaves (it is now a leaf), `wilds` arrives (it is now the natural
-- container). Keep `immutable`, `set search_path = ''` and the coalesce.
create or replace function private.location_can_hold_rooms(p_type public.location_type_enum)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_type in (
    'building', 'dungeon',        -- structures proper
    'store', 'tavern', 'inn',     -- also structures; a tavern has a floor plan
    'wilds'                       -- and the unroofed one: a wood, a graveyard,
                                  -- a marsh. Replaces `grounds` here, which
                                  -- moved down to the interior tier.
  ), false);
$$;

comment on function private.location_can_hold_rooms(public.location_type_enum) is
  'The site tier: a place with a plan, whose children are placed as traced regions rather than as pins. Larger places use pins (#810) and are not listed here.';

-- ── The parent guard, widened from `room` to the whole interior tier ─────────
-- Unchanged in substance; every `= 'room'` becomes the predicate so a second
-- interior type cannot arrive later and quietly skip the guard.
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
     )
  then
    raise exception '% holds rooms or traced regions, so it cannot become a %', new.name, new.location_type
      using errcode = '23514';
  end if;

  return new;
end;
$function$;

revoke execute on function public.guard_location_room_parent() from public, anon, authenticated;

-- ── The region guard ─────────────────────────────────────────────────────────
-- Two edits. The site-side error message names the new type set, and the
-- space-side test asks the interior predicate instead of comparing to 'room' --
-- without which a `grounds` could not be bound to a region at all, since after
-- this migration it is neither `room` nor a plan-holder. That is the one place
-- where moving `grounds` down would otherwise have broken it silently: the
-- shape traces fine and only the bind raises.
create or replace function public.guard_location_map_region_space()
returns trigger
language plpgsql
set search_path = public, private
as $$
declare
  v_parent uuid;
  v_type   public.location_type_enum;
  v_site   public.location_type_enum;
begin
  select location_type into v_site
    from public.locations where id = new.site_location_id;

  if not private.location_can_hold_rooms(v_site) then
    raise exception 'Regions can only be traced on a place with a floor plan (building, dungeon, store, tavern, inn or wilds)'
      using errcode = '23514';
  end if;

  -- #868: a zone is not a room. It belongs to the plan, not to a space -- an
  -- ash-fall that straddles the nave and the corridor is one zone, not two --
  -- so it never binds, and "unbound" stops being ambiguous.
  if new.region_role = 'zone' and new.space_location_id is not null then
    raise exception 'A zone binds to nothing; only a space region may be bound to a location'
      using errcode = '23514';
  end if;

  if new.space_location_id is null then
    return new;
  end if;

  select parent_id, location_type into v_parent, v_type
    from public.locations where id = new.space_location_id;

  -- #818: the bound child must itself be an addressable space -- an interior
  -- (a room, or the open-air `grounds`), or a nested site with its own floor
  -- plan (a courtyard inside a dungeon, a shop's back room inside an inn).
  -- The two private predicates are the single source for both halves; do not
  -- re-list types here.
  if not private.location_is_interior(v_type) and not private.location_can_hold_rooms(v_type) then
    raise exception 'A map region can only be bound to a room, a grounds, or a nested site' using errcode = '23514';
  end if;

  if v_parent is distinct from new.site_location_id then
    raise exception 'A map region can only be bound to a space of the site it is drawn on'
      using errcode = '23514';
  end if;

  -- ...and not to a space belonging to another campaign (#827). Redundant with
  -- the parent rule today, because a space must already be a child of the site
  -- -- but the two guards fire on different tables and different columns, and
  -- the read path this protects (get_player_visible_site_state) trusts the pair
  -- rather than the chain. Cheap, and it fails closed if the parent rule is
  -- ever relaxed.
  if exists (
    select 1
      from public.locations space, public.locations site
     where space.id = new.space_location_id
       and site.id = new.site_location_id
       and space.campaign_id is not null
       and site.campaign_id is not null
       and space.campaign_id <> site.campaign_id
  ) then
    raise exception 'A map region cannot bind a space from another campaign'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke execute on function public.guard_location_map_region_space() from public, anon, authenticated;

-- ── The data move ────────────────────────────────────────────────────────────
-- Order matters and is not incidental: the parent must become a `wilds` BEFORE
-- its children become `grounds`, or the widened parent guard above rejects each
-- child for sitting inside a place that can no longer hold it.

-- A `grounds` that holds children was being used as a container, which is what
-- `wilds` is now for. (Production: one row, "Palace Gardens".)
update public.locations
   set location_type = 'wilds'
 where location_type = 'grounds'
   and exists (select 1 from public.locations c where c.parent_id = locations.id);

-- ...and the rooms inside it were only ever called rooms for want of a better
-- word -- a hedge maze is not a room. They are the open-air leaves this
-- migration exists to name.
--
-- Two things about this statement that look wrong and are not:
--
-- 1. `parent_id in (select ... 'wilds')` IS exactly the set just converted,
--    not "every wilds ever". `wilds` is created by the companion migration
--    immediately before this one, so at this instant the only rows carrying it
--    are the ones the statement above wrote. A `wilds` with a legitimate `room`
--    child -- a hunting lodge in a wood -- is a perfectly good thing to have,
--    and this must never touch one; it cannot, because none exists yet.
--
-- 2. It has to be a separate statement rather than a data-modifying CTE over
--    the update above. A CTE's sub-statements share one snapshot, so the parent
--    guard firing on each child would read the parent's PRE-update type
--    (`grounds`, which can no longer hold interiors by the function replaced
--    above) and raise. Sequential statements let the child's guard see the
--    committed `wilds`.
update public.locations
   set location_type = 'grounds'
 where location_type = 'room'
   and parent_id in (
     select id from public.locations where location_type = 'wilds'
   );

-- ── The three other readers of `'room'` ──────────────────────────────────────
-- Found by asking the database rather than by guessing, which is the only way
-- that works here:
--
--   select n.nspname, p.proname from pg_proc p join pg_namespace n
--     on n.oid = p.pronamespace
--    where n.nspname in ('public','private') and p.prosrc like '%''room''%';
--
-- Five functions matched. Two are the guards replaced above. The other three
-- each compared to the literal `'room'` inline instead of routing through a
-- predicate, so replacing `location_can_hold_rooms` alone would not have
-- reached them -- the exact shape CLAUDE.md records for the admin claim, where
-- fixing the helper missed `get_admin_users` because it had copied the
-- comparison rather than calling the helper. After this migration no function
-- in `public` or `private` compares to the literal at all; `location_is_interior`
-- is the single reader, and a sixth interior type would be one line.
--
-- Each is reproduced verbatim from its live definition with only the
-- comparison (and the affected message text) changed. `create or replace`
-- preserves existing grants, so the revokes on the trigger function and the
-- definer grants on the two RPCs are untouched, and the advisor count does not
-- move -- same functions, same properties, same reachability.
--
-- Why each one actually matters, rather than being tidy-up:
--
--  * guard_location_door_endpoints -- a way out into a `grounds` would be
--    REFUSED outright, since a grounds is now neither `room` nor a plan-holder.
--    Caught by `location_doors.test.sql`, which is how it was found.
--  * get_player_visible_site_state -- resolves an interior to its parent site
--    ("the room has no map of its own; its site does"). Left alone, a player
--    standing in a `grounds` would have it treated as its own site, fail the
--    admission check below it, and see nothing at all.
--  * get_quest_runtime_context -- reports `room_count` for the site a beat is
--    staged at. Left alone, a `wilds` whose parts are all `grounds` would
--    report zero parts, so a fully built wood would read as unmapped.

CREATE OR REPLACE FUNCTION public.guard_location_door_endpoints()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'private'
AS $function$
declare
  v_from_parent uuid;
  v_to_parent   uuid;
  v_from_type   public.location_type_enum;
  v_to_type     public.location_type_enum;
begin
  select parent_id, location_type into v_from_parent, v_from_type
    from public.locations where id = new.from_location_id;

  if not (private.location_is_interior(v_from_type) or private.location_can_hold_rooms(v_from_type)) then
    raise exception 'A way out starts in a space: a room, a grounds, or a nested site with a floor plan'
      using errcode = '23514';
  end if;

  if v_from_parent is null then
    raise exception 'A way out starts in a space that sits inside a place'
      using errcode = '23514';
  end if;

  if new.to_location_id is not null then
    select parent_id, location_type into v_to_parent, v_to_type
      from public.locations where id = new.to_location_id;

    if not (private.location_is_interior(v_to_type) or private.location_can_hold_rooms(v_to_type)) then
      raise exception 'A way out connects two spaces: rooms, grounds, or nested sites with a floor plan'
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
$function$

;

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
$function$

;

CREATE OR REPLACE FUNCTION public.get_quest_runtime_context(p_campaign_id uuid, p_quest_id uuid, p_thread_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
declare
  v_state public.quest_runtime_state;
  v_previous jsonb;
  v_return jsonb;
  v_thread jsonb;
  v_threads jsonb;
  v_held jsonb;
  v_outgoing jsonb;
  v_path jsonb;
  v_found boolean;
begin
  if auth.uid() is null or not coalesce(private.is_campaign_dm(p_campaign_id), false) then
    raise exception 'Not authorized';
  end if;

  select jsonb_build_object(
    'id', t.id, 'label', t.label, 'status', t.status,
    'opened_by_edge_id', t.opened_by_edge_id, 'parent_thread_id', t.parent_thread_id,
    'merged_into_thread_id', t.merged_into_thread_id, 'created_at', t.created_at
  ) into v_thread
  from public.quest_threads t
  where t.id = p_thread_id and t.quest_id = p_quest_id and t.campaign_id = p_campaign_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', t.id, 'label', t.label, 'status', t.status,
    'opened_by_edge_id', t.opened_by_edge_id, 'parent_thread_id', t.parent_thread_id,
    'merged_into_thread_id', t.merged_into_thread_id, 'created_at', t.created_at,
    'current_beat_id', s.current_beat_id,
    'current_beat_title', b.title,
    'runtime_status', s.status,
    'version', s.version
  ) order by t.created_at), '[]'::jsonb)
  into v_threads
  from public.quest_threads t
  left join public.quest_runtime_state s on s.thread_id = t.id and s.campaign_id = p_campaign_id and s.quest_id = p_quest_id
  left join public.quest_beats b on b.id = s.current_beat_id and b.quest_id = p_quest_id
  where t.quest_id = p_quest_id and t.campaign_id = p_campaign_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'event_id', ev.id, 'consequence_id', ev.consequence_id, 'action', ev.action,
    'target_objective_id', ev.target_objective_id, 'target_npc_id', ev.target_npc_id,
    'target_quest_id', ev.target_quest_id, 'action_payload', ev.action_payload,
    'after_days', ev.after_days, 'held_at', ev.held_at,
    'beat_id', tr.to_beat_id, 'beat_title', tr.to_beat_title
  ) order by ev.held_at), '[]'::jsonb)
  into v_held
  from public.quest_consequence_events ev
  left join public.quest_beat_transitions tr on tr.id = ev.transition_id
  where ev.quest_id = p_quest_id and ev.campaign_id = p_campaign_id
    and ev.held_at is not null and ev.performed_at is null and ev.undone_at is null;

  select * into v_state from public.quest_runtime_state
   where campaign_id = p_campaign_id and quest_id = p_quest_id and thread_id = p_thread_id;
  v_found := found;

  if not v_found then
    return jsonb_build_object(
      'state', null, 'current', null, 'previous', null,
      'outgoing', '[]'::jsonb, 'return_target', null, 'path_so_far', '[]'::jsonb,
      'thread', v_thread, 'threads', v_threads, 'held', v_held
    );
  end if;

  if v_state.visit_index > 0 then
    v_previous := v_state.visit_stack -> (v_state.visit_index - 1);
  end if;
  if jsonb_array_length(v_state.return_stack) > 0 then
    v_return := v_state.return_stack -> (jsonb_array_length(v_state.return_stack) - 1);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'edge_id', e.id,
    'quest_id', e.quest_id,
    'beat_id', b.id,
    'beat_title', b.title,
    'beat_kind', b.kind,
    'route_kind', e.route_kind,
    'thread_label', e.thread_label,
    'converge_mode', b.converge_mode,
    'site', (
      select jsonb_build_object(
        'location_id', l.id, 'name', l.name,
        'room_count', (select count(*) from public.locations r where r.parent_id = l.id and private.location_is_interior(r.location_type))
      )
      from public.locations l
      where l.id = b.staged_at_location_id
        and private.location_can_hold_rooms(l.location_type)
    ),
    'gate', (
      select jsonb_build_object(
        'objective_id', g.objective_id, 'objective', o.description,
        'required_status', g.status, 'current_status', o.status,
        'is_open', o.status = g.status
      )
      from public.quest_beat_edge_gates g
      join public.quest_objectives o on o.id = g.objective_id
      where g.edge_id = e.id
    ),
    'effects', coalesce((
      select jsonb_agg(jsonb_build_object(
        'action', qc.action,
        'objective', tobj.description,
        'after_days', qc.after_days
      ) order by qc.created_at)
      from public.quest_consequences qc
      left join public.quest_objectives tobj on tobj.id = qc.target_objective_id
      where qc.on_edge_id = e.id
    ), '[]'::jsonb),
    'payoff', coalesce((
      select jsonb_agg(jsonb_build_object(
        'consequence_id', qc.id, 'action', qc.action,
        'target_objective_id', qc.target_objective_id, 'target_objective', tobj.description,
        'target_npc_id', qc.target_npc_id, 'target_npc', tnpc.name,
        'target_quest_id', qc.target_quest_id, 'target_quest', tquest.title,
        'action_payload', qc.action_payload, 'after_days', qc.after_days,
        'on_edge', qc.on_edge_id is not null
      ) order by qc.created_at)
      from public.quest_consequences qc
      left join public.quest_objectives tobj on tobj.id = qc.target_objective_id
      left join public.npcs tnpc on tnpc.id = qc.target_npc_id
      left join public.quests tquest on tquest.id = qc.target_quest_id
      where qc.on_edge_id = e.id or qc.on_beat_id = b.id
    ), '[]'::jsonb),
    'loot', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', lp.id, 'kind', lp.kind, 'label', lp.label, 'quantity', lp.quantity, 'item_id', lp.item_id
      ) order by lp.sort_order, lp.created_at)
      from public.loot_placements lp
      where lp.beat_id = b.id and lp.dispatched_at is null
    ), '[]'::jsonb)
  ) order by e.created_at), '[]'::jsonb)
  into v_outgoing
  from public.quest_beat_edges e
  join public.quest_beats b on b.id = e.target_beat_id
  where e.source_beat_id = v_state.current_beat_id;

  select coalesce(jsonb_agg(recent.entry order by recent.created_at, recent.id), '[]'::jsonb)
  into v_path
  from (
    select t.id, t.created_at, jsonb_build_object(
      'id', t.id, 'kind', t.transition_kind,
      'from_quest_id', t.from_quest_id, 'from_beat_id', t.from_beat_id,
      'from_quest_title', t.from_quest_title, 'from_beat_title', t.from_beat_title,
      'to_quest_id', t.to_quest_id, 'to_beat_id', t.to_beat_id,
      'to_quest_title', t.to_quest_title, 'to_beat_title', t.to_beat_title,
      'reason', t.reason, 'runtime_version', t.runtime_version, 'provenance', t.provenance,
      'created_at', t.created_at
    ) entry
    from public.quest_beat_transitions t
    where t.campaign_id = p_campaign_id
      and (t.thread_id = p_thread_id or t.thread_id is null)
      and (t.to_quest_id = p_quest_id or t.from_quest_id = p_quest_id)
    order by t.created_at desc, t.id desc
    limit 100
  ) recent;

  return jsonb_build_object(
    'state', to_jsonb(v_state),
    'current', (
      select to_jsonb(b) from public.quest_beats b
      where b.id = v_state.current_beat_id and b.quest_id = p_quest_id
    ),
    'previous', v_previous,
    'outgoing', coalesce(v_outgoing, '[]'::jsonb),
    'return_target', v_return,
    'path_so_far', v_path,
    'thread', v_thread,
    'threads', v_threads,
    'held', v_held
  );
end;
$function$

;

