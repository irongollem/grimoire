# NPC Tracker

## Overview

The NPC Tracker is the DM's central registry for every person the party might encounter — allies, enemies, merchants, sages, mysterious strangers. Each NPC is a rich record combining identity fields, roleplaying content (appearance, personality, backstory), an optional full D&D 5e stat block, faction memberships, inter-NPC relationships, PC-specific connection notes, a portrait with adjustable focal point, and an AI Voice Coach for improvising in-character dialogue at the table.

The feature comprises four main surfaces:

- **NPC List** (`/npcs`) — filterable card grid
- **NPC Detail Sheet** (`/npcs/:id`) — read-only view and edit form in the same route
- **Relationship Web** (`/npcs/web`) — interactive force-directed graph of all NPC connections
- **NPC Generator** — slide-in panel (accessible from the list header) for quick-create and AI generation

Players access shared NPCs through the **Player Portal** at `/play/party` under the "People" section.

Every NPC create/update also queues a fire-and-forget semantic-search embedding (`queueNpcEmbedding` in `useNpcs.ts` → `embed-content` edge function, #600) so retrieval-grounded generators — currently the quest-hook generator — can find the NPC by meaning. The embed text format and the full retrieval mechanism are documented in world-building.md's "Retrieval grounding" section; NPC `notes` is deliberately excluded from the embed text there.

---

## NPC List (DM)

Route: `/npcs`

### Layout

NPCs render as a responsive card grid: 1 column on mobile, 2 on sm, 3 on lg, 4 on xl. Each card shows:

- A landscape-format portrait thumbnail (`FocalImage`, 144 px tall) with a hover scale animation. Falls back to coloured initials (first two letters) in the relationship colour if no portrait.
- A relationship badge overlaid top-right on the portrait (colour-coded: ally=blue, neutral=grey, enemy=red, unknown=purple).
- NPC name (truncated), species + occupation line, location (with pin emoji if present), and up to 3 tag chips ("+N more" if overflow).
- A status dot (top-right of name row): green=alive, red=dead, amber=missing, grey=unknown.
- On hover: an "Edit" quick-link (top-left overlay) and a share/visibility toggle button.

Infinite scroll is used: items are revealed progressively as the user scrolls (`useInfiniteScroll`). A count line at the bottom shows "N of M NPCs" when filters are active.

### Filtering and Sorting

All filter state is stored in `useUiStore` and survives navigation within the session.

| Filter       | Type         | Options                                                                      |
| ------------ | ------------ | ---------------------------------------------------------------------------- |
| Search       | Full-text    | Name, disguise name, species, occupation, location name, tags                |
| Status       | Toggle group | All / Alive / Dead / Missing / ?                                             |
| Relationship | Toggle group | All / Ally / Neutral / Enemy                                                 |
| Location     | Combobox     | Hierarchical location tree; selecting a parent includes all descendants      |
| Connected to | Combobox     | Any party member — shows only NPCs with a PC-connection note for that player |
| Sort         | Toggle group | Name (alphabetical) / Location (tree order, then alphabetical)               |

A **Clear** button appears when any filter is active, calling `resetNpcsFilters()`.

### Sharing (player visibility) — quick popover

Every card has an eye/eye-off button that opens an inline popover (Teleported to `body` to avoid overflow clipping). The popover lets the DM:

- Share to the **whole party** in one click.
- Toggle visibility per individual party member.
- Remove from all players ("Hide from all players").

When an NPC becomes visible to a player for the first time while the DM is in **Play mode**, a narrative event fires to the campaign chat: _"The party encounters [name]."_ or _"[Player] encounters [name]."_

### Header Actions

- **Web** — navigates to the Relationship Web
- **Populate Setting** — shown only when the active campaign has a recognised setting (e.g. Faerûn). Bulk-inserts seed NPCs from the setting's Hall of Heroes list, deduplicating by name. Reports how many were added or whether already up to date. Also back-fills portrait URLs for existing NPCs that previously had none.
- **Generate** — opens the NPC Generator panel
- **New NPC** — navigates to `/npcs/new`; blocked by paywall if the campaign's NPC quota is exceeded.

---

## NPC Detail Sheet (DM)

Route: `/npcs/:id` (also `/npcs/new`)

The view has two modes controlled by `?edit=true` in the URL:

- **View mode** — renders `NpcSheet` (read-only)
- **Edit mode** — renders `NpcDetail` (the full form)

Toggling between modes does not lose unsaved work because edit mode is URL-driven (the form re-mounts on the keyed `:id`).

### Header Actions (edit mode)

| Button                   | Condition          | Behaviour                                                                 |
| ------------------------ | ------------------ | ------------------------------------------------------------------------- |
| Edit / View              | Existing NPC       | Toggles `?edit=true` in URL                                               |
| Delete                   | Existing NPC       | Confirms, deletes NPC + storage images, navigates to `/npcs`              |
| Scriptorium              | Existing NPC       | Formats NPC as a Scriptorium document and pushes to `/scriptorium/:docId` |
| Player Visibility Toggle | Existing NPC       | Per-player visibility multi-select                                        |
| Revealed / Concealed     | NPC has disguise   | Toggles `is_revealed` in-place                                            |
| Generate (AI)            | API key configured | Opens `NpcGenerateDialog`                                                 |
| Save / Create NPC        | Always             | Submits the `#npc-detail-form`                                            |

### Left Column — Portrait + Meta

**Portrait tabs**: "True Form" and "Alter Ego" — each with a separate `ImageUpload` with focal-point setter. The alter-ego tab is pre-selected if the NPC already has `disguise_name` or `disguise_portrait_url`.

**Party Stance** (relationship): four coloured toggle buttons — Ally (blue), Neutral (grey), Enemy (red), Unknown (purple).

**Status**: four coloured toggle buttons — Alive (green), Dead (red), Missing (amber), Unknown (grey).

**Tags**: `TagInput` component for freeform comma-separated tags.

### Right Column — Identity Section

| Field         | Type                  | Notes                                                               |
| ------------- | --------------------- | ------------------------------------------------------------------- |
| Name          | Text input (required) |                                                                     |
| Disguise Name | Text input            | The alter-ego name shown to players when concealed                  |
| Species       | Text input            | Free-text, e.g. "Half-Elf", "Tiefling"                              |
| Alignment     | Select                | 10 D&D alignments + Unaligned                                       |
| Age           | Text input            | Can be descriptive ("Ancient") or numeric                           |
| Occupation    | Text input            |                                                                     |
| Location      | EntityCombobox        | Hierarchical location tree                                          |
| Factions      | `NpcFactionsSection`  | Shown only on existing NPCs; manages faction memberships with roles |

**NPC Connections** (`NpcRelationsSection`) is embedded between Identity and the tab bar. It shows the NPC's peer relationships, allows adding new ones (target NPC + relationship type + optional notes), and inline deletion. Each entry links to the other NPC's sheet.

### Tab Bar

Three tabs in edit mode, five tabs in view mode:

#### Lore Tab

| Field       | Type           |
| ----------- | -------------- |
| Appearance  | RichTextEditor |
| Personality | RichTextEditor |
| Backstory   | RichTextEditor |
| DM Notes    | RichTextEditor |

All fields are nullable; empty fields are hidden in view mode.

#### Inventory Tab

`NpcInventorySection` — lets the DM add items from the vault to this NPC's carry list. Items show quantity, optional notes, and a "Vault" link. A **Drop to Chat** button (gift icon) sends the item as a chat message drop event and removes it from the NPC's inventory in one click (for loot hand-outs during play).

#### Relations Tab (view mode only)

Surfaces `NpcRelationsSection` in read-only mode so DMs can review — and manage — relationships without entering edit mode. See the Web section for the graph alternative.

#### Combat Tab

**Two ways to populate the stat block:**

1. **From template**: a grouped `<select>` backed by `NPC_TEMPLATES` / `NPC_TEMPLATE_CATEGORIES` in `src/data/npcTemplates.ts`. Applying a template fills all numeric fields and trait lists.
2. **From Bestiary**: searches all campaign monsters via `EntityCombobox`. Selecting one imports its full stat block, portrait, alignment, and tags. If the monster is SRD-only (no UUID), data is imported as a template without a stored link. Non-SRD monsters store a `linked_monster_id` FK; a "View in Bestiary →" link appears. A **Promote to Monster** button (visible when no link exists) creates a new Bestiary entry from the NPC's current data and immediately navigates there.

**"Include stat block" checkbox** controls whether a stat block is attached on save.

**Stat block fields:**

| Section            | Fields                                                                                                                                               |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Core               | Armor Class, Hit Points (dice expression via `DiceExprInput`), Speed (structured: Walk / Fly with Hover toggle / Swim / Climb / Burrow, each in ft.) |
| Abilities          | STR / DEX / CON / INT / WIS / CHA (shows computed modifier below each input)                                                                         |
| Derived            | Challenge Rating, Proficiency Bonus, Saving Throws, Skills                                                                                           |
| Defenses           | Damage Resistances, Damage Immunities, Condition Immunities                                                                                          |
| Senses & Languages | Senses (string), Languages (string)                                                                                                                  |
| Traits             | Special Abilities (`TraitSection`) — repeating name + RichTextEditor pairs                                                                           |
| Spellcasting       | `SpellcastingSection` — ability (INT/WIS/CHA), save DC, attack bonus, spell entries by frequency                                                     |
| Actions            | Actions (`TraitSection`)                                                                                                                             |
| Legendary          | Legendary Actions (`TraitSection`)                                                                                                                   |

#### Voice Tab (view mode only)

At the table, a player asks the NPC something the DM didn't prep for. The Voice Coach turns a one-line description of the situation into 2–3 short, in-character replies the DM can read aloud immediately (issue #336). Nothing is persisted — the situation text and the returned lines live only in the component's local state and vanish the moment the DM navigates away.

**One shared component, not two surfaces.** The tab renders `NpcVoiceCoach.vue` directly, and it is the exact same component instance on desktop (`NpcTabContent.vue`'s "Voice" tab) and on mobile (`NpcDetailMobile.vue`'s "Voice Coach" accordion section, closed by default like the other sections). There is one implementation to keep correct, not two that can silently diverge — this repo has been bitten by that failure mode before, so it's worth stating explicitly rather than leaving it implicit.

**What the AI receives.** The DM types the situation (capped at `AI_PROMPT_LIMIT_SHORT`, 500 characters). The edge function (`generate-npc-voice/index.ts`) loads the NPC row from the database itself by `npc_id` rather than trusting any client-supplied NPC facts, then builds a profile (`buildNpcProfile()`) containing: name, race, alignment, age, occupation, status, relationship toward the party, and Tiptap-flattened (`toPlainText()`) personality (≤800 chars), backstory (≤600 chars), and DM notes (≤600 chars) — each field omitted entirely, never emitted as an empty label, when absent. A campaign-setting context block is appended when the campaign has one configured. No party query, no monster index, and no ruleset-context fetch — this is pure dialogue with no rules content, so that context would be dead prompt weight on a call felt live at the table.

**The disguise rule.** When the NPC has a `disguise_name` and `is_revealed` is `false`, the true name is not sent to the model at all — not masked, not flagged "do not reveal," simply absent from the profile. The model receives only the disguise name, plus an explicit instruction to stay in that persona. Handing a model a secret behind a "don't say this" instruction is a strictly weaker guarantee than withholding the secret outright, and the true name adds nothing to voice quality that personality, occupation, and backstory don't already supply — while the failure mode of getting it wrong is a DM reading a suggested line aloud at speed and blowing a reveal that's been built for months. The backstory is still sent even while disguised, since it's what makes the persona sound like a person, paired with an instruction not to surface any detail that would expose the cover. `buildNpcVoiceProfile.test.ts` carries a load-bearing `expect(profile).not.toContain(npc.name)` assertion guarding exactly this.

**Three deliberate deviations from every other AI generator** (`useNpcVoiceCoach.ts`):

- Not registered via `registerAiGenerator()` — this is ephemeral at-table assistance with no entity to route to, and nothing for the AI-generation badge to track.
- Never gated on, and never sets, `isAnyAiGenerating` — a DM mid-session may have a portrait rendering in the background at the same time, and blocking the voice coach behind that flag would defeat the point of a feature whose whole value is speed.
- Does not call `startAiQuotes()` / `stopAiQuotes()` — that loading-text carousel is a single global instance, and hijacking it would stomp the loading text of a concurrent real generation running elsewhere in the app. The component shows its own plain "Finding the words…" state instead.

**Latency.** The feature is non-streaming — like every other AI generator in this codebase, it calls the shared `callText()` (`_shared/textGen.ts`), a single request/response round trip rather than a stream. Output is capped at 350 tokens, generous relative to the 2–3 short lines the prompt actually asks for; the cap exists to guard against runaway cost rather than to bound useful output, since OpenAI is called with `response_format: json_object` and a response truncated at the cap would come back as invalid JSON rather than merely a short answer. Streaming was not implemented here: fixed per-call overhead (cold start, auth, the NPC row read) makes up a meaningful share of the total round trip on a response this short, so the perceived-latency benefit of streaming would be modest set against the cost of reworking the credit ledger (`reserveCredits`/`recordGeneration` in `_shared/credits.ts`) to account for usage arriving with a streamed response instead of one synchronous one.

**Credit cost.** 1 credit, `npc_voice_generation` in `ai_generation_credit_costs`, multiplied by the active text provider's `text_multiplier` — the same convention as every other text generator. The system prompt lives in `ai_system_prompts` under `generator_type = 'npc_voice'`. Both rows are seeded by migration `20260802000001_npc_voice_coach_ai.sql`. BYOK generations are charged 0 credits but still recorded via `recordGeneration` (server) / `logUsage` (client), so generation history stays complete even when nothing was spent.

**Client-side (BYOK/local) mirror.** `src/lib/npcs/buildNpcVoiceProfile.ts` is a hand-kept client copy of the edge function's `buildNpcProfile()`, used when the DM is in local-vault BYOK mode (`grimoire_key_local_mode === "local"` in `localStorage`) so the NPC profile can be built in-browser without a server round trip that would leak the local key. Same precedent as `_shared/ai-prompt.ts` mirroring `src/ai/utils.ts` — there is no shared source of truth between edge and client for this logic, so the two must be changed together by hand.

### Revealed Fields Panel (shared NPCs)

When a NPC is shared with at least one player, a panel appears at the top of the edit form. It contains:

**Checkboxes for per-field visibility** (which fields players can see):

- Portrait, Name, Alive/Dead status, Species, Occupation, Relationship (ally/enemy…), Location

**Party Notes** (`PlayerNotesWidget`) — rich-text notes visible to the whole party.

**PC Connection Notes** (`NpcPcNotesSection`) — per-player notes with a relationship type tag (e.g. "Contact", "Mentor"). Each note is tied to one party member and visible only to them in their portal. Uses RichTextEditor with the PC selector and relationship type dropdown embedded in the toolbar.

### View Mode (NpcSheet)

The read-only sheet uses a two-column layout (portrait column fixed 208 px, content column scrolls).

Left column: portrait (portrait format), status + relationship badges, tags, faction links (clickable), alter-ego section with a quick Reveal/Conceal toggle (saves immediately, no edit-mode required; fires a chat event on reveal in Play mode).

Right column: `NpcTabContent` with identity line (species · occupation · alignment · age), then Lore / Inventory / Relations / Combat / Voice tabs. The Relations tab embeds both `NpcRelationsSection` (NPC↔NPC) and `NpcPcNotesSection` (NPC↔party-member connections) so both are visible — and editable, since the sections own their CRUD — from view mode without flipping into the edit form (#168/#169).

### Alter Ego / Disguise System

An NPC can have a parallel identity:

- `disguise_name` — the name shown to players while concealed
- `disguise_portrait_url` / `disguise_portrait_focal_point` — separate portrait for the false identity
- `is_revealed` — DM-controlled flag; when `false` the disguise name/portrait is shown to players instead of the true form

The DM always sees both identities. The page title and list card show the disguise name when `is_revealed` is `false`. The `getNpcDisplayName`, `getNpcDisplayPortrait`, and `getNpcDisplayFocalPoint` helpers in `src/lib/npcDisplay.ts` centralise this logic.

---

## Relationship Web

Route: `/npcs/web`

A full-viewport force-directed graph rendered with `v-network-graph` (VNetworkGraph) using ForceLayout. Nodes are positioned automatically with dragging pinned by the user.

### Nodes

- **NPC nodes**: coloured circles sized 18 px radius, colour = relationship colour (ally blue, neutral grey, enemy red, unknown purple). Labels shown.
- **PC nodes** (togglable): larger circles (22 px radius), amber/gold colour, labelled with party member name.

### Edges

- **NPC–NPC**: solid line, coloured by the relationship type from the full 13-type taxonomy (ally, family, friend, rival, enemy, mentor, apprentice, lover, subordinate, superior, contact, former_ally, former_enemy). Each type has a distinct colour.
- **NPC–PC**: dashed line, coloured by the note's relationship type.

Only one edge is drawn per pair regardless of directionality (the inverse type is computed on read).

### Filters and Controls

| Control                    | Behaviour                                                                            |
| -------------------------- | ------------------------------------------------------------------------------------ |
| Search input               | Filters nodes by NPC name or disguise name; selected/linked nodes are pinned visible |
| Party Members toggle       | Shows/hides PC nodes and their edges                                                 |
| Location dropdown          | Shows only NPCs at that location (including descendants)                             |
| Relationship type dropdown | Shows only edges of that type (considering inverse)                                  |
| Legend                     | Colour swatches for Ally/Neutral/Enemy + dashed line = PC link                       |
| Clear                      | Appears when any of the four is active; calls `resetNpcWebFilters()`                 |

All four live in `useUiStore` (`npcWebSearch`, `npcWebShowPcs`, `npcWebFilterLocation`, `npcWebFilterType`) and survive navigating to an NPC sheet and back (#723). A graph is not a list, which is why the Filter State Pattern audit skipped it — but the filters are filters, so it gets the same treatment. `NpcWebTopBar` stays prop/emit-driven (the view owns where the state lives) and bridges to the `ListSearchInput` / `ListFilterSelect` v-models with local writable computeds.

### Side Panel

Clicking a node opens a sliding panel on the right (absolute overlay — the graph SVG never resizes).

**NPC panel**: portrait thumbnail, name, occupation, species, relationship + status badges, a shift-click hint, an "Open Sheet" button, and a CONNECTIONS list for that NPC. Each connection row shows a type badge and the other NPC's name; clicking a row enters inline editing (type selector + notes field + save/cancel/delete).

**PC panel**: portrait, name, Party Member badge, class + species + level, "Open Sheet" button (links to `/party/:id`).

**New / edit connection form**: triggered by:

1. Clicking an existing edge — pre-fills type and notes from the stored relation.
2. Shift+clicking a second node after selecting the first — creates a new connection between the two nodes. Works for NPC–NPC and NPC–PC pairs.

The form shows both node names, a relationship type selector, and an optional notes field. For NPC–NPC the relationship type uses the full 13-type taxonomy; for NPC–PC it uses the same taxonomy. The inverse type is automatically stored on the correct side.

---

## NPC Generator

The Generator is a right-side slide-in panel (`max-w-md`), opened from the list page header. It supports two create paths: AI generation and quick create.

### Quick Create

Fills a minimal NPC with:

- Name (optional — auto-generates from `FIRST_NAMES` + `LAST_NAMES` tables if left blank)
- Species (from a preset list of 15 common races)
- Alignment
- Relationship (party stance)
- Faction (any campaign faction) + Role in faction
- Location (location tree combobox)
- Stat block template (grouped by category from `NPC_TEMPLATE_CATEGORIES`)
- Known associate (any existing NPC) + relationship type to them

After creation, faction membership and the associate relationship are added automatically.

### AI Generation (requires OpenAI API key in Campaign Settings)

An additional **Concept** textarea (required) prompts the AI with a free-text description. Quick option fields (name, species, alignment, relationship, faction, location, associate) are injected as constraints into the prompt.

Additional AI options:

- **Generate portrait art** toggle (on by default) — generates an image via OpenAI
- **Generate Alter Ego** toggle (requires portrait toggle on) — generates both a true-form portrait and a disguise portrait (uses 2× image generation credits)

Generation can be **dismissed to background**: the panel closes while the AI call continues. A badge in the nav or list indicates when generation finishes.

On completion, all AI-returned fields are applied to the NPC form (name, species, alignment, age, occupation, status, relationship, tags, appearance, personality, backstory, notes, portrait URL, disguise name, disguise portrait URL) and the user is taken to the new NPC's detail page.

A **Generate** button is also available from within an existing NPC's edit form (header action) via `NpcGenerateDialog`, which applies results to the current NPC rather than creating a new one.

---

## Player Portal

Players access shared NPCs through `/play/party` under the **"People"** section, which appears when at least one NPC has been shared with them.

### What Players See

Each player sees only the NPCs where their party member ID is in `player_visible_to`. The content of each card and lightbox is further restricted by `player_visible_fields` — the DM selects a subset of: Portrait, Name, Status, Species, Occupation, Relationship, Location.

Fields not in `player_visible_fields` are silently omitted or replaced:

- If portrait is hidden but one exists, a mystery-figure placeholder image is shown instead.
- If name is hidden, "???" is displayed.

The alter-ego system integrates transparently: if the NPC is not yet revealed (`is_revealed: false`) and has a disguise, players see the disguise name and disguise portrait automatically. The DM's true-form data is never sent for unrevealed NPCs.

### Player NPC Card (`PlayerNpcCard`)

Portrait (3:4 aspect ratio), name (or "???"), status dot, species, occupation, location (if the location field is visible). A **1–5 star relevance rating** system is shown at the bottom of each card, stored per player in `player_npc_ratings`. Ratings affect sort order (higher rated NPCs appear first). Legacy `player_npc_rating:<npc-id>` browser values are uploaded for visible NPCs and removed only after the server copy is confirmed readable.

### Sort and Filter (People section)

Sorted by: star rating (descending) → location name → NPC display name.

Filters (state in `useUiStore`):

- Text search: searches name, species, occupation (only fields that are visible for each NPC)
- Relationship filter (shows only if relationship field is visible for the NPC)
- Status filter (shows only if status field is visible)
- Location filter (dropdown populated from locations of visible NPCs)

A **Clear** button appears when filters are active.

### NPC Lightbox

Clicking a card opens a modal with:

- Full-height portrait (if portrait field is visible)
- Name, relationship badge, status badge, species, occupation (each gated by `player_visible_fields`)
- **Your Connection** box — the DM's per-PC connection note for this player (`useMyNpcPcNote`), displayed read-only with `RichTextViewer`
- **Player Notes** (`PlayerNotesWidget`) — personal notes the player can write about this NPC, stored per-player per-NPC in the `npc_player_notes` table (not shared with other players or the DM)
- Relevance star rating (also in the lightbox header)

### NPCs in Other Player Portal Views

- **Player Locations (Atlas)** — `useSharedNpcsByLocations` surfaces shared NPCs at visible locations on the atlas.
- **Player Journal** — shared NPC names appear as @mention options in journal entries.
- **Player Quests** — NPC names appear in quest detail when linked.
- **Player Factions** — shared NPCs listed as faction members when the faction is visible.

---

## Key Capabilities / USPs

- **Field-level player visibility**: rather than showing all-or-nothing, the DM controls exactly which of 7 fields are visible per NPC (portrait, name, status, species, occupation, relationship, location). This allows mysteries — an NPC can be "known" (portrait shown, location shown) but still anonymous (name hidden).
- **Alter-ego / disguise system**: NPCs can have a parallel identity (separate name, portrait, focal point). The DM toggles `is_revealed` at any time from the sheet header or the list; a chat event fires automatically in Play mode when the reveal happens.
- **Per-PC connection notes**: the DM can write individual notes for each party member's relationship with an NPC. Each player sees only their own note in the portal lightbox, creating personalised backstory.
- **Relationship Web with inline editing**: a force-directed graph of all NPC connections. Edges are clickable to edit/delete. Shift+click creates new connections directly on the graph without leaving the view.
- **13-type directional relationship taxonomy** with automatic inverse type: storing "Mentor" from NPC A's side automatically reads as "Apprentice" from NPC B's side.
- **AI NPC generation with alter-ego support**: one generation call can produce both a true-form portrait and a disguise portrait. Generation runs in background so the DM can dismiss the panel and continue working.
- **Setting population**: Faerûn campaigns can bulk-insert canonical NPCs (Hall of Heroes) in one click, with name-based deduplication and portrait back-fill.
- **Bestiary bridge**: an NPC can link to a Bestiary monster (import stat block), or be promoted to a full Bestiary entry. Dual-direction linking: NPCs can also be exported to the Scriptorium as formatted documents.
- **Player relevance ratings**: players can star-rate NPCs 1–5 in their portal to surface important characters; starred NPCs sort first and persist across browsers/devices via `player_npc_ratings`.
- **AI Voice Coach for at-the-table dialogue**: a one-line situation prompt returns 2–3 short, ready-to-read in-character replies (issue #336), ephemeral and never persisted. One shared component renders identically on the desktop "Voice" tab and the mobile "Voice Coach" accordion. A disguised, unrevealed NPC's true name is withheld from the model entirely rather than merely instructed not to reveal it — a stronger guarantee against an accidental spoiler read aloud mid-session.

---

## Data Fields

### Npc (core table)

| Field                           | Type                                        | Description                                                              |
| ------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------ |
| `id`                            | uuid                                        |                                                                          |
| `campaign_id`                   | uuid                                        | FK to campaigns                                                          |
| `name`                          | string                                      | True name                                                                |
| `disguise_name`                 | string \| null                              | Alter-ego name                                                           |
| `race`                          | string \| null                              | Free-text species                                                        |
| `alignment`                     | string \| null                              | e.g. "Lawful Good"                                                       |
| `age`                           | string \| null                              | Descriptive or numeric                                                   |
| `occupation`                    | string \| null                              |                                                                          |
| `location_id`                   | uuid \| null                                | FK to locations                                                          |
| `appearance`                    | Tiptap JSON \| null                         | Rich text                                                                |
| `personality`                   | Tiptap JSON \| null                         | Rich text                                                                |
| `backstory`                     | Tiptap JSON \| null                         | Rich text                                                                |
| `notes`                         | Tiptap JSON \| null                         | DM-private notes (rich text)                                             |
| `status`                        | `alive` \| `dead` \| `missing` \| `unknown` |                                                                          |
| `relationship`                  | `ally` \| `neutral` \| `enemy` \| `unknown` | Party stance                                                             |
| `portrait_url`                  | string \| null                              | Storage URL                                                              |
| `portrait_focal_point`          | `{x,y}` \| null                             | 0–100 percentages                                                        |
| `disguise_portrait_url`         | string \| null                              | Alter-ego portrait                                                       |
| `disguise_portrait_focal_point` | `{x,y}` \| null                             |                                                                          |
| `is_revealed`                   | boolean                                     | Whether true identity is shown                                           |
| `tags`                          | string[]                                    | Freeform                                                                 |
| `stat_block`                    | StatBlock JSONB \| null                     | Full D&D 5e stat block                                                   |
| `linked_monster_id`             | uuid \| null                                | FK to monsters table                                                     |
| `scriptorium_doc_id`            | uuid \| null                                | FK to scriptorium_documents                                              |
| `player_visible_to`             | uuid[]                                      | Party member IDs who can see this NPC                                    |
| `player_visible_fields`         | string[]                                    | Subset: portrait, name, status, race, occupation, relationship, location |

### StatBlock (JSONB sub-document)

AC, HP (dice expression string), Speed (string), STR/DEX/CON/INT/WIS/CHA, Challenge Rating, Proficiency Bonus, Saving Throws, Skills (record), Damage Resistances/Immunities, Condition Immunities, Senses, Languages, Special Abilities (name+description array), Actions (name+description array), Legendary Actions (name+description array), Spellcasting (ability/save DC/attack bonus/entries).

### NpcRelation (separate table)

`npc_id`, `related_npc_id`, `relationship_type` (13-type enum), `notes` — directional; the inverse type is computed on read.

### NpcPcNote (separate table)

`npc_id`, `party_member_id`, `relationship_type`, `notes` (Tiptap JSON) — one row per (NPC, party member) pair.

### npc_player_notes (separate table)

`npc_id`, `user_id`, `notes` — player's personal observations, one row per (NPC, user account) pair. Not visible to DM or other players.
