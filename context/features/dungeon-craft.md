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

## Anchoring material to a place

Until [#788](https://github.com/irongollem/grimoire/issues/788) only puzzles could say where they were (`puzzle_rooms.location_id`, migration `20260720000002`). Traps, features, roll tables and loot tables carried no location at all — a trap reached play solely through `encounters.trap_ids`, which meant it needed a *fight* to exist, so a corridor could not have one.

**`location_placements`** (migration `20260904054806`) fixes that, and is a **join table rather than a `location_id` column on each entry**. The reason is in the data: `encounters.trap_ids` is a `uuid[]`, so traps were already reusable across encounters, and `dungeon_features` has no `campaign_id` at all because it is a user-scoped catalogue of reusable fixtures. A column would force one placement per template and quietly turn a reusable thing single-use. Placing a catalogue entry somewhere is a many-to-many fact and needs a row.

It is deliberately **not** a polymorphic `(kind, ref_id)` pair. That is the shape of `quest_beat_attachments`, whose text `ref_id` cannot carry a foreign key and therefore needs a trigger to validate what the database should have been enforcing — and which epic [#780](https://github.com/irongollem/grimoire/issues/780) is removing. Here each kind has a real column with a real FK and a real cascade, and a check constrains a row to exactly one of them (an *exclusive arc*). Adding a fifth kind later is a nullable column plus one name in the check.

- `num_nonnulls(trap_id, dungeon_feature_id, roll_table_id, loot_table_id) = 1`.
- **Per-kind partial uniques** on `(location_id, <kind>_id)`: the same entry twice in one room is a mistake every time, the same entry in two rooms is the point. A single composite unique would permit the first, because NULLs are distinct.
- **No `campaign_id`.** `locations` already owns which campaign a place is in, and a second copy is the duplication #780 exists to remove; the insert policy joins for it. The other three policies are owner-scoped, exactly as `puzzle_rooms`' are.
- `note` is what the entry is doing *here* — "pressure plate, triggers the portcullis at the far end". The catalogue entry says what the trap *is*.
- Puzzles keep their existing `location_id` column and are **not** part of this table. A puzzle is an instance, not a template.

Cover: `supabase/tests/location_placements.test.sql`.

**The reverse direction** (`EntityPlacements.vue`, `useEntityPlacements`, [#802](https://github.com/irongollem/grimoire/issues/802)). #788 built placement from the *location* only, so from a trap's own page there was no sign it was placed anywhere. A "Placed In" panel now sits on the trap and feature sheets and the roll- and loot-table detail views: every location the entity sits in, its placement note, inline remove, and a location picker so a DM authoring a trap can drop it into a room without navigating there first.

Both directions invalidate each other's query key — a placement made from either side shows up on the other without a reload.

**Puzzles are not part of this and must not be moved into it.** `puzzle_rooms` keeps its own `location_id` / `dungeon_feature_id` columns, surfaced as navigable links in `PuzzleDetailView` since `01f6ed72`. A puzzle is an *instance*, not a reusable template placed in several rooms, so the join table is the wrong shape for it.

**What co-DMs actually get, stated plainly.** `location_placements` and `locations` are both owner-scoped on SELECT, and the insert policy requires the placed entity to be the caller's own. Follow that through and a cross-DM placement cannot exist at all: DM B cannot place DM A's trap (the entity check refuses it), and DM A cannot place their own trap into DM B's room (B's room is invisible to A's picker). So the reverse panel is not hiding real rows — there are none to hide.

What it does mean is that in a co-DM campaign this whole mechanism behaves as **per-DM private prep layered over a nominally shared world**. Two DMs prepping the same dungeon each see only their own placements of their own catalogue entries, never a merged view. That is inherited from the same "authored possessions are owner-scoped" decision as `traps` and `puzzle_rooms`, and it is deliberate — but it is the kind of thing that would surprise a co-DM pair expecting one shared prep space, so it is written down rather than discovered.


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

- Browse the Traproom tab (filtered by type and/or keyword). The list is also implicitly scoped by campaign — general traps plus the active campaign's own, same as the Bestiary (`combat-encounters.md`) — with no "show all campaigns" override.
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
| **Scope**             | `CampaignScopeField` — General (all campaigns) vs. the active campaign; new traps default to the active campaign |

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

### Campaign scope

Traps gained a nullable `campaign_id` alongside monsters (#597, migration `20260809000003`) — the same null-is-global rule as the Bestiary (`combat-encounters.md`): unset is available in every campaign, a set value only while that campaign is active. The `CampaignScopeField` control in the Identity card sets it directly; new traps default to the active campaign, and a trap created via the AI generator (`TrapGeneratorPanel.vue`) is scoped the same way. Existing rows were deliberately not backfilled, for the same reason as monsters — a trap's original campaign can't be recovered from the data, and a wrong guess (hiding it from the campaign it was actually written for) is worse than leaving it visible everywhere until the DM re-scopes it by hand. `usePopulateTraps`'s seeded templates stay global regardless of the active campaign: its not-already-present check spans every trap the DM owns, not just the active campaign's, so scoping the seeded rows would make a second campaign's "Populate Examples" re-seed names that check would otherwise see as already taken. An encounter's `trap_ids` resolve against the unscoped trap list, so a trap doesn't drop out of an encounter that already references it after a later re-scope — see combat-encounters.md's Traps section.

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

- Browse the Enigmarium tab (filterable by type, difficulty, and keyword). The list is also implicitly scoped by campaign — general puzzles plus the active campaign's own, same as the Bestiary and Traproom — with no "show all campaigns" override.
- Tap any card to open `/puzzles/:id`.
- The detail view has an inline **view/edit toggle** — existing puzzles open in view mode.
- New puzzles open at `/puzzles/new`.
- After create the DM is returned to `/dungeon-craft?tab=puzzles`. After save the view switches back to view mode.

#### DM-side fields

| Section          | Fields                                                                         |
| ---------------- | ------------------------------------------------------------------------------ |
| **Identity**     | Name, puzzle_type, difficulty, tags, Scope (`CampaignScopeField`), optional image (square, with focal point) |
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

#### Reveal (DM view)

Puzzles were the last entity that could not name an audience — a single `is_shared` boolean revealed the room to the whole campaign or to nobody, which is why the unified reveal control (#741) did not fit them. `20260817230740` added `player_visible_to`, so a DM can hand the riddle to the character standing in front of it.

In view mode the header carries `PuzzleRevealControl`:

1. **Who** — party members, as everywhere else in the app. Writing an audience also sets `is_shared` (shared ⇔ the list is non-empty) and auto-assigns `campaign_id` to the active campaign, but only if the puzzle isn't already scoped — see Campaign scope below.
2. **What** — which hints the party has been given, stored in `shared_hints[]`. The hint ladder is the puzzle's reveal ladder, so it sits with the audience decision. The hints list further down the page keeps its own per-hint toggle, because that is where the DM is reading the hint text; both write the same column through the same mutation.

Hiding from everyone clears the revealed hints — the next group should start from the top — but leaves `campaign_id` untouched.

**Read-Aloud** is no longer part of the share panel. It is prose the DM writes, not a switch they flip, so it lives in the page body with the puzzle's other text, saved on blur.

`is_shared` survives as a derived flag rather than a second source of truth: it is what assigns `campaign_id`, and the player projection now gates on the audience (`private.is_puzzle_player_visible`). The migration backfilled every already-shared puzzle to its campaign's whole party, so no player lost a puzzle they could see.

#### Campaign scope

`puzzle_rooms` already had `campaign_id`; #597 is what made it actually drive DM-side visibility, not just player sharing (migration `20260809000003`). It carries one meaning, not two: which campaign the puzzle belongs to. The Identity card's Scope control (`CampaignScopeField`) sets it directly — general vs. the active campaign, defaulting new puzzles to the active one, and a puzzle created via the AI generator (`PuzzleGeneratorPanel.vue`) is scoped the same way — and sharing sets it too, but only as a fallback when it isn't already set, so the Scope control's own choice always wins over the sharing auto-assign. A shared puzzle is therefore always a scoped puzzle, and it stops appearing in the DM's other campaigns' Enigmarium lists. Existing rows were deliberately not backfilled, for the same reason as monsters and traps — a puzzle's original campaign can't be recovered from the data, and a wrong guess is worse than leaving it visible everywhere until the DM re-scopes it.

---

### Player View

Players access shared puzzles at `/play/puzzles` (list) and `/play/puzzles/:id` (detail). These routes live in the player portal (`/play/*`) and only show puzzles whose `player_visible_to` includes the reader's party member, in their active campaign — enforced by `private.is_puzzle_player_visible` inside the `get_player_visible_puzzles` projection, not client-side.

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

The shared campaign realtime registry listens for `puzzle_rooms` changes. Because player puzzle queries are SECURITY DEFINER projections that redact solutions, outcomes, notes, and unrevealed hints, puzzle events deliberately invalidate that projection instead of copying a raw database payload into it. Players see changes promptly without a second bespoke channel or a manual refresh.

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

### AI-Assisted Roll Table Generator

The "Generate" button on the Roll Tables tab opens a slide-in panel (`RollTableGeneratorPanel`, mounted in `DefaultLayout`) driven by `useRollTableGeneration.ts` (text-only generator, registered with the AI badge). The DM provides:

- **Concept** — a one-line prompt (e.g. "forest road at night, bandits active in the region, levels 3–5")
- **Die** — d6 / d8 / d10 / d12 / d20

The AI returns a full table (name, CR-tier tags, one-line description, and entries whose inclusive ranges cover 1–N with no gaps and no overlaps), aiming for tonal variety (combat / environmental / social / weird). Output is grounded in the active setting via `buildCampaignContext`, so a Barovia table differs from a Chult one. Ranges are validated client-side before create — `useRollTableGeneration` is the single validation point for both generation paths below; invalid output prompts a regenerate rather than saving a broken table. The panel previews the table, then **Create Table** persists it (campaign-scoped) and offers a "View Table →" link. Encounter linking is left to the DM to wire up manually afterward.

**Retrieval grounding (#600).** Generation runs server-side (`supabase/functions/generate-roll-table/index.ts`) on platform credits or the campaign's BYOK-cloud key; only local-key mode keeps the old ungrounded client path (policy, not debt — see `useQuestGeneration.ts`'s comment). The server embeds the concept and injects the same `---BEGIN CAMPAIGN ENTITIES---` block as the quest generator, via the shared `_shared/campaignEntityRetrieval.ts` module — the full mechanism (side tables, embed formats, scope predicate, fallback) is documented in world-building.md's "Retrieval grounding" section. The response carries `npcs`/`locations`/`factions` name arrays; `resolveGeneratedEntities` (`src/ai/`) maps them to chips (`GeneratedEntityChips`, shared with the quest panel) shown under the previewed table — resolved chips navigate to the entity, unmatched names render dashed with a "new" affix, never dropped. Chips are display-only for roll tables: `RollTableEntry` links only `encounter_id`, so nothing is persisted from them on Create Table.

The system prompt is stored in `ai_system_prompts` (`generator_type = 'roll_table'`); the credit cost is `roll_table_generation` in `ai_generation_credit_costs`. Both seeded in migration `20260623000003_roll_table_ai_generation.sql`.

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

Tables carry an optional CR tier for filtering: `Any`, `CR 0–4`, `CR 5–10`, `CR 11–16`, `CR 17+`. It does not affect roll logic, but it IS the constraint band for the AI generator below — `LOOT_TIER_RARITIES` (`lootTable.types.ts`) maps each tier to the rarities retrieval is allowed to offer.

### AI loot generator (#602)

**Panel:** `LootTableGeneratorPanel.vue`, opened from the Loot Tables tab's **Generate** action (`ui.lootTableGeneratorOpen`), mounted with the rest in `AiGeneratorPanels.vue`. Inputs: concept (500 chars), tier, and a "skip items that require attunement" toggle. Pro-gated and `ai_enabled`-gated like every other generator.

**Server-path only.** `supabase/functions/generate-loot/index.ts` — no client-side BYOK twin, unlike every sibling in `src/ai/`. Those carry one because they predate retrieval; this generator was grounded from day one and its whole value is a candidate block built from vectors only the service-role client can read. Local-key mode gets an explicit error, not a silent downgrade (BYOK-local is a legacy tier, not a parity target — see `useQuestGeneration.ts`).

**Retrieval grounding — the first generator with a constraint band.** The mechanism is the #595/#600 shape (read combat-encounters.md's "Monster retrieval" for the full rationale), with one structural addition documented here because no other generator has needed it:

- **Corpora**: two, like monsters — `item_embeddings` (uuid) and `library_item_embeddings` (text id), migration `20260805000005`. Embed format is `buildItemEmbedText` in `_shared/entityEmbedText.ts` (name, rarity/type/subtype, attunement clause, cost, tags, description at 500 chars). The attunement clause carries the requirement **text**, not just the boolean, and that is load-bearing: all 16 library items attuned "by a Druid" mention druids nowhere else — not in the name, description or tags — so embedding the boolean alone makes "a hoard of druidic items" unanswerable. Two shapes exist in the data (677 of 685 rows are full sentences, 8 custom rows are fragments like "Druid or Ranger"); the builder detects the prefix rather than blindly concatenating — deliberately ONE format for both corpora so a homebrew sword and a library sword rank against the same query on the same terms. `dm_notes` is excluded on purpose: `library_items` has no such column, and including it would make a custom item's vector drift from its shared twin's for reasons unrelated to what the item is.
- **The band**: "loot for a level 7 party" is a _constraint_ query wearing a semantic query's clothes — cosine similarity ranks a Vorpal Sword top for "impressive treasure", and a model handed that candidate uses it. So `match_custom_items`/`match_library_items` take `p_rarities` + `p_exclude_attunement` and apply them in the `WHERE` **before** ranking, exactly like the enabled-sources gate; retrieval then ranks thematically _inside_ the band. The rarities are derived server-side from `cr_tier` (`RARITIES_BY_TIER` in the edge function, mirrored for display only by `LOOT_TIER_RARITIES`) — never taken from the request, or the gate would be caller-controlled. The unembedded-append path in `_shared/itemRetrieval.ts` re-applies the same predicates, or it would be a hole straight through the gate.
- **Sources gate**: the library RPC filters on `source_document_key` (not `source`) because that is what `fetchLibraryItems()` filters on client-side — the two must agree or the generator offers books the Vault itself doesn't show. `'grimoire-bundled'` is always included, matching that query's `.in()` list exactly.
- **Offer**: `item|Name|rarity|type` lines in a `---BEGIN VAULT ITEMS---` block, custom rows first so a DM's own copy wins a name collision with a library row.
- **Fallback**: identical contract to the other generators — any retrieval failure drops the block and generates ungrounded. The response carries `grounded: boolean` so the panel can explain unresolved names as "ran without your Vault" rather than letting them read as a resolution bug.

**Resolution guard** (`src/ai/resolveGeneratedLoot.ts` + tests): the model returns item _names_; every entry is resolved against the merged `useItems` catalogue. Resolved item entries route through `useEnsureOwnedItem` at create time (a library slug id is not a valid `LootEntry.item_id` uuid — the clone is the same one the manual picker performs). Unresolved names are surfaced struck-through with a reason and left out of the created table: never dropped silently, never written as stub item rows (#337). Duplicate item entries are surfaced rather than merged. Malformed-but-recoverable values are repaired, not rejected (drop chance clamped to 1–100, dice wins over `fixed_qty`, unknown `item_type_filter` dropped while the entry survives) — entry validation itself stays in `validateEntries`, the single client-side validation point.

**Embed-on-write**: `queueItemEmbedding` (`useItems.ts`) fires `embed-content` (`mode: "single"`, entity `item`) after create/update, after the downtime seed-reward mint, and after a library→owned clone. The clone is embedded despite being byte-identical to its already-embedded library twin, because the twin is only retrievable while its source stays enabled — without it, an item visible in the Vault would be invisible to loot retrieval. `library_item` is **batch-only** (`supportsSingle: false`): shared content has no `user_id` to authorize a single-mode call against, and it only changes on an admin import.

**Storage**: measured before building, per #599's multiplier — `library_monster_embeddings` is 52 MB across 3,541 rows (~15 KB/row incl. HNSW), so 1,717 library items + 2,015 items ≈ 56 MB on a 211 MB database. Both new targets are in `useEmbeddingBackfill`'s `EMBED_TARGETS`; **the backfill must be run once after deploy** or retrieval finds nothing and every generation falls back to ungrounded.

The system prompt is `ai_system_prompts.generator_type = 'loot'`; the credit cost is `loot_generation` (1 credit); `loot_tables.ai_provenance` was added by the same migration (the table was not in EPIC #611's original 13 because no loot generator existed then).

### Monster linking

A table can be associated with one or more monsters (`monster_ids[]`). This populates the "Linked Monsters" section visible from both the table detail and monster detail pages. Naming an already-linked monster resolves against an unscoped bestiary query (`useMonsters(() => ({ includeAllScopes: true }))`), so a monster the DM later scopes to a different campaign (#597, combat-encounters.md) still shows its real name here instead of a raw uuid; the picker used to add a new link only offers the active campaign's own monsters (a second, scoped `useMonsters()` call — the two share a cache, so this costs nothing extra).

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
- **Vault-grounded loot generator** — the hoard is built from items the DM actually owns or has enabled, filtered to the requested tier before the model ever sees a candidate; every entry resolves to a real item rather than a name the app has to invent a row for.
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
| `campaign_id`        | uuid\|null                         | NULL = every campaign, set = only that campaign; never backfilled (#597) |
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

| Field                 | Type               | Notes                                                                                    |
| --------------------- | ------------------ | ---------------------------------------------------------------------------------------- |
| `name`                | string             | Required                                                                                 |
| `puzzle_type`         | PuzzleType         | Logic / Physical / Arcane / Social / Environmental                                       |
| `difficulty`          | PuzzleDifficulty   | Trivial / Easy / Medium / Hard / Deadly                                                  |
| `description`         | Tiptap JSON\|null  | "What the players see"                                                                   |
| `solution`            | Tiptap JSON\|null  | DM eyes only                                                                             |
| `hints`               | PuzzleHint[]       | {order: number, text: Tiptap JSON}                                                       |
| `skill_checks`        | PuzzleSkillCheck[] | {skill: string, dc: number}                                                              |
| `success_outcome`     | Tiptap JSON\|null  |                                                                                          |
| `failure_consequence` | Tiptap JSON\|null  |                                                                                          |
| `campaign_id`         | string\|null       | NULL = every campaign, set = only that campaign; Scope control or sharing sets it (#597) |
| `is_shared`           | boolean            | Derived: shared ⇔ `player_visible_to` is non-empty. Kept because it assigns `campaign_id` |
| `player_visible_to`   | string[]           | Party member ids the puzzle is revealed to; `[]` is nobody (#741, `20260817230740`)      |
| `shared_hints`        | number[]           | Orders of revealed hints                                                                 |
| `read_aloud`          | string\|null       | Scripted narration for players                                                           |
| `image_url`           | string\|null       |                                                                                          |
| `image_focal_point`   | {x,y}\|null        |                                                                                          |
| `tags`                | string[]           |                                                                                          |
| `notes`               | Tiptap JSON\|null  | DM-only                                                                                  |
| `location_id`         | string\|null       | Host location anchor (#168); nav-link pill in view mode; nulled in the player projection |
| `dungeon_feature_id`  | string\|null       | Host dungeon feature anchor (#168); same treatment                                       |

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
| `ai_provenance` | jsonb\|null | Set by the AI loot generator (#602); null on hand-authored tables |
