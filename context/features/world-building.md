# World-Building: Atlas, Quests & Factions

## Overview

Three interconnected modules for tracking the physical and political geography of a campaign: **Atlas** manages the location hierarchy and maps, **Quest Log** tracks adventures and objectives, and **Factions** models the organisations that shape the world. All three support granular player visibility — the DM controls what each player sees in the `/play/*` portal.

---

## Atlas (Locations)

### DM View

Route: `/locations` (list), `/locations/new`, `/locations/:id`, `/locations/:id?edit=true`

**List page** (`LocationsView.vue`)

- Title: "Atlas", subtitle: "Continents, cities, dungeons, and every place in between"
- Filter bar: free-text search + type dropdown (all 17 location types)
- Action buttons: **New Location** (primary), **Populate Setting** (bulk-inserts preset locations for the campaign's setting/calendar, e.g. Faerûn), **Populate Planes** (bulk-inserts the 21 standard D&D cosmological planes). Both populate buttons are idempotent — they skip names that already exist and report how many were added.
- List rendered by `LocationList.vue`

**Detail page** (`LocationDetailView.vue` + `LocationSheet.vue` / `LocationEditor.vue`)

The detail page follows the sheet + editor convention: existing locations show a read-only sheet; adding `?edit=true` flips to the editor. New locations go straight into the editor. A breadcrumb showing the full ancestor chain (Locations → Parent → … → Current) is shown in both modes.

**Location editor fields:**

- **Name** (required), **Type** (one of 17 types, see below), **Sigil/Emblem image** (portrait aspect, uploaded to `location-images` bucket)
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
  - **Player visibility** — `PlayerVisibilityToggle` picks which party member UUIDs are in `player_visible_to[]`
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

**Location type taxonomy** (17 types, each with a distinct colour dot):

- _Vague containers_ (not useful as single map pins): World, Plane, Continent, Region, Country
- _Concrete place types_: City, Town, Village, District, Building, Dungeon, Wilderness, Other
- _Store types_ (support inventory): Store, Tavern, Inn
- _Other_: Room

**Hierarchy**: unlimited depth; parent/child relationship is a single `parent_id` FK. The `useLocationTree` composable builds a depth-annotated flat list for indented combobox display across the app. `getPinnableDescendants()` recurses through vague containers to surface pinnable leaves (capped at 60 per map).

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
- **Wares** (store/tavern/inn with `is_inventory_shared = true`) — rendered via `PlayerStoreWares`
- **People in the Area** (when `is_npcs_shared = true`) — NPC cards showing display name, race, occupation (shapeshifter disguise respected via `getNpcDisplayName`)
- **Player notes widget** — personal notes tied to this location entity

---

## Quest Log

### DM View

Route: `/quests` (list), `/quests/new`, `/quests/:id`, `/quests/:id?edit=true`

**List page** (`QuestsView.vue` + `QuestList.vue`)

- Filter bar: text search (title, summary, tags), a **Shared with party** toggle, and a searchable NPC/location/faction facet. Filter state uses the quest-specific `useLocalStorage` entries in `useUiStore`, so it survives both navigation and reload; **Clear** resets the composed state. Entity matching includes the primary giver/location plus typed `quest_refs`, loaded once per campaign by `useCampaignQuestRefs` rather than once per card. Beat placements create authoritative faction and other quest refs, so those links feed this same facet. Prep-gap and pending-loot filters remain hidden/no-op until board summaries and loot dispatch (#661) are wired.
- **View toggle**: list view ↔ Kanban board (preference stored in `ui.questsIsKanban`, persists session)
- **List view**: responsive card grid (1–4 columns), status colour bar at top of each card, summary excerpt, tags (up to 2), time-ago stamp
- **Kanban board**: five horizontally scrollable status lanes (Undiscovered, Rumor, Active, Completed, Failed), implemented by `QuestKanbanBoard.vue`. Cards are draggable between lanes and also carry a native status picker as the keyboard/touch alternative; either route updates `status` through `useUpdateQuest`, and moving to Completed still schedules quest-completion consequences. Empty non-terminal lanes include a New Quest action. `QuestBoardCard.vue` is the atomic card boundary: today it renders title, hook, tags, player-sharing faces and last-touched time; its optional `QuestBoardSummary` prop is the deliberate seam for the beat redesign to add current/live beat, progress spine, prep gaps and loot counts without inventing those values for legacy quests. The old list view remains unchanged.

**Beat graph foundation** (`quest_beats`, `quest_beat_edges`, `quest_runtime_state`, `quest_beat_transitions`; `useQuestFlow.ts`): a beat is a general narrative moment, not a renamed combat encounter. Authored content and directed routes live separately from the campaign's shared live cursor and append-only navigation history. Beat kinds are extensible presentation hints (initially Combat / Social / Explore / Discovery / Neutral), never attachment constraints. Cycles are valid and client traversal in `lib/quests/graph.ts` is cycle-safe. New and improvised beats default hidden; player access uses `get_player_visible_quest_beats`, which returns explicit rumor/reveal copy and exposes no DM title/content fallback. Prep readiness is deliberately not stored on a beat: later attachment work derives it from linked payload requirements.

**Beat attachments** (`quest_beat_attachments`; `lib/quests/attachments.ts`): typed placements point at existing encounters, objectives, quest refs, Atlas location/room sets, NPCs, factions, sounds/playlists, notes, and Scriptorium handouts. The adapter contract supplies compact summary data and the route back to each full editor. Required links whose polymorphic target was deleted resolve as prep gaps instead of throwing; optional missing links remain informational. Summaries batch once per attachment type, never once per beat/card. Server validation rejects cross-quest objectives and cross-campaign material. Encounter/NPC/faction/location placements also create the normal quest-level ref, preserving existing filters and reverse lookups; changing or removing a beat placement never deletes the authoritative entity or broader quest ref.

**Graph adapter** (`lib/quests/flow.ts`, `QuestFlowCanvas.vue`, `QuestGraphOutline.vue`): Build mode uses `@vue-flow/core` 1.48.2 (MIT, Vue 3.3+; no plugin packages) behind domain mapping and command types, so persistence never receives library nodes. Core provides pan/zoom, touch dragging, selection, connection ports, and fit-on-open; the custom beat node and edge styling use Grimoire tokens. Narrow screens default to the ordered outline, which exposes equivalent create/open/link/delete actions and remains the screen-reader/keyboard fallback. Canvas motion respects reduced-motion preferences. Dependency review on 2026-08-10: package last updated 2026-01-28, unpacked core size ~1.29 MB; it remains isolated to the lazy-loaded quest designer path.

**Build graph state** (`QuestGraphDesigner.vue`, `lib/quests/presentation.ts`): `?mode=build` loads beats, edges, typed attachment summaries, the campaign cursor, and quest history in a bounded set of queries. One shared presentation selector derives readiness, visibility-adjacent display, visited/current emphasis, route history, and disconnected staging state for reuse by Build, board, and Run; it accepts beat-loot counts from #661 without inventing a second loot state machine. Node positions save to authoritative beat coordinates after a short debounce with optimistic query-cache rollback. Viewport is a per-browser, per-quest preference: first open fits the graph, later opens restore it, and `?focus=current` recenters when returning from Run.

**Legacy conversion** (`20260810000016`, `QuestFlowConversionPanel.vue`): existing quests remain on the legacy sheet until the DM previews and explicitly enables flow. Conversion can add a hidden overview and unconnected staging beats for existing encounter refs, but never infers story order or rewrites objectives, triggers, rewards, refs, sharing, or subquests. It is idempotent and rollback removes only provenance-marked generated beats; full coexistence and retirement criteria are recorded in `docs/quest-flow-conversion.md`.

**Graph authoring** (`QuestBeatComposer.vue`, `lib/quests/mutations.ts`): Add-next, empty-canvas connection drops, and the ordered outline open a client-local composer; no row exists until a non-empty title is submitted. Beat creation followed by route creation uses visible compensating rollback if the route fails, avoiding a migration/RPC whose real UTC version would sort behind the earlier counter-named quest migrations. Branching, convergence, cycles, source/target reconnection, and DM-only route labels use existing edge constraints; self-links and exact duplicates fail predictably. Concurrent co-DM route/label/position writes are last-write-wins, while unique/FK constraints remain authoritative. Removing a beat is a history-preserving soft archive: its beat-owned routes and placements are detached, authoritative entities/chat/inventory remain, and current beats require a replacement or explicit runtime end before removal.

**Quest editor fields** (two-column layout on desktop):
_Left column:_

- **Title** (required), **Status** selector (Undiscovered / Active / On Hold / Completed / Failed, colour-coded), **Player visibility toggle**, Save/Cancel/Delete/Scriptorium buttons
- **Summary** — plain text, short description
- **Quest Giver** — NPC combobox
- **Location** — Location combobox (primary location for this quest)
- **Part of Quest** — parent quest combobox (supports sub-quest nesting)
- **Reward Notes** — freetext (XP, reputation, favours…)
- **Reward Currency** — five-coin grid (PP/GP/EP/SP/CP); "Drop to Chat" button sends the currency pool as a chat message; integrated with `EncounterLoot` component for full loot management (items + multiple currency pools + art objects)
- **Tags** — `TagInput`
- **Description** — `RichTextEditor` (full narrative/context)
- **DM Notes** — separate `RichTextEditor` (session notes, reminders — never shown to players)

_Right column:_

- **Objectives panel** — inline add/remove; each objective has a checkbox (toggle `is_done`) and a visibility toggle (Eye/EyeOff, controls `is_player_visible`). Objectives can only be added after the quest is saved.
- **Reward panel** — `EncounterLoot` component (items, currency pools, art objects, "Drop pool to chat" and "Drop item to chat" buttons)
- **Linked Encounters** — combobox to attach encounters; each linked ref has its own `is_player_visible` toggle

**Quest sheet (view mode) — read-only sections:**

- Status badge (colour-coded), Edit/Delete action bar
- Summary text
- Meta row: quest giver (links to NPC), primary location (links to location), parent quest (links to quest), tags
- Description (Tiptap, rendered via `RichTextViewer`)
- DM Notes (dimmed heading, rendered via `RichTextViewer`)
- Objectives with interactive check/uncheck and visibility toggle (no edit mode required for these)
- Rewards — coin text + item chips (link to vault) + freetext rewards note
- Linked Encounters (section + count)
- Key NPCs (grid, links to NPC detail)
- Key Locations (chip links to location detail)
- Creatures / Monsters (chip links)
- Sub-quests (list with status badge + link)
- **Scriptorium export** button — creates a Scriptorium document from this quest's content

**Quest nesting**: `parent_quest_id` supports one level of official nesting (sub-quests shown on parent sheet). No depth limit in the schema.

**AI quest generator** (`QuestGeneratorPanel.vue`, `src/ai/useQuestGeneration.ts`, `supabase/functions/generate-quest/index.ts`):

- Opened via the **Generate** button (`Wand2` icon) on the Quest Log list page
- Always mounted in `DefaultLayout.vue` so background generation survives navigation
- Inputs: party average level (auto-calculated from `useParty()`) + optional Quest Giver and Location comboboxes (passed to the model as constraints AND prefilled onto the created quest's `giver_npc_id`/`location_id`) + optional theme textarea
- Campaign setting context is automatically injected (`buildCampaignContext()` client-side; the edge function builds the same block server-side)
- Produces 3–5 quest hooks, each with: title, summary, full DM narrative description (stored as Tiptap JSON), objectives, tags — and, on the server path, `npcs`/`locations`/`factions` name arrays (see Retrieval grounding below)
- User picks a hook → quest record + all objectives created immediately, plus `quest_refs` rows for every hook-referenced NPC/location that resolved to a real record (skipping the giver/location already stored as FK columns; `is_player_visible: false`). Factions resolve to chips only — `quest_refs.ref_type` has no `faction` member.
- Pro feature (paywall-gated). Generation runs server-side (`generate-quest`) on platform credits or the campaign's BYOK-cloud key, mirroring `generate-encounter`'s split; only local-key mode still runs the old client-side path, ungrounded by policy (BYOK-local is a legacy tier, not a parity target — see the comment in `useQuestGeneration.ts`).

**Retrieval grounding (#600).** The quest generator was the first generator after the #595 bestiary to be grounded in the DM's own content; the roll-table generator (dungeon-craft.md) was the second, consuming the same corpora through `supabase/functions/_shared/campaignEntityRetrieval.ts`; the Chronicler (campaign-notes-calendar.md) was the third, adding a fourth corpus — the DM's `notes` (`note_embeddings`, migration `20260804000001`, embed text = title, category/"Session N", tags, then content truncated at 4000 chars since a note's substance IS its content; only the DM-authored `notes` table, never the player-authored `entity_notes`/`player_journal_entries`/`npc_player_notes`, per #599's exclusion rule). All note categories are embedded, but `match_campaign_notes` takes a `p_categories` predicate and the Chronicler passes `['session']` only — spoiler containment for player-facing prose; see campaign-notes-calendar.md. The mechanism is a deliberate replay of combat-encounters.md's "Monster retrieval" section — read that for the full rationale (side tables not columns, one vendor platform-wide, `SECURITY INVOKER` + service-role-only RPCs, graceful degradation); this section is the canonical home for the campaign-entity specifics, and later grounded generators should point here rather than re-document them.

- **Corpus**: three embedding side tables — `npc_embeddings`, `faction_embeddings`, `location_embeddings` (migration `20260803000004`), each `vector(1536)` + `embedding_model` + `source_hash`, HNSW cosine index, `on delete cascade`, RLS enabled with zero policies (service-role only). No `library_*` twin exists for these — they are entirely DM-authored.
- **Embed text formats** (`supabase/functions/_shared/entityEmbedText.ts` — format changes invalidate every stored `source_hash` for that entity type and force a full re-embed): NPC = name, race/occupation/alignment, tags, then Tiptap-flattened appearance/personality/backstory each truncated at 500 chars (NPC `notes` deliberately excluded — session scratch, not identity). Faction = name, type/alignment, tags, description. Location = name, type, tags, `player_summary`, description (`notes` excluded — dead column). Shared string utilities live in `embedTextUtil.ts` and are frozen — changing them re-embeds every entity type at once.
- **Embed-on-write**: `queueNpcEmbedding`/`queueFactionEmbedding`/`queueLocationEmbedding` fire-and-forget `embed-content` (`mode: "single"`) after every create/update in `useNpcs`/`useFactions`/`useLocations`, including the bulk populate paths that bypass the mutation hooks. Ownership is enforced server-side (`row.user_id === auth.uid()`); an unchanged source hash short-circuits with no provider call. The admin backfill (`useEmbeddingBackfill.ts`, five targets) covers pre-existing rows and vendor switches.
- **Retrieval** (`generate-quest`): the composed prompt is embedded once (recorded delta-0 as `entity_embedding`, after the rate-limit gate — same spend-protection ordering as `generate-encounter`), then `match_campaign_npcs`/`_locations`/`_factions` return 12/10/8 candidates. Scope predicate, in the RPC `WHERE` before ranking: rows in the active campaign (any author, so co-DM content counts) plus the campaign OWNER's global (`campaign_id IS NULL`) rows — mirroring the list views' null-means-global semantics, and stable under #596's planned default flip. Unembedded rows are appended by recency (caps 8/6/4) so brand-new entities are never invisible during the embed window.
- **Offer**: candidates enter the prompt as `npc|Name|occupation` / `location|Name|type` / `faction|Name|type` lines inside a `---BEGIN CAMPAIGN ENTITIES---` block — fixed ~30 lines regardless of corpus size, so prompt cost does not scale with DM engagement.
- **Resolve** (`src/ai/resolveGeneratedEntities.ts` — moved out of `lib/quests/` when the roll-table generator became its second consumer): hook name arrays are matched trim/case-insensitively against the client's own entity pools. Matched names render as clickable chips (`GeneratedEntityChips` in `components/common/`, shared with the roll-table panel); unmatched names render as dashed "new" chips — surfaced, never silently dropped, per the #337/#595 resolution-guard principle.
- **Fallback**: any retrieval failure (no vendor, provider down, RPC error, zero candidates) drops the entity block and generates exactly what the pre-#600 client path sent. Retrieval can cost grounding, never the feature.
- **Not documented here**: the loot generator (#602, dungeon-craft.md) is a fourth consumer of this pattern but does NOT use `campaignEntityRetrieval.ts` — items span two corpora and need a rarity/attunement _constraint band_ applied in the RPC `WHERE` before ranking, which the single-corpus entity RPCs have no parameter for. It has its own sibling module (`_shared/itemRetrieval.ts`); read dungeon-craft.md's "AI loot generator" section for the band rationale before adding a band to anything else.

**Ref system** (`quest_refs` table): quests maintain a set of typed references (NPC / Location / Monster / Encounter), each with an `is_player_visible` flag that controls what the player portal shows. This is separate from the primary giver NPC and primary location fields.

**Status lifecycle:** Undiscovered → Active → On Hold / Completed / Failed. Undiscovered quests exist in the DM's log but are excluded from the player portal query (`usePlayerVisibleQuests` filters on `player_visible_to IS NOT NULL`).

**Consequences (quest triggers):** DM configures time-delayed consequences in the quest editor (right column, "Consequences" panel). Each trigger has a condition (`quest_complete` or `objective_done` + which objective), an `offset_days` delay, and an action (`create_calendar_event` with title + event_type, or `send_broadcast` with message). When the condition fires, a `quest_trigger_scheduled` entry is created with `fire_date = today + offset_days`. When the DM advances the in-game date to ≥ fire_date via the calendar "Today" button, pending triggers execute: calendar events are created at the fire date, broadcasts are sent to the campaign chat. Composable helpers: `scheduleQuestTriggers()`, `fireDueTriggers()` in `useQuests.ts`.

**In-game "today" date:** Stored as `current_year`, `current_month`, `current_day` on the `campaigns` table. The DM sets it via the calendar page's "Today: [date]" button (top-right actions area). Changing the date posts a `📅 The date is now…` announcement to the campaign chat and fires any pending consequences. Players see the current date in the player portal top bar (read-only). Live-synced to all connected clients via `useCampaignLiveSync` (watches `campaigns` table for `UPDATE` events).

### Player View

Route: `/play/quests` (list), `/play/quests/:id` (detail)

**Quest list** (`PlayerQuestsView.vue`)

- Shows only quests where `player_visible_to` is non-null (the DM has explicitly shared the quest)
- Grouped into four sections: Active, On Hold, Completed, Failed (Undiscovered never appears)
- Each entry: title, status badge (colour-coded), summary excerpt, rewards hint (gold star icon + rewards text)
- Clicking navigates to the detail view

**Quest detail** (`PlayerQuestDetailView.vue`)

- Title + colour-coded status badge
- Meta row: quest giver name (clickable → NPC lightbox modal), primary location name
- Summary text
- **Objectives** — only objectives with `is_player_visible = true` are shown; checkboxes are read-only (state display only); progress counter (done/total)
- **Rewards** — shown when quest has rewards text, items, or currency (freetext only in the current player view)
- **Key NPCs** — only refs with `is_player_visible = true`; clicking opens an NPC lightbox modal (portrait shown if in `player_visible_fields`; name, race, occupation shown per field permissions; includes a personal notes widget)
- **Key Locations** — only player-visible refs; display only (no click-through)
- **Creatures** — only player-visible refs; display only
- **Player notes widget** — personal notes for this quest

---

## Factions

### DM View

Route: `/factions` (list), `/factions/new`, `/factions/:id`, `/factions/:id?edit=true`

**List page** (`FactionListView.vue`)

- Filter bar: text search (name, tags) + type dropdown; state in `useUiStore` with Clear button
- "Populate Setting" button — bulk-inserts seed factions for the active campaign's setting (only shown when the campaign has a recognised `calendar_id` with faction seed data); idempotent, deduplicates by name
- Responsive card grid (1–3 columns): emblem thumbnail (or shield placeholder), name, type, tags (up to 3), Eye icon when `player_visible_to` is non-empty

**Faction editor** (`FactionEditor.vue`) — two-column layout:
_Left column:_ emblem image (square, click to upload, `asset-images` bucket), type selector (`EntityCombobox`), alignment selector (9 standard alignments), player visibility toggle (`PlayerVisibilityToggle`), tags (`TagInput`)
_Right column:_ name, description/notes (`RichTextEditor`, placeholder: "History, motives, known activities…"), Save/Cancel/Delete buttons

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

## Key Capabilities / USPs

- **Unlimited location hierarchy** with breadcrumb navigation at every level; parent/child wiring can be done at creation or retroactively from any location's editor.
- **Interactive map pinning**: DM drops pins onto uploaded map images and links each to a child location. The pin picker recurses through vague container types (regions/continents) to surface concrete towns without flattening the hierarchy.
- **Granular per-player visibility**: all three modules use a `player_visible_to: string[]` array of party member UUIDs — the DM selects which specific players see each item (not just a global "visible" flag).
- **Layered location sharing**: four independent toggles (summary, full description, linked NPCs, inventory/store wares) give the DM fine-grained control over what each revealed location exposes.
- **Quest objective visibility**: each individual objective has its own `is_player_visible` toggle, so the DM can reveal objectives one at a time.
- **Quest ref system**: a typed reference table (`quest_refs`) links quests to NPCs, locations, monsters, and encounters with individual player-visibility flags, separate from the primary giver NPC / location links.
- **Quest Kanban board** with drag-and-drop status changes; List view and Kanban view toggle persisted per session.
- **Sub-quests**: quests support `parent_quest_id` for nesting (displayed on parent's sheet as a sub-quest list).
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
| `location_type`         | enum (17 values) | World, Plane, Continent, Region, Country, City, Town, Village, District, Building, Store, Tavern, Inn, Room, Dungeon, Wilderness, Other                                 |
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

### Quest (`quests` table)

| Field                        | Type        | Notes                                                             |
| ---------------------------- | ----------- | ----------------------------------------------------------------- |
| `title`                      | string      | Required                                                          |
| `status`                     | enum        | undiscovered, active, on_hold, completed, failed                  |
| `summary`                    | string      | Short description                                                 |
| `description`                | Tiptap JSON | Full narrative                                                    |
| `notes`                      | Tiptap JSON | DM-only session notes                                             |
| `giver_npc_id`               | uuid FK     | Primary quest giver NPC                                           |
| `location_id`                | uuid FK     | Primary location                                                  |
| `parent_quest_id`            | uuid FK     | For sub-quests                                                    |
| `rewards`                    | string      | Freetext reward description                                       |
| `reward_pp/gp/ep/sp/cp`      | integer     | Coin reward amounts                                               |
| `reward_item_ids`            | uuid[]      | Item FK array                                                     |
| `reward_currency_pools`      | JSONB       | Multiple named currency pools                                     |
| `reward_art_objects`         | JSONB       | Art object rewards                                                |
| `tags`                       | string[]    |                                                                   |
| `player_visible_to`          | uuid[]      | Null = not yet shared; non-null = shared with those party members |
| `started_at` / `resolved_at` | timestamp   |                                                                   |

### QuestObjective (`quest_objectives` table)

| Field               | Type    | Notes                                 |
| ------------------- | ------- | ------------------------------------- |
| `description`       | string  | Objective text                        |
| `is_done`           | boolean | Togglable in both view and edit modes |
| `is_player_visible` | boolean | Per-objective visibility toggle       |
| `sort_order`        | integer | Display order                         |

### QuestRef (`quest_refs` table)

| Field               | Type    | Notes                             |
| ------------------- | ------- | --------------------------------- |
| `ref_type`          | enum    | npc, location, monster, encounter |
| `ref_id`            | uuid    | ID of the referenced entity       |
| `is_player_visible` | boolean | Individual ref visibility         |

### QuestTrigger (`quest_triggers` table)

| Field            | Type   | Notes                                                                   |
| ---------------- | ------ | ----------------------------------------------------------------------- |
| `quest_id`       | uuid   | Parent quest (cascade delete)                                           |
| `objective_id`   | uuid?  | Set when `trigger_type = objective_done`                                |
| `trigger_type`   | enum   | `quest_complete`, `objective_done`                                      |
| `offset_days`    | int    | Days after condition fires before action executes                       |
| `action_type`    | enum   | `create_calendar_event`, `send_broadcast`                               |
| `action_payload` | JSONB  | `{title, event_type}` for calendar; `{message}` for broadcast           |

### QuestTriggerScheduled (`quest_trigger_scheduled` table)

| Field         | Type      | Notes                                           |
| ------------- | --------- | ----------------------------------------------- |
| `trigger_id`  | uuid      | FK → quest_triggers (cascade delete)            |
| `quest_id`    | uuid      | Denormalised for fast lookup                    |
| `campaign_id` | uuid      | For querying all pending triggers for a campaign|
| `fire_year`   | int       | Computed fire date (today + offset_days)        |
| `fire_month`  | int       |                                                 |
| `fire_day`    | int       |                                                 |
| `fired_at`    | timestamp | null = pending; set when fired                  |

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

### FactionRelation (`faction_relations` table)

| Field               | Type                              | Notes                                                                            |
| ------------------- | --------------------------------- | -------------------------------------------------------------------------------- |
| `faction_id`        | uuid                              | Source faction                                                                   |
| `target_faction_id` | uuid                              | Target faction                                                                   |
| `relation_type`     | enum                              | allied, friendly, neutral, suspicious, rival, hostile, secret_ally, secret_enemy |
| `notes`             | string                            | Optional notes on the relation                                                   |
| Unique constraint   | `(faction_id, target_faction_id)` | Upsert on conflict                                                               |
