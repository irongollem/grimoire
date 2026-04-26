# Dungeon Craft: Traps, Puzzles, Roll/Loot Tables & Dungeon Features

## Overview

Dungeon Craft is a five-tab hub at `/dungeon-craft` for dungeon and encounter prep. The tabs are:

| Tab label   | Route prefix        | Purpose                                                      |
| ----------- | ------------------- | ------------------------------------------------------------ |
| Features    | `/dungeon-features` | Secret doors, hidden passages, treasure caches, moving walls |
| Traproom    | `/traps`            | Mechanical, magical, hybrid and environmental traps          |
| Enigmarium  | `/puzzles`          | Puzzle rooms with tiered hints and player-share              |
| Roll Tables | (inline in hub)     | Random-result tables (wandering monsters, events)            |
| Loot Tables | `/loot-tables`      | Probabilistic item/currency/art hoards                       |

Every tab has a **text search** field and at least one **type/filter** selector. Three of the five tabs (Features, Traps, Puzzles) also have a **"Populate Examples"** button that bulk-inserts curated templates without duplicating any that already exist by name. The Puzzles tab adds a **Generate** button that opens an AI-assisted puzzle generator panel.

---

## Dungeon Features (Secret Doors, Hazards, Enigmas)

### What they are

Dungeon Features model static environmental elements that players may discover — secret doors, hidden passages, treasure chests, hidden caches, concealed alcoves, and moving walls.

### Feature types

`Secret Door`, `Hidden Passage`, `Treasure Chest`, `Hidden Cache`, `Concealed Alcove`, `Moving Wall`, `Other`

Each type renders with a distinct colour badge on the card thumbnail.

### How DMs use them

- Browse the list at `/dungeon-craft` (Features tab), filtered by type and/or keyword.
- Tap any card to open the detail view (`/dungeon-features/:id`), which shows a read-only **sheet** by default; click Edit to switch to the editor.
- New features are created at `/dungeon-features/new`.
- After save or delete the DM is returned to `/dungeon-craft` (Features tab).

### Trigger / Mechanism

Each feature optionally records how it is activated. Supported trigger types:
`Lever`, `Pressure Plate`, `Bookshelf`, `Candlestick`, `Keyword`, `Puzzle`, `Key`, `Button / Knob`, `Magic Sensor`, `Combination`, `None`, `Other`

A free-text **Trigger Description** field elaborates (e.g. "The worn bookshelf swings open when the red tome is removed").

### Discovery DCs

Three DC fields cover the main discovery scenarios:

- **Perception DC** — passive or active Perception to notice the feature
- **Investigation DC** — active Investigation to understand the mechanism or find hidden compartments
- **Arcana DC** — for magically concealed features

The sheet displays whichever DCs are populated in large numerals.

### Contents / What's Inside

A rich-text field describing what the feature guards — gold, relics, a hidden stairway. Rendered in view mode with the full RichTextViewer.

---

## Traps

### What they are

Traps are dangerous mechanisms placed in dungeons. They carry full D&D 5e combat-adjacent mechanics: CR, XP, attack/save, damage dice, and structural stats.

### Trap types

`Mechanical`, `Magical`, `Hybrid`, `Environmental`

### How DMs use them

- Browse the Traproom tab (filtered by type and/or keyword).
- Tap any card to open `/traps/:id`.
- The detail view renders a **TrapSheet** in view mode and a **TrapEditor** in edit mode (`?edit=true`).
- New traps open at `/traps/new`.
- After save or delete the DM is returned to `/dungeon-craft?tab=traps`.

### Mechanics fields

| Field                 | Notes                                                                           |
| --------------------- | ------------------------------------------------------------------------------- |
| **Type**              | Mechanical / Magical / Hybrid / Environmental                                   |
| **CR**                | Full CR list (0 through 30 + fractions); XP shown automatically                 |
| **Trigger**           | Tripwire, Pressure Plate, Proximity, Visual, Sound, Magic Sensor, Manual, Other |
| **Detection DC**      | Perception or Investigation to spot                                             |
| **Disarm DC**         | Thieves' Tools or other check to disable                                        |
| **Reset**             | None / Automatic / Manual                                                       |
| **Trap HP**           | Hit points (if the trap can be destroyed)                                       |
| **Trap AC**           | Armour class                                                                    |
| **Damage Immunities** | TagInput with damage-type suggestions; defaults: poison, psychic                |

### Effect fields

| Field                  | Notes                                                                         |
| ---------------------- | ----------------------------------------------------------------------------- |
| **Effect Description** | Free text — "fires a poisoned dart at the nearest creature"                   |
| **Attack Bonus**       | If the trap makes an attack roll                                              |
| **Save Type**          | STR / DEX / CON / INT / WIS / CHA                                             |
| **Save DC**            | Saving throw difficulty                                                       |
| **Damage entries**     | Multiple dice+type pairs (e.g. 2d6 piercing + 1d8 poison); uses DiceExprInput |

### CR Advisor

The trap editor includes a **CR Advisor** modal triggered by a "Suggest" button next to the CR field. The DM answers five questions:

1. **Primary Effect** — Damage / Condition / Terrain / Alarm / Death
2. **Damage Dice** (if "Damage" selected)
3. **Area of Effect** — Single target / Small area (≤3) / Large area (4+)
4. **DC Difficulty** — Low (≤12) / Moderate (13–16) / High (17–20) / Extreme (21+)
5. **Secondary Effect** — None / Minor condition / Major condition / Ongoing damage / Barrier+split

The advisor computes a **Suggested CR** with range and a bullet list of contributing factors, plus five reference benchmarks. The DM can accept with "Use CR X" which writes the value into the form.

---

## Puzzles

### DM View

#### What they are

Puzzles model puzzle rooms — set pieces where players must solve something before progressing. Each puzzle has a complete DM-only record and a separately controlled player-facing layer.

#### Puzzle types and difficulty

Types: `Logic`, `Physical`, `Arcane`, `Social`, `Environmental`
Difficulties: `Trivial`, `Easy`, `Medium`, `Hard`, `Deadly`

Both are colour-coded; the card thumbnail shows the type badge top-left and the difficulty badge bottom-right.

#### Creating and editing puzzles

- Browse the Enigmarium tab (filterable by type, difficulty, and keyword).
- Tap any card to open `/puzzles/:id`.
- The detail view has an inline **view/edit toggle** — existing puzzles open in view mode.
- New puzzles open at `/puzzles/new`.
- After create the DM is returned to `/dungeon-craft?tab=puzzles`. After save the view switches back to view mode.

#### DM-side fields

| Section          | Fields                                                                         |
| ---------------- | ------------------------------------------------------------------------------ |
| **Identity**     | Name, puzzle_type, difficulty, tags, optional image (square, with focal point) |
| **Setup**        | Rich-text description — what players see/experience when they enter            |
| **Skill Checks** | Multiple skill+DC pairs (any of 15 standard skills)                            |
| **Hints**        | Ordered list of rich-text hints; hints can be reordered with up/down buttons   |
| **Solution**     | Rich-text, DM eyes only; collapsible "Reveal/Hide" toggle in view mode         |
| **Outcomes**     | Separate success and failure/consequence rich-text blocks                      |
| **DM Notes**     | Private running notes, variant solutions, pacing tips                          |

#### AI-Assisted Puzzle Generator

The "Generate" button opens a slide-in panel (PuzzleGeneratorPanel) with:

- **Concept** — free-text prompt for the AI
- **Constraints** — optional type and difficulty filters
- **Generate room illustration** toggle (if an AI API key is configured)

The generator produces a complete puzzle pre-filled into the editor.

#### Player Share panel (DM view)

In view mode a **Player Share** card lets the DM:

1. **Toggle sharing on/off** — when shared the puzzle becomes visible to all players in the active campaign (written to `is_shared` + `campaign_id`).
2. **Write a Read-Aloud text** — a short spoken passage the DM reads as players enter; saved on blur.
3. **Reveal/hide individual hints** — each numbered hint has an Eye/EyeOff toggle; the set of revealed hint order numbers is stored in `shared_hints[]`. The share panel shows "Revealed hints: N / total" at a glance.

Turning sharing off clears all revealed hints.

---

### Player View

Players access shared puzzles at `/play/puzzles` (list) and `/play/puzzles/:id` (detail). These routes live in the player portal (`/play/*`) and only show puzzles with `is_shared = true` in the player's active campaign.

#### Player puzzle list (`/play/puzzles`)

A grid of puzzle cards showing name, type badge, difficulty badge, and a count of how many hints are currently available ("N hints available"). Only puzzles shared by the DM appear.

#### Player puzzle detail (`/play/puzzles/:id`)

The player view is **read-only** and shows only what the DM has explicitly exposed:

| Section                          | Visibility                                                                            |
| -------------------------------- | ------------------------------------------------------------------------------------- |
| Name, type, difficulty           | Always shown                                                                          |
| Skill checks (skill + DC)        | Always shown                                                                          |
| **Read-Aloud text**              | Shown in a highlighted "READ ALOUD" block if set                                      |
| **The Room** (Setup/description) | Shown if the DM has a description                                                     |
| **Hints**                        | Only hints whose `order` is in `shared_hints[]` are shown; numbered in the DM's order |
| Solution                         | Never shown to players                                                                |
| Outcomes                         | Never shown to players                                                                |
| DM Notes                         | Never shown to players                                                                |

If no hints have been revealed a message reads "No hints revealed yet."

#### Realtime sync

The player detail view subscribes to `usePuzzleRealtime(id)`, which opens a Supabase Realtime channel on `puzzle_rooms:id`. When the DM toggles a hint reveal or changes the read-aloud text, the player's cached query is invalidated immediately — players see changes within seconds without refreshing.

---

## Roll Tables

### What they are

Roll tables are random-result tables built around a single die. They are used for wandering monster tables, random event tables, and similar "what happens next?" mechanics. Each entry covers an inclusive numeric range; rolling the die lands on one entry.

### How DMs use them

Roll Tables are fully **inline** inside the Dungeon Craft hub — there is no separate route. Clicking a table card in the list opens an inline editor/viewer in the same tab. The "New Roll Table" button shows the editor in-place. A "← All Tables" button closes the detail back to the list.

### Die types

`1d4`, `1d6`, `1d8`, `1d10`, `1d12`, `1d20`, `1d100`

### Entry structure

Each entry has:

- **Range** — min and max (inclusive) within 1–die_max
- **Label** — required display text shown when the result is rolled
- **Linked encounter** — optional FK into Encounters; displayed as "Open encounter →" in results
- **Notes** — optional free-text DM note shown alongside the rolled entry

The editor validates ranges in real time — overlapping ranges and out-of-bounds values block saving. Sparse coverage (e.g. only rolls 1–3 on a 1d6) is intentional and allowed ("no encounter" on high rolls).

### Live roll panel

A sticky panel on the right side of the detail shows:

- A **Roll** button that simulates the die and matches to an entry
- The raw rolled value in large text
- The matched entry's label, any linked encounter link, and per-entry notes
- "No entry covers this result" if the roll falls in a gap

### Campaign scoping

Roll tables are stored with an optional `campaign_id`. Tables belonging to the active campaign, plus global tables (campaign_id = null), are shown together. The populate action seeds example tables into the current campaign.

---

## Loot Tables

### What they are

Loot tables define probabilistic hoards — each entry has its own independent drop chance. Rolling a loot table checks each entry's chance separately; a 100 GP bag and a rare sword can both appear (or not) in a single roll.

### Route

`/loot-tables/new` and `/loot-tables/:id`. Unlike Roll Tables, Loot Tables navigate to their own pages rather than using inline editing.

### Entry types

Loot tables support three kinds of entry in any mix:

**Item** — a specific item from the Item Vault.

- `item_id` (required): EntityCombobox picker against all Vault items
- `drop_chance` (1–100%): chance this item appears
- Quantity: either a dice expression (`2d4`, `1d6+1`) or a fixed integer

**Currency** — a fixed coin pool.

- Optional `currency_label` for the chat display (e.g. "Belt pouch")
- Per-denomination amounts: PP, GP, EP, SP, CP
- `drop_chance` (1–100%)

**Random** — picks a random item from the Vault matching filters.

- `rarity` (required): Common / Uncommon / Rare / Very Rare / Legendary / etc.
- Optional `item_type_filter`: narrows the pool by item type (potion, weapon, etc.)
- Quantity: dice expression or fixed
- `drop_chance` (1–100%)
- The editor shows a live "N matching items in vault" count as the filters are set

### CR Tier

Tables carry an optional CR tier for filtering: `Any`, `CR 0–4`, `CR 5–10`, `CR 11–16`, `CR 17+`.

### Monster linking

A table can be associated with one or more monsters (`monster_ids[]`). This populates the "Linked Monsters" section visible from both the table detail and monster detail pages.

### Live roll panel

The right sidebar has a **Roll** button that evaluates every entry independently against its drop chance, rolls quantities, and resolves random picks from the Vault. The result lists each drop as `N× Item Name` or a formatted coin amount. An "expected hit rate" percentage (average of all drop chances) is shown as a summary.

### Drop-in-chat

The **"Drop chest in chat"** button opens a dialog that:

1. Re-rolls the table to produce a live preview of what drops.
2. Lets the DM set a **Claims** value (fixed number or dice expression, e.g. `1d4`) — this caps how many items players can claim before the chest closes.
3. Optionally uploads a **chest art image**.
4. Shows a preview list of claimable atoms (each unit of each item is a separate claimable atom; currency pools are a single atom).
5. Confirms the effective claim count (= min(rolled claims, total atoms)).

Clicking **Drop chest** sends a `loot_chest` message to campaign chat via `sendLootChest()` from `useCampaignMessages`. Players see the chest in chat and claim items one at a time.

### Validation

The editor blocks saving when any entry has a drop_chance outside 1–100, an Item entry without an item_id, or a Random entry without a rarity selected.

---

## Key Capabilities / USPs

- **Unified prep hub** — five distinct dungeon-prep tools under one tabbed route rather than scattered nav items.
- **Populate Examples** — one-click seeding of curated DM-ready templates into Features, Traps, Puzzles, and Roll Tables without overwriting existing records.
- **CR Advisor for traps** — interactive calculator that derives a suggested CR from effect type, area, DC tier, secondary effect, and reset mechanics; cites specific D&D 5e benchmark traps.
- **Tiered hint reveal for puzzles** — DMs gate player access per hint rather than all-or-nothing; players receive realtime push updates as hints are unlocked mid-session.
- **Read-Aloud text** — DMs write a short scripted narration block that players see in their portal exactly as written, framed distinctly.
- **AI puzzle generator** — generates complete puzzle definitions (all fields, including hints and solution) from a free-text concept prompt.
- **Roll panel on both table types** — DMs roll live during play directly from the detail view without switching context.
- **Drop chest in chat** — loot tables integrate with campaign chat: one button rolls the table, builds claimable atoms, and posts an interactive chest message that players can pick items from in real time.
- **Random loot entries** — loot tables can include "pick N random items of rarity X" entries that draw from the live Vault, so adding new items to the Vault automatically expands future hoards.
- **Monster linking on loot tables** — loot tables can be associated with specific monsters; the monster's detail page surfaces which hoards it drops.

---

## Data Fields

### DungeonFeature (`dungeon_features` table)

| Field                  | Type                        | Notes                                                                                                                               |
| ---------------------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `name`                 | string                      | Required                                                                                                                            |
| `feature_type`         | DungeonFeatureType          | Secret Door / Hidden Passage / Treasure Chest / Hidden Cache / Concealed Alcove / Moving Wall / Other                               |
| `perception_dc`        | number\|null                |                                                                                                                                     |
| `investigation_dc`     | number\|null                |                                                                                                                                     |
| `arcana_dc`            | number\|null                |                                                                                                                                     |
| `trigger_type`         | DungeonFeatureTrigger\|null | Lever / Pressure Plate / Bookshelf / Candlestick / Keyword / Puzzle / Key / Button/Knob / Magic Sensor / Combination / None / Other |
| `trigger_description`  | string\|null                |                                                                                                                                     |
| `contents_description` | Tiptap JSON\|null           | Rich text                                                                                                                           |
| `description`          | Tiptap JSON\|null           | Rich text (flavour)                                                                                                                 |
| `image_url`            | string\|null                |                                                                                                                                     |
| `image_focal_point`    | {x,y}\|null                 |                                                                                                                                     |
| `tags`                 | string[]                    |                                                                                                                                     |
| `notes`                | Tiptap JSON\|null           | DM-only                                                                                                                             |

### Trap (`traps` table)

| Field                | Type                               | Notes                                         |
| -------------------- | ---------------------------------- | --------------------------------------------- |
| `name`               | string                             | Required                                      |
| `trap_type`          | TrapType                           | Mechanical / Magical / Hybrid / Environmental |
| `cr`                 | string\|null                       | 0–30 incl. fractions                          |
| `trigger_type`       | TrapTrigger\|null                  |                                               |
| `detection_dc`       | number\|null                       |                                               |
| `disarm_dc`          | number\|null                       |                                               |
| `effect_description` | string\|null                       |                                               |
| `attack_bonus`       | number\|null                       |                                               |
| `save_type`          | STR\|DEX\|CON\|INT\|WIS\|CHA\|null |                                               |
| `save_dc`            | number\|null                       |                                               |
| `damage_entries`     | DamageEntry[]                      | Array of {dice, type}                         |
| `reset_type`         | None\|Automatic\|Manual            |                                               |
| `trap_hp`            | number\|null                       |                                               |
| `trap_ac`            | number\|null                       |                                               |
| `damage_immunities`  | string[]                           | Default: ["poison","psychic"]                 |
| `description`        | Tiptap JSON\|null                  | Rich text (flavour)                           |
| `image_url`          | string\|null                       |                                               |
| `image_focal_point`  | {x,y}\|null                        |                                               |
| `tags`               | string[]                           |                                               |
| `notes`              | Tiptap JSON\|null                  | DM-only                                       |

### PuzzleRoom (`puzzle_rooms` table)

| Field                 | Type               | Notes                                              |
| --------------------- | ------------------ | -------------------------------------------------- |
| `name`                | string             | Required                                           |
| `puzzle_type`         | PuzzleType         | Logic / Physical / Arcane / Social / Environmental |
| `difficulty`          | PuzzleDifficulty   | Trivial / Easy / Medium / Hard / Deadly            |
| `description`         | Tiptap JSON\|null  | "What the players see"                             |
| `solution`            | Tiptap JSON\|null  | DM eyes only                                       |
| `hints`               | PuzzleHint[]       | {order: number, text: Tiptap JSON}                 |
| `skill_checks`        | PuzzleSkillCheck[] | {skill: string, dc: number}                        |
| `success_outcome`     | Tiptap JSON\|null  |                                                    |
| `failure_consequence` | Tiptap JSON\|null  |                                                    |
| `campaign_id`         | string\|null       | Set when `is_shared` = true                        |
| `is_shared`           | boolean            | Controls player visibility                         |
| `shared_hints`        | number[]           | Orders of revealed hints                           |
| `read_aloud`          | string\|null       | Scripted narration for players                     |
| `image_url`           | string\|null       |                                                    |
| `image_focal_point`   | {x,y}\|null        |                                                    |
| `tags`                | string[]           |                                                    |
| `notes`               | Tiptap JSON\|null  | DM-only                                            |

### RollTable (`roll_tables` table)

| Field         | Type             | Notes                                        |
| ------------- | ---------------- | -------------------------------------------- |
| `name`        | string           | Required                                     |
| `dice`        | RollTableDie     | 1d4 / 1d6 / 1d8 / 1d10 / 1d12 / 1d20 / 1d100 |
| `description` | string\|null     |                                              |
| `entries`     | RollTableEntry[] | {id, min, max, label, encounter_id?, notes?} |
| `campaign_id` | string\|null     | Global if null                               |
| `tags`        | string[]         |                                              |
| `notes`       | string\|null     | DM-only                                      |

### LootTable (`loot_tables` table)

| Field         | Type         | Notes                          |
| ------------- | ------------ | ------------------------------ |
| `name`        | string       | Required                       |
| `cr_tier`     | LootCrTier   | any / 0-4 / 5-10 / 11-16 / 17+ |
| `description` | string\|null |                                |
| `entries`     | LootEntry[]  | See entry types above          |
| `monster_ids` | string[]     | FK refs to monsters            |
| `campaign_id` | string\|null | Global if null                 |
| `tags`        | string[]     |                                |
| `notes`       | string\|null | DM-only                        |
