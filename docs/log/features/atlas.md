# Features — Atlas & Locations

Shipped features in the **Atlas & Locations** area, newest first. Part of the Grimoire feature log — see the [log index](../index.md).

- [x] Atlas — time-bound locations: optional `era_start`/`era_end` year fields; locations outside the campaign's current year are greyed out (with an era badge) in the DM Atlas grid and player Atlas list

- [x] Atlas (Locations) — recursive hierarchy (world → plane → continent → region → city → town → building → room), Tiptap description, Scriptorium formatter

- [x] Atlas — "Populate Setting" button seeds iconic locations from the active campaign's setting (Faerûn: ~70 locations, Greyhawk/Eberron/Dragonlance: ~15–20 each)

- [x] Atlas — Parent picker in location editor with live breadcrumb updates

- [x] Atlas — Location sigil/emblem image upload (square format) displayed in editor and list cards

- [x] Atlas — Location editor restructured: large sigil left, name/parent/child/tags/pins right; child picker as combobox to reparent existing locations; compact calendar pins row

- [x] Atlas — `related_location_ids` field for non-hierarchical links (trade routes, tunnels, connected districts); inline chip picker in editor, "Related Locations" section on detail sheet

- [x] **People in the Area** — "People in the Area" section on location pages shows NPCs assigned to this location or any descendant; sublocation badge shows which child the NPC belongs to; count reflects full tree depth

- [x] **Full ancestor breadcrumb** — location editor breadcrumb walks the entire parent chain (root → … → parent → current), all segments clickable; depth capped at 10 to prevent cycles

- [x] **Map upload & pinning** — upload a map image per location; interactive `LocationMap` component with drag-to-place child pins, per-pin player visibility toggle, hover labels, single-click navigation; `is_map_shared` toggle shares the map with players; pin positions stored as % in `map_pins` JSONB (child name/type denormalised for player reads)

- [x] **Full location sharing** — DM can set a player summary (always visible), share the full Tiptap description, and share linked player-visible NPCs per location; three new DB columns + editor toggles; player atlas renders each section when enabled (issue #34)

- [x] **Populate Planes button** — "Populate Planes" button in Atlas header seeds the 21 standard D&D planes (transitive, inner, outer, and Sigil) via `usePopulatePlanarLocations`; two-pass insert resolves parent links (Avernus → Nine Hells); idempotent — skips already-existing planes

- [x] **Atlas type filter dropdown** — replaced pill-button type filters with a compact `<select>` dropdown in the Atlas header, matching the encounters view layout

- [x] **Pin through vague regions** — the map editor's Unplaced picker now recurses through container types (world / plane / continent / region / country) to surface concrete descendants, so a map of Icewind Dale can pin the individual Ten Towns without first flattening the hierarchy. Each surfaced entry shows a breadcrumb (`· Ten Towns`) so the DM can tell which region it came from. (issue #139)

- [x] **Related locations (non-hierarchical links)** — location editor includes a "Related" section showing bidirectional cross-location links; DM can search and add related locations inline; `related_location_ids uuid[]` column on locations table; displayed with type-color indicators and remove buttons; supports linking any locations without parent-child constraints (e.g., two distant cities, or a tavern to other businesses in town)

- [x] **LocationDetailView — view/edit split** (irongollem/grimoire#168) — DM-side location detail now renders a read-only sheet by default (sigil + type badge + tags + Tiptap description + map + sub-locations + People in the Area + Encounters Here + Currently Here + store inventory for store/tavern/inn types) with an **Edit** button that appends `?edit=true` to flip into the existing `LocationEditor`. Editor gains a **Cancel** button that strips the flag (preserves other query params like `?parent=` for nested creates). Sub-location links, NPC cards, encounter cards, and party-member chips are now clickable navigation — no more picker-only access to the location's network. Matches the NPC / Monster / Item / Spell split convention.

- [x] **Atlas: Stores** (irongollem/grimoire#60) — added `store`, `tavern`, and `inn` location types; new `store_items` table links items to store locations with per-item price overrides and visibility (visible / under the counter); DM UI in LocationEditor shows inventory panel for store-type locations with item search, price editing, and visibility toggles; Player Sharing section has an Share inventory toggle; players can browse visible wares in the Atlas portal when a location's inventory is shared
