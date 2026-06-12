# Party Tracker & Character Management

## Overview

Party & character management in Grimoire spans three interconnected feature areas:

1. **Party Tracker** (`/party`) — the DM's live combat dashboard for all party members
2. **Character Codex** (`/codex/*`) — the DM's compendium of character options (species, backgrounds, classes, archetypes, abilities)
3. **Hall of Heroes** (`/hall-of-heroes`) — a cross-campaign library of reusable iconic characters
4. **Player Portal** (`/play/*`) — players' own interface for creating, editing, levelling, and viewing their characters and party

All party data is stored in the `party_members` Supabase table, scoped to the active campaign. Real-time sync via Supabase Postgres changes means DM edits (e.g. HP damage) appear instantly on a player's sheet without a page refresh.

---

## Party Tracker (DM)

**Route:** `/party` — `PartyView.vue` + `PartyTracker.vue`

The Party Tracker is the DM's primary combat dashboard. It lists every party member as a card sorted by initiative (when all members have rolled) or by manual `sort_order`.

### Combat Flow

**Initiative:**

- "Roll All Initiative" button prompts each member's d20 roll in sequence (uses `usePromptedRoll`) and stores results as `current_initiative` in the DB.
- Cards automatically re-sort highest to lowest once everyone has rolled.
- "Clear Initiative" resets all values, returning cards to `sort_order`.
- Individual members can also be rolled from inside their character sheet view.

**HP Tracking:**

- Each card has a numeric input, then three action buttons: **Damage**, **Heal**, **+Temp**.
- Damage applies to temporary HP first; overflow flows to current HP (can go negative down to `-max_hp`).
- Healing also resets death save counters.
- Temp HP takes the higher of existing and new value (does not stack by default).
- A colour-coded HP bar provides instant visual triage (green → yellow → orange → red → destructive red at 0).

**Death Saves:**

- Appear automatically when `current_hp <= 0`.
- Three success pips (green) and three failure pips (red), clickable to increment. Cycling past 3 resets to 0.

**Conditions & Curses:**

- A "+" Condition button opens a dropdown of all D&D 5e conditions not already applied.
- Exhaustion is handled by `ExhaustionChip` with pip-level controls (1–6).
- Curses are a separate tracked list displayed as violet-coloured chips. Adding a curse also automatically adds the "Cursed" condition tag. When all curses are removed, the "Cursed" condition clears.
- Each condition/curse chip has an inline × button to remove it.

**Inspiration:** A sparkle toggle per character. Toggling sets `inspiration: true/false`.

**Passive Skills (read-only, auto-calculated):**
Each card displays a grid of computed passives: Passive Perception, Insight, Investigation, Arcana, History, Nature, Religion. All are 10 + relevant ability modifier + proficiency bonus (doubled for expertise).

### Companions

Each party member card has a **Companions** sub-section. The DM can add named companions (familiars, mounts, summoned creatures, NPC allies, etc.) via `CompanionForm`. Companions have their own HP, AC, and condition tracking. They can be linked to a specific monster or NPC entry as their "source". Unowned companions (no specific owner) appear in a separate "Unassigned Companions" block below the party list.

### Party Inventory

A shared **Party Inventory** section below the party cards tracks items carried by the group rather than individual characters. Items can be:

- Added via a combobox that searches the Vault (item catalog) or allows custom names
- Assigned to a specific party member as the carrier
- Quantity-adjusted with +/− controls
- Attuned (ATT toggle)
- Dropped to the campaign chat (removes from inventory and announces to all players)
- Linked items show a rarity colour dot and type label

### Shapeshifter Disguise Badge

When a party member with `disguise_species_id` set is in disguise, the DM sees a `◈ disguised` badge in amber on their identity card. The DM always sees the true species. See the Shapeshifter section below for full details.

### Member Locations

Each member card shows their current location (linked to `/locations/:id`) or "Location unknown" if `current_location_id` is null. The `locationNameMap` is resolved from `useAllLocations`.

### DM Member Detail

Clicking a member's name navigates to `/party/:id` (`PartyMemberView.vue`), which renders the full `PlayerCharacterView` in read-only mode (`hide-player-actions` prop). An "Edit" button in the top bar opens `PartyMemberForm` as a right-anchored side-sheet without navigating away.

---

## Character Sheet (DM View via PartyMemberForm)

**Route:** Slide-in panel triggered from `/party/:id`

`PartyMemberForm` is a tabbed side-sheet with the following tabs:

### Identity Tab

- **Portrait** upload with focal-point control (stored in `npc-portraits` bucket)
- **Player assignment** — links the character to a `campaign_members` row (the player sees this character on their `/play` portal)
- **Species** — entity combobox sourced from the species compendium; shows **Variant** (subrace) selector if the species has subraces
- **Disguise** fields (shown only for shapeshifter species) — "Appears as" species + variant
- **Class** — if the character was built using the Level Up wizard, class/subclass/level are shown read-only with a "Level Up →" link; otherwise editable dropdowns/inputs
- **Level** (editable if no builder data, else derived from `CharacterClasses` table)
- **Proficiency Bonus** auto-calculated from level
- **Notes** — rich-text (Tiptap) field for background, personality, goals

### Stats Tab

- **Ability Scores** (STR, DEX, CON, INT, WIS, CHA) with live modifier display
- **Combat stats**: Max HP, Current HP, Temp HP, AC, Speed (ft), Initiative Bonus, Carry Capacity Override (`*2`, `+30`, `150`, or blank for STR×15)
- **Computed passives** (read-only): Passive Perception, Insight, Investigation
- **Saving throw proficiencies** checkboxes (6 stats)
- **Skill Proficiencies** grid: None / Proficient / Expertise per skill

**Shield AC** — the stored `party_members.ac` is the armor class WITHOUT shield. An equipped (non-ruined) shield in the paper doll adds its `armor_class` bonus at display time via `useShieldAcBonus()` (`src/composables/useShieldAc.ts`, pure logic + tests in `src/lib/shieldAc.ts`). Wired into: PlayerCharacterHeader, PlayerPartyMemberCard, PartyMemberLightbox, PartyTrackerRow, RunnerPcPanel, useRunnerCombatant, and CharacterSheetRenderer (via `acBonus` prop — the renderer is mounted with a bare `createApp` for PDF export, so it can't use query composables). Wildshaped characters show the beast AC with no shield bonus. Both AC edit fields (CharacterEditTabs, PartyMemberAbilitiesTab) carry a "without shield" hint.

### Equipment Tab

- Free-text armor, weapons, items fields plus worn slots (ring1/ring2/waist etc.)

### Location Tab

- Sets `current_location_id` via entity combobox

---

## Character Codex

**Route:** `/codex/:tab` — `CharacterCodexView.vue`

The Character Codex is the DM-facing compendium for all character creation options. It uses a tabbed layout at `/codex/species`, `/codex/backgrounds`, `/codex/classes`, `/codex/archetypes`, and `/codex/abilities`. Tab state is stored in `useUiStore.codexActiveTab` and synced to the URL so deep links work. DMs see create/import buttons; players (if they access this route) see read-only lists.

### Species Tab

Filterable by text search and size (Tiny / Small / Medium / Large). Each species entry can be viewed as a detail sheet or edited.

**Species fields (from `SpeciesDetail` form):**

- Name, size, source attribution
- `is_shapeshifter` flag — enables the shapeshifter disguise feature for any character of this species
- Subraces (list) — drives the Variant dropdown in character creation
- Traits — rich-text descriptions

**Open5e import panel:** Searches the Open5e API and bulk-imports species, deduplicating by slug.

**Species Detail view** (`SpeciesDetailView.vue`): Toggles between a read-only `SpeciesSheet` and editable `SpeciesDetail` based on `?edit=true` query param. `DetailActions` (save/delete) live in the PageHeader `#actions` slot.

### Backgrounds Tab

Filterable by search and source (Custom / Open5e). Supports bulk import from Open5e with a source picker (multi-select checkboxes from live Open5e document list). Import is incremental: reports `inserted` and `updated` counts.

**Background fields:**

- Name, source/source_title
- Feature name and feature description
- Skill/tool/language proficiencies
- Starting equipment description
- Personality traits, ideals, bonds, flaws (rich text or freeform lists)

**Background Detail view** (`BackgroundDetailView.vue`): Same edit/view toggle pattern as Species.

### Classes Tab

Lists both imported SRD classes (`system_classes` table, read-only) and custom classes (`custom_classes` table, editable). Filtered by text search with filter state in `useUiStore`.

**"Import from Open5e"** button pulls the Black Flag SRD class list into `system_classes`, deduplicating by slug.

**Custom Class Editor** (`CustomClassEditorView.vue`) — full-featured class designer:

1. **Identity** — class name, hit die (d6/d8/d10/d12), primary ability, subclass-granting level, campaign scope (all campaigns or one specific campaign)
2. **Proficiencies** — saving throw checkboxes (STR/DEX/CON/INT/WIS/CHA), armor proficiency tags, weapon proficiency tags
3. **Features per Level** — assign any ability from the Abilities compendium to any level 1–20 via entity combobox chips
4. **Ability Score Increase Levels** — configure which levels grant ASI (defaults: 4, 8, 12, 16, 19)
5. **Spellcasting** — toggle on/off; if on: caster type (prepared/spellbook/known), slot recovery (long/short rest), spells-known table toggle, cantrips-known table toggle, prepared ability (WIS/INT/CHA), prepared spell scaling (full level or half level), and a full 20×9 spell slot grid
6. **Wizard Steps** — define prompted choices shown to the player during level-up (e.g. "Choose Fighting Style at level 1"); each step has: level, type (pick-one or accumulate), options source (Abilities compendium / Spellbook / Custom text), key, label, description, option list
7. **Resource Pools** — tracked pools shown on the character sheet; each pool has: key, label, recharges-on (short/long rest), scaling (fixed value / per class level / custom 20-value table)

### Archetypes Tab

Filterable by text search and by class name. Lists both SRD-imported and custom subclasses. Class name filter dropdown is built from the union of `system_classes` and `custom_classes`.

**"Import from Open5e"** button imports Black Flag SRD subclasses.

**Custom Archetype Editor** (`CustomSubclassEditorView.vue`) — same structure as Custom Class Editor but scoped to a base class:

- Base class selector (all known class names, SRD + custom)
- Description (plain text flavour)
- Features per Level
- Wizard Steps
- Resource Pools
- Campaign scope

### Abilities Tab

The Abilities compendium is the shared library of named features used by both classes and archetypes. Filterable by search and type.

**Feature types** (from `FEATURE_TYPES`): class feature, species trait, background feature, feat, fighting style, metamagic, maneuver, invocation, infusion, other.

**"Sync from Open5e"** runs two operations: first imports SRD features (`useImportSrdFeatures`), then backfills descriptions for any system features that lack them (`useBackfillSystemFeatureDescriptions`). The button label reports `N added`, `M updated`, and `K descriptions filled`.

Features are linked to classes/archetypes by UUID reference stored in the `features` JSONB column of `custom_classes` / `custom_subclasses`.

---

## Hall of Heroes

**Route:** `/hall-of-heroes` — `HallOfHeroesView.vue`

The Hall of Heroes is a cross-campaign library of pre-built reusable characters — iconic NPCs or player characters that can be imported into any active campaign. It is owned at the application level (requires `isAppAdmin` to create/edit) rather than per-campaign.

### List View

Cards displayed in a responsive grid. Each card shows:

- Portrait (focal-point aware) or initial placeholder
- Setting badge (e.g. "Faerûn", "Eberron")
- `✦` marker if the hero's setting matches the active campaign's calendar/setting — these float to the top of the list
- Name, species, occupation
- Up to 3 tags (with overflow count)
- **"Add to Campaign"** button (disabled without an active campaign) — imports the hero as an NPC into the campaign's NPC list and navigates to `/npcs`
- Edit and Delete buttons (app admin only)

**Filters:** Text search (name, species, occupation, tags) and setting filter dropdown. Filter state lives in `useUiStore.hallOfHeroesSearch` and `.hallOfHeroesFilterSetting`.

**"Sync All Settings"** (app admin) — runs `usePopulateAllSettingHeroes`, a bulk seeding operation.

### Hero Detail View (`HeroDetailView.vue`)

Two-column layout:

- **Left:** Portrait, identity fields (Species, Alignment, Occupation, Age, Status with colour coding — green/red/amber/gray, Setting), tags
- **Right:** Rich-text sections — Appearance, Personality, Backstory, DM Notes (only visible to app admin)

### Hero Editor View (`HeroEditorView.vue`)

Accessible only to app admins. Fields:

- Portrait + focal-point upload
- Setting selector (from `DND_SETTINGS`)
- Name (required), Species, Alignment (full 9-alignment list + Unaligned), Occupation, Age
- Status (alive/dead/missing/unknown)
- Tags (`TagInput`)
- Rich text: Appearance, Personality, Backstory, DM Notes

Also stores: `card_art_url`, `disguise_name`, `disguise_portrait_url`, `disguise_portrait_focal_point`, `is_revealed`, `relationship`, `stat_block` — the full NPC type shape so the hero becomes a proper NPC on import.

---

## Player Portal — Character Management

**Routes:** `/play/*` — the player-facing portal

### Champions List (`/play/champions` — `PlayerChampionsView.vue`)

A player may have multiple characters in a campaign (e.g. a backup character). The Champions view lists all their owned characters with:

- Portrait, name, species + class + level summary
- **"Set Active"** button — updates `campaign_members.party_member_id`, changing which character is linked and visible to the DM
- **"Edit"** link — navigates to `play-character-edit`
- **"Level Up"** link (active character only, if level > 0)
- Active indicator bar (primary-colour bottom border)

### Character Create / Edit (`/play/character/create` — `PlayerCharacterCreateView.vue`)

This view switches between two modes based on whether a `memberId` query param is present (or the player already has a linked character):

- **Create mode:** `CharacterCreateWizard` — a multi-step wizard that walks the player through name, species, background, class selection, ability score allocation, and equipment.
- **Edit mode:** `CharacterEditTabs` — a tabbed form for updating an existing character (same data as the DM's `PartyMemberForm` but in the player's own portal).

Both are provided the shared `useCharacterCreationForm` composable via `provide(CHARACTER_FORM_KEY, form)`.

### Character Sheet (`/play` — `PlayerCharacterView.vue`)

The primary player-facing character sheet. Also used by the DM via `PartyMemberView` (with `hide-player-actions` prop) and in DM preview mode.

**Header section** (`PlayerCharacterHeader`):

- Portrait, name, class/level, species, background
- Current HP / Max HP with temp HP display
- Colour-coded HP bar (green → amber → red → grey at 0)
- AC, Speed, Initiative
- Inspiration indicator
- Mobile HP bar

**Ability Scores** (`AbilityScoreTable`):

- 6 ability scores with modifiers shown
- Saving throw bonuses (modifier + proficiency if applicable)
- Clickable to roll: clicking an ability score prompts a d20 roll (with advantage/disadvantage applied automatically if a condition requires it); result displayed in `RollToast`

**Conditions** (`PlayerConditions`):

- Active conditions shown as chips with context-aware effect descriptions
- Players can view conditions but typically cannot add/remove them (DM-controlled)

**Custom Trackers** (`PlayerTracksSection`):

- Campaign-specific rule-based trackers (from `useRules`) rendered as progress pips or counters
- DM preview sees all rules; players see only `player_visible` rules

**Shapeshifter appearance controls** (`PlayerAppearanceSection`):

- Shown only if the player's true species has `is_shapeshifter = true`
- Lets the player pick a disguise species (see Shapeshifter section)

**Tabs:**

| Tab        | Component           | Contents                                                                                                                                                                      |
| ---------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Skills     | `PlayerSkillsTab`   | Full skill list with proficiency/expertise indicators, passive scores, clickable roll buttons                                                                                 |
| Features   | `PlayerFeaturesTab` | Class features and species traits from the character's class/archetype data; expandable descriptions via `RichTextViewer`                                                     |
| Combat     | `PlayerCombatTab`   | Attack entries, spell slots, resource pools; attack rolls with advantage/disadvantage from conditions                                                                         |
| Wild Shape | inline              | Druid-only; usage pips (2/day at level 2+), CR limit display, Circle of Moon label; beast picker showing discovered + DM-pinned beasts filtered by CR/level/type restrictions |

Wild Shape tab is only shown for Druid characters (detected by class name containing "druid") or when a wildshape is already active.

**Wild Shape mechanics:**

- Beast forms come from the monster bestiary filtered to: discovered by the player OR pinned by DM, type = "beast", CR ≤ level-appropriate cap, and fly/swim speed gated to level 8+
- Clicking a beast opens a lightbox with full stat block (special abilities, actions, bonus actions, reactions)
- Confirming replaces the member's `wildshape_state` JSONB with beast name, HP, AC, and monster ID
- Beast HP/AC appear on the sheet header while transformed; STR/DEX/CON from beast, INT/WIS/CHA from character
- "Revert" clears `wildshape_state`

### Level Up (`/play/levelup` — `PlayerLevelUpView.vue`)

Wraps `LevelUpWizard` with a target level (from query param or current level + 1) and the player's linked member. Also includes `DeLevelPanel` for correcting level mistakes if character classes are present.

The `LevelUpWizard` (at `src/levelup/LevelUpWizard.vue`) walks through class-defined wizard steps at the relevant level (choose fighting style, pick spells, pick features, etc.) and commits the result to the `character_classes` table. Features unlocked at the new level are displayed with expandable descriptions.

---

## Player Portal — Party View

**Route:** `/play/party` — `PlayerPartyView.vue`

### The Party Section

A responsive grid of character cards for all party members plus companions. Each card shows:

- Portrait (3:4 aspect) with hover zoom
- "You" badge on the player's own card
- Display name, species (respecting shapeshifter disguise), class, level
- HP bar — numeric HP shown for the player's own character and when campaign `health_visibility = "strategic"`; for other members in "immersive" mode, a text label is used instead (Healthy / Hurt / Wounded / Bloodied / Dead)
- AC and up to 2 active conditions
- Companion type badge (e.g. "Familiar") for companion cards

**Health visibility modes** (controlled by campaign settings):

- `strategic` — all players see numeric HP for all party members
- `immersive` — players see only text labels for others' HP; their own HP is always numeric

Companions are interleaved under their owner's card; unowned group companions appear last. Clicking any card opens a **lightbox** with HP, AC, conditions, and a personal notes widget.

**Party member lightbox** (`PartyMemberLightbox`): Full character sheet preview within an overlay.

### People Section (shared NPCs)

Displays NPCs that the DM has made player-visible to this specific character (`npc.player_visible_to` array includes the viewer's `party_member_id`).

Each NPC card (`PlayerNpcCard`) shows only the fields the DM has flagged as visible per-NPC (`player_visible_fields` array): name, portrait, race, occupation, relationship badge (colour-coded), status badge.

On opening an NPC lightbox the player sees:

- Visible fields only
- Their per-NPC relationship rating (1–5 stars, editable locally)
- "Your Connection" — the DM-authored PC-specific note for this NPC (from `npc_pc_notes` table)
- Personal player notes widget (write your own observations)

NPC filter controls:

- Text search (name, race, occupation — only visible fields)
- Relationship filter (Ally / Neutral / Enemy / Unknown)
- Status filter (Alive / Dead / Missing / Unknown)
- Location filter (populated from visible NPCs that have `location` in `player_visible_fields`)
- NPC list is sorted: higher star rating first, then by location name, then alphabetically

### Companion Lightbox

Clicking a companion card opens a lightbox with HP bar, AC, active conditions, and personal notes.

---

## Shapeshifter Disguise Feature

The shapeshifter disguise feature lets one party member appear to be a different species to all other players — while the DM and the shapeshifter themselves always see the true form.

### How It Works

**Setup (DM or player in their character form):**

1. The character's species must have `is_shapeshifter = true` in the Species compendium.
2. In `PartyMemberForm` (Identity tab), a "Disguise" section appears when a shapeshifter species is selected.
3. The DM (or player via their edit form) picks a disguise species and optionally a subrace/variant.
4. This sets `disguise_species_id`, `disguise_race`, `disguise_subrace` on the `party_members` row.

**Player control (`PlayerAppearanceSection`):**
The player can toggle their own disguise on/off using DB functions `set_shapeshifter_appearance(member_id, target_species)` and `clear_shapeshifter_appearance(member_id)`. These bypass the normal DM-only update RLS policy.

**Display logic (`src/lib/partyMemberDisplay.ts`):**

`shouldSeeDisguise(member, viewerMemberId, viewerIsDm)`:

- Returns `false` (show true form) if:
  - `viewerIsDm = true` (DM not in preview mode)
  - `viewerMemberId === member.id` (the shapeshifter viewing themselves)
- Returns `true` (show disguise) in all other cases when `disguise_species_id` is set

`getDisplaySpeciesId()` returns either `species_id` or `disguise_species_id` based on this logic.
`getDisplayRace()` returns either the true species name or `disguise_race`.
`getDisplaySubrace()` returns either true subrace or `disguise_subrace`.

**What each viewer sees:**

| Viewer                                        | Species shown                 | Portrait                   |
| --------------------------------------------- | ----------------------------- | -------------------------- |
| DM (not in preview)                           | True species                  | True portrait              |
| The shapeshifter themselves                   | True species                  | True portrait              |
| Other players                                 | Disguise species + race label | Disguise portrait (if set) |
| DM in preview mode (acting as another player) | Disguise species              | Disguise portrait          |

**DM Party Tracker badge:** The `◈ disguised` label (amber) appears under the member's name when `disguise_species_id` is non-null.

**Party lightbox for other players:** Uses `getDisplaySpeciesId` to load the full disguise species entry and `getDisplayRace` for the race label, so other players see a completely convincing alternate species sheet.

---

## Key Capabilities / USPs

- **Real-time sync:** `usePartyLive` subscribes to Supabase Postgres changes on `party_members` so DM HP edits instantly update player sheets and vice versa without page refresh.
- **Multiclass support:** `character_classes` table tracks multiple class/level rows per character; `formatMulticlassLabel()` builds display strings like "Fighter 4 / Wizard 3"; total level from `totalLevel()`.
- **Wild Shape as a first-class feature:** Full CR/level/type filtering, stat block preview lightbox, beast HP tracking separate from character HP, ability score override (STR/DEX/CON from beast), automatic tab visibility for Druids only.
- **Custom class/archetype system:** DMs can build fully custom classes with per-level feature tables, custom spell slot grids, ASI scheduling, wizard step flows for player-facing choices, and resource pools — all surfacing automatically in the level-up wizard and character sheet.
- **Open5e integration:** One-click import for species, backgrounds, classes, archetypes, and abilities from the Black Flag SRD. Incremental (upsert-based) so re-importing is safe and reports changes.
- **Shapeshifter disguise:** Cryptographic-grade privacy — other players see a completely different species entry with no tells. The shapeshifter and DM are the only ones who see the true form.
- **Hall of Heroes as a template library:** App-admin-managed iconic characters that any DM can import into their campaign in one click, complete with stat block and lore.
- **Health visibility modes:** Strategic (numeric) vs. immersive (prose labels) per campaign, preserving narrative tension.
- **Player NPC relationship system:** Per-character NPC visibility, per-character PC notes, and a personal star rating system for tracking which NPCs the player finds relevant.

---

## Data Fields

### `party_members` table (key fields)

| Field                           | Type   | Description                                            |
| ------------------------------- | ------ | ------------------------------------------------------ |
| `name`                          | text   | Character name                                         |
| `player_name`                   | text   | Real player name (optional)                            |
| `species_id`                    | uuid   | FK → species table                                     |
| `subrace`                       | text   | Species variant                                        |
| `class`                         | text   | Legacy single-class field                              |
| `subclass`                      | text   | Legacy subclass field                                  |
| `level`                         | int    | Level (legacy; superseded by `character_classes` rows) |
| `str/dex/con/int/wis/cha`       | int    | Ability scores                                         |
| `max_hp/current_hp/temp_hp`     | int    | Hit points                                             |
| `ac`                            | int    | Armor class WITHOUT shield — see shield AC note below  |
| `speed`                         | int    | Speed in feet                                          |
| `initiative_bonus`              | int    | Custom initiative modifier                             |
| `proficiency_bonus`             | int    | Computed from level                                    |
| `saving_throw_proficiencies`    | text[] | E.g. `["str","con"]`                                   |
| `skill_proficiencies`           | jsonb  | `Record<skill, "none"\|"proficient"\|"expertise">`     |
| `conditions`                    | text[] | Active conditions (includes Exhaustion 1–6)            |
| `curses`                        | text[] | Named curses                                           |
| `death_save_successes/failures` | int    | 0–3                                                    |
| `inspiration`                   | bool   | Inspiration token                                      |
| `current_initiative`            | int    | Current combat initiative (null when not rolled)       |
| `sort_order`                    | int    | Manual display order                                   |
| `portrait_url`                  | text   | Storage URL                                            |
| `portrait_focal_point`          | jsonb  | `{x,y}` 0–1 normalised                                 |
| `carry_capacity_override`       | text   | Expression or fixed number                             |
| `notes`                         | jsonb  | Tiptap rich text                                       |
| `current_location_id`           | uuid   | FK → locations table                                   |
| `disguise_species_id`           | uuid   | FK → species (shapeshifter disguise)                   |
| `disguise_race`                 | text   | Display race string for disguise                       |
| `disguise_subrace`              | text   | Display subrace string for disguise                    |
| `wildshape_state`               | jsonb  | `WildshapeState \| null`                               |
| `wildshapes_used`               | int    | Uses consumed today                                    |
| `owner_user_id`                 | uuid   | User who created/owns this character                   |

### `custom_classes` table (key fields)

| Field                  | Type   | Description                                |
| ---------------------- | ------ | ------------------------------------------ |
| `class_name`           | text   | Display name                               |
| `hit_die`              | int    | 6/8/10/12                                  |
| `primary_ability`      | text   | Description string                         |
| `saving_throws`        | text[] | Proficient saves                           |
| `armor_proficiencies`  | text[] | Tags                                       |
| `weapon_proficiencies` | text[] | Tags                                       |
| `subclass_level`       | int    | Level subclass is granted                  |
| `features`             | jsonb  | `Record<levelStr, featureId[]>`            |
| `asi_levels`           | int[]  | Levels granting ASI                        |
| `spell_slots`          | jsonb  | `number[][]` 20×9 grid or null             |
| `spells_known`         | int[]  | Per-level known count or null              |
| `cantrips_known`       | int[]  | Per-level cantrip count or null            |
| `slot_recovery`        | text   | `"short"\|"long"`                          |
| `caster_type`          | text   | `"prepared"\|"spellbook"\|"known"\|"none"` |
| `prepared_ability`     | text   | `"wis"\|"int"\|"cha"`                      |
| `prepared_divisor`     | int    | 1 (full) or 2 (half)                       |
| `steps`                | jsonb  | `CustomStep[]` — wizard prompts            |
| `resources`            | jsonb  | `CustomResource[]` — tracked pools         |
| `campaign_id`          | uuid   | null = all campaigns, set = scoped         |
| `source`               | text   | `"open5e"` or null for custom              |

### `hall_of_heroes` table (key fields)

| Field                  | Type   | Description                                  |
| ---------------------- | ------ | -------------------------------------------- |
| `name`                 | text   | Hero name (required)                         |
| `setting`              | text   | DnD setting slug (e.g. `"faerun"`)           |
| `race`                 | text   | Species string                               |
| `alignment`            | text   | One of 9 alignments or Unaligned             |
| `occupation`           | text   | Character role/profession                    |
| `age`                  | text   | Age string                                   |
| `status`               | text   | `"alive"\|"dead"\|"missing"\|"unknown"`      |
| `relationship`         | text   | Default relationship when imported as NPC    |
| `tags`                 | text[] | Search/filter tags                           |
| `appearance`           | jsonb  | Tiptap rich text                             |
| `personality`          | jsonb  | Tiptap rich text                             |
| `backstory`            | jsonb  | Tiptap rich text                             |
| `notes`                | jsonb  | DM-only rich text                            |
| `portrait_url`         | text   | Storage URL                                  |
| `portrait_focal_point` | jsonb  | Focal point                                  |
| `card_art_url`         | text   | Card Forge art                               |
| `disguise_*`           | —      | NPC disguise fields (mirrored from NPC type) |
| `is_revealed`          | bool   | NPC reveal flag                              |
| `stat_block`           | jsonb  | Full stat block JSONB (mirrored from NPC)    |
