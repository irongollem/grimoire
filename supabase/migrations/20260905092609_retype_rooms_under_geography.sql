-- Retype the rooms that #810 left under geography. Follows #810, epic #780.
--
-- #810 narrowed "can hold rooms" to the five types with a floor plan
-- (building, dungeon, store, tavern, inn), and deliberately migrated nothing,
-- on the grounds that a room under a district is either a mistyped parent or a
-- mistyped room and only the author knows which. It left four rows behind.
--
-- The author has now said which, so this migration is the answer to that
-- question rather than a guess at it. Three of the four are settled here; the
-- fourth is deliberately not, and the reason is at the bottom.
--
-- ── 1. A "room" under geography is a building ───────────────────────────────
--
-- The Painters' Library and The Round-Windowed Scholar's Library sit in The
-- White Quarter beside those seven buildings; The Lost-and-Found sits in The
-- Well (Understage) — a genuine district of a city — beside The Gathering-Room,
-- The Roost and The Spinning-Floor, all buildings. A library or a lost-and-found
-- on a city street is a building, so the *room* was the mistyped thing and the
-- parent was right. Retyping leaves the hierarchy exactly as authored, where
-- re-parenting each one into some sibling building would invent a containment
-- the DM never wrote.
--
-- Expressed as a rule rather than three ids: ids would misrepresent how the
-- decision was made, and would miss any sibling row created before #810's guard
-- landed. Written against the live `private.location_can_hold_rooms`, so it
-- cannot silently encode today's list if that list changes again.
--
-- `wilderness` parents are excluded — see the note below.

update public.locations c
   set location_type = 'building'
  from public.locations p
 where p.id = c.parent_id
   and c.location_type = 'room'
   and p.location_type <> 'wilderness'
   and not private.location_can_hold_rooms(p.location_type);

-- ── 2. The White Quarter is a city, not a district ──────────────────────────
--
-- Stated by the owner. Its seven other children are already buildings — Guild
-- House, Bell-Tower, Painters' Chapel, Master Painter Linen's Studio, the
-- Training Workshop, the Water-Gate, the Stained District Chapel — which is
-- what a city holds. Addressed by id and guarded by name: a one-off correction
-- to one authored row, which should quietly do nothing if that row has since
-- been renamed or retyped by hand.
--
-- This MUST come after the rooms above, and #810's own guard is what says so:
-- a place that still holds rooms may not become one that cannot, so with the
-- statements the other way round this migration fails with
-- "The White Quarter holds rooms or traced regions, so it cannot become a
-- city". The order is the invariant being obeyed, not a style choice.

update public.locations
   set location_type = 'city'
 where id = '94099f8c-ffc7-4d1e-9ed7-57c75bc5849a'
   and name = 'The White Quarter'
   and location_type = 'district';

-- ── 3. Terrace, under Palace Gardens, is deliberately left alone ────────────
--
-- Palace Gardens is a garden inside the Ducal Palace's carriage court, holding
-- Terrace, Hedge Maze, Fountain Clearing and Rose Bench. Neither available
-- answer is true: `wilderness` makes it geography, which it plainly is not —
-- it is a space inside a building — and there is no site-tier type for outdoor
-- grounds, so it cannot hold rooms either.
--
-- The owner's reading is the right one: a garden is not terrain, it is a place
-- within a site that behaves like a room, and one can as easily be part of a
-- dungeon as of a palace. That means the ladder is missing an *outdoor site*
-- type, not that this row needs forcing into one of the types that exist.
-- Adding an enum value is a schema change with its own tier mapping, colour,
-- label and backfill, so it gets its own story rather than riding along here.
--
-- Until then Terrace stays a `room` under a `wilderness`. It renders and edits
-- normally — #810's guard judges transitions, not rows — it simply shows as a
-- sub-location rather than a numbered room, and no new room can be added beside
-- it. That is a smaller wrong than recording a garden as wilderness and having
-- to unpick it later.

-- Nothing else keys on `location_type` for these rows: no FK, no policy, no
-- generated column. It decides which panels a place shows and where it sorts on
-- the scale rail, both derived at render time. Every row keeps its id, name,
-- description, tags, art, sharing flags and parent. Safe to re-run.
