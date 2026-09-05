-- `grounds` joins the site tier, and Palace Gardens becomes one. Story #817.
--
-- Separate from 20260905094606 because a new enum value cannot be used in the
-- transaction that adds it. Everything here reads or writes 'grounds', so it
-- all has to be on this side of that boundary.
--
-- ── The site tier gains a sixth type ────────────────────────────────────────
--
-- Mirrors `isSiteType` in src/lib/locations/tiers.ts, as the comment on this
-- function has said since #810: the two must not diverge. Rebuilt from the live
-- definition rather than from the migration that last wrote it.

create or replace function private.location_can_hold_rooms(p_type public.location_type_enum)
returns boolean
language sql
immutable
set search_path = ''
as $$
  -- coalesce at the SOURCE, not at each call site. `select x in (...)` returns
  -- NULL for a NULL input, and this helper is consumed NEGATED by
  -- `guard_location_room_parent` and `guard_location_map_region_room`:
  -- `not NULL` is NULL, the `and` chain is NULL, the `if` never fires, and the
  -- guard is skipped. That is the `is_app_admin()` shape CLAUDE.md item 3
  -- describes, and it would be safe here only by accident, because
  -- `locations.location_type` happens to be NOT NULL — a guarantee living in a
  -- different object.
  select coalesce(p_type in (
    'building', 'dungeon',        -- structures proper
    'store', 'tavern', 'inn',     -- also structures; a tavern has a floor plan
    'grounds'                     -- and an unroofed one: a garden, a courtyard
  ), false);
$$;

comment on function private.location_can_hold_rooms(public.location_type_enum) is
  'True for the site tier — the six location types that have a floor plan and '
  'therefore place their children by traced region rather than by pin. Mirrors '
  '`isSiteType` in src/lib/locations/tiers.ts; the two must not diverge (#810, #817).';

-- ── Palace Gardens is grounds, and its spaces are rooms ─────────────────────
--
-- Order matters and the guards enforce it: the parent must be able to hold
-- rooms before its children can become rooms. Doing it the other way round
-- raises 23514 from `guard_location_room_parent`.
--
-- Addressed by id and guarded by name and current type, so this quietly does
-- nothing if the owner has already retyped these by hand. Terrace is not listed
-- because it is already a `room`; #810's guard judges transitions rather than
-- rows, so it has stayed valid and editable throughout and simply becomes a
-- numbered room of a site the moment its parent does.

update public.locations
   set location_type = 'grounds'
 where id = '8d5e9b62-e591-433a-9cd6-12439516b3fa'
   and name = 'Palace Gardens'
   and location_type = 'wilderness';

update public.locations
   set location_type = 'room'
 where parent_id = '8d5e9b62-e591-433a-9cd6-12439516b3fa'
   and location_type = 'wilderness';

-- Deliberately scoped to this one garden rather than "every wilderness inside a
-- building": the other 40 wildernesses in this world are genuine terrain, and a
-- rule broad enough to catch a courtyard would also catch a valley that happens
-- to have been filed under a keep. One known row, corrected; the type now
-- exists for the rest to be reclassified by hand as their author sees them.
