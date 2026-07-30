# Items, Spells & Workshop (Crafting)

## Overview

Three interconnected feature groups let the DM build a campaign-specific item and spell compendium, define crafting recipes, and surface the right subset to each player. Items feed the inventory system, spells feed the per-character spellbook, and crafting recipes consume items and produce items.

Routes:

- `/vault` — Item Vault list
- `/vault/:id` — Item detail / editor
- `/vault/new` — New item
- `/spells` — Spellbook list
- `/spells/:id` — Spell detail / editor
- `/spells/new` — New spell
- `/crafting` — Workshop (recipe list)
- `/crafting/:id` — Recipe detail / editor
- `/crafting/new` — New recipe
- `/play/inventory` — Player Inventory (player portal)
- `/play/crafting` — Player Crafting (player portal)
- `/play/spells` — Player Spells (player portal)

---

## Item Vault

### DM View (`/vault`)

The Vault is the DM's master catalog of all equipment and magic items available in the campaign.

**List view** — filterable by:

- Free-text name search
- Item type (weapon, armor, shield, ring, wand, staff, scroll, potion, gear, ammunition, art object, other)
- Rarity (mundane, common, uncommon, rare, very rare, legendary)
- Source (dynamically populated from items in the DB)
- "Show items from all campaigns" checkbox — by default the list is filtered to general items (`campaign_id IS NULL`) plus items scoped to the active campaign; toggling it on returns the full catalog.

**Shared SRD items (#303)** — the per-user "Import SRD Items" button is retired. SRD items live in the shared `srd_items` table (public read, admin write; seeded by `npm run seed-srd-items` from Open5e v2 weapons/armor/magic items plus the built-in local datasets `data/gear.ts`/`provisions.ts`/`services.ts`/`ammunition.ts`, which are stamped edition-neutral so 2024 campaigns get mundane gear too). `useItems()` merges shared rows (slug ids, `user_id: ""`) with the user's own; a per-user row shadows its shared counterpart by source identity — or by lowercase name for pre-versioning imports — so legacy vaults look unchanged. Shared rows are read-only in the vault ("Clone to customize" in the detail view); every picker that persists an item reference into a uuid FK (stores, inventories, recipes, loot tables, quest rewards, encounter loot, downtime deck backs, chat vendor offers/drops) converts a picked shared row into a per-user clone first via `useEnsureOwnedItem()`. Per-campaign gating rides `campaign_enabled_sources` (the Vault has the same Sources panel as Monsters/Spells, backed by `get_srd_item_sources`; grimoire-bundled rows are always available).

**Open5e import layer (#554)** — every v2 fetch across items/spells/monsters/etc. goes through shared helpers in `src/lib/open5eApi.ts`: `rulesetForDocument()` maps a document's gamesystem to `2014`/`2024`/`null`, `fetchSupported5eDocumentKeys()` lists every 5e-gamesystem document (excluding non-5e gamesystems like a5e), and `fetchAllFromDocuments()` scopes a list fetch to those keys via `document__key__in`. Plain `document__key` is silently ignored on `/v2/items`, `/v2/weapons`, and `/v2/magicitems` — those endpoints otherwise return the full unfiltered cross-publisher set with no error — so `document__key__in` is the only filter used against any v2 endpoint, with a stray-document assertion (`fetchAllFromDocuments` throws if a returned record's document key isn't in the requested set) guarding against that failure mode recurring.

**AI Generator** — "Generate" button opens `ItemGeneratorPanel`, an AI-assisted item creation wizard.

**Item Detail editor** (`/vault/:id?edit=true`) — a two-column form:

- **Portrait upload** — tabbed "Identified / Mundane" views; each has an independent image with focal-point control. The mundane image is shown to players before identification; the identified image is shown after.
- **Tags** — free-form tag array via `TagInput`.
- **Name, Type, Subtype, Rarity** — type drives which conditional panels appear below.
- **Weight + Cost** — weight uses `WeightInput` (supports lb/kg). Cost is a freeform string (e.g. "50 gp"). A rarity-based price hint is shown as a hint below the cost field for magic items.
- **Weapon section** (appears for weapon types) — damage rolls (multi-roll via `DamageRollsInput`), versatile damage (dice expression), range (e.g. "80/320 ft."), weapon properties checkboxes (finesse, light, thrown, two-handed, reach, heavy, loading, silvered, adamantine, etc.), and (2024 campaigns only, #557) a **Mastery** dropdown — one of the eight 2024 PHB mastery properties (Cleave, Graze, Nick, Push, Sap, Slow, Topple, Vex), stored in `items.mastery`. Definitions (label + full rules text, SRD 5.2, CC-BY-4.0) live in `src/data/weaponMastery.ts`; on import, mastery is extracted from the Open5e v2 `properties[]` array (`property.type === "Mastery"`). Shown on item views (`ItemSheet`, `ItemStatBlock`) only in 2024 campaigns.
- **Armor section** (appears for armor types) — Armor Class text field (supports formulas like "13 + DEX modifier (max 2)").
- **Magic Properties** (non-mundane items only) — "Requires Attunement" toggle + optional attunement-by text.
- **Charges / Quantity** — max charges, recharge roll (dice expression), recharge trigger (dawn/short rest/long rest). For ammunition items the section relabels to "Quantity / Count". Also: "Arcane Focus" and "Container" checkboxes.
- **Bundle Contents** (pack items) — ordered list of sub-items with quantities; when a pack is added to a player's inventory it auto-expands into individual rows inside a container.
- **Linked Spells** (non-mundane items only) — search and multi-select spells from the Spellbook to associate with this item (e.g. a staff that can cast specific spells).
- **Mundane Description** (non-mundane items only) — rich text field shown to players before identification.
- **Description** — rich text full item description shown after identification.
- **DM Notes** — rich text amber-bordered panel **never shown to players**. Use for GM-side asides, structural beats, foreshadowing. Rendered DM-side in ItemSheet when present.
- **Curse** (non-mundane items only) — toggle + rich text curse description. The hint reminds the DM to reveal the curse via the party inventory panel once triggered.
- **Scope** — two-button toggle: "General — all campaigns" (`campaign_id IS NULL`) vs "Campaign — *active campaign name*" (`campaign_id = active`). New items default to the active campaign; SRD imports stay general. The Vault list and every downstream `useItems()` caller (chat search, store inventory, crafting recipes, NPC inventory, encounters, loot tables, quests, party inventory) filter by this scope unless `includeAllScopes` is opted in.
- **Source** — freeform text for custom items; read-only link for Open5e imports.

**View mode** (`/vault/:id` without `?edit=true`) — renders `ItemSheet`, a clean reading layout with tabbed identified/mundane art, a stat block panel (type, rarity, weight, cost, damage, armor class, attunement, charges, properties), linked spells list, and the rich text description.

**Header actions on existing items:**

- "Send to…" dropdown (`ItemSendMenu`) — "Add to Party Stash" (party-wide shared inventory) or "Assign to Player" (sends directly to a player character's backpack).
- "Edit" — enters edit mode.
- "Scriptorium" — creates a Scriptorium document formatted as an item entry.
- "Clone" — duplicates the item.
- "Delete" — confirmation prompt then removal (also deletes associated storage images).

**Filter state** — search, type, rarity, source, and the "show all scopes" toggle are persisted in `useUiStore` (`vaultSearch`, `vaultFilterType`, `vaultFilterRarity`, `vaultFilterSource`, `vaultShowAllScopes`) so they survive navigation within a session.

---

### Player Inventory (`/play/inventory`)

The Player Inventory is the richest player-facing view in the portal. It is specific to the authenticated player's linked party member (or the DM's preview target in preview mode).

#### Paper Doll

A 128×240px character silhouette is shown on the left. The silhouette image switches between `dressed.webp` and `naked.webp` based on whether the "Clothes" slot is filled. Eleven slot buttons are overlaid on the silhouette at anatomically correct positions:

| Slot      | Label     | Matching logic                          |
| --------- | --------- | --------------------------------------- |
| head      | Head      | tags: helmet, hat, hood, circlet, crown |
| neck      | Neck      | tags: amulet, necklace, pendant         |
| shoulders | Shoulders | tags: cloak, cape, mantle, pauldrons    |
| body      | Body      | item_type === "armor"                   |
| hands     | Gloves    | tags: gloves, gauntlets, bracers        |
| ring      | Ring      | item_type === "ring"                    |
| waist     | Waist     | tags: belt, girdle, sash                |
| clothes   | Clothes   | tags: clothes, clothing                 |
| feet      | Boots     | tags: boots, shoes, sandals, footwear   |
| main_hand | Main Hand | all items (no type restriction)         |
| off_hand  | Off Hand  | all items (no type restriction)         |

The "Clothes" slot has a warning state (amber outline) when empty and equippable. Clicking a slot that has an item opens `ItemDetailPanel`. Clicking an empty slot opens a modal listing inventory items eligible for that slot; selecting one equips it. Equipping a stacked item automatically splits off qty 1 into a new equipped row.

To the right of the silhouette, weapon slots (main hand / off hand) and an "Other" section for catch-all equipped items are shown as `EquipSlotRow` rows.

#### Attunement Tracker

Below the doll: three pip dots. Filled pips are colored `bg-primary`; empty pips are `bg-muted`. Counter shows `n/3`. Hovering a filled pip shows the item name.

#### Coin Purse

Five currency columns (PP, GP, EP, SP, CP) shown as a compact grid. Each coin denomination is editable inline via `CoinRow`. A "Drop Coins to Chat" button opens a form for selecting amounts to drop; confirmed drops deduct from the player's wallet and post a campaign chat message.

#### Carry Weight Bar

A horizontal progress bar below the paper doll / coin purse row shows carry load:

- **Burden portrait** — 60×84px image switches among four portraits: `unencumbered.webp`, `encumbered.webp`, `heavily_encumbered.webp`, `over_encumbered.webp`.
- **Burden levels** — Unencumbered (≤STR×5 lb), Encumbered (≤STR×10 lb), Heavily Encumbered (≤STR×15 lb), Over Encumbered (>STR×15 lb). All thresholds double for characters with **Powerful Build** (detected from species name).
- **Bar color** — primary (green) → amber/70 → amber-500 → destructive (red) as load increases.
- **Capacity override** — clicking the capacity figure opens an inline edit input. Accepts absolute values (`150`), multipliers (`*2`), or additions (`+30`). An amber color and override expression are shown when a custom value is active. A reset button restores STR×15.
- **Extradimensional containers** — items inside a container tagged `extradimensional` contribute 0 weight to the total.

#### Container Sections

All containers are rendered as `ContainerSection` components with drag-and-drop reordering (via `vue-draggable-plus`, persisted as `sort_order` integers):

1. **Backpack** — always present, default location for newly added items.
2. **Belt** — always present, a quick-access slot.
3. **Custom containers** — inventory items that have `is_container = true`. Created by promoting an existing inventory item via the "Add container" picker. Items tagged `container` in the Vault auto-set `is_container` on add. Each custom container section shows its label (item name), total weight, and a remove button (which removes the container item row itself).

Within each container, items are shown as `ItemRow` rows supporting:

- Quantity adjustment (+/− buttons)
- Move to another container or location via dropdown
- "Drop to chat" — removes from inventory and posts an item-drop chat message
- Split stack (prompts for qty, creates a second row)
- Open detail panel
- Sell (opens detail panel pre-scrolled to sell form)

#### Stored Elsewhere

Items with `location === "stored"` (not on the character's person) are listed in a separate section. No carry-weight contribution.

#### Party Stash

Items with `carried_by === null` (shared party inventory) are shown in a read-only-ish section. "Show carrier" label is displayed. Party stash items can be moved to the character's own locations.

#### Add Item Form

A sticky form at the bottom of the page: a combobox searches the full Vault by name, a quantity field, and an "Add" button. If a Vault item has `bundle_items` (pack), adding it auto-creates the pack container and expands sub-items inside it. Magic items are added as `is_identified = false` (unidentified); mundane items are added as identified.

#### Item Detail Panel (`ItemDetailPanel`)

Slides in when any item row or slot button is clicked. Shows the linked Vault item's full data (identified or unidentified depending on `is_identified` flag) plus inventory-instance data:

- Notes field (per-instance notes)
- Attunement toggle with 3-slot guard (disabled when 3 already attuned and item is not yet attuned)
- Charge tracker (optimistic local state, synced via watch on `[props.inv?.id, props.inv?.charges]`)
- Identification — DM-only "Identify" button (hidden in player view / DM preview mode)
- Equip / Unequip button
- Consume button (removes the item row)
- Sell form (posts a player offer to campaign chat)

#### Live Sync

The inventory subscribes to real-time Supabase changes via `useInventoryLive()`, so inventory updates from the DM (e.g. sending an item to a player) appear immediately without page refresh.

---

## Spellbook

### DM View (`/spells`)

The Spellbook is the DM's master spell compendium, holding both imported SRD spells and custom homebrew spells.

**List view** — paginated (50 per page, `keepPreviousData`), filterable by:

- Name search (debounced 400 ms)
- Level (0–9 button group; 0 = Cantrips labeled "C")
- School (all 8 schools)
- Class (Barbarian, Bard, Cleric, Druid, Fighter, Paladin, Ranger, Rogue, Sorcerer, Warlock, Wizard, etc.)
- Source (dynamically populated)

**Import from Open5e** — "Sync from Open5e" button. A source picker popover (lazy-loaded from `useOpen5eDocuments`, stored in localStorage as `grimoire:spell-import-sources`) allows selecting specific sourcebooks before importing; leaving all unchecked imports everything. Import is upsert-based: new spells inserted, existing `open5e_import` spells updated for source/classes metadata only (images never overwritten). Reports "N added, N updated".

**AI Generator** — "Generate" button opens `SpellGeneratorPanel`.

**Spell Detail editor** (`/spells/:id?edit=true`) — a three-column layout on wide screens:

- **Left column** — portrait upload with focal-point, source field (read-only link for Open5e imports, editable for custom spells).
- **Center column** — core mechanical fields:
  - Name
  - Level (Cantrip through 9th) + School (Abjuration, Conjuration, Divination, Enchantment, Evocation, Illusion, Necromancy, Transmutation)
  - Casting Time (standard options: Action, Bonus Action, Reaction, 1 Minute, 10 Minutes, 1 Hour, 8 Hours, Special) + optional custom text for Reaction/Special
  - Range (Touch, Self, 5/10/30/60/90/120/150/300/500 ft., 1 Mile, Sight, Unlimited, Special)
  - Duration (standard options including instantaneous, 1 round, up to 1/10 minutes, 1/8/24 hours, Special, Until Dispelled) + Concentration and Ritual toggles
  - Components (V/S/M checkboxes) + material component text field
  - **Mechanics block**: Attack/Targeting type (Melee Spell Attack, Ranged Spell Attack, Saving Throw, Utility/No Attack), save attribute and "effect on successful save" (for saving throws); damage rolls (multi-roll `DiceInput`); area of effect (shape + size)
  - Spell description — rich text editor
  - Higher level effects — rich text editor
- **Right column** — class list (multi-select checkboxes for all spellcasting classes)
- **Spell Level Advisor modal** — wizard that appears for new spells. Asks school, effect type, intensity/damage dice, target count, and save type; outputs a suggested spell level and pre-fills mechanical fields.

**View mode** (`SpellSheet`) — a clean stat-block style layout with all spell stats in a compact summary line (level, school, ritual, concentration), then the rich text description and higher-level text. Below the source line it renders two reverse-lookup sections (#168): **Known By** — party members with the spell in `character_spells` (prepared marker included, via `useSpellKnowers`) — and **Cast By** — NPC pills linking to `/npcs/:id` for every active-campaign NPC whose `stat_block.spellcasting.entries[].spell_ids` contains the spell (via `useNpcSpellCasters`, a JSONB containment query in `useNpcs.ts`).

**DM-only edit guard** — edit controls are hidden when `!auth.isDM || ui.dmPreviewMode`.

**Actions on existing spells:**

- "Send to Scriptorium" — creates a formatted Scriptorium document.
- "Delete" — confirmation + image storage cleanup.

---

### Player Spells (`/play/spells`)

The player spell view adapts entirely to the character's caster type. The view resolves the current party member (or DM preview target).

**Caster types:**

- `spellbook` — Wizard-style: spells are learned into a spellbook then a subset prepared daily
- `prepared` — Cleric/Druid-style: all class spells are available to prepare, no separate spellbook
- `known` — Sorcerer/Bard/Warlock-style: a fixed number of spells known
- `none` — non-caster: only innate + browse tabs shown

**Tab layout per caster type:**

| Type      | Tabs                                        |
| --------- | ------------------------------------------- |
| spellbook | Prepared · Spellbook · Innate · All Spells  |
| prepared  | Prepared · Innate · All [Class] Spells      |
| known     | Known [Class] · Innate · All [Class] Spells |
| none      | Innate · All Spells                         |

Tab badges show counts (and max where applicable). "Known" badge shows `N/maxKnown + Nc/maxCantrips` for known-type casters. If counts exceed max, badge turns destructive red.

**Prepared tab / Known tab** — rendered by `PlayerMySpells`. Displays the character's prepared/known spells grouped by level. Each spell row shows name, school, components, and roll buttons for spell attack and damage. Spell slots are tracked per level (including multiclass-aware slot table). Clicking a spell opens a detail modal. Spells can be un-prepared/removed from this tab.

**Spellbook tab** (spellbook casters) — also `PlayerMySpells` in `view-mode="spellbook"`. Shows all spells learned into the character's spellbook. Spells can be prepared from here (up to the daily preparation limit).

**Innate tab** — rendered by `PlayerInnateSpells`. Shows racial, feat, and item-sourced spells (source_type != "class"). An "Add Innate Spell" button opens `AddInnateSpellDialog`, which searches the full Spellbook and adds a spell with a custom source label.

**Browse tab** — full paginated Spellbook with name search, level filter, school filter, and class filter (pre-filtered to the character's class). Spell rows show "Prepared", "Known", or an "Add to Spellbook / Prepare" button depending on caster type and current state. Clicking a spell row opens `PlayerSpellModal` (a slide-in detail view, not a navigation).

**Spell attack bonus and save DC** — computed per source class (proficiency bonus + that class's casting ability modifier) via the shared `computeSpellcastingByClass` helper (`src/lib/spellcastingByClass.ts`), consumed by both `PlayerSpellsView` and the encounter runner's `RunnerPcPanel`. Innate/item grants resolve their stats through `grantAttackBonus`/`grantSaveDc` (`src/lib/spellGrantStats.ts`): `casting_ability` first, then per-class stats, then the surface's fallback. There used to be a first-precedence `fixed_attack_bonus` / `fixed_save_dc` pair for a grant with a printed DC (e.g. a magic item), but nothing ever wrote either column — both were 100% NULL in production, so the override branch could never fire — and they were dropped in `20260730000009` (#589). If a printed-DC grant is wanted later, it needs a write path as well as a read path.

**Spell roll actions** (#460) — castable spell rows expose interactive `Atk +X` / `DC X` controls (in both `PlayerMySpells` and the encounter runner's `RunnerPcSpells`):

- **Attack spells** (`attack_type` = `ranged_spell`/`melee_spell`): the `Atk` badge is a button that rolls `d20 + spell attack bonus` and posts to chat. In the runner it reuses the `roll-attack` → `performCheck` chain; `spellAttackBonus = saveDc − 8` in `RunnerPcPanel`.
- **Save spells** (`attack_type` = `save`): the `DC` badge announces a `DC X {ability} saving throw` (with half/negates effect from `save_effect`) so the table can roll against it — a flavor message in the player view, a chat announcement (respecting chat/silent mode) in the runner via the `roll-spell-save` event.
- Damage/healing dice are still rolled by the **Cast** button (the upcast picker scales them); these buttons are slot-free, standalone rolls.

**Multiclass support** — `useCharacterClasses` returns per-class level rows; `getMulticlassSpellSlots()` computes combined slot totals per PHB multiclass rules. Displayed slots come from `deriveEffectiveSpellSlots` (`src/lib/spellSlots.ts`), which reconciles stored server-owned pools against freshly derived maxima (usage preserved) so a campaign ruleset switch is reflected without losing spent slots.

### Dual-ruleset spellcasting engine (EPIC #550)

The campaign `ruleset` (`2014`/`2024`, campaign-wide, default 2014) drives every edition-sensitive spell rule. Support boundaries are documented in `docs/spellcasting-support-matrix.md`. Server-authoritative pieces (all SECURITY DEFINER RPCs authorize from `auth.uid()`; players cannot create illegal spell state via direct API):

- **Casting** — `cast_character_spell_v4` (folded into a single authoritative body in migration `20260720000044`; the former v1–v3 inner layers are dropped): one transaction spends the chosen slot/pool (Spellcasting, Pact, temporary, feature), records a `spell_cast_records` row (select-only RLS by design — clients must not forge cast records), enforces prepared/known/ritual eligibility (wizard spellbook rituals cast unprepared), turn-scoped rules via `private.active_turn_key()`, and metamagic eligibility/costs (Arcane Apotheosis free use at Sorcerer 18+). One row lock/auth check/ruleset/turn-key/grant lock/spell resolve per cast.
- **Rules data (#551)** — Metamagic identity/classification/cost lives in the `metamagic_options` table (per ruleset; `post_roll` marks Empowered/Seeking, `cost_scaling: spell_level` covers original Twinned) and per-class ritual eligibility in `class_ritual_policies` (`ritual_style`: none/prepared/known/spellbook/spellbook_or_prepared; unlisted classes default to `prepared` in 2024, `none` in 2014). Both are world-readable/admin-writable and consumed by the cast RPC server-side and by the client via `useMetamagicOptions()` (`src/composables/useMetamagic.ts`) and `useRitualStyles()` (`src/composables/useRitualPolicies.ts`) — the old static `src/data/metamagic.ts` and the hardcoded `RITUAL_CASTERS_2014` set are gone; `canCastAsRitual` now takes a `ritualStyle`.
- **Slot pools** — server-owned in `party_members.spell_slots`; `spend_spell_slot` reconciles a client-derived template only to fill pools missing entirely (legacy characters), never to enlarge existing maxima.
- **Rests** — `take_spellcasting_rest` atomically restores only eligible pools (Pact on short rest; Sorcerous Restoration tracked separately) and reopens preparation windows. Rest/turn-state clearing is declarative (`20260720000045`): any `class_choices` key ending in `_turn` is removed on a long rest, and other resettable keys register in `class_choice_rest_resets` (`rest` + `remove`/`set_false`) — new class features never need another rest-function migration.
- **Preparation windows** (`spell_change_windows`) — opened at class creation/level-up (trigger) and each long rest via `open_spell_change_windows`; closed when a non-cantrip slot cast occurs (the post-rest preparation period ends). `set_character_spell_prepared` / `change_prepared_spell` gate 2024 preparation/replacement on an open window and `remaining_changes`.
- **Acquisition** — `validate_character_spell_source` checks class list/level/counts per pinned class definition (system or custom; legacy kind-NULL rows fall back to name-based custom class lookup). `delete_character_spells` protects leveled 2024 class spells behind replacement windows but allows cantrip and spellbook-entry deletion; `p_source_class_id = null` matches only unassigned rows.
- **Level-up** — `required_level_up_spell_choices`/`apply_level_up` validate choice counts; the client mirrors the same logic per definition kind in `levelUpSpellChoiceCount` (`spellPreparationPolicy.ts`) — custom classes use their own progression even when named like an official class.
- **Content identity** — character classes/subclasses/spells pin an exact content version (`class_definition_id`/`kind`); ruleset switches remap safe counterparts and flag the rest for player review (acknowledge RPCs). World bundles (format v2) carry the source campaign ruleset; v1 bundles strip pins on import.

Mutation errors from these RPCs surface via toasts (`useCharacterSpells` mutations have `onError` handlers) — they are policy messages, not silent failures.

---

## Workshop (Crafting)

### DM View (`/crafting`)

The Workshop is where the DM creates crafting recipes and controls which players can see them.

**List view** — tabbed by crafting discipline. All recipes are shown in an "All" tab; individual discipline tabs filter the list. Mobile-responsive cards truncate the name and collapse discipline/proficiency/tools badges to icons only.

**Crafting disciplines** — defined in `src/lib/crafting-disciplines.ts`. Each discipline has:

- An id, label, icon
- The ability score used for the check (INT, WIS, DEX, etc.)
- The relevant tool(s) for proficiency checks
- A workspace bonus (standard modifier for having a proper workspace)
- A workspace label shown in the attempt dialog

**Player visibility toggle** — `PlayerVisibilityToggle` on each recipe card controls which player characters can see the recipe in their portal. This can be changed directly from the list without entering the editor.

**Starter recipe import** — "Import Starter Recipes" button imports a built-in set of starter recipes (idempotent).

**Recipe editor** (`/crafting/:id`) — a focused form:

- **Name** + proficiency toggle (lock icon: whether proficiency is required to attempt) + tools toggle (wrench icon: whether tools must be in inventory, or if lacking them only imposes disadvantage)
- **Player visibility toggle** — sets which party members can see this recipe
- **Discipline** dropdown
- **Crafting DC** (integer 1–30)
- **Crafting time** + unit (minutes, hours, days)
- **Description** — rich text editor
- **Outputs** — searchable item picker; at least one output is required to save. Each output has a quantity. The first output is the "primary" result.
- **Ingredients** — searchable specific-item picker OR tag-based wildcards (e.g. `any "meat"` or `any ["glass", "container"]`). Each ingredient has a quantity. The first ingredient is the "PRIMARY" one (ruined on a critical fail).
- **Conditional modifiers** — DM-defined bonus conditions (e.g. "Full forge available" → +4). Workshop bonus and poor-ingredient penalty are provided automatically by the dialog and not listed here.

**Read mode** (`RecipeSheet`) — clean layout showing DC, time, ingredient list, and output list.

---

### Player Crafting (`/play/crafting`)

Players see only recipes the DM has shared with them (via `player_visible_to`) via `usePlayerCraftingRecipes`.

**Discipline tabs** — only disciplines with at least one accessible recipe are shown. Tabs where the character lacks the required tool proficiency show a "NO PROF" badge and use dimmer styling.

**Recipe cards** — each card shows:

- Name and discipline badge (when viewing "All")
- DC and crafting time
- Output item names (inline summary, e.g. "→ 2× Iron Ingot")
- Lock/status badge: "LOCKED" if proficiency required and not met; "NO TOOLS" if tools required and not in inventory; "DISADV" if tools not in inventory (disadvantage penalty applies)
- Description (rendered from Tiptap JSON)
- Ingredients list — each line shows a green checkmark or red X, required quantity, and owned count (checked against `myInventory` including party stash)
- "Attempt Craft" button — disabled when any hard requirement is unmet

**Discipline header** (when a specific discipline is active) — shows the discipline description, the ability score used (e.g. "Uses INT (+2) + Proficiency (+3)") or a note that no proficiency bonus applies.

**Ingredient matching** — specific-item ingredients matched by `item_id`; tag-based ingredients matched by checking ALL required tags against the vault item's tag array. Ruined items are excluded from counts. Party stash items are included.

**CraftAttemptDialog** — modal that opens when "Attempt Craft" is clicked:

1. **Ingredient slots** — shows each ingredient with green/red status, quantity needed vs owned.
2. **Proficiency notice** — amber warning if proficiency is missing (no proficiency bonus added).
3. **Disadvantage notice** — amber warning if the required tool is not in inventory (roll made at disadvantage: roll twice, take lower).
4. **Modifier checklist** — optional checkboxes for workspace bonus (discipline-defined), poor quality ingredients penalty (−2), and any recipe-specific conditional modifiers the DM added.
5. **Roll** — clicking "Attempt Craft" rolls the check server-side (`useAttemptCraft`). Result is displayed: the d20 roll, any disadvantage second roll, total vs DC.
6. **Outcome** — one of three results:
   - **Success** (total ≥ DC) — green result panel
   - **Fail** (total < DC) — neutral result panel; ingredients are preserved
   - **Ruin** (critical fail / natural 1) — red result panel; the PRIMARY ingredient is ruined
7. On completion, the result is posted to the campaign chat as a message.

---

## Key Capabilities

- **Dual-image identification system** — magic items have both a mundane appearance (what unidentified players see) and an identified appearance. The DM can flip `is_identified` on a player's inventory item, changing what they see without changing the underlying vault item.
- **SRD + Open5e import pipelines** — spells sync selectively by sourcebook; items come from the shared `srd_items` table (#303). All paths are upsert-safe and preserve user-customized data. The full per-entity re-import contract (what refreshes vs. what's DM-owned and never touched) is documented in [`docs/srd-reimport.md`](../../docs/srd-reimport.md).
- **SRD seed pipeline (#560, #303)** — the shared `srd_spells`/`srd_monsters`/`srd_items`/`srd_species` tables are seeded by `scripts/seed-srd-*.ts` (run via `npm run seed-srd-<entity>` under `tsx`), reusing the exact same Open5e v2 mappers as the in-app import flows — one source of truth for the field mapping, only the transport differs. All seed both editions by default and upsert idempotently on `(source_document_key, source_record_key)`; the spell seed excludes rows already marked `mechanics_reviewed = true` from the upsert entirely (`planSrdSpellImport` in `src/lib/open5eSpellImport.ts`), so admin-reviewed spell mechanics are never clobbered by a re-run. `srd_spells` currently holds 319 `srd-2014` + 339 `srd-2024` rows; `srd_items` 1717 rows (548 `srd-2014`, 808 `srd-2024`, 361 edition-neutral bundled); `srd_species` the 9 core species per edition. The legacy `wotc-srd` identity set was retired by migration `20260722000002` (references remapped to the equivalent `srd-2014` rows; v1 class lists unioned into v2 rows where the v2 data had regressed).
- **Redistribution guard (#567)** — every seed script calls `assertRedistributableDocuments()` after resolving its document keys and before fetching any content, so an explicit `npm run seed-srd-monsters <key>` is refused just as firmly as `--all` if that document's licence doesn't clear `REDISTRIBUTABLE_LICENSE_KEYS` (`ogl-10a`, `cc-by-40`, `cc0`, `orc`). A document listing **no** licence is refused too — unknown licensing is never a default-allow. All four mappers now populate `source_license`; because the embedded `document` ref on v2 records omits `licenses`, seed scripts build a `Map<string, Open5eDocumentRef>` from `fetchOpen5eDocumentRefs()` and thread it into the mapper. `scripts/seed-content-sources.ts` (`npm run seed-content-sources`, supports `--dry-run`) refreshes the `content_sources` attribution catalogue from `/v2/documents/`, writing machine-derived fields only and skipping `is_metadata_curated` rows wholesale. See the Reliquary Licences section in `publishing-tools.md`.
- **Weapon mastery (#557)** — 2024-only per-item mastery property (see Weapon section above) plus per-character tracking: `party_members.weapon_masteries` records which masteries a character has active, toggled from the equipped-weapon rows in the Character Sheet's Combat tab (`PlayerCombatTab` — see `party-characters.md`).
- **Tag-based slot matching** — the paper doll uses vault item tags and subtypes to determine which slots an item can fill, without requiring a dedicated "slot" field on the item.
- **Extradimensional container weight exclusion** — items inside a container tagged `extradimensional` (e.g. a Bag of Holding) contribute 0 weight.
- **Pack expansion** — vault items with `bundle_items` auto-expand into individual container rows when added to inventory.
- **Per-character spell management** — spell view adapts to caster type (spellbook/prepared/known/none), shows multiclass-accurate slot tables, and tracks prepared vs known separately from innate spells.
- **Player-gated recipe visibility** — each recipe has a `player_visible_to` array; the DM controls visibility per recipe per party member without separate publish flows.
- **Crafting proficiency and tools matrix** — the attempt dialog separately handles the three states: proficiency (adds bonus), tools present (normal roll), tools absent (disadvantage). A recipe can hard-lock to require proficiency or tools.
- **Campaign chat integration** — item drops, coin drops, item-sell offers, and crafting outcomes all post messages to the campaign chat feed. Clicking a dropped vault item's name (or the "Show Details" toggle) expands its stat block/description inline — available whether or not the item has already been grabbed (`ChatItemDropMessage.vue` → `ChatItemDropDetails.vue`, RLS-gated so unclaimed players still see a "claim it to reveal" placeholder).
- **Scriptorium export** — any item or spell can be sent to the Scriptorium as a formatted document.

---

## Data Fields

### Item (`items` table)

| Field                       | Type               | Notes                                                                                         |
| --------------------------- | ------------------ | --------------------------------------------------------------------------------------------- |
| `name`                      | string             |                                                                                               |
| `item_type`                 | enum               | weapon, armor, shield, ring, wand, staff, scroll, potion, gear, ammunition, art_object, other |
| `subtype`                   | string             | e.g. "longsword", "chain mail"                                                                |
| `rarity`                    | enum               | mundane, common, uncommon, rare, very_rare, legendary                                         |
| `weight`                    | string             | parsed by `parseWeightLb()`                                                                   |
| `cost`                      | string             | freeform, e.g. "50 gp"                                                                        |
| `tags`                      | string[]           | drive slot matching, container detection, ingredient wildcards                                |
| `image_url`                 | string             | identified portrait                                                                           |
| `image_focal_point`         | object             | {x, y} for FocalImage                                                                         |
| `mundane_image_url`         | string             | pre-identification portrait                                                                   |
| `mundane_image_focal_point` | object             |                                                                                               |
| `requires_attunement`       | boolean            |                                                                                               |
| `attunement_requirements`   | string             | "by a spellcaster", etc.                                                                      |
| `charges`                   | number             | max charges                                                                                   |
| `recharge_roll`             | string             | dice expression                                                                               |
| `recharge_when`             | string             | "dawn", "short rest", etc.                                                                    |
| `is_arcane_focus`           | boolean            |                                                                                               |
| `is_container`              | boolean            | tags `container` auto-sets this                                                               |
| `damage_rolls`              | DamageRoll[]       | JSONB array                                                                                   |
| `versatile_damage`          | string             | dice expression                                                                               |
| `weapon_range`              | string             | "80/320 ft."                                                                                  |
| `properties`                | string[]           | finesse, light, thrown, etc.                                                                  |
| `armor_class`               | string             | "13 + DEX modifier (max 2)"                                                                   |
| `spell_ids`                 | string[]           | linked Vault spells                                                                           |
| `bundle_items`              | {name, quantity}[] | pack expansion                                                                                |
| `description`               | Tiptap JSON        | rich text, post-identification                                                                |
| `mundane_description`       | Tiptap JSON        | rich text, pre-identification                                                                 |
| `curse_description`         | Tiptap JSON        |                                                                                               |
| `is_cursed`                 | boolean            |                                                                                               |
| `source`                    | string             | slug                                                                                          |
| `source_title`              | string             | display name                                                                                  |
| `source_url`                | string             | link to external source                                                                       |

### Spell (`spells` table)

| Field               | Type        | Notes                                                  |
| ------------------- | ----------- | ------------------------------------------------------ |
| `name`              | string      |                                                        |
| `level`             | number      | 0 = cantrip                                            |
| `school`            | string      | abjuration, conjuration, etc.                          |
| `casting_time`      | string      |                                                        |
| `range`             | string      |                                                        |
| `duration`          | string      |                                                        |
| `concentration`     | boolean     |                                                        |
| `ritual`            | boolean     |                                                        |
| `components`        | string[]    | ["V","S","M"]                                          |
| `material`          | string      | material component text                                |
| `attack_type`       | string      | melee_spell_attack, ranged_spell_attack, save, utility |
| `save_attribute`    | string      | STR, DEX, CON, INT, WIS, CHA                           |
| `save_effect`       | string      | half, none, other                                      |
| `damage_rolls`      | DiceInput[] |                                                        |
| `area_of_effect`    | object      | shape + size                                           |
| `classes`           | string[]    | class list                                             |
| `description`       | Tiptap JSON |                                                        |
| `higher_level`      | Tiptap JSON |                                                        |
| `image_url`         | string      |                                                        |
| `image_focal_point` | object      |                                                        |
| `source`            | string      |                                                        |
| `source_title`      | string      |                                                        |
| `source_url`        | string      |                                                        |
| `open5e_import`     | boolean     | true for Open5e-sourced spells                         |

### CraftingRecipe (`crafting_recipes` table)

| Field                  | Type               | Notes                               |
| ---------------------- | ------------------ | ----------------------------------- |
| `name`                 | string             |                                     |
| `discipline`           | CraftingDiscipline | id referencing CRAFTING_DISCIPLINES |
| `dc`                   | number             | 1–30                                |
| `crafting_time`        | number             |                                     |
| `crafting_time_unit`   | enum               | minutes, hours, days                |
| `description`          | Tiptap JSON        |                                     |
| `requires_proficiency` | boolean            | hard-lock on proficiency            |
| `requires_tools`       | boolean            | hard-lock on tools                  |
| `player_visible_to`    | string[]           | party member ids                    |

### CraftingIngredient (related table)

| Field       | Notes                          |
| ----------- | ------------------------------ |
| `recipe_id` | FK                             |
| `item_id`   | null for tag-based             |
| `tags`      | string[] for wildcard matching |
| `quantity`  |                                |

### CraftingOutput (related table)

| Field       | Notes         |
| ----------- | ------------- |
| `recipe_id` | FK            |
| `item_id`   | vault item FK |
| `quantity`  |               |

### CraftingModifier (related table)

| Field         | Notes           |
| ------------- | --------------- |
| `recipe_id`   | FK              |
| `description` | condition label |
| `bonus`       | integer bonus   |

### PartyInventoryItem (`party_inventory` table)

| Field           | Notes                                             |
| --------------- | ------------------------------------------------- |
| `item_id`       | FK to vault item (null for ad-hoc items)          |
| `name`          | display name                                      |
| `quantity`      |                                                   |
| `carried_by`    | party member id; null = party stash               |
| `location`      | equipped, backpack, belt, container, stored       |
| `slot`          | InventorySlot or null                             |
| `is_container`  | promotes item to a container section              |
| `container_id`  | FK to another party_inventory row                 |
| `is_equipped`   | boolean                                           |
| `is_attuned`    | boolean                                           |
| `is_identified` | boolean                                           |
| `is_ruined`     | boolean                                           |
| `notes`         | freeform per-instance text                        |
| `sort_order`    | integer for drag-and-drop ordering                |
| `charges`       | current charges (tracks against vault item's max) |
