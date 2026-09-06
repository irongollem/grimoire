-- A child may not belong to another campaign. Story #827.
--
-- Found by exploit during the #798 security audit, and fixed there only at the
-- read path. This is the root cause.
--
-- Nothing tied a child location to its parent's campaign, or a map region's
-- space to its site's. `guard_location_map_region_space` checked the space's
-- parent_id structurally; `guard_location_room_parent` checked the parent's
-- type; neither compared campaign_id, and neither table's RLS relates a child's
-- campaign to its parent's. So a DM running two campaigns could, with two
-- individually legal writes, park a campaign-B room under a campaign-A site:
--
--   update locations            set parent_id        = <A site> where id = <B room>;
--   update location_map_regions set site_location_id = <A site> where space_location_id = <B room>;
--
-- `get_player_visible_site_state` then handed B's room name and B's looted
-- state to A's players. #798 closed that one function with
-- `space.campaign_id = site.campaign_id`; the malformed data stayed writable,
-- and other consumers assume the invariant.
--
-- ── The NULL decision, made from the data rather than from taste ────────────
--
-- Production holds zero of the dangerous shape and ten rows that touch the
-- global boundary: 8 campaign-parent-to-global-child, 2 the other way round.
-- Those are a DM reusing personal content inside a campaign, which is
-- legitimate and supported.
--
-- So the rule permits a NULL on either side and forbids only two DIFFERENT
-- non-null campaigns. A plain equality check would have rejected all ten — and
-- because these triggers fire on `UPDATE OF`, which fires when a column appears
-- in the SET list whether or not its value changed, those rows would have
-- become uneditable through the app with no route to repair them from the UI.
-- That is precisely the stranding #793 shipped and had to unpick.
--
-- ── Read path relaxed to match ─────────────────────────────────────────────
--
-- #798's predicate was strict equality, which would hide a *legitimate* global
-- room from players — the 8-row shape above. Both ends now say the same thing:
-- same campaign, or the space is personal content.

-- ── The room/parent guard ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.guard_location_room_parent()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'private'
AS $function$
begin
  -- A room needs a parent that can hold it — on insert, and on the edits that
  -- could actually break it. See the header: an unchanged value must not be
  -- re-judged against a rule that has since narrowed.
  if new.location_type = 'room'
     and (tg_op = 'INSERT'
          or old.parent_id is distinct from new.parent_id
          or old.location_type is distinct from new.location_type)
  then
    if new.parent_id is null then
      raise exception 'A room must sit inside a place that can hold rooms; % has no parent', new.name
        using errcode = '23514';
    end if;
    if not exists (
      select 1 from public.locations p
      where p.id = new.parent_id
        and private.location_can_hold_rooms(p.location_type)
    ) then
      raise exception 'A room must sit inside a building, dungeon, store, tavern or inn'
        using errcode = '23514';
    end if;
  end if;

  -- A child may not belong to a DIFFERENT campaign than its parent (#827).
  --
  -- Applies to every child, not only rooms: the exploit that found this used a
  -- room, but nothing about the hole is room-specific. A DM running two
  -- campaigns could reparent a campaign-B room under a campaign-A site with two
  -- individually legal writes, and get_player_visible_site_state then served
  -- B's room name and looted state to A's players.
  --
  -- NULL on either side is allowed, deliberately and with the data in hand.
  -- Production holds 8 rows shaped campaign-parent to global-child and 2 shaped
  -- global-parent to campaign-child: a DM reusing personal content inside a
  -- campaign, and the reverse. A plain equality check would reject all ten and,
  -- because this trigger fires on UPDATE OF -- which fires when a column is in
  -- the SET list whether or not it changed -- would leave those rows uneditable
  -- through the app with no way to fix them from the UI. That is the #793
  -- stranding exactly. What is forbidden is only the case nothing can justify:
  -- two different campaigns.
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

  -- And a place that already holds rooms — or carries traced regions — may not
  -- become something that can hold neither.
  --
  -- The regions half is new (#810). Without it an *unbound* region strands: the
  -- region guard fires only on insert and on rebinding, so retyping the site
  -- afterwards left a shape on a place with no floor plan — a row no screen can
  -- render, and one that is then partly frozen, since any later write touching
  -- `site_location_id` raises. Unbound is the normal mid-trace state ("draw the
  -- shapes, then say which room each one is"), so the gap sat precisely on the
  -- workflow the table exists for.
  --
  -- Known limit, stated rather than implied: this function is SECURITY INVOKER
  -- and `location_map_regions` is owner-scoped, so it cannot see regions traced
  -- by a *co-DM* on a site they do not own — which `location_map_regions_insert`
  -- does permit. Closing that would mean a SECURITY DEFINER trigger, and a
  -- definer earning its keep on an integrity check that already covers every
  -- single-owner case is a poor trade. The co-DM case strands as before.
  if tg_op = 'UPDATE'
     and old.location_type is distinct from new.location_type
     and not private.location_can_hold_rooms(new.location_type)
     and (
       exists (
         select 1 from public.locations c
         where c.parent_id = new.id and c.location_type = 'room'
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
$function$

;

-- The trigger must now also fire when campaign_id itself moves, or a child
-- could be walked into another campaign without its parent changing.
drop trigger if exists locations_room_parent_guard on public.locations;
create trigger locations_room_parent_guard
  before insert or update of parent_id, location_type, campaign_id on public.locations
  for each row execute function guard_location_room_parent();

-- ── The region/space guard ──────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.guard_location_map_region_space()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'private'
AS $function$
declare
  v_parent uuid;
  v_type   public.location_type_enum;
  v_site   public.location_type_enum;
begin
  select location_type into v_site
    from public.locations where id = new.site_location_id;

  if not private.location_can_hold_rooms(v_site) then
    raise exception 'Regions can only be traced on a place with a floor plan (building, dungeon, store, tavern or inn)'
      using errcode = '23514';
  end if;

  if new.space_location_id is null then
    return new;
  end if;

  select parent_id, location_type into v_parent, v_type
    from public.locations where id = new.space_location_id;

  -- #818: the bound child must itself be an addressable space -- a room, or
  -- a nested site with its own floor plan (a courtyard inside a dungeon, a
  -- shop's back room inside an inn). private.location_can_hold_rooms is the
  -- single site-tier predicate (see 20260904014714); do not re-list types
  -- here.
  if v_type is distinct from 'room' and not private.location_can_hold_rooms(v_type) then
    raise exception 'A map region can only be bound to a room or a nested site' using errcode = '23514';
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
$function$

;

-- ── And the read path, relaxed to agree with the write rule ────────────────
--
-- #798 shipped `space.campaign_id = site.campaign_id`, which closes the leak
-- but also hides a room that is legitimately global — the 8-row shape above,
-- a DM's personal content placed inside a campaign's site. With the guards now
-- forbidding the only case that was ever dangerous, the projection can say the
-- same thing the database enforces: same campaign, or personal content.

CREATE OR REPLACE FUNCTION public.get_player_visible_site_state(p_site_location_id uuid, p_preview_party_member_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(space_location_id uuid, name text, cells jsonb, label text, sort_order integer, is_cleared boolean, is_looted boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
  -- `p_preview_party_member_id` mirrors get_player_visible_quest_beats: a DM
  -- asks "what does THIS character see?" and gets exactly that, gated on
  -- private.is_campaign_dm. Without it a DM previewing the journal would get an
  -- empty room list, because a DM's own campaign_members row has a null
  -- party_member_id and so matches nothing in player_visible_to — the feature
  -- would be unpreviewable by the only person who can fix what it shows.
  -- Deliberate difference from the sibling, so nobody "aligns" it later:
  -- get_player_visible_quest_beats RAISES on a bad preview request, this one
  -- returns empty. That function is plpgsql and already has a guard block; this
  -- one is plain SQL, and converting it to plpgsql to raise would trade a
  -- readable set-returning query for an error message the client cannot act on
  -- anyway — the preview id comes from a picker of this campaign's own party
  -- members, so a bad one is a programming error, not something a DM can type.
  -- The realistic empty result is "nothing explored yet", which is exactly what
  -- an empty set should mean.
  select
    r.space_location_id,
    space.name,
    r.cells,
    r.label,
    r.sort_order,
    coalesce((select s.value from public.location_state s
               where s.location_id = r.space_location_id and s.fact = 'cleared'), false),
    coalesce((select s.value from public.location_state s
               where s.location_id = r.space_location_id and s.fact = 'looted'), false)
  from public.location_map_regions r
  join public.locations site  on site.id  = r.site_location_id
  join public.locations space on space.id = r.space_location_id
  where r.site_location_id = p_site_location_id
    and r.space_location_id is not null
    -- The caller must be a member of the campaign the site belongs to.
    and site.campaign_id is not null
    and exists (
      select 1 from public.campaign_members cm
      where cm.user_id = (select auth.uid())
        and cm.campaign_id = site.campaign_id
    )
    -- … the site must be shared with this player's character, and its map
    -- shared at all. A site whose map the DM has not shared has no picture for
    -- regions to sit on, so returning its geometry would leak the floor plan
    -- in coordinates.
    and site.is_map_shared
    and case
      when p_preview_party_member_id is null then exists (
        select 1 from public.campaign_members cm
        where cm.user_id = (select auth.uid())
          and cm.campaign_id = site.campaign_id
          and cm.party_member_id = any (site.player_visible_to)
      )
      -- Preview: only a DM of THIS campaign may ask, and only about a character
      -- who is actually in it. Both checks are coalesced because a missing
      -- membership row must deny rather than answer NULL.
      else coalesce(private.is_campaign_dm(site.campaign_id), false)
           and exists (
             select 1 from public.party_members pm
             where pm.id = p_preview_party_member_id
               and pm.campaign_id = site.campaign_id
           )
           and p_preview_party_member_id = any (site.player_visible_to)
    end
    -- … the room must belong to the SAME campaign as the site it is drawn on.
    --
    -- Not redundant, though it reads that way. Nothing in the schema guarantees
    -- a region's space and site share a campaign: `guard_location_map_region_space`
    -- checks that the space's parent_id equals the site, and
    -- `guard_location_room_parent` checks that the parent can hold rooms —
    -- neither compares campaign_id, and neither table's RLS relates a child's
    -- campaign to its parent's. So a DM running two campaigns can, with two
    -- ordinary writes that pass every existing check, park a room belonging to
    -- campaign B under a site belonging to campaign A. Without this line the
    -- projection then serves B's room name and B's looted state to A's players,
    -- who have never been near it. Demonstrated with a working exploit during
    -- the #798 audit; the root-cause trigger gap is filed separately.
    and (space.campaign_id = site.campaign_id or space.campaign_id is null)
    -- … and the space itself must have been explored.
    and coalesce((
      select s.value from public.location_state s
       where s.location_id = r.space_location_id and s.fact = 'explored'
    ), false)
  order by r.sort_order, space.name;
$function$;
