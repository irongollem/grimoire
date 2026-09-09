# World-Building: Atlas, Factions & Pantheons

## Overview

Two interconnected modules for tracking the physical and political geography of a campaign: **Atlas** manages the location hierarchy and maps, and **Factions** models the organisations that shape the world. Both support granular player visibility — the DM controls what each player sees in the `/play/*` portal. Quests used to live here too and now have their own doc: [quests.md](quests.md).

---

## Atlas (Locations)

### DM View

Route: `/locations` (list), `/locations/new`, `/locations/:id`, `/locations/:id?edit=true`

**List page** (`LocationsView.vue`)

- Title: "Atlas", subtitle: "Continents, cities, dungeons, and every place in between"
- Filter bar: free-text search + type dropdown (all 18 location types)
- Action buttons: **New Location** (primary), **Populate Setting** (bulk-inserts preset locations for the campaign's setting/calendar, e.g. Faerûn), **Populate Planes** (bulk-inserts the 21 standard D&D cosmological planes). Both populate buttons are idempotent — they skip names that already exist and report how many were added.
- Body rendered by `AtlasExplorer.vue`

**Atlas explorer** (`AtlasExplorer.vue` + `AtlasTree.vue` / `AtlasTreeRow.vue` / `AtlasPlacePane.vue` / `AtlasScaleRail.vue`)

Two panes from `lg` up, master/detail swap below it. This replaced a flat alphabetical card grid (`LocationList.vue` / `LocationCard.vue`, both deleted), which sorted a continent between a tavern and a broom closet and rendered the `parent_id` hierarchy as one line of italic text. The players' atlas had had a tree since it shipped; the DM who authored the hierarchy did not.

- **Left — tree.** One row per location: type dot, name, descendant count, and a `map` glyph when the place has non-battle-map art. Expander and row are separate targets (opening a region ≠ selecting it). Rows carry no images, which is why the old `useInfiniteScroll` paging is gone — it existed to stop a few hundred `FocalImage`s mounting at once.
- **Right — place pane.** Breadcrumb of clickable ancestors, sigil, type badge, scale rail, then the location's children **grouped by scale tier** rather than laid out as equal cards. This is the part that must carry the pane for a DM with no artwork, so it leans on the taxonomy instead of on images. The map is a `SegmentedControl` mode *inside* this pane, offered only when `map_url` is set and `is_battle_map` is false — never the pane itself.
- **Scale rail** (`AtlasScaleRail.vue`) — the six tiers as rungs; the selection's tier is lit, tiers occupied by its subtree are at half strength, and unauthored tiers are dim, so a gap in a world is visible without opening every node.
- **The full read-only body**, via the shared `LocationDetailSections.vue` (below) — description, related locations, store, people, encounters, party. The pane is not a preview of the detail page; it renders the same content.

**`LocationDetailSections.vue` — shared by the sheet and the pane.** Holds the nine sections that are *about* a place rather than *where it sits*: Description, Related Locations, Ways out, Store, Rooms, Prepared Here, People in the Area, Encounters Here, Currently Here. Three of those are always present rather than gated on content, so the body itself is no longer conditional; the pane asks `hasSubstance` instead when it needs to know whether a place is genuinely empty. Self-contained (does its own queries; TanStack dedupes against the caller's). Each caller keeps what genuinely differs — breadcrumb, identity, sub-locations, map placement, and the Atlas's scale rail and tier groups.

It exists because the Atlas pane needed the same sections the sheet already had, and a second copy drifts within a release: the sheet's People card grid and the pane's People list were already two designs for one thing before the extraction. `LocationSheet` went 403 → 217 lines.

**Five sibling panels, deliberately not extracted.** `LocationDetailSections` now mounts `StoreInventory`, `SiteRoomsPanel`, `LocationPlacements`, `LocationDoors` and `LocationStateControls`. They look related because they share two idioms the app already had — the bordered list row (`rounded-md border border-border bg-card px-3 py-2`) and the dashed inline-add box ending in an `AppButton` — not because this work duplicated anything. Their interaction models genuinely differ: commerce pricing, drag reorder, a kind-typed exclusive-arc picker, a directional graph edge with three authored flags, and a flat row of state toggles.

The map itself — and the room-shapes list that rides alongside it — is deliberately **not** one of these six: #807 removed the `SiteMapView` panel this section used to list here, because it rendered `map_url` a second time. Map placement genuinely differs per caller (the sheet's own section, the Atlas pane's mode toggle, the run surface's composed layout), so `LocationMap.vue` — the caller-owned composite — carries the regions canvas and `SiteMapRegionList` with it instead. See "Clickable rooms on a site's map" below.

**The trigger for extracting, when it comes:** a *third* near-identical "list of typed relations with an `EntityCombobox` add-box" panel. Two is a coincidence of shared idiom; three is a recipe. Extracting at two would produce a slot-heavy component configured differently at each of its two call sites — the over-abstraction the granularity rule is not aiming at.

`hasSubstance` is `defineExpose`d so a caller can tell "this place is genuinely empty" from "merely childless". It deliberately excludes the always-present editing panels (Rooms, Prepared Here, Ways out) — those make the *body* unconditional, and folding them in would have retired that message everywhere. It also excludes a room's `related_location_ids` specifically, since Ways out replaces that section there (see below) and a stray link set before the place became a room must not claim substance the body no longer renders. The Atlas pane pairs `hasSubstance` with its child-group count, because *Nothing inside X yet* is wrong above a tavern's stocked store — a venue has no sub-places by nature.

**Descending and rising between maps** (`AtlasMapZoom.vue`, `lib/locations/mapZoom.ts`). A pin's *watch* action, when this place and the child both have a non-battle map, moves between them as a continued zoom rather than a page change — the thing an atlas actually does. A matching **Up to `<parent>`** control sits on the map itself, because rising is the reverse of the gesture that got you there and belongs where that gesture happened. Both fall back to plain selection when either end has no map, and under `prefers-reduced-motion`.

The illusion rests on three things, all of which have failed at least once:

- **One locked trajectory.** The child's map depicts the pin's region, so a parent shown at scale `s` matches a child shown at `s / ZOOM_PARENT_SCALE`. Both layers ride that single line — parent 1→7 while child 1/7→1 descending, exactly reversed rising — which is why their transforms must share one curve, one duration and no delay. Only opacity may differ. An earlier version had the child merely overshoot (1.25 → 1); descending that is masked by the parent's explosion, but reversed it put the *departing* map at full opacity growing, so rising visibly began by zooming **in**. `ZOOM_CHILD_SCALE` is derived from `ZOOM_PARENT_SCALE` rather than chosen, and a test asserts the ratio holds at every point of any easing.
- **Overlap.** The arriving map starts fading in at `ZOOM_CROSSFADE_AT` (0.45), while the departing one is still moving. The eye tracks velocity, not pixels; finish the first move before starting the second and it reads as two shots.
- **The anchor is the child's pin on the *parent's* map**, for both directions. It is the one point the two images agree about, so the place stays still while the scale changes.
- **The overlay outlives the selection.** It stays mounted at full opacity until the destination's real `LocationMap` has mounted underneath, then fades over 220ms. Tearing it down when the animation ended produced a visible jitter: the selection travels through the router, so for a frame or two the *previous* map was still what was mounted. The fade also covers the fact that two maps of different aspect ratios never occupy the same box, so the last animated frame and the first real one are not pixel-identical.

Destination images are decoded before the motion starts (`preloadImage`) — a crossfade onto an undecoded image flashes white on exactly the frame being watched — and whichever layer is magnified blurs, which sells speed and hides a 2000px JPEG at 7×.

Two sizing rules are shared rather than restated. `MAP_IMAGE_SIZING` / `MAP_IMAGE_COMPACT_SIZING` in `lib/locations/mapZoom.ts` are used by **both** `LocationMap` and the overlay: `LocationMap` caps a compact map's height, and an overlay that only constrained width drew the map full-width then snapped the instant the real map took over. The overlay is also opaque, because underneath it sits the departing map at rest — rising, that showed a stationary copy of the image being shrunk away.

Everything above the map keeps a **fixed height** for the same reason: the sigil box is always rendered (placeholder when unset) rather than `v-if`'d away, the header row has a floor, and the breadcrumb is one line that scrolls sideways. A header that changes height moves the map, and a map that starts somewhere other than where it finished turns the zoom into a jump cut.

**Open became Edit.** Since the pane renders the detail page's body, a link to that page led where the reader already was. The button now goes straight to `/locations/:id?edit=true` — the one thing the pane cannot do is change the place.

**Selection is a route, not just store state.** Picking a place pushes `/locations?at=<id>`, so browser Back walks the trail of places you visited instead of leaving the Atlas — descending a hierarchy *is* navigation. The route is the input: a watcher resolves `at` against the live index, so a deep link, a Back, and a stale-after-delete id all land correctly, and `revealLocationPath` unfolds the ancestors on arrival.

**Two things deliberately absent:**

- **No stub/`empty` marker.** An earlier version flagged places with no description, children, map or tags. It was removed rather than tuned: the predicate reads four fields, three of which the tree does not display, so a row marked "empty" beside an unmarked sibling looked arbitrary — the sibling had a description you could not see. A marker needing knowledge the surface withholds is noise however accurate it is.
- **The sigil is size-capped by a wrapper `div`, not by a class on `FocalImage`.** `FocalImage`'s root is `w-full h-full` and is not run through `cn()`, so a size class passed to it does not override — it coexists, and `w-full` wins. Passing `h-14 w-14` directly rendered the coat of arms at pane width and pushed every child row out of view.

**Filter state**: `locationsSearch` / `locationsFilterType` as before, plus `locationsExpanded`, `locationsSelectedId` and `locationsPaneMode` in `useUiStore`. Expansion is deliberately **not** cleared by `resetLocationsFilters()` — clearing a search should return you to the tree you had, not collapse the world. Searching flattens the tree to a match list (same behaviour as the player atlas), because hiding a branch that contains a match makes the match unreachable.

**Detail page** (`LocationDetailView.vue` + `LocationSheet.vue` / `LocationEditor.vue`)

The detail page follows the sheet + editor convention: existing locations show a read-only sheet; adding `?edit=true` flips to the editor. New locations go straight into the editor. A breadcrumb showing the full ancestor chain (Locations → Parent → … → Current) is shown in both modes.

**Location editor fields:**

- **Name** (required), **Type** (one of 18 types, see below), **Sigil/Emblem image** (portrait aspect, uploaded to `location-images` bucket)
- **Parent** — `EntityCombobox` picking any other location; setting this places the location in the hierarchy
- **Child locations** — inline tag-style list of existing children; an inline search box lets the DM re-parent existing locations OR create a new child (navigates to `/locations/new?parent=id&name=…`)
- **Tags** — `TagInput` component
- **Calendar events** — compact inline `EntityCalendarSection` widget
- **Description** — `RichTextEditor` (Tiptap, full formatting)
- **Player Sharing panel** (hidden when creating new):
  - **Player Summary** — a plain-text teaser always visible to players who can see the location
  - **Share full description** — toggle (boolean)
  - **Share linked NPCs** — toggle; when on, NPCs whose `location_id` equals this location appear in the player portal under "People in the Area"
  - **Share inventory with players** — toggle; only shown for store/tavern/inn types
  - **Player visibility** — the editor action bar's `AudienceRevealControl` picks which party member UUIDs are in `player_visible_to[]`. The editor is the one surface where the control covers "who" only: a location's "what" is already on this page as the toggles above. Everywhere else — the Atlas pane, `LocationSheet` — `LocationRevealControl` carries all four switches in its `#what`, so seeing a place and sharing it no longer means opening a form (#741)
- **Proprietor** (store/tavern/inn only) — NPC combobox; used as the sender name in vendor chat messages
- **Store Inventory** — `StoreInventory` component, only for store/tavern/inn types; also shown in view mode so the DM can restock without entering edit mode
- **Map** — upload landscape image; once uploaded an interactive `LocationMap` component appears with:
  - DM can click to place **pins** on the map, each linked to a direct child location (or a pinnable descendant surfaced through "vague container" types — regions/continents recurse transparently so individual towns appear on a regional map)
  - Each pin has `visible_to_players` flag (shown/hidden independently)
  - "Share with players" toggle for the whole map
  - Compact / Full-size toggle; "Change map" and "Remove" buttons

**Location sheet (view mode) — read-only sections:**

- Sigil + name + type badge + tags
- Description (only rendered when Tiptap JSON has text content)
- Interactive map with pins (clicking a pin navigates to the child location)
- Sub-locations — chip links to each direct child
- **Store** — `StoreInventory` available in read mode for quick restock
- **People in the Area** — NPCs assigned to this location or any descendant, shown as cards (first 3, then "Show all N"); links to NPC detail
- **Encounters Here** — encounters linked to this location; links to encounter detail
- **Currently Here** — party members whose `current_location_id` equals this location; links to party member detail
- **Move a party member here** — available in edit mode via an `EntityCombobox` + "Move here" button

**Location type taxonomy** (18 types). Two independent axes — do not conflate them:

*By pinnability* (drives map pin recursion and store inventory):

- *Vague containers* (not useful as single map pins): World, Plane, Continent, Region, Country
- *Concrete place types*: City, Town, Village, District, Building, Grounds, Dungeon, Wilderness, Other
- *Store types* (support inventory): Store, Tavern, Inn
- *Room* — excluded from pinning entirely (#807). `getPinnableDescendants()` skips a `room` child outright rather than offering it as a pin candidate: a room is placed by a traced region on its site's floor plan (`location_map_regions`), never by a pin. This is a pinnability exclusion, not a recursion one, so it lives beside the `VAGUE_LOCATION_TYPES` walk rather than inside that set — a room is already a concrete leaf, just not a mappable point on this axis.

*By map kind* (`lib/locations/tiers.ts`) — the ladder the Atlas groups, sorts and colours by. This axis used to claim to encode *size* ("type says what a place is; tier says how big it is"), and never actually did — the ladder was auto-generated, so nobody had checked. `venue` encoded function ("has an inventory"), not scale; `wilderness` had no scale at all — production has a `wilderness` (Icewind Dale) that itself contains 9 villages and 4 regions, so a size-based ladder read that as a place smaller than its own contents. [#810](https://github.com/irongollem/grimoire/issues/810) redefined the axis to say what it actually needs to say: **what kind of map a place has, and therefore how its children get placed on it** — pins down through `district`, traced regions on a floor plan at `site`.

| Tier         | Types                                   |
| ------------ | ---------------------------------------- |
| `cosmic`     | World, Plane                            |
| `land`       | Continent, Region, Country, Wilderness  |
| `settlement` | City, Town, Village                     |
| `district`   | District                                |
| `site`       | Building, Dungeon, Grounds, Store, Tavern, Inn |
| `interior`   | Room                                    |
| *(none)*     | Other — the escape hatch claims no tier |

`venue` is gone: a tavern is a building, one of the six types with a floor plan (`grounds` joined them in #817). `wilderness` moved to `land`, beside continent/region/country, where "no floor plan, children placed by pins" actually describes it. `district` earned its own rung: its children are buildings on a geography map, not traced rooms.

**`LOCATION_TYPE_COLORS` is a tier ramp, not a palette of kinds.** It runs cool-to-warm along that ladder (violet → blue → teal → lime → amber → rust), which reads as distance; within a tier, lightness steps by enclosure, darkest = most enclosed. `land` runs continent → region → country → wilderness, lightest last: wilderness is the least enclosed thing on the ladder. `site` now steps six types instead of three — dungeon (underground, windowless) darkest, then building and grounds, then store/tavern/inn lightest — so Dungeon reads darkest of the whole ramp. Dungeon and Wilderness no longer share a hue family; under the old ladder they did, which was the bug #810 fixed — they are not the same kind of map, whatever their footprint on the page. The type label already says what a place is; colour now says what kind of map it gets. Do not reshuffle it back into a red-for-dungeons rainbow. `LOCATION_TYPE_LABELS` declaration order is likewise ladder order, because both type dropdowns (DM and player) iterate it to build their options.

**DM and player share one colour system by construction**, not by discipline: `LOCATION_TYPE_COLORS` / `LOCATION_TYPE_LABELS` in `types/location.types.ts` are the single source, imported by `LocationMap`, `LocationSheet`, `LocationHierarchyPanel`, `AtlasTreeRow`, `AtlasPlacePane`, `PlayerLocationCard`, `PlayerLocationDialog`, `PlayerLocationsView` and `AssetInsertPanel`. There is no second map anywhere — keep it that way rather than adding a player-side variant. `AtlasScaleRail` derives its tier swatches from the same record via `TIER_REPRESENTATIVE_TYPE`, so a rung can never drift from the places it stands for.

**Hierarchy**: unlimited depth; parent/child relationship is a single `parent_id` FK. The `useLocationTree` composable builds a depth-annotated flat list for indented combobox display across the app. `getPinnableDescendants()` recurses through vague containers to surface pinnable leaves (capped at 60 per map).

**Sites and rooms** (`SiteRoomsPanel.vue`, migration `20260904014714`, [#783](https://github.com/irongollem/grimoire/issues/783)). A **site-tier** place — building, dungeon, store, tavern, inn: the five types with a floor plan (redefined by [#810](https://github.com/irongollem/grimoire/issues/810)) — gets a Rooms panel, gated by `isSiteType()` in `lib/locations/tiers.ts`. `STORE_LOCATION_TYPES` (store, tavern, inn) is now a strict *subset* of `site`, not a separate tier: before #810, "venue" sat alongside "site" as its own rung, so a tavern got a Store panel and a dungeon got a Rooms panel from two disjoint type sets. Under this ladder a tavern gets both — its taproom's stock and its guest rooms are not mutually exclusive — and district/wilderness lose the Rooms panel entirely, since neither has a floor plan.

Rooms are ordinary `room`-typed **direct children**. There is deliberately no membership table: `parent_id` already owns that fact, and a second writer for it is the shape [#780](https://github.com/irongollem/grimoire/issues/780) exists to remove. A `building` nested inside a site is not a room of it — it is a child *site* with its own panel.

- **Order** is `locations.sort_order integer`, nullable. NULL means "no order claimed" and sorts **last**, so the Atlas keeps its name ordering until a DM arranges something. Siblings sort by **tier, then `sort_order` nulls-last, then name** — one comparator, `compareSiblings` in `lib/locations/tree.ts`, used by the tree, the queries and realtime cache splicing alike. The ordinal a room displays is derived from its position; there is no stored number column, because a stored label sorts "10" before "2".
- **`sort_order` is not content, and that WHEN clause now actually holds.** It is absent from the `locations_updated_at` WHEN list on purpose: rearranging rooms must not bump "last edited" or invalidate the location's embedding source hash. The exclusion sat unenforced from `20260529000002` onward, though: that migration meant to replace `locations_updated_at` and `quests_updated_at` with the conditional triggers, but the squashed schema had actually created them as `set_locations_updated_at` / `set_quests_updated_at`, so its `drop trigger if exists` dropped nothing — both tables ran the old *unconditional* trigger alongside the new conditional one the whole time, and a room reorder or a reveal toggle bumped "last edited" and re-embedded the row regardless of the WHEN list's promise. `20260908215643` (epic #868) found and dropped the stale pair; the exclusion has held since.
- **Reordering** goes through `reorder_locations(uuid[], integer[])`, `SECURITY INVOKER` so the table's own UPDATE policy is the authorization. It demands every id of exactly one sibling set — partial reorders are how two rows end up claiming one position — and checks the affected row count, because RLS skips rows silently rather than raising.
- **Where a room may live** is enforced by `locations_room_parent_guard`, via `private.location_can_hold_rooms` — now exactly the site tier: building, dungeon, store, tavern, inn, and — since [#817](https://github.com/irongollem/grimoire/issues/817) — `grounds`, the unroofed site a garden or courtyard needs. Before [#810](https://github.com/irongollem/grimoire/issues/810) this deliberately allowed a *wider* set than the panel showed (site tier plus venue tier), on the reasoning that "renting a room above a tavern is ordinary, and a check that rejects it would be hit by a real DM at a real table — where a panel appears and what the data permits are different questions and must not share one predicate." **That principle is deleted on purpose, not merely superseded.** Under this ladder "site" is defined as precisely the types with a floor plan, so a room above a tavern is exactly as valid as one in a dungeon *because a tavern is site-tier now*, not because the guard was deliberately widened past the panel — `location_can_hold_rooms` and `isSiteType()` are the same predicate by construction, and they cannot drift apart the way a panel gate and a data constraint maintained separately eventually would. What the guard still forbids is a room inside a room, a room under a world/region/continent/district/wilderness, and a top-level room. A place that already holds rooms also cannot change into a type that cannot hold them. Cover: `supabase/tests/location_room_parent_guard.test.sql`.
- **On a site, `AtlasPlacePane` stops grouping `room` children into an Interiors tile**, because the panel below already lists them — in the DM's manual order rather than scale-then-name. Two lists of the same rooms in two different orders is worse than either.

**Room flow** (`location_doors`, migration `20260904061014`, [#785](https://github.com/irongollem/grimoire/issues/785); widened by `20260908215641`, epic #868). `parent_id` says a room is *inside* a site; nothing said a room *connects* to another room, so "the nave opens onto the reliquary, but the abbot's cell is barred from the outside" lived only in the DM's head.

`related_location_ids` is **not** that mechanism and is not being made into one. It is a bare `uuid[]` with no meaning to its order, no type and no direction, and it earns its keep at map scale — trade routes, tunnels, connected districts. A crawl needs direction, a name, and a reason a door will not open.

- A door has a `label` (free text: "iron grille", "collapsed stair" — read aloud rather than branched on) and, since #868, a `door_kind` (`door` | `arch` | `stair` | `shaft` | `portal`). #785's original line here said "an enum of passage kinds is a taxonomy nobody asked for" — and for *labels* that still holds: the label stays free text and stays what is read aloud. The kind answers a different question. It is not read aloud; it is branched on — by the renderer (an arch draws thin, a stair draws as a stair) and by the levels rail (which lists only the vertical kinds, `VERTICAL_DOOR_KINDS` = stair/shaft) — and that is the line between a label and a kind: one is prose, the other is a closed list a renderer must exhaustively handle. `src/types/locationDoor.types.ts` carries this distinction in its header comment. A door also has `is_one_way`, `starts_locked` with a `lock_note`, and `is_secret`.
- **`source_edge_key`** ("14,6:W" in the map's own cell space) and **`dungeon_feature_id`** (nullable FK to `dungeon_features`, `on delete set null`) arrive with the same migration. `source_edge_key` is null for every hand-made door, forever, and lets a re-publish from the Cartographer update the door it derived instead of duplicating it. `dungeon_feature_id` closes a two-catalogues-one-fact gap: a "Secret Door" feature and a door with `is_secret` used to be the same fact recorded twice, with the perception DC retyped into `lock_note` as prose. Only three of the seven `DUNGEON_FEATURE_TYPES` — Secret Door, Hidden Passage, Moving Wall — *are* connections, so a door may *cite* a feature rather than folding features into doors outright; a door's own guard trigger checks the cited feature is the caller's own.
- **Authored prep only.** `starts_locked` and `is_secret` are what the DM prepared. Whether the party has since opened or found it is *play* state and belongs to the durable-site-state log (see below), keyed on the site the door's two spaces share. A live `is_locked` here would give that fact two homes, one of them without provenance or undo.
- `location_doors_endpoint_guard` originally required **both ends to be rooms sharing one parent**; #868 widened it to **both ends being bindable spaces sharing one parent** — a room, or a nested site with its own floor plan (`private.location_can_hold_rooms`, the same predicate `bindableSpaces()` in `tiers.ts` mirrors for the region-binding guard). A level is a sibling site, so a stair between Level 1 and Level 2 is one row under the same rule that already covered a courtyard's own doors. Without the guard at all a "door" could join two spaces in different dungeons, or a room to a continent, and every consumer would have to re-derive what a valid connection is — exactly the hole `metadata.room_ids` left by validating only that an id existed.
- Unique on `(from, to, label)` rather than the pair, because two rooms may genuinely have two connections — a main door and a secret crawlspace. Same rule, and same reason, as `quest_beat_edges`. `source_edge_key` gets its own partial unique index, `(from_location_id, source_edge_key)`, as the publish's safety net alongside its client-side edge-key match.
- **On a room, "Related Locations" defers to "Ways out".** Two lists of what a place connects to, in two different mechanisms, is the duplication the Interiors tier group had before #783. Every non-room type keeps Related Locations unchanged.

Cover: `supabase/tests/location_doors.test.sql`.

**Client side** (`useLocationDoors.ts`, `LocationDoors.vue`, plus `lib/locations/doors.ts` and `SiteWaysOutPanel.vue`/`DoorFeatureCard.vue` since #868). The room-level "Ways out" panel (`LocationDoors.vue`) mirrors `SiteRoomsPanel` / `LocationPlacements`'s shape — self-contained, always-editable, keyed off scalar props (`roomId`, `parentId`) rather than a route param. It always creates a door with `from_location_id` = the room it's mounted on; the composable then merges that room's outgoing doors with any *bidirectional* incoming door (`to_location_id` = this room, `is_one_way = false`) into one list told from this room's point of view. That merge — `doorsFromRoomPerspective` — moved out of `useLocationDoors.ts` into `lib/locations/doors.ts` (#868), because a site-level reader needs the exact same merge and there must be exactly one implementation; `useLocationDoors.ts` re-exports the name so its existing callers read unchanged, and a site-scoped caller reaches for the same function under the alias `doorsOfSpace` so its own code doesn't say "room" about something that might be a nested dungeon level. A one-way door leading *into* a space is deliberately dropped from its list: it is not a way out of it. The room-level picker restricts candidates to sibling rooms (same `parent_id`, type `room`, excluding self) rather than re-deriving the endpoint guard client-side; a rejection from the trigger still surfaces as a toast. Each row's label is inline-editable (same lazy-commit `AppInput` pattern as `LocationPlacements`' note); on `LocationDoors.vue` the three flags, `door_kind` and `lock_note` are set at add time only and shown afterward as read-only markers, not live toggles — editing an authored flag there is a delete-and-recreate, not a switch to flip.

**`SiteWaysOutPanel.vue`** (#868, frames 03/06/11) lifts the same list to the site: a DM wants to see all eight of a dungeon's doors at a glance, not walk into each room in turn to find them. It reads `useSiteDoors` directly — every door whose origin is one of the site's own bindable spaces — so it never needs the incoming-door merge itself (a door between two children of this site always has its `from` side among the site's own spaces already). Unlike the room-level panel, the three authored flags, the `door_kind` picker and the governing feature are all **live**, editable in place after creation: only the *endpoints* are a delete-and-recreate. `DoorFeatureCard.vue` renders whatever feature a door cites — name, type, trigger, and its DCs read from where they were authored rather than retyped — and is reused verbatim by the run surface (below). A `verticalOnly` prop renders the frame-06 "Vertical ways out" variant (filtered to `VERTICAL_DOOR_KINDS`, read-only, no add form) for the levels rail to mount without also offering to author a new door from that context.

**Durable site state** (`location_state_events` + the `location_state` view, migration `20260904062741`, [#787](https://github.com/irongollem/grimoire/issues/787)). What is explored, cleared and looted is a fact about the **world**, not about the quest that happened to be running. A party is in one place and on many quests at once, and two chains routinely converge on the same vault — so if this hung off a beat, the two would hold contradictory ideas of the same rooms. It hangs off the room, and a party returning four sessions later on a different chain finds the reliquary still looted.

An append-only **log**, not booleans on `locations`, for three reasons:

1. "Looted three weeks ago" is a claim someone will need to take back, and undo against a boolean is just another write with no record that the first one happened.
2. Provenance — who said so, and when — is the difference between state a DM trusts and state they second-guess.
3. A later story may want to know which quest a fact was asserted during. On a log that is `alter table add column`; on a boolean it is a backfill that cannot be done, because the information was never kept. Worth recording that #797 shipped **without** taking this: a beat stages at a place, but site state stays a fact about the world and deliberately does not record which chain was open when it changed — the reason the state hangs off the room in the first place.

A quest-wide rule may watch a place's fact directly (#869, `quest_consequences.on_location_id`/`on_location_fact`) — see "one rule engine" in quests.md.

**A door has play state too, since #868** (`location_state_events.door_id`, migration `20260908215644`, frames 08/16). #787 deliberately did not extend the log to doors, because nothing read door state yet — the run surface now does. `door_id` is nullable and, when set, `location_id` is repurposed to mean the *site* the door's two spaces share (the endpoint guard already guarantees they share one), which keeps a door fact inside the same RLS the log already has, keeps a site-wide read to one `.in()` query, and keeps "what is the state of this dungeon" answerable from one column. Two new facts, gated by a `fact_check` constraint that is now a disjunction — `door_id is null` admits `explored`/`cleared`/`looted`; `door_id is not null` admits `unlocked`/`found` — so a door fact and a location fact can never be confused for each other. No new table: "0 new tables" holds, and a second log for the same kind of fact is the shape #780 exists to remove. The `location_state` view widens to `distinct on (location_id, door_id, fact)`; `create or replace view` resets `security_invoker`, which is exactly how `ai_generation_costs` leaked (see the Sanctioned Exceptions entry in CLAUDE.md), so the migration restates it explicitly rather than trusting the prior setting to survive.

Client side: `useDoorStateForSite(siteId)` batches a site's door facts in one query, the same reason `useLocationStateForRooms` batches room facts, and `useAssertDoorState()` is a typed wrapper over the same append-only `useAssertLocationState()` mutation, narrowed so a caller can't accidentally build a door assertion missing `door_id`. `reachableRoomIds` (`lib/locations/siteRun.ts`) takes a third argument now, `unlockedDoorIds: ReadonlySet<string>` — consulted only for a door that `starts_locked`, never as a way to lock a door the table doesn't otherwise think is locked, exactly as the story predicted when it shipped without this. `starts_locked` itself stays authored prep and is never mutated by play.

**Undo is appending the opposite assertion.** UPDATE and DELETE are revoked from `authenticated`, exactly as on `quest_beat_transitions`.

- **Absent is not false.** A location with no rows for a fact has never had anything said about it; that is different from an explicit `false`, and the UI must not collapse them. "We have not been there" and "we went and it was empty" are different sentences.
- **Ordering is `seq bigint generated always as identity`, not `created_at`.** This was a real defect caught by its own test before it shipped: `created_at` defaults to `now()`, which is *transaction* time, so two assertions written in one transaction carry an identical timestamp and the tiebreak fell to a random uuid — "the newest assertion wins" passed or failed by coin flip. `created_at` stays, because it is what a DM reads; the sequence is what orders.
- **The view is `security_invoker = true`,** and that is not optional. A view without it executes as its owner and RLS is evaluated against the *executing* role, so it would hand every caller every DM's site state — the `ai_generation_costs` leak (`20260828202800`). `supabase/tests/view_security_invoker.test.sql` asserts this structurally for every view; this migration's own test pins it for this one.
- Deliberately **not** recorded: a session id. `campaign_session_state` has `UNIQUE (campaign_id)`, so there is one row per campaign reused across every evening and its id never changes — storing it would say nothing about which session a fact belongs to. (`encounter_state.session_id` has the same limitation.)
- Not room-only: a district can be cleared and a whole dungeon looted. The panel decides where it is worth showing.

Cover: `supabase/tests/location_state_events.test.sql`.

**Readable by every DM of the campaign**, not only the author — deliberately wider than the neighbouring content tables. `traps`, `puzzle_rooms` and `location_placements` are owner-scoped on select because they are authored *possessions*; a trap you wrote is yours. This is not that. It records what happened to a shared world, and two co-DMs each seeing only their own assertions would mean the vault is looted for one of them and pristine for the other — the split-brain the story exists to prevent.

**Client side** (`useLocationState.ts`, `LocationStateControls.vue`). Three toggles on any location; clicking appends the opposite of the current value, or `true` from unknown. The three states are visually distinct at rest rather than on hover, because "never said" and "said no" are different sentences: unknown is a neutral outline, explicit false a soft danger pill, explicit true a strong success pill. Provenance — who asserted it and when — is on the tooltip. `useLocationStateForRooms` batches the whole rooms panel into one `.in()` query rather than one per row, and `SiteRoomsPanel` shows read-only glyphs for explicit-true assertions only, so an unasserted room stays visually quiet.

**A room can hold and drop loot, the same as a beat** ([#830](https://github.com/irongollem/grimoire/issues/830) — full mechanism, `loot_placements`, in [quests.md](quests.md)). `LocationLootPanel.vue` is the "Loot" section on any location that has a campaign (`LocationDetailSections.vue`, right after Progress — dropping loot is what flips this section's Looted pill, so they sit together) and again inline on the current room in `SiteRunSurface.vue`'s live run. The quest cockpit's site handoff (`QuestSiteHandoff.vue`, [quests.md](quests.md)) shows the current room's loot too, but through the shared entries list alone (`LootPlacementList.vue`) — preparing loot for a room stays on the room's own surfaces. The panel shares that entries list with the beat's combined payoff list (`QuestPayoffPanel.vue`) but has its own prepare form, because a room can additionally roll a loot table into a held chest, which a beat has no use for. `dispatch_loot` records the room's `looted` fact server-side as part of the drop; the panel only invalidates the `location_state` query cache afterward so `LocationStateControls` picks it up without a reload — it never writes the fact itself.

**Arrival** (`mark_arrival_explored`, migration `20260904135558`, [#790](https://github.com/irongollem/grimoire/issues/790)). Moving the party now fires something. A trigger on `campaigns.current_location_id` records the party's **first** arrival at a place as an `explored` assertion in the #787 log.

It deliberately does **not** add an arrivals table. "The party has been here" and "this place is explored" are the same fact, and a second store for one fact is the shape [#780](https://github.com/irongollem/grimoire/issues/780) exists to remove.

- **First arrival only.** The log answers *has* the party been here, not how many times, and a row per visit would bury a DM's own assertions under machine noise. Per-visit history is a different fact and would want its own row shape, not a flood of duplicates here.
- **The guard reads the newest assertion, not mere existence.** A DM who explicitly marks a place un-explored has *said something*, so walking back in re-asserts it.
- **`is distinct from`, not `<>`,** in the trigger's `WHEN`. The first move is from NULL, where `<>` evaluates to NULL — the trigger would have silently skipped the one arrival every fresh campaign is guaranteed to have.
- **Fails safe.** With no authenticated user the trigger returns without writing, rather than failing the update: a party that cannot move is far worse than a missing log row.
- `SECURITY INVOKER` and revoked from `public`, `anon` and `authenticated`, so it adds nothing to the advisor's definer count and stays off the PostgREST surface.

Cover: `supabase/tests/party_arrival.test.sql`.

**Clickable spaces on a site's map** (`location_map_regions`, migration `20260904142401`, [#784](https://github.com/irongollem/grimoire/issues/784), [#805](https://github.com/irongollem/grimoire/issues/805), [#807](https://github.com/irongollem/grimoire/issues/807) and [#818](https://github.com/irongollem/grimoire/issues/818), epic [#780](https://github.com/irongollem/grimoire/issues/780)). A site-tier place can show its map with clickable spaces traced onto it: the **image** (`locations.map_url` — a Cartographer bake, an uploaded scan, a photo of a hand-drawn page) with **regions** over it (`location_map_regions` rows, each a set of grid cells bound to a child location). A DM can trace clickable spaces straight onto a scanned page without ever opening the Cartographer.

**One map surface, two layers (#807).** #784 and #805 built this as its own view (`SiteMapView.vue`), stacked *underneath* the ordinary pin map (`LocationMap.vue`) in `LocationDetailSections` — so a site-tier place rendered `map_url` twice, once with pins and once with regions, and a room could be both pinned on the parent's map and traced on this one at the same time. #807 deleted `SiteMapView` and moved its canvas into `MapRegionsLayer.vue`, a sibling of `MapPinsLayer.vue` mounted inside the same `MapFrame.vue` slot `LocationMap.vue` already used for pins — so the image, the zoom/pan, and the client-point → image-fraction conversion (`MapFrame`'s `toImageFraction`, extended with the frame's own `imageNaturalWidth`/`imageNaturalHeight` so no second `<img>` has to duplicate that reading) are each one implementation shared by both layers, not two. Rooms lost their pin eligibility in the same change — see "By pinnability" above — so a room is now designated on its parent's map by exactly one mechanism, a region, never both.

- **The grid is anchored to the image, never to what has been traced on it.** Cells are resolved through `locations.grid_calibration` by `src/lib/locations/gridCalibration.ts` — `gridExtent` for the extent, and `cellAtImageFraction` / `cellRectInImageFractions`, which are exact inverses so a cell you can click is a cell you can draw in the same place. #784 originally derived the extent from the union of the painted map and the traced regions, which meant **tracing a shape resized the coordinate space the shape was traced in**: the map visibly shrank, and — the dangerous half — the picture was re-stretched under every earlier region, so they silently stopped lining up with the features they were traced over. A grid over *nothing* has no intrinsic extent, which is why the extent had to come from its contents; anchoring to the image removes the need. `resolveGridBounds`, `DEFAULT_GRID_BOUNDS`, `regionsBoundingBox`, `GRID_PADDING_CELLS`, `cellAtPoint` and `fitTilePx` are gone.
- **`grid_calibration` was already the answer, and is now shared.** It predates this work (`GridCalibrationDialog.vue` + `src/lib/battlemap/gridCalibration.ts`, built for battle maps) but was never VTT-specific in practice: `useMapExport` writes one on *every* Save to Atlas regardless of `is_battle_map`. Converging on it means a DM who traces rooms on a scan and later ticks "Battle map" is not asked to calibrate the same picture twice. It gained `origin_cell_x/y` because the bake insets the drawing by `DEFAULT_BAKE_PADDING_CELLS`, so a baked image's cell (0,0) is not the map's — without recording that offset a region traced on a bake could not be matched to the `CellMetadata` authored underneath it.
- **Three states, and no invented default.** No `map_url` → no map surface at all, just a prompt. An image but no calibration → the map, read-only, with one action to calibrate. Both → the grid and tracing. A guessed calibration is deliberately *not* seeded: `!!grid_calibration` also gates the VTT (`EncounterRunner.vue`, `PlayerEncounterPanel.vue`), so a made-up value would silently switch those on at the wrong scale.
- **Gated on presence, not on tier (#807).** [#810](https://github.com/irongollem/grimoire/issues/810) widened the site tier to include store, tavern and inn, so gating this apparatus on `isSiteType()` alone would grow every shop a "Room shapes" list, empty and permanent, since most venues will never trace a single room. `LocationMap.vue` instead shows the canvas overlay, the calibration prompt and `SiteMapRegionList` only once the site actually **has** a room or a region (`rooms.length > 0 || regions.length > 0`) — a presence question, not a taxonomy one. This isn't a dead end: a room is added first through the always-present `SiteRoomsPanel` (unconditional on site tier), and the apparatus reveals itself the moment one exists.
- **The binding is relational; the geometry is not.** `space_location_id` is a real FK (cascade), `cells` is a jsonb array of `CellKey` strings — the same split `location_placements` and `location_doors` make, and deliberately not the shape `metadata.room_ids` left behind. `site_location_id` is required even on an unbound region, because a DM traces shapes off the page first and names them second; `space_location_id` null means exactly "traced but not yet named", not broken. A partial unique index allows only one *bound* region per space while several unbound ones coexist; a trigger (`guard_location_map_region_space`) rejects binding to something that is not a child of the site it is drawn on, or that has no footprint on this map.
- **A region binds to any addressable space, not only a room** ([#818](https://github.com/irongollem/grimoire/issues/818)). A room, or a *nested site* — a `grounds` courtyard inside a dungeon occupies an area of the dungeon's floor plan exactly as a room does, and tracing its footprint to click through into it is the same descent a pin already gives, drawn as a polygon instead of a point. The column was called `room_location_id` until #818 and was renamed rather than stretched: a name that says `room` while holding a `grounds` id is the kind of thing that gets misread later. `bindableSpaces()` in `lib/locations/tiers.ts` mirrors the guard's type half so the picker never offers what the database will refuse — the database stays the authority, and a rejection still surfaces as a toast.
- **There is no second image column, and an earlier draft's `underlay_url` was removed before it shipped.** `map_url` already *is* the picture of a place whatever its provenance, and `is_map_shared` already decides whether players see it. Two columns meant this panel reported "no map yet" on a site that plainly had one, because it consulted only its own field — the same two-answers-to-one-question shape the epic exists to remove. Regions overlay `map_url`; the location editor owns that field, and this layer has no uploader of its own.
- **There is no live Cartographer canvas here any more, and that is deliberate.** #784 rendered `dungeon_maps.layers` live, over the image, and the migration header called that "the point". It was not: `map_url` and `source_map_id` are written together by Save to Atlas, so **the bake already is the render**, and drawing the tiles over their own bake shows the same picture except when the map was edited without re-baking — for which the answer is re-baking. Deleted with it: `useSiteMapRuntimes.ts`, `layersBoundingBox`, `collectUsedPackRefs`, and `renderMap`'s `transparentBackground` option (the engine is back to an unconditional opaque ground, untouched by the Atlas). What #789 needs from the Cartographer is cell *data* — keys joining `CellMetadata` — not a second renderer.
- **Client side** (`MapRegionsLayer.vue`, `SiteMapRegionList.vue`, `useLocationMapRegions.ts`, `src/lib/locations/gridCalibration.ts`, `src/lib/locations/siteMap.ts`, `src/types/locationMapRegion.types.ts`). `MapRegionsLayer` is mounted by `LocationMap.vue` — the one composite, alongside `MapPinsLayer` — for site-tier locations with the presence gate above satisfied; each caller (`LocationSheet`, `AtlasPlacePane`, `SiteRunSurface`) fetches its own `rooms`/`regions`/`calibration` and passes them in, the same way each already passed `pins`. `SiteMapRegionList` (the "Room shapes"/"Untitled shapes" CRUD list) is mounted by `LocationMap.vue` too, in browse mode only — mirroring how the pins layer's own "Unplaced children" list already lived inside `LocationMap.vue` rather than in a caller. The image renders through `MAP_IMAGE_SIZING` — the shared constant every layer uses — so none of them can disagree about its size; `siteMap.ts` is down to `toggleCell` and `isCellOnImageGrid`.
- **Tracing is drag-to-paint.** The direction locks on the first cell touched — already in the region means the whole stroke erases, otherwise it paints — so dragging back over a cell cannot flicker it. Cells render live during the stroke, and the release commits **one** mutation rather than one round trip per cell. Because `useUpdateLocationMapRegion` invalidates rather than writing through, the committed cells are held in a local optimistic ref until the refetch carries them back; without it the shape snapped to its pre-drag state for one round trip, which is the same "nothing happened until later" the drag was built to fix.
- **Interaction otherwise**: with no region selected, clicking a bound region's cell navigates to that room; clicking an unbound region's cell selects it for naming. Rooms with no region yet are still listed (not hidden), so a site is usable before it is fully traced. This section's original line here said "deliberately a grid, not a freeform polygon tool" — #868 makes that no longer true; see "Tracing: paint, pen and template" below for the pen tool that traces a genuine polygon.
- **Pointer handling survives `MapFrame`'s pan/pinch capture without changing it.** `MapFrame` calls `setPointerCapture` on itself for most gestures, which retargets a descendant's own `pointermove`/`pointerup` listeners away from it — the same problem `MapPinsLayer`'s pin-drag already solved by listening on `window` instead of on the pin element. `MapRegionsLayer` uses the same idiom: `pointerdown` starts locally (captured or not, the initial event still reaches it), then `window`-level `pointermove`/`pointerup` track the rest of the gesture — a drag-to-paint stroke when a region is being traced, or a plain tap-to-navigate otherwise. This needed nothing new from the frame's gesture code — only an additive exposure, `imageNaturalWidth`/`imageNaturalHeight` (read off the frame's own `<img>`, so no second image element has to duplicate that measurement).

Cover: `src/lib/locations/siteMap.test.ts` (grid bounds, click-to-cell mapping, cell toggling, pack-ref collection — the pure logic only; rendering itself is exercised by `src/cartographer/renderMap.test.ts`, unchanged by this feature).

**Regions have a role** (`region_role`, migration `20260908215640`, epic #868, frames 07/09/12). Until now a `location_map_regions` row was either bound to a space or "traced but not yet named", and that single ambiguity is why terrain, darkness and triggers ended up as prose in a room's description — there was no way to draw a shape on the plan that was deliberately *not* a room. A **zone** is the same geometry with a role (`region_role = 'zone'`) instead of a binding: `zone_kind` (`terrain` | `hazard` | `light` | `trigger` | `marker`), and `zone_payload` jsonb for hints the renderer and run surface read but nothing enforces — `movement_cost`, `depth_ft`, `light_level`, `trap_id`, `encounter_id`, `beat_id`, `visible_to_players` (`ZonePayload` in `src/types/locationMapRegion.types.ts`). A DB biconditional (`region_role = 'zone'` iff `zone_kind is not null`) means a row cannot be a zone of no kind or a space that claims one.

- **Why a role column and not a second table.** The geometry, the cell space, the calibration, the drag-to-trace canvas, the RLS and the guard trigger are all already built for regions; a parallel `location_map_zones` table would duplicate every one of them so the two could disagree about the same map. `guard_location_map_region_space` widens to four extra lines: a zone must bind to nothing. That is what makes "unbound" unambiguous again — an unbound *space* is unfinished, an unbound *zone* is finished.
- **A zone never binds** — not because nobody built the FK, but because a zone belongs to the plan rather than to a room: an ash-fall that straddles the nave and the corridor is one zone, not two. `guard_location_map_region_space` (widened by the same migration) raises if a zone-role row is given a `space_location_id`.
- **Provenance and identity across a re-publish**: `derived_from` (`dm` | `floodfill` | `annotation`, default `dm`) is a one-way ratchet — anything the DM has touched reads `dm` and is never overwritten by a re-publish, only offered — and `cell_signature` is a stable hash of the derived cell set, so "the Cistern shifted one east" is recognised as the same room rather than one deletion plus one creation. Both are null for every hand-traced region, forever.
- **`vertices`** is the pen tool's ring — an ordered array of `[x, y]` grid points, halves allowed. Null means a plain painted region (`cells` is authoritative, exactly as before this migration); set means `cells` is *derived* from the ring and cached, so everything downstream keeps asking "which cells?" and always gets an answer. See "Tracing" below.

Client side: `src/lib/locations/zones.ts` (pure — `ZONE_KIND_FILL` colours, `zoneSummary()` for the one-line read-out, `isPlayerVisible()`, `emptyZoneInsert()`), `SiteMapZoneList.vue` (the zone-CRUD sibling of `SiteMapRegionList`, mounted alongside it by `LocationMap.vue` in browse mode — same lifted-`activeRegionId` convention, same per-kind payload editor with fields that vary by `zone_kind`), `SiteMapLayerBar.vue` (the layer toggles, reading/writing `useUiStore().siteMapLayers` — `spaces`, `ways`, `zones`, `prepared`, `grid`, no v-model needed since every flag is session UI state), and `SiteMapLegend.vue`. Zones are DM ink by default (`visible_to_players` absent means false, not unknown); the player-visible projection clips a shown zone to the party's own explored cells (see "The player's plan is composed, not masked" below).

**The Atlas place pane gains new apparatus** (epic #868, frames 02/03/06, gathered by `useSiteStructure.ts`). `AtlasPlacePane`'s readiness meter, its map-mode source strip, its layer bar and its levels rail all need the same facts about a site — its bindable spaces, its traced regions, its door graph, and (when it has one) the Cartographer drawing it was last published from. Gathering each of those independently is how a readiness pill and a staleness strip end up disagreeing about the same site, so `useSiteStructure(location)` is the one composable that gathers them all once.

- **Readiness** (`siteReadiness()`, `lib/locations/siteReadiness.ts`, `SiteReadinessMeter.vue`) — the site analogue of the Quest Board's gap chips: five checks in a fixed order (mapped, calibrated, traced, bound, ways out). `bound` folds two different gaps under one flag — a region traced but never bound to a room (`unboundSpaces`), and a bindable child with no region bound to it at all (`untracedSpaces`) — because a DM fixing either one is doing the same job: making the floor plan agree with the room list. The single `caption` reports whichever is cheaper to fix first: an unbound shape is a one-click pick, an untraced room needs new ink drawn.
- **Source strip and staleness** (`SiteMapSourceStrip.vue`, `publishStaleness()` in `siteReadiness.ts`). `dungeon_maps.rev` (migration `20260908215643`) is a revision counter bumped by trigger whenever a map's `layers` or `metadata` change — renaming or retagging a map does not count, so those saves leave `rev` alone. `locations.map_published_rev` records which rev the site's last publish carried; null means "never published from the Cartographer" (a scanned page, a photo). `publishStaleness()` is null when there's nothing to compare (no source map, or the last publish already carries the current rev) — the fresh state the strip renders — and otherwise diffs `structureFromSite()` (a minimal `DerivedStructure` rebuilt from the Atlas's *own* regions and doors' `source_edge_key`s) against a fresh `deriveStructure(map)` with the Cartographer's own `structureDelta`, the same diff the publish review itself uses.
- **`AtlasSiteMapMode.vue`** (split out of `AtlasPlacePane.vue` once that file's template passed the 300-line soft max) — everything specific to *looking at a place's drawing*: the stale-only source strip, the levels rail, the map itself with its up-one-level overlay and Ways-out aside, and the zoom transition between two maps. `AtlasPlacePane` keeps identity, the Contents/Map toggle row, and Contents mode. Readiness (Contents mode) and the layer bar (Map mode) share the same row beside the scale rail, per frame 02's "beside the scale rail on the Contents/Map row". Switching to Map mode on a site folds the location tree if it was already open (only what the pane itself folded is restored on the way back out — a DM who folded the tree on purpose beforehand finds it still folded).
- **Levels rail and reuse** (`SiteLevelsRail.vue`, `SiteLevelReusePanel.vue`, frame 06). "Not a new table — it lists this site's children that are themselves sites, ordered by `sort_order`." `AtlasSiteMapMode` decides *which* site's children to show (this site's own, when it has any; otherwise its parent's, marking this one active) since that needs the Atlas index, which the rail itself has no business holding. The reuse panel offers two starts: **Clone this level** (`lib/locations/cloneLevel.ts` + `useCloneSiteLevel.ts`) copies the floor plan, rooms and ways out — **never `location_state`, `loot_placements`, `location_placements`, or `map_published_rev`**: a clone is DM ink starting fresh, not a second copy of *play* that has happened, and `source_edge_key`/`dungeon_feature_id` on a cloned door are dropped for the same reason a room's own map/pins/sharing flags are (provenance of the original, or player-facing state that must not silently carry over to an unpublished copy). **Draw level N** opens a plain new Cartographer drawing for a freshly created sibling site — it does not pre-mark a stair cell as the frame's own caption imagines, because the Cartographer has no notion of a pre-placed object on a brand-new map yet, and a half-built promise is worse than an honest gap.
- **Descend by region.** `regionOrigin()` (`lib/locations/mapZoom.ts`) anchors a descent into a space via its *traced region* rather than a pin — "the same zoom a pin gives, drawn as a polygon" — averaging the centroid of the region's cell rects cell-by-cell (not by bounding-box midpoint) so an L-shaped room anchors inside its own footprint. `LocationMap.vue` emits `descend` when a bound region is clicked in browse mode; the caller decides whether that means an Atlas re-centre or a route push.
- **`LocationMap.vue` grew two slots and an emit for exactly this apparatus**: `#frame-overlay` sits inside the map's own box (used for the Atlas pane's "Up to `<parent>`" control, so it tracks the map regardless of what renders above it — a sibling element was what put that control over the layer bar once this component started rendering chrome above the frame); `#aside` sits in the 340px side column beside the space/zone lists in Map mode (where `SiteWaysOutPanel` mounts); and a `layer-counts` emit (`{ spaces, ways, zones, prepared }`) lets a caller read the same tallies the layer bar shows without deriving them a second time.

**Tracing: paint, pen and template** (epic #868, frame 12 "Three ways to trace a space"). Drag-to-paint (cells directly) was the only tool before this; two more now sit beside it, and the "deliberately a grid, not a freeform polygon tool" line the earlier section carried is retired — the pen genuinely traces a polygon.

- **The pen** (`src/lib/locations/polygon.ts`, `useRegionPen.ts`, `useRegionPointer.ts`) traces an ordered *open* ring of grid points (`vertices`), snapping to intersections by default or half-cells on modifier (a 45° wall needs the half). A ring being traced is *unsaved* until it closes on its own first node — that click is the only thing that ever writes a fresh `vertices` for the first time, which is what makes Escape a real "abandon" rather than a partial commit. Once a region has vertices at all, every further edit (drag a node, alt-click delete, double-click insert) mutates the *persisted* ring directly and commits immediately — there is no separate edit mode. `cells` is then derived from the ring (every cell whose *centre* falls inside it, even-odd rule) and cached, so everything downstream keeps asking "which cells?" and always gets an answer regardless of which tool produced them.
- **Templates** (circle, octagon, hex) reuse the Cartographer's own room-tool geometry (`cellsInCircle`/`cellsInOctagon`/`cellsInHex` in `src/cartographer/geometry.ts`) rather than reinventing it; `templateRing()` draws the same shape's *outline* so a template drop is stored as `vertices` and stays editable with the pen afterward.
- **Converting a pen-traced shape back to paint is a one-way, announced action.** Painting over a region whose `vertices` is set asks first — "Painting converts this pen-traced shape to cells — the diagonal edges are lost. Continue?" (`MapRegionsLayer.vue`'s `confirmConvert`) — because the diagonal genuinely cannot survive the round trip: cells are squares by construction. There is no path back from cells to the original ring.
- **Door bars on the plan.** `MapRegionsLayer.vue` draws each site's doors as bars on their originating edge (`drawWaysPass`), reading the same edge-key-to-canvas-point conversion the pen tool and template rings use, so a door drawn on the plan and a wall drawn by the pen agree about where an edge actually is.
- The drawing passes that used to live inline in `MapRegionsLayer.vue` moved to a dedicated, tested module, `src/lib/locations/planCanvas.ts` (#868 wave 2) — every render pass (floor, grid, zones, doors, the pen/template overlay) the component composes. The Cartographer-editor-side canvas is a separate module documented in dungeon-craft.md; this one is the Atlas plan's own renderer.

**Prepared marks on the plan** (`MapPreparedLayer.vue`, `lib/locations/preparedMarks.ts`, `useSitePrepared.ts`, `useSitePlacements.ts`, epic #868, frames 08/10). Traps, features, puzzles, encounters and loot are already authored, already reusable, and already anchored — to a room by `location_placements`, to a cell by `source_cell_key` (migration `20260908215643`), or to a host feature. `resolvePreparedMarks()` is the one place that turns those anchors into a drawable point, so the map layer and the reverse "Placed in" lines on Dungeon Craft's own grid cards (see dungeon-craft.md) agree about what a DM sees, because both read the same resolution.

- **The two anchors, reconciled**: a cell wins on position — `source_cell_key`, when set, always draws there — and a room wins on membership when there is no cell, drawing at the room's own centroid (`planSvg.ts`'s `centroid`). A mark with neither is dropped; there is nowhere on the plan to put it.
- **"No markers for tables."** Roll tables and loot tables are placements too, but frame 10 is explicit that they never get a marker on the plan — a table is prep for a *roll*, not a thing standing in a room.
- Six kinds, one disc each (`PREPARED_MARK_KINDS`): `trap`, `feature`, `secret_feature`, `puzzle`, `encounter`, `loot`, each with its own colour (`MARK_COLOURS`) and a shared ring colour (`MARK_RING_COLOUR`) so a Prepared-layer disc reads as one family regardless of kind. `MapPreparedLayer.vue` renders them as an SVG overlay (not canvas) inside `MapFrame`'s transformed slot, between `MapRegionsLayer` and `MapPinsLayer` in stacking order — a token on the floor, not a pin above the whole map — because a marker needs a crisp vector glyph and a native hover title, neither of which a canvas gives for free.
- `useSitePrepared(spaceIds, regions)` gathers every placement across the site's rooms (`useSitePlacements`, one `.in()` query across a site's bindable spaces rather than one query per room) plus the four campaign-scoped catalogues a placement's `*_id` points into, and feeds both the map layer and the layer bar's "Prepared" pill / `SiteMapLegend`'s per-kind counts.

The "Prepared Here" panel and its "from map" chip (a placement drawn on the site's plan through Publish, versus added by hand from the room sheet) are documented in dungeon-craft.md's "Placed in" section — `location_placements.source_cell_key` is the same column powering both.

**The site runner** (`SiteRunSurface.vue`, `lib/locations/siteRun.ts`, [#791](https://github.com/irongollem/grimoire/issues/791), epic #780 Phase 1; rebuilt entirely by epic #868 wave 3, frames 08/11). #791 built three static zones — the place, the current room, and a context sidebar — composing `LocationStateControls`, `LocationPlacements` and `LocationDoors` inline. #868 replaced that with the maintainer's framing for the story: **a room is a zoomed-in beat**, so the current room reuses the beat's own presentation pieces rather than inventing room equivalents, and the surface is now a header plus three columns rather than three zones.

- **`SiteRunHeader.vue`** — the site's name, a "Running" / "Running · `<quest title>`" caption, the party's pulsing "Party in `<room>`" chip, a "Back to the beat" button when a beat is staged here (routing to the run cockpit, at that beat — the only place a beat actually resolves), and Stop Running.
- **The rooms list** (`SiteRoomList.vue`, `run-captions` mode) is still the plain click-to-move list that makes a site runnable before any of it is traced — unchanged in that role from #791 — now with frame-08 subtitles: a room whose only known doors are all secret and undiscovered gets its own caption rather than a plain "Reachable" (a presentation signal computed in the component, not a second reachability graph), and the party's own room additionally shows its active zone's name if one covers it.
- **The map**, via `LocationMap.vue`'s `run-mode`, unchanged in mechanism from #791 (region palette swaps to party-here/reachable/unreachable/untraced, click-to-move instead of click-to-navigate) but now sits above `SiteRunRoomStack.vue` rather than beside a room-detail column.
- **`SiteRunRoomStack.vue`** is the room's own stack — "what bites, what fights, what hides, what to roll, and what to hand over," in that fixed order, because that is the order a DM actually needs to know about a room in. `buildRoomStack()` (`lib/locations/roomStack.ts`, colocated-tested) resolves it from the same prep rows the Prepared layer already draws: traps and roll tables from this room's `location_placements`, encounters placed here or reachable through a `trigger`-kind zone over this room's cells, undiscovered secret ways out (via `doorsOfSpace`, dropped once a door's `found` fact is asserted true), and held loot. The room's description **is** its read-aloud; its placements **are** its attachments — this module is the one genuinely new thing a room needs of its own. Loot rows resolve in the pure module for completeness and testing but render through `LocationLootPanel` instead of a generic prompt, since dropping loot needs the full `LootPlacement` object (delivery state, claims, chat link) a generic row can't carry.
- **`SiteRunBeatCard.vue`** is the frame-08 beat card — the same read-aloud presentation `QuestRunBeatCard` uses, for the one case where a DM opened a site straight from the Atlas and a beat is waiting here with no quest cockpit open. "Resolve beat" and the header's "Back to the beat" both go to the run cockpit, because that is genuinely the only place a beat resolves.
- **`SiteRunWaysOut.vue`** ("Ways out of the `<room>`") gives Move / Unlock / Reveal per door — the two door facts (`unlocked`, `found`) landing in the append-only state log via `useAssertDoorState`, never on the authored flags — reusing `DoorFeatureCard.vue` for whatever feature governs a door.
- **Progress** stays `LocationStateControls` on the current room, unchanged.
- **Prompts, not automation** remains the surface's own rule, restated in its own copy: "Nothing on this surface fires because a token moved." Moving the party is still one write to `campaigns.current_location_id` (`useSetCampaignLocation`); the arrival trigger (`mark_arrival_explored`, #790) records `explored` on its own, so this surface never writes `location_state_events` directly except through the two door-fact actions above.
- **`useBeatsStagedAt`** (`composables/quests/useBeatsStagedAt.ts`) is the reverse read that answers "is a beat waiting here" — `quest_beats.staged_at_location_id` already names the place; this is the same reverse-read direction `useSitePlacements` takes for placements and `useSiteDoors` takes for doors. A beat staged at the party's current room outranks one staged at the site in general; ties break on most-recently-updated.
- **Out of scope on purpose, still**: the surface has zero references to any `quest_*` *table* beyond that one reverse read — resolving a beat, editing quest content, and the site handoff panel remain the quest cockpit's own job (`QuestSiteHandoff.vue`, quests.md).

Cover: `src/lib/locations/siteRun.test.ts` (reachability graph, party-room derivation — pure logic only), `src/lib/locations/roomStack.test.ts` (the fixed-order stack, pure logic only).

**Ambience follows the party during a session** (`usePartyAmbience`, mounted once in `DefaultLayout`; inheritance added by epic #868, story S7, frame "14 Room audio"). `locations.audio_theme` had existed since July 2026 driven by exactly one thing: a location *sheet* being open. So during a live session, clicking any location in the Atlas hijacked the table's ambience — the music followed what the DM was browsing rather than where the party was.

- **Gated on a running session.** Following the party is a *play* behaviour; a DM tidying the Atlas on a Tuesday must not start music by changing a dropdown. Outside a session, sheet-driven preview is unchanged and worth keeping.
- **A themeless room inherits, it does not go silent (#868).** Before this, a room with no `audio_theme` of its own was read as a release, so a dungeon themed once at the site went silent the instant the party stepped into any room beneath it — theming seven rooms meant seven trips through the edit form. `resolveInheritedTheme()` (`lib/locations/ambience.ts`, pure and Vue-free — exercised by both `usePartyAmbience` and `LocationSheet`'s prep-time preview) now walks `parent_id` toward the root, stopping at the first location with a non-blank `audio_theme`. The reserved value `SILENCE_THEME` (`isSilenceTheme()`, `lib/audio/audioThemes.ts`) is *authorable* silence: a DM can say "this room is deliberately quiet" without that reading as "not decided yet," and the walk stops at a silent ancestor exactly as it would at a real theme — a silent site under a themed continent stays silent rather than skipping past itself to inherit from further up. The walk is cycle-guarded the same way `lib/locations/tree.ts`'s `ancestorPath` is.
- **`sourceId` is keyed on the theme's *owner*, not on the room being asked about.** `resolvePartyAmbience()` requests under `partyAmbienceSourceId(resolved.from.id)` — the ancestor that actually owns the resolved theme — because `useAudioThemeTriggers`'s ambient slot dedupes a request against `ambientOwners` by `sourceId` but releases unconditionally, with no check for a second owner still holding the same target. Keyed on the room's own id instead, walking from one inheriting room to a sibling would request the already-playing scene under a *new* sourceId (a no-op) and then release the *old* one, stopping that same playlist outright — an audible dropout on every step through a themed dungeon, not a crossfade. Keyed on the owner's id, two rooms inheriting from the same ancestor resolve to the identical `sourceId`, so the watcher sees no change at all and neither requests nor releases anything when the party moves between them. `label` still names the room the party is actually in, not the ancestor — what a DM reads in the "why is this playing" chip.
- This namespace (`party:${locationId}`, keyed as above) stays distinct from the sheet's own `location:${id}`, so the two producers cannot steal the slot from each other.
- **Request-then-release ordering is load-bearing** in both producers: releasing first hands the slot back to whatever preceded the old location and then immediately takes it again, which is audible as a stop-start between two rooms that should cross over.
- Starting a session with a sheet open hands the slot over immediately rather than leaving a stray scene playing; ending one resumes the preview.
- **Held by slot separation, not by a precedence order.** The ambient slot the party's ambience occupies (`slot: "ambient"`) stacks — a location has no business stopping the scene a different location started, and the party can be in a dungeon and in a storm at once — while an encounter's own battle music (`EncounterRunner.vue`, `slot: "music"`) is exclusive and lives in a separate slot entirely. A room's ambience and an active encounter's music therefore coexist because they never compete for the same slot, not because either outranks the other.
- **Client side, per row** (`RoomAmbienceCell.vue`, on `SiteRoomsPanel`'s Ambience column). One component renders both the site-default row and every room row beneath it: it edits *this* location's own `audio_theme` column only, never the resolved value — for "Inherits" and inherited silence, the resolved theme belongs to an ancestor several rooms up, and editing it here would silently detach the room from that ancestor rather than override it as the DM intended. The prefix line ("Own theme →", "Inherits ·", "Deliberately silent →") and chip styling come straight from `ResolvedAmbience.kind`.

Widening `locations` at all means recreating `get_player_visible_locations`, which `returns setof locations` and lists every column positionally; `20260818081308` learned that the hard way and says so in its header.

**Bulk seeding**: `SETTING_LOCATIONS` data maps calendar IDs to preset location arrays (e.g. Faerûn towns). `PLANAR_LOCATIONS` covers the 21 cosmological planes. Both use a two-pass insert: all records first, then parent links resolved by name.

### Player View

Route: `/play/locations` (embedded in player portal via `PlayerLocationsView.vue`)

Players see only locations explicitly shared with them (`player_visible_to` contains their `party_member_id`). A location whose parent was not shared still appears at depth 0 so orphaned children are never invisible.

**List layout:** collapsible tree with depth-based left indentation (16 px per level). Two toggles per entry:

- **Main bar** (click) — expands/collapses child locations; shows a chevron indicator when shared children exist
- **Details button** (Eye icon, right side) — toggles an inline detail panel below the entry

Collapse/detail open state is persisted in `useUiStore` (`atlasChildrenOpen`, `atlasDetailOpen`) so it survives in-session navigation.

**Filter bar:** text search (name, player_summary, and optionally shared description) + type dropdown; when filtering, the tree flattens to a simple matched list. A "Close all" button collapses all open panels.

**Detail panel contents** (when expanded with Details button):

- Sigil image (click → fullscreen lightbox overlay)
- Player summary text
- Interactive map (if `is_map_shared`): shows only pins with `visible_to_players = true`. Players can:
  - Click a shared pin → scrolls to and expands that location in the list
  - "Go there" pin action → same as click (scroll + expand)
  - "Watch" pin action → opens a bottom-sheet modal with the sub-location's art, player summary, and a personal notes widget (even for unshared sub-locations where the pin still provides denormalised name/image)
  - Pin token images are **re-hydrated from live shared child data** (`PlayerLocationDetailPanel` `sharedChildren` map): the denormalised `child_image_url` snapshot in `map_pins` goes stale when a child's image is later replaced (its old storage file is deleted → 404), which players saw as broken pin images (#502). Shared children resolve their current image; unshared children fall back to the snapshot. `LocationMap` also hides any pin image that fails to load, falling back to the child's initial letter
  - Compact / Full-size toggle
- Full description (only when `is_description_shared = true`)
- **Wares** (store/tavern/inn with `is_inventory_shared = true`) — rendered via `PlayerStoreWares`.
  A store row carries only an `item_id`; the name behind it comes from the
  `get_player_visible_items` projection, because players have no read path to `items`
  (owner-only RLS since `20260711000014`). Those are two caches with different lifetimes —
  the rows refetch on remount, the projection is `staleTime: Infinity` and, for a player,
  is invalidated by nothing (`items` realtime events are owner-gated, and `store_items` is
  not on the live-sync channel, #811). A shop revealed mid-session therefore listed its
  whole stock as "Unknown item" until a hard reload. `useSharedStoreItems` now refetches
  the projection once per unresolved `item_id`; the "not yet revealed" placeholder is the
  in-flight state only, never a steady one.
- **People in the Area** (when `is_npcs_shared = true`) — NPC cards showing display name, race, occupation (shapeshifter disguise respected via `getNpcDisplayName`)
- **Player notes widget** — personal notes tied to this location entity

**The player's own record of a site** (`PlayerSiteMap.vue`, `PlayerSitePlan.vue`, epic #868 story S9, frame 16 "Fog and player view"). #798 gave players `get_player_visible_site_state`, cut for a list — the rooms the party has explored, as rows. #868 (migration `20260908215645`) recomposes the same RPC into a plan: "masking is not the same as withholding — draw the map and then shade it, and everything drawn after the shade leaks: every door, the secret one included, and the walls of rooms nobody has entered." The RPC now returns `jsonb`, not `setof record`, and carries everything the player's plan is allowed to be made of, and nothing else:

- **`spaces`** — explored rooms only: cells, name, cleared/looted, as before.
- **`glimpsed`** — DERIVED, not stored: a space that shares a non-secret (or found) way out with an explored space, and is not itself explored. Footprint only — no id, no name, no contents. "A room, that way" — the same shape as the token layer's `unseen` versus `hidden`.
- **`ways`** — doors the party has stood beside (one endpoint explored), never a secret one unless it has been `found`. A locked door draws as a plain door: `starts_locked`, `lock_note` and `is_one_way` are withheld. An endpoint id is sent only when that space is explored.
- **`zones`** — only those the DM marked `visible_to_players`, clipped to explored cells only.

Never in the payload: unexplored geometry, secret ways out, lock notes, hazard glyphs, trap DCs, room notes, the door graph, or any region the party hasn't stood in — filtered in the RPC, not hidden in the component, because a thing absent from the payload cannot leak through a re-render, a zoom, or a curious devtools panel. `get_player_visible_site_state` needed a drop-and-recreate for the `jsonb` return type, which resets the ACL to the `PUBLIC` default (the same shape that let #650 happen); the migration revokes explicitly and `anon_rpc_surface.test.sql` still pins exactly five anon-reachable functions — this one is not among them.

`PlayerSitePlan.vue` is the pure SVG renderer (`lib/locations/planSvg.ts` for the cell-to-rect/outline geometry) — no baked image, no calibration, no pan/zoom frame at all, because there is nothing left to anchor an `<img>`-based overlay to once the RPC returns cell geometry directly. That closes the frame's "one honest limit": the old widget drew the DM's picture and shaded it, so a signed image URL still containing every room and door regardless of what the party had found sat in the payload the whole time. `PlayerSiteMap.vue` shrank to the card shell plus the accessible room list (name, Cleared/Looted glyphs) that sits beside the plan as its textual record, not nested inside it — the list renders even when nothing draws (#828), so a screen reader has the same facts the SVG (`aria-hidden`) draws visually. The deeper RPC history and the DM-side site-handoff surface are documented in quests.md.

**Advisor note (epic #868).** None of this epic's five migrations add a new client-reachable `SECURITY DEFINER` function: every new trigger function (`guard_location_map_region_space`, `guard_location_door_endpoints`, `guard_location_state_event_door`, `bump_dungeon_map_rev`) is revoked from `public`/`anon`/`authenticated`, since a trigger never needs the `EXECUTE` grant. `get_player_visible_site_state` is dropped and recreated (return-type change forces the drop) but was already counted in the advisor baseline from #798 — its explicit `revoke ... from public, anon` keeps it off the anonymous surface, and `anon_rpc_surface.test.sql`'s pinned set of five is unchanged.

---

## Quest Log

**Moved.** Quests are documented in [quests.md](quests.md) — the model (beats are
events, objectives are state), the schema, every DM and player surface, and the
runtime RPCs. [#780](https://github.com/irongollem/grimoire/issues/780) collapsed
the two generations into that one model and deleted the older one outright, so
there is no longer a second schema to describe; read quests.md for the whole of
it.

What stays here: quests reference Atlas locations through `quests.location_id` and
typed `quest_refs` rows, and the AI quest generator's retrieval grounding is
described below because three other generators share it.

---

## Factions

### DM View

Route: `/factions` (list), `/factions/new`, `/factions/:id`, `/factions/:id?edit=true`

**List page** (`FactionListView.vue`)

- Filter bar: text search (name, tags) + type dropdown; state in `useUiStore` with Clear button
- "Populate Setting" button — bulk-inserts seed factions for the active campaign's setting (only shown when the campaign has a recognised `calendar_id` with faction seed data); idempotent, deduplicates by name
- Responsive grid (1–3 columns) of `EntityListRow` (`src/components/common/EntityListRow.vue`) — the shared horizontal row: 3rem emblem tile (or a fallback icon), truncating name, subtitle, tags (`maxTags`, default 3), an `#actions` slot at the trailing edge, and the chevron. `PantheonListView` is the same component with a different fallback icon and subtitle; the two had each written the same forty lines and had already drifted (one passed `render-width` to `FocalImage`, the other did not)
- The row's reveal goes in `#actions` as the `inline` form, **not** `overlay`, and lands in the trailing group beside the chevron. `overlay` is the dark-scrim chip and the scrim is only correct on top of artwork — on a faction row there is none behind it, so it read as a black square on parchment and its gold "shared" state disappeared into its own backdrop. On the title line it was also vertically adrift from the chevron and, being `shrink-0` beside a `truncate` name, cost the longer names a word. The controls and chevron are one group so the pair spends a single `gap-3`; split into two row children the extra gap came straight back out of the names

**Faction editor** (`FactionEditor.vue`) — two-column layout:
*Left column:* emblem image (square, click to upload, `asset-images` bucket), type selector (`EntityCombobox`), alignment selector (9 standard alignments), reveal control (`AudienceRevealControl`), tags (`TagInput`)
*Right column:* name, description/notes (`RichTextEditor`, placeholder: "History, motives, known activities…"), Save/Cancel/Delete buttons

**Faction detail page** (`FactionDetailView.vue`)
Shows the sheet or editor (via `?edit=true`), then below it always-visible sub-sections (rendered even in edit mode):

- **FactionMembersSection** — NPC members. Combobox to add NPCs; each row shows NPC portrait thumbnail, name, occupation, role (Leader/Officer/Enforcer/Member/Initiate/Associate/Agent/Informant/Unknown), status (Active/Retired/Defected/Expelled/Deceased with colour badge). Role and status are inline-editable. Remove button per row.
- **FactionPartyMembersSection** — PC members (party characters). Same structure; role-editable.
- **FactionRelationsSection** — Directional inter-faction relations. Outgoing and incoming relations shown separately. Relation types: Allied, Friendly, Neutral, Suspicious, Rival, Hostile, Secret Ally, Secret Enemy (each with colour). Upsert on `(faction_id, target_faction_id)` unique constraint — adding the same relation again updates it.
- **FactionLocationsSection** — Associated locations (with optional notes per link). Combobox + add button; remove per row.
- **FactionItemsSection** — Associated items (with optional notes per link). Same pattern.
- **EntityNotesPanel** — DM notes attached to the faction entity.

### Player View

Route: `/play/factions` (embedded in player portal via `PlayerFactionsView.vue`)

#### Faction list

- Shows factions the player can see: factions where they are a member (`faction_party_members` row exists) OR where their `party_member_id` is in the faction's `player_visible_to[]` array
- In DM preview mode the client filters to the same criteria
- Factions the player belongs to float to the top (sorted first), then alphabetical within each group; member factions get a green border highlight
- Filter: text search on name, type, tags
- Card grid (1–2 columns): emblem thumbnail, name, type, tags (up to 3)
- Clicking a card opens the **detail modal** (fullscreen overlay)

**Faction detail modal**

- Header: emblem (larger), name, type · alignment
- About: faction description rendered via `RichTextViewer`
- **Known Members** (only shown if the player is a member of this faction):
  - Heading includes the player's role ("Member", "Officer", etc.)
  - PC members (party characters): name, species · class, role; the player's own character highlighted in green with "(You)" badge
  - NPC members with `status = "Active"`: display name (shapeshifter-aware via `getNpcDisplayName`), race · occupation, role
  - Uses player-scoped queries (`usePlayerFactionNpcs`, `usePlayerFactionPartyMembers`) that only return data if the player is a faction member
- **Player notes widget** — personal notes for this faction

---

## Pantheons & Deities

Two thin sibling modules, documented here rather than in their own file because
they share this doc's shared-card machinery and its per-player visibility model
rather than having behaviour of their own.

**Pantheon list** (`src/views/pantheons/PantheonListView.vue`, `/pantheons`) —
the same `EntityListRow` the faction list uses: emblem tile with an `IconFire`
fallback, name, a "N deities" subtitle counted from `useAllDeities`, tags, and
an `inline`-form `AudienceRevealControl` in `#actions`.

**Deity list** (`src/views/deities/DeityListView.vue`, `/deities`, nav label
**Pantheon**) — a responsive grid (1–4 columns) of `EntityGridCard`, the same
shell the NPC and monster grids use:

- portrait through the card's own `imageUrl` / `focalPoint`, placeholder
  `/assets/placeholders/deity.webp`
- alignment through `badgeText`, so it wears the same corner-badge treatment as
  a monster's CR rather than the hand-rolled `bg-black/60` pill it had
- reveal in `#actions-start` — `overlay` form here, unlike the two row-based
  lists, because on this card there genuinely *is* artwork under the control
- `#body` carries name, titles, pantheon name, and up to three domain chips with
  a `+N` overflow

Filters (`deitiesFilterDomain`, `deitiesFilterPantheon`) and search live in
`useUiStore` as the Filter State Pattern requires. "Reveal All"
(`useRevealAllDeities`) shares every deity in the campaign with the whole party
in one action — the pantheon is usually common knowledge, and setting it row by
row was the most-repeated reveal in the app.

Both are quota'd on the free plan (`plans.quotas`: 5 deities, 3 pantheons),
which is low enough that the fixture's own seed has to stay under it — see
`scripts/lib/dev-fixture-content.ts`.

**Content we ship does not count against those caps** (`20260818081308`). Rows
inserted by a Populate button carry a `setting_source` column naming the setting
(or `'planar'` for the standard planes), and both `check_quota` and
`check_all_quotas` skip non-null values — the same exemption sounds and playlists
already had via `library_id` / `library_scene_slug`. **Change both functions or
neither**; they are the same rule written twice, once per call shape, and the
trigger disagreeing with the on-screen counter is the failure that produces.

Without it the feature paywalled itself, worst of all on the Atlas:

| | free cap | Faerûn populate |
| --- | --- | --- |
| `locations` | 10 | 35 (+20 from Populate Planes) |
| `deities` | 5 | 112 |
| `pantheons` | 3 | 13 |
| `factions` | 5 | 15 (Eberron: 28) |

`enforce_quota` is a BEFORE INSERT trigger, so a free user pressing the button
got an upgrade prompt instead of the content. Every one of the nine settings
exceeds the location cap on its own (Planescape 27, Spelljammer 12 at the low
end), so the Atlas button had never worked on the free tier for any setting.

There is no SQL backfill for campaigns populated before that shipped. The setting
definitions live in `src/settings/*.ts`, so a migration would have had to carry
several hundred names as a literal — a second copy of the source data, stale the
moment a setting changes, and matched on a name the user is free to have edited.
Instead the four populate mutations (`usePopulateFactions`, `usePopulateDeities`,
`usePopulateLocations`, `usePopulatePlanarLocations`) stamp the rows they already
match by name, so pressing the button again repairs an existing campaign. See
`lib/populateSetting/settingContent`.

Note for anyone adding a column to `locations`: `get_player_visible_locations`
returns `setof locations` by listing every column **positionally** so it can null
the DM-only ones, so a new column silently makes that list one short and the
function fails at call time for players only. `supabase/tests/player_projections.test.sql`
catches it; `20260818081308` had to rebuild the function for exactly this reason.

---

## Retrieval Grounding for AI Generators (#600)

**Retrieval grounding (#600).** The quest generator was the first generator after the #595 bestiary to be grounded in the DM's own content; the roll-table generator (dungeon-craft.md) was the second, consuming the same corpora through `supabase/functions/_shared/campaignEntityRetrieval.ts`; the Chronicler (campaign-notes-calendar.md) was the third, adding a fourth corpus — the DM's `notes` (`note_embeddings`, migration `20260804000001`, embed text = title, category/"Session N", tags, then content truncated at 4000 chars since a note's substance IS its content; only the DM-authored `notes` table, never the player-authored `entity_notes`/`player_journal_entries`/`npc_player_notes`, per #599's exclusion rule). All note categories are embedded, but `match_campaign_notes` takes a `p_categories` predicate and the Chronicler passes `['session']` only — spoiler containment for player-facing prose; see campaign-notes-calendar.md. The mechanism is a deliberate replay of combat-encounters.md's "Monster retrieval" section — read that for the full rationale (side tables not columns, one vendor platform-wide, `SECURITY INVOKER` + service-role-only RPCs, graceful degradation); this section is the canonical home for the campaign-entity specifics, and later grounded generators should point here rather than re-document them.

- **Corpus**: three embedding side tables — `npc_embeddings`, `faction_embeddings`, `location_embeddings` (migration `20260803000004`), each `vector(1536)` + `embedding_model` + `source_hash`, HNSW cosine index, `on delete cascade`, RLS enabled with zero policies (service-role only). No `library_*` twin exists for these — they are entirely DM-authored.
- **Embed text formats** (`supabase/functions/_shared/entityEmbedText.ts` — format changes invalidate every stored `source_hash` for that entity type and force a full re-embed): NPC = name, race/occupation/alignment, tags, then Tiptap-flattened appearance/personality/backstory each truncated at 500 chars (NPC `notes` deliberately excluded — session scratch, not identity). Faction = name, type/alignment, tags, description. Location = name, type, tags, `player_summary`, description (`notes` excluded — dead column). Shared string utilities live in `embedTextUtil.ts` and are frozen — changing them re-embeds every entity type at once.
- **Embed-on-write**: `queueNpcEmbedding`/`queueFactionEmbedding`/`queueLocationEmbedding` fire-and-forget `embed-content` (`mode: "single"`) after every create/update in `useNpcs`/`useFactions`/`useLocations`, including the bulk populate paths that bypass the mutation hooks. Ownership is enforced server-side (`row.user_id === auth.uid()`); an unchanged source hash short-circuits with no provider call. The admin backfill (`useEmbeddingBackfill.ts`, five targets) covers pre-existing rows and vendor switches.
- **Retrieval** (`generate-quest`): the composed prompt is embedded once (recorded delta-0 as `entity_embedding`, after the rate-limit gate — same spend-protection ordering as `generate-encounter`), then `match_campaign_npcs`/`_locations`/`_factions` return 12/10/8 candidates. Scope predicate, in the RPC `WHERE` before ranking: rows in the active campaign (any author, so co-DM content counts) plus the campaign OWNER's global (`campaign_id IS NULL`) rows — mirroring the list views' null-means-global semantics, and stable under #596's planned default flip. Unembedded rows are appended by recency (caps 8/6/4) so brand-new entities are never invisible during the embed window.
- **Offer**: candidates enter the prompt as `npc|Name|occupation` / `location|Name|type` / `faction|Name|type` lines inside a `---BEGIN CAMPAIGN ENTITIES---` block — fixed ~30 lines regardless of corpus size, so prompt cost does not scale with DM engagement.
- **Resolve** (`src/ai/resolveGeneratedEntities.ts` — moved out of `lib/quests/` when the roll-table generator became its second consumer): hook name arrays are matched trim/case-insensitively against the client's own entity pools. Matched names render as clickable chips (`GeneratedEntityChips` in `components/common/`, shared with the roll-table panel); unmatched names render as dashed "new" chips — surfaced, never silently dropped, per the #337/#595 resolution-guard principle.
- **Fallback**: any retrieval failure (no vendor, provider down, RPC error, zero candidates) drops the entity block and generates exactly what the pre-#600 client path sent. Retrieval can cost grounding, never the feature.
- **Not documented here**: the loot generator (#602, dungeon-craft.md) is a fourth consumer of this pattern but does NOT use `campaignEntityRetrieval.ts` — items span two corpora and need a rarity/attunement *constraint band* applied in the RPC `WHERE` before ranking, which the single-corpus entity RPCs have no parameter for. It has its own sibling module (`_shared/itemRetrieval.ts`); read dungeon-craft.md's "AI loot generator" section for the band rationale before adding a band to anything else.

---

## Key Capabilities / USPs

- **Unlimited location hierarchy** with breadcrumb navigation at every level; parent/child wiring can be done at creation or retroactively from any location's editor.
- **Interactive map pinning**: DM drops pins onto uploaded map images and links each to a child location. The pin picker recurses through vague container types (regions/continents) to surface concrete towns without flattening the hierarchy.
- **Granular per-player visibility**: all three modules use a `player_visible_to: string[]` array of party member UUIDs — the DM selects which specific players see each item (not just a global "visible" flag).
- **Layered location sharing**: four independent toggles (summary, full description, linked NPCs, inventory/store wares) give the DM fine-grained control over what each revealed location exposes.
- **Faction relationship graph**: bidirectional inter-faction relations with 8 relation types (Allied → Secret Enemy), queried as outgoing + incoming so both sides see the link.
- **Faction member roster** distinguishes NPC members (with role + lifecycle status) from PC members (party characters), and exposes them to players who belong to the faction.
- **Setting seed data**: Atlas and Factions both ship "Populate Setting" buttons that bulk-seed campaign-appropriate locations/factions from static data keyed by `calendar_id`.
- **Planar cosmology**: "Populate Planes" seeds all 21 standard D&D planes with correct parent hierarchy (e.g. Astral Sea as parent of outer planes).
- **Store/vendor integration**: Store, Tavern, and Inn location types support a `StoreInventory` component (editable in both view and edit modes) with an optional proprietor NPC. When `is_inventory_shared` is toggled, the wares list appears in the player portal.
- **Collapsible player atlas**: the player-facing Atlas keeps tree expand/collapse and detail-panel open state in `useUiStore` so the player's navigation context survives tab switching.

---

## Data Fields

### Location (`locations` table)

| Field                   | Type             | Notes                                                                                                                                                                   |
| ----------------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`                  | string           | Required                                                                                                                                                                |
| `location_type`         | enum (18 values) | World, Plane, Continent, Region, Country, City, Town, Village, District, Building, Grounds, Store, Tavern, Inn, Room, Dungeon, Wilderness, Other                        |
| `parent_id`             | uuid FK          | Null = top-level                                                                                                                                                        |
| `description`           | Tiptap JSON      | DM-only unless `is_description_shared`                                                                                                                                  |
| `notes`                 | text             | (currently unused in UI)                                                                                                                                                |
| `tags`                  | string[]         |                                                                                                                                                                         |
| `image_url`             | string           | Sigil/emblem (portrait)                                                                                                                                                 |
| `map_url`               | string           | Map image (landscape)                                                                                                                                                   |
| `map_pins`              | MapPin[]         | JSONB array; each pin has `child_location_id`, `child_name`, `child_type`, `child_image_url`, `x`, `y`, `visible_to_players`                                            |
| `is_map_shared`         | boolean          |                                                                                                                                                                         |
| `player_visible_to`     | uuid[]           | Party member IDs who can see this location                                                                                                                              |
| `player_summary`        | string           | Plain text always shown to players                                                                                                                                      |
| `is_description_shared` | boolean          |                                                                                                                                                                         |
| `is_npcs_shared`        | boolean          |                                                                                                                                                                         |
| `is_inventory_shared`   | boolean          | Store/tavern/inn only                                                                                                                                                   |
| `npc_owner_id`          | uuid FK          | Proprietor NPC                                                                                                                                                          |
| `related_location_ids`  | uuid[]           | Non-hierarchical links to other locations (trade routes, tunnels, connected districts); shown in editor as inline chip picker and in sheet as "Related Locations" chips |
| `campaign_id`           | uuid, nullable   | null = general (all campaigns), set = scoped to that campaign — see "Scope" below                                                                                       |

**Scope (`CampaignScopeField`, #596).** `LocationEditor` now offers the same "General — all campaigns" / "Campaign — *active campaign name*" toggle items/spells/species/monsters/traps/puzzles already had; a new location defaults to the active campaign, and editing an existing one — including an already-general one — never moves it regardless of which campaign is active. This is a bigger change here than for those other entities: `fetchLocations`/`fetchAllLocations` (`useLocations.ts`) had never read `campaign_id IS NULL` as "every campaign" at all, unlike every sibling table — they filtered with `.eq("campaign_id", campaignId)`, which never matches NULL. RLS and the FK layer already treated a null `campaign_id` as legitimate (a room can lose its campaign and the loot-placement FK is built to notice), so the gap was purely that the Atlas's own queries never looked for it. Both fetchers were widened to `.or("campaign_id.eq.<id>,campaign_id.is.null")` (matching `useQuestFilterEntities`'s existing location lookup, which had already special-cased this) so a general location is actually visible somewhere, not just accepted by the write path and then silently hidden. `useGlobalSearch`'s location query picked up the same widening.

No migration reassigns the small number of locations that already carried a null `campaign_id` from before this fix — they simply become visible again, in every campaign, which is the documented behaviour for every other general-scoped entity in this app.

### Faction (`factions` table)

| Field               | Type        | Notes                                                                                                |
| ------------------- | ----------- | ---------------------------------------------------------------------------------------------------- |
| `name`              | string      | Required                                                                                             |
| `faction_type`      | string      | Guild, Government, Religion, Criminal, Military, Merchant, Secret Society, Cult, Order, Tribe, Other |
| `description`       | Tiptap JSON | History, motives, activities                                                                         |
| `emblem_url`        | string      | Square emblem image                                                                                  |
| `alignment`         | string      | 9 standard alignments                                                                                |
| `player_visible_to` | uuid[]      | Party member IDs; also shown if player is a faction member                                           |
| `tags`              | string[]    |                                                                                                      |

### FactionNpc / FactionPartyMember (junction tables)

| Field    | Type   | Notes                                                                             |
| -------- | ------ | --------------------------------------------------------------------------------- |
| `role`   | string | Leader, Officer, Enforcer, Member, Initiate, Associate, Agent, Informant, Unknown |
| `status` | string | Active, Retired, Defected, Expelled, Deceased                                     |

**Only the faction's DM may write a junction row** — `private.can_edit_faction(faction_id)`
on INSERT and UPDATE across `faction_party_members`, `faction_npcs`, `faction_items`,
`faction_locations` and `faction_relations` (`20260828211656`). The helper resolves the
campaign through the parent faction and mirrors the predicate `factions_update` already
uses: campaign DM, or owner of a global (`campaign_id is null`) faction.

This is a security boundary, not bookkeeping. `faction_party_members` is what *grants*
faction read access — `factions_member_select`, `faction_npcs_shared_faction_member_select`
and `private.is_faction_pc_member` all admit rows on the strength of "a junction row links
this faction to a campaign_members row that is mine". While writes were gated on row
ownership alone, that made the read predicate satisfiable by a row the reader could write:
any player could enrol their own character into any faction in any campaign and read the
faction, its NPCs and its whole PC roster, bypassing `player_visible_to` entirely.

These five tables carry no `campaign_id` of their own — they resolve it through
`faction_id` — which is why the campaign-scoped write sweep of `20260828201935` did not
reach them. `faction_deities` is the exception that shows the intended shape: it has a real
`campaign_id` and has been gated on `private.is_campaign_dm` since it was created.

Regression cover: `supabase/tests/faction_link_boundary.test.sql`, ending in a structural
assertion over every `faction_*` junction write policy — so a sixth junction table cannot
ship with the loose shape.

### FactionRelation (`faction_relations` table)

| Field               | Type                              | Notes                                                                            |
| ------------------- | --------------------------------- | -------------------------------------------------------------------------------- |
| `faction_id`        | uuid                              | Source faction                                                                   |
| `target_faction_id` | uuid                              | Target faction                                                                   |
| `relation_type`     | enum                              | allied, friendly, neutral, suspicious, rival, hostile, secret_ally, secret_enemy |
| `notes`             | string                            | Optional notes on the relation                                                   |
| Unique constraint   | `(faction_id, target_faction_id)` | Upsert on conflict                                                               |
