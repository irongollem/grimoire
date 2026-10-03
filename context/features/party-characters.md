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

### Experience Points (XP levelling)

When the optional house-rule `xp_levelling` is enabled for the campaign (Campaign Settings → Rules; registered in `src/rules/optionalRules.ts`, stored in `campaign_rules`), the Party Tracker shows a **`PartyXpAward.vue`** control at the top of the card list. The DM enters an XP amount and a target — **Everyone** or a single member via `EntityCombobox` — and **Award** adds it (clamped at 0) to each target's `party_members.experience_points`, toasting when an award pushes a character past a level threshold. XP is milestone-by-default: with the rule off, no XP UI appears anywhere.

On the player side, `PlayerCharacterHeader` reads `useIsRuleEnabled("xp_levelling")` and, when on, renders an XP progress bar (current / next-level threshold from `LEVEL_XP_THRESHOLDS` in `party.types.ts`) plus a **Ready ↑** level-up trigger once `levelForXp(xp) > level`. Helpers: `levelForXp`, `xpForNextLevel`, `xpForLevel`.

### Combat Flow

**Initiative:**

- The Party Tracker itself has no roll or clear control — `current_initiative` is set from the live encounter, not from here.
- Each player rolls their own initiative (DEX mod + `initiative_bonus`, via `usePromptedRoll`) from `PlayerEncounterPanel` when an encounter starts (#504); the write lands on their own `party_members` row (RLS lets a player update their own character), and the DM's runner ingests the value live rather than writing it itself — see "Encounter Runner" in combat-encounters.md.
- Cards automatically re-sort highest to lowest once every member has a value; anyone still unrolled falls back to `sort_order`.

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

A `combat_ready` boolean (default true) toggles per companion via a "With Party" / "Elsewhere" chip on `CompanionCard.vue` (#569) — controls whether the companion auto-joins new encounters (see combat-encounters.md); benched companions render the whole card at reduced opacity with an "· Elsewhere" label. Players can now manage their own companions from `/play/party` too — create, edit, HP/condition tracking, and the same `combat_ready` toggle, not just the DM (see player-portal.md). RLS (migration `20260725000002`) was reworked accordingly: insert still requires `auth.uid() = user_id` but now also campaign membership; update/delete allow the creator, the campaign DM (`private.is_campaign_dm`), or the player whose character owns the companion (`private.my_party_member_id`) — the same grant that lets End Combat write companion HP back and lets a DM manage player-created companions. `CompanionForm` also role-gates its NPC-source picker: DMs browse the raw `npcs` table, non-DM callers get the player-safe `useSharedNpcs()` projection so a disguised NPC's true identity and DM-only columns never reach a player's client.

**Companion notes live in `entity_notes`** (`entity_type = 'companion'`), like every other entity's. Editing a companion shows the DM an `EntityNotesPanel` under the stat block, and players keep theirs in the lightbox's `PlayerNotesWidget`. A private note is private by RLS on `entity_notes`, which is why this is the only place for a DM secret about a companion: every campaign member can select the full `companions` row. The table used to carry `notes` and `party_notes` columns that no screen showed; migration `20260926155338` moved their content into `entity_notes` and dropped them, along with the unused RPC `update_companion_party_notes`.

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

Each member card shows their **effective** location, linked to `/locations/:id`.

**Position is derived, not stored** ([#786](https://github.com/irongollem/grimoire/issues/786), migration `20260904133304`). `campaigns.current_location_id` is where the party is and is authoritative; `party_members.current_location_id` is an **override**, and **NULL means "with the party"** rather than "unknown". A member's position is `effectiveLocationId(member, campaignLocation)` — their override if they have one, otherwise the campaign's — exported from `src/lib/partyPosition.ts` and used by every reader.

Consequences worth not undoing:

- **Moving the party is one write** to the campaign, and everyone without an override comes along. Nothing propagates to member rows, so nothing can drift. The old "Sync to party" button on the dashboard's Session widget is gone: it existed only because nothing propagated, and a DM who forgot it left the whole party pinned to last session's location.
- **An override is visually distinct at rest**, not on hover — a member who stayed behind or scouted ahead is the exception worth seeing at a glance.
- **Clearing an override is "rejoin the party"**, not "clear location". That is what it means, and the wording matters because null is now a real state rather than missing data.
- Backup, restore and world-bundle export carry the raw column through unchanged rather than deriving it — an override is data, and resolving it on export would lose it.

### DM Member Detail

Clicking a member's name navigates to `/party/:id` (`PartyMemberView.vue`), which renders the full `PlayerCharacterView` in read-only mode (`hide-player-actions` prop). An "Edit" button in the top bar opens `PartyMemberForm` as a right-anchored side-sheet without navigating away.

---

## Character Sheet (DM View via PartyMemberForm)

**Route:** Slide-in panel triggered from `/party/:id`

`PartyMemberForm` is a tabbed side-sheet with exactly four tabs: Identity, Stats, Proficiencies, Persona.

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
- **Combat stats**: Max HP, Current HP, Temp HP, AC (with a "without shield" hint), Speed (ft), Initiative Bonus, Carry Capacity Override (`*2`, `+30`, `150`, or blank for STR×15)
- **Computed passives** (read-only): Passive Perception, Insight, Investigation
- **Spell Slots (Max per Level)** — 9-level grid with a "Reset to class defaults" action

**Shield & armor AC** — the stored `party_members.ac` is the armor class WITHOUT shield. Display AC resolves through `useShieldAcBonus().acFor(member)` (`src/composables/party/useShieldAc.ts`, wrapped in `createSharedComposable` so N tracker/runner rows share one set of inventory-scanning computeds; pure logic + tests in `src/rules/shieldAc.ts` and `src/rules/armorAc.ts`): base AC comes from `resolveBaseAc(ac_formula, storedAc, equippedArmor, dex)` — `"armor"` live-derives from the equipped body armor (`parseArmorClass`, base anchored to a leading integer), `"unarmored:*"`/`"mage_armor"` are replaced by armor-derived AC while body armor is equipped (RAW: those calculations only function unarmored), `"natural:*"` (fixed `natural:<N>` or Dex-based `natural:<N>+dex` — Tortle vs. Lizardfolk/Draconic Resilience) takes the higher of shell vs. worn armor, and null/manual `ac` is never overridden — then any equipped (non-ruined) shield bonus stacks on top in every mode. Wired into: PlayerCharacterHeader, PlayerPartyMemberCard, PartyMemberLightbox, PartyTrackerRow, RunnerPcPanel, useRunnerCombatant, and CharacterSheetRenderer (via `acBonus` prop — the renderer is mounted with a bare `createApp` for PDF export, so it can't use query composables). Wildshaped characters show the beast AC with no shield bonus. Both AC edit fields (CharacterEditTabs, PartyMemberAbilitiesTab) carry a "without shield" hint.

### Proficiencies Tab

- **Saving Throw Proficiencies** checkboxes (6 stats) with live bonus display
- **Skills** grid: None / Proficient / Expertise per skill, with live bonus display
- **Tool Proficiencies** — tag picker (`TagPickerInput`)
- **Languages** — tag picker (`TagPickerInput`)

### Persona Tab

- **Alignment** dropdown (9-alignment list, blank for none) + **Deity** free-text field with an autocomplete dropdown against the deities compendium
- **Age**, **Gender**, **Pronouns** free-text fields
- **Physical Description**, **Personality Traits**, **Ideals**, **Bonds**, **Flaws** — rich-text (Tiptap) fields

There is no Location tab or free-text equipment fields on this form. A member's position is set via `LocationResidents` on the location itself, calendar travel events, or "Rejoin the party" (see "Member Locations" above) — never edited directly in `PartyMemberForm`.

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
- **Scope** (`CampaignScopeField`, #596) — "General — all campaigns" (`campaign_id IS NULL`) vs "Campaign — *active campaign name*". New species default to the active campaign; editing an existing species — including one that's already general — never moves it, no matter which campaign happens to be active. Before #596 every new species defaulted to general regardless of the DM's intent, which is what the per-campaign gating in the paragraph below was built to filter down from.

**Copying to another campaign (#598).** Re-scoping *moves* the row; copying makes a second, independent one in a campaign the account DMs, reachable from the Select surface's bar and from the detail editor's own actions. The rules — which cross-entity references travel, which are dropped and named, which are reported rather than dropped, and why the copy neither suffixes its name nor navigates afterwards — are written once in `items-spells-crafting.md` ("Copying to another campaign"). Species-specific note: a grant whose spell the target campaign cannot see is **removed**, not blanked, because `SpeciesSpellGrant` reads `spell_id: null` as a free player pick — blanking it would quietly make the copy more generous than the original. A grant naming a shared-library spell travels, and is reported when the target has not enabled that source.

**Shared SRD species (#303):** the core species per edition come from the shared `library_species` table (public read, admin write; seeded by `npm run seed-library-species`; mapper in `src/lib/library/open5eSpeciesImport.ts`). `useAllSpecies()` merges shared rows (slug ids) with the user's own; a per-user row shadows its shared counterpart by source identity (or lowercase name for pre-versioning imports). Species references (`party_members.species_id`/`disguise_species_id`, `campaigns.disabled_species_ids`) are **text** since migration `20260724000003` and hold either a custom uuid or an `library_species` slug — players can pick shared species directly in character creation without any cloning.

**Per-campaign gating (#566):** what a *picker* may offer is decided in one place — `src/lib/campaignContentGating.ts`, surfaced as `useCampaignSpecies()` / `useCampaignSystemClasses()` / `useCampaignCustomClasses()` / `useCampaignCustomSubclasses()`. Each returns `{ data, all, isLoading }`: **`data` is the gated list every picker must use** (DM's `campaigns.disabled_species_ids` / `disabled_class_names` blocklist, minus content marked exclusive to another campaign), **`all` is the ungated list for resolving what a character already has** — disabling a species/class hides it from the pickers, it never erases it from the characters who picked it first, and an existing barbarian still levels. Custom classes/subclasses are never blocklisted (ClassesTab only toggles SRD classes) but are still campaign-scoped. The gate is a table rule, not a security boundary: it is enforced client-side only.

**Player-claims-a-DM-managed-character (rejected alternative):** when a player links to a character the DM already set up, UPDATE is extended to the linked member rather than the seemingly safer "read-only plus a force-assume action". Assume deep-copies the character, which breaks the DM-managed link the DM deliberately created — so the safe-looking option silently destroys the thing being protected. Migration `20260711000005` carries the escalation analysis for the write path itself.

**Open5e import panel:** Searches the Open5e API and imports individual species into the user's own table, deduplicating by source identity. (The "seed core PHB species" bulk button was retired in #303.)

**Species Detail view** (`SpeciesDetailView.vue`): Toggles between a read-only `SpeciesSheet` and editable `SpeciesDetail` based on `?edit=true` query param. `DetailActions` (save/delete) live in the PageHeader `#actions` slot. Shared SRD species render read-only with a "Clone to customize" action — the clone shadows the shared row and can then be enriched (subraces, granted spells, art).

### Backgrounds Tab

Filterable by search and source (Custom / Open5e). Supports bulk import from Open5e with a source picker (multi-select checkboxes from live Open5e document list). Import is incremental: reports `inserted` and `updated` counts.

**Background fields:**

- Name, source/source_title
- Feature name and feature description
- Skill/tool/language proficiencies
- Starting equipment description
- Personality traits, ideals, bonds, flaws (rich text or freeform lists)
- **2024 mechanics (#558)** — `asi_ability_trio` (the three abilities the background's ASI can be spent on) and `origin_feat` (jsonb: feat name + optional variant), added by migration `20260722000003`, parsed from the Open5e v2 background `benefits` on import. 2014 backgrounds simply have these columns null.

**Background Detail view** (`BackgroundDetailView.vue`): Same edit/view toggle pattern as Species.

### Classes Tab

Lists both imported SRD classes (`system_classes` table, read-only) and custom classes (`custom_classes` table, editable). Filtered by text search with filter state in `useUiStore`.

**"Import from Open5e"** button pulls the Black Flag SRD class list into `system_classes`, deduplicating by slug.

**Custom Class Editor** (`CustomClassEditorView.vue`) — full-featured class designer:

1. **Identity** — class name, hit die (d6/d8/d10/d12), primary ability, subclass-granting level, campaign scope (a dropdown of the DM's own campaigns, plus "All my campaigns") — new classes default to the active campaign rather than "all my campaigns" (#596); editing an existing class keeps whatever scope it already has
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
- Campaign scope — same default-to-active-campaign flip as the Custom Class Editor (#596)

### Abilities Tab

The Abilities compendium is the shared library of named features used by both classes and archetypes. Filterable by search and type.

**Feature types** (from `FEATURE_TYPES`): class feature, species trait, background feature, feat, fighting style, metamagic, maneuver, invocation, infusion, other.

**"Sync from Open5e"** runs two operations: first imports Open5e features (`useImportOpen5eFeatures`), then backfills descriptions for any system features that lack them (`useBackfillSystemFeatureDescriptions`). The button label reports `N added`, `M updated`, and `K descriptions filled`.

Features are linked to classes/archetypes by UUID reference stored in the `features` JSONB column of `custom_classes` / `custom_subclasses`.

A custom feature (`FeatureDetail`) carries the same campaign-scope dropdown as classes/archetypes, with the same #596 default: a new feature defaults to the active campaign rather than "all my campaigns"; editing an existing one leaves its stored scope alone. `ArchetypeList`'s "Load example" seed features are the one deliberate exception — those three sample features are meant to be usable from every campaign and pass `campaign_id: null` explicitly, same as `ClassList`'s "Duplicate" fork of a system class.

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

**AI badge.** The hall grid and the hero detail page show the small `AI` chip on a portrait that was AI-generated (`AiImageBadge`, fed the portrait URL). Neither `hall_of_heroes` nor `party_members` has a provenance column: provenance is recorded per stored image in `image_provenance`, written at upload from the mark in the file, so a hero imported into a campaign as an NPC keeps its badge because it keeps its image. See `context/compliance/provenance-architecture.md` §6a.

---

## Player Portal — Character Management

**Routes:** `/play/*` — the player-facing portal

### Durable Characters & the Pool (#730, migration `20260814221409`)

A character is OF a player, not of a campaign. `party_members.campaign_id` is
nullable (it always was — the squash-point schema shipped it that way) and a
character with `campaign_id = null` is an **unattached** character resting in
its owner's pool: readable and editable by `owner_user_id` alone, invisible to
everyone else. Linking to a campaign is 1:1 — one character, at most one
campaign at a time — because progression (level, XP, HP, inventory, gold)
lives on the character row. Wanting the same character at two tables means
**cloning** it; the clones diverge, on purpose.

The `campaign_id` transitions are RPC-only (a `BEFORE UPDATE OF campaign_id`
guard trigger rejects client writes; the FK's `ON DELETE SET NULL` referential
action is exempted):

- `attach_party_member_to_campaign(p_party_member_id, p_campaign_id, p_set_active)` —
  owner (or DM for unclaimed rows) brings an unattached character into a
  campaign they are a member of. `p_set_active` fills `campaign_members.party_member_id`
  only when it is empty; switching an already-active character stays the
  Champions view's client-side concern.
- `detach_party_member_from_campaign(p_party_member_id)` — owner or campaign DM
  returns the character to the pool. Clears `current_location_id` /
  `current_initiative`; progression travels. Idempotent.
- `join_campaign_via_invite(p_token, p_party_member_id default null)` — joining
  can bind a pool character in the same transaction (see collaboration.md).
- `clone_party_member(p_party_member_id)` — copies the sheet (jsonb round-trip,
  future columns included), `character_classes` and `character_spells` (with
  `source_class_id` remapped to the cloned class rows) into the caller's pool,
  unattached. Campaign-bound satellites (inventory, companions, tracker state,
  pinned wild forms, notes, downtime) deliberately do not travel.

**Detach, never delete.** Removing a member (MembersTab, or the
`campaign_members` cascade when a campaign dies) fires an `AFTER DELETE`
trigger that detaches the removed player's owned characters; campaign deletion
detaches via the FK. A claimed character (`owner_user_id` set) can be deleted
by nobody but its owner — the creator-`ALL` policy was split into per-command
policies to carve that out, and the DM's delete affordances became Detach.
Before an account deletion, migration `20260815000001` re-stamps characters
that account created but another player owns to the surviving `owner_user_id`.
This prevents the creator FK cascade from erasing another player's claimed
character (#735); unclaimed and creator-owned characters retain the normal
account-deletion cascade.

**Pool UI:** `/play/home` (`PlayerHomeView.vue` + `CharacterPoolCard.vue`,
route `play-home`, "Adventurer's Rest") lists every owned character with
Continue/Detach/Clone (attached) or Attach/Edit/Clone/Delete (unattached),
the player-role campaign list, and a join-by-code box. It is a
`playerStandalone` route — reachable with no membership at all, which is the
point (#729). Champions gained **Leave campaign** (detach) and **Clone** per
card. Standalone character creation inserts with `campaign_id: null`, skips
the equipment seeding (`party_inventory.campaign_id` is NOT NULL) and the
membership link, and lands back on the pool; the species picker falls back to
the `wotc-srd` baseline when no campaign is active (`useSpecies.ts`), since
`campaign_enabled_sources` has no row to read. Data layer:
`src/composables/party/useCharacterPool.ts` (query key `character-pool` — NOT
`my-characters`, which useParty.ts owns for the campaign-scoped champions
list).

**A character's ruleset is its own (#943, migration `20261003105146`).**
`party_members.ruleset` is NOT NULL with no default, and every insert states
it, inside a campaign or not; one that omits it is refused. That is why the
creation wizard asks for the edition first. It is written
by nothing but `convert_party_member_ruleset()`: a guard trigger refuses a bare
column write, because changing the edition without re-pinning classes and spells
leaves the sheet on two editions at once. `private.party_member_ruleset(id)` is
the only function that resolves it, and the fifteen class and spell functions
all read through it. Until `20261001220509` they each joined the member to its
campaign instead, a join that returns no row for an unattached character, so
the class trigger raised `P0002` and standalone creation could not finish.

**The table decides who sits down.** `campaigns.allows_mixed_rulesets` (default
false) gates `attach_party_member_to_campaign`, `join_campaign_via_invite` and a
direct insert, all through `private.assert_ruleset_admissible()`. A refusal
raises SQLSTATE `RS001` with both rulesets in `detail` as JSON; the client's
bounce dialog keys on that code and offers a converted copy
(`convert_party_member_copy`, which leaves the original untouched) or another
character. Admission that runs later (a parent's approval) never raises: the
joiner is admitted and a character the table no longer takes stays in the pool.

**A campaign switching edition changes no character.** The trigger that rewrote
every seated character is gone. Characters keep their edition and their seat;
the mismatch is derivable (`party_members.ruleset <> campaigns.ruleset`) and has
no table of its own. The owner converts in place when they choose to; the DM can
convert only a character nobody owns. A seated character converts only to an
edition its table takes, so conversion cannot be used to walk round the door.

**What follows the character and what follows the table.** Build rules (classes,
subclasses, features, spells and their preparation, slots, feats, background,
species, metamagic, weapon mastery) follow the character. Table rules
(conditions and exhaustion, monsters, items, house rules, AI generators) follow
the campaign while the character is seated there, and the character when it is
not. On the client that is `useRuleset()` and `useTableRuleset()` in
`src/composables/rules/useRuleset.ts`, which resolve the nearest ruleset scope:
a surface showing one character calls `provideCharacterRuleset(member)`, and
with no scope both fall back to the active campaign. A list that shows several
characters resolves each one's own things per character: `CharacterSpeciesName`
provides the row's scope and hands the name down a slot, and `useSpeciesByIds`
looks species up by id with no edition filter for the two callers that have no
per-character component (the token forge's party list, the group portrait).

**Where the edition is asked and shown.**

- *Wizard*: `CharacterCreateEditionStep` is the first step in create mode.
  Nothing is preselected for a character with no table; a character that will
  land at a table starts on that table's edition, with a note under each option
  saying what the table takes. Changing it later clears species, background and
  class. The rules are pure functions in `characterCreationEdition.ts`.
- *New Campaign* asks the edition first and starts unchosen; *Rules* in campaign
  settings holds the edition, "Allow both editions", and a list of seated
  characters built with the other edition (`RulesEditionMismatchList`).
  `RulesetPicker` is the one control all three use.
- *The bounce*: `RulesetBounceDialog` opens from the pool's Attach menu (for a
  table marked as not taking the character, or on an `RS001` that arrives
  anyway) and from the join page. It converts a copy and brings the copy.
- *A seated mismatch*: `CharacterEditionNotice` on the champions list and the
  character sheet, informational at a table that takes both editions, otherwise
  offering "Convert" to whoever the database will let convert.

**The door is for a character arriving, not for the table's own DM.** Attach,
join and a player's direct insert are refused with `RS001` at a table that does
not take the character's edition. A DM placing a roster character at their own
table is not: a table that switched edition already holds characters of the
other one, and a backup restore or a world import has to be able to put that
state back. Both importers (`useCampaignBackup`, `useWorldBundle`) therefore
carry each character's own edition and its class pins. They used to drop the
edition when the destination would not admit it, so the database stamped the
table's on a character whose classes and spells were still the other's: a
label that lied, and one the Rules tab's mismatch list could not see. A
character imported that way shows in that list and is converted from there.

**Every insert states the edition.** There is no "take the campaign's" default
in the database: that was the old model surviving as a convenience. The wizard
asks first, the MCP tool requires `ruleset`, and a file that does not carry a
character's edition is refused when it is read. There is no compatibility code
for older export files (the maintainer's ruling, 2 Oct 2026: nobody holds one):
both importers accept only what the app writes today.

**Claiming transfers ownership, and only one thing is a claim.** A seat
(`campaign_members.party_member_id`) pointing at a character nobody owns hands
that character to the seat's member when **the DM assigned it** (Members tab,
which confirms first: "Give X to Y?") or when the member made the character
themselves. A trigger sets `owner_user_id`; before #943 nothing did, so a player
could play a DM-made character for months and lose it to a detach or to the DM
deleting their account. Three things are deliberately not a claim:

- A player linking their own seat to a roster character the DM made. The link
  still gives them the sheet to edit, as it always has; it does not make the
  character theirs to keep or delete.
- An **offered** character (`is_dm_managed`). It stays the DM's, and a player
  takes their own copy through `assume_character()`.
- A character in another campaign. A DM's seat write used to skip every check on
  the character it named, which was harmless only while a link granted nothing.
  `guard_campaign_member_self_update` now holds the DM to "same campaign" too.

An owned character is never re-owned; the seat link moves freely between a
player's own characters. And `owner_user_id` is not client-writable at all:
`guard_party_member_owner` refuses a direct update, and an insert for anyone but
the caller. The same trigger pins `user_id`: a character is created in its
creator's own name and its creator never changes. A DM's insert policy would
otherwise let them make a roster character "created by" any account, which was
harmless until "whose content is this" started to be answered from the
character. It is `SECURITY INVOKER` on purpose, so a direct client write runs as
`authenticated` and is refused, while the definer paths (claim, clone, assume,
admission) and the owner foreign key's `ON DELETE SET NULL` run as the owner and
pass without a flag. This closed a hole that predated #943 (a creator could
write themselves back in as owner) and mattered once ownership decided who may
convert, clone and delete a character.

**A creator's hold ends with the claim.** `party_members_creator_select` and
`_update` asked only "did you make this row", so the DM who made a roster
character kept reading and writing it after its player had claimed it and taken
it to their pool. Both now carry the condition delete already had (nobody owns
it, or the creator does). At the DM's own table nothing changes: the DM reads
and writes a seated character as the DM.

**A copy is a whole copy.** `clone_party_member()` and `assume_character()` both
go through `private.copy_party_member()`, which copies the sheet through jsonb
so a new column comes along without anyone remembering. Each used to carry its
own hand-written column lists, frozen on the day they were written: a clone lost
its class and subclass definition pins and its always-prepared grants; an
assumed character lost those too, its class spells still pointed at the
original's class rows (which the spell-source trigger refuses, so an offered
spellcaster could not be assumed at all), and its containers at the original's
items.

`supabase/tests/character_ruleset.test.sql` holds all of the above, each refusal
beside a control.

#### One class model (#943 wave 5, migration `20261003105148`)

A character's class had three shapes, all still being written: typed text on
the character (`party_members.class` / `.subclass`), a `character_classes` row
carrying only a name, and a row pinned to a definition. A review of the pull
request for legacy found them, and the maintainer ruled the consolidation into
the same change (he also wants art and more on custom classes, which need a
definition to live on). There is now one:

- **A character's classes are its `character_classes` rows, each pinned to a
  definition.** `class_definition_id` and `class_definition_kind` are NOT NULL;
  `subclass_name` and `subclass_definition_id` are set together or not at all.
  An official class is a `system_classes` row; a table's or a player's own is a
  `custom_classes` / `custom_subclasses` row. Nothing resolves a class by name
  against "whatever the viewer can read" any more.
- **`party_members.class` / `.subclass` are a mirror the database keeps**: the
  primary class row's names, null for a character with no class. About fifty
  screens read them, so they stay; nothing writes them. A client's write is
  overwritten (`mirror_party_member_class`), and a change to the class rows
  refreshes them (`character_classes_refresh_mirror`). The types say so:
  `PartyMemberInsert` / `PartyMemberUpdate` do not accept them.
- **Classless is a valid state.** A character with no class rows has no class.
  It takes its first class by levelling up, and that first row carries the
  character's whole new level (`apply_level_up`'s rule for a first row).
- **A class is made and changed in three places only**: the creation wizard
  (a pinned row for the class picked), level-up (add a class, or a subclass
  from the table's definitions, asked again at every level until one is
  chosen) and de-level. `PartyMemberForm` shows the classes read-only; the MCP
  tool's `class` on create resolves the name to a definition and inserts the
  row, and refuses a name that resolves to nothing.
- **A definition that is deleted** leaves a pin pointing at nothing, flagged
  `missing`. Removing it deletes the class row (a class is its definition),
  with the spells learned through that class, or clears the subclass.

The migration moved the old shapes rather than tolerating them. A typed class
became a row pinned to the official class of that name in the character's own
edition, else to a class of that name its table or its makers have, else to a
new, empty class of that name in the table's content. Subclasses the same way.
Nothing anyone typed was lost. Read-only against production on 2 Oct 2026: 28
characters, 4 typed classes (all official), 8 subclasses known only by name (5
matched, 3 got an empty definition), no disagreement between text and rows.

**The demo template is the trap.** `copy_demo_template` copies, live, only what
belongs to the template campaign. A template character pinned to one of its
author's general (unscoped) definitions makes the copy fail for every new user
("Subclass definition is unavailable"). The first version of the migration did
exactly that and a real `load_demo_campaign()` on the local stack failed; the
migration now brings a matched general definition into the template campaign
first, and `demo_campaign.test.sql` holds a template character with a pinned
class and subclass. `publish_demo_version()` dry-runs the copy, so a template
that drifts that way later is refused at publish time.

The older spell and level functions carried their own tolerance for an unpinned
row (`coalesce(class_definition_kind, 'system')`, `class_definition_id is null
or`, a name-based fallback in `validate_character_spell_source`). That went
when they were re-declared for the owner rule below.

`supabase/tests/one_class_model.test.sql` holds the constraints, the mirror and
the classless state.

#### The owner acts for a character (migration `20261003105149`)

A character has a creator (`user_id`) and an owner (`owner_user_id`). They
differ once a DM-made character is handed to a player. Eighteen functions (the
level, spell and Wild Shape RPCs) and eight policies were written before that mattered and
admitted "creator or owner", so the account that made a character kept its
rights after handing it over. A security audit of the one class model did it
for real: as the creator of a character someone else owned, and which the creator
could no longer even read, `apply_de_level` rewrote its hit points.

The rule, everywhere: **the owner, or the creator while nobody owns it**, plus
(where it was already so) the DM of the character's table and the member seated
on it.

```sql
owner_user_id = auth.uid() or (owner_user_id is null and user_id = auth.uid())
```

- The functions were re-declared from their production bodies (checked by hash)
  with that one clause replaced. Copy the clause from a sibling and it is now
  the right one; `character_owner_acts.test.sql` fails if "creator or owner" is
  written again in any function or policy.
- **Class rows are read by whoever may read the character.** The old read
  policy admitted creator and owner only. A DM is neither for a character its
  player made, so the DM read no class rows for most characters at the table.
  Nobody noticed, because every screen fell back to the typed class text; once
  that fallback was removed (the one class model), the DM would have seen no
  class at all. Class rows are written directly only by the owner (or the
  creator of an unowned character); the DM changes a class through the level
  RPCs.
- `crafting_recipe_grants_select` asked for the creator alone, so the owner of
  a DM-made character could not read the recipes granted to their own character.

#### What a table approves (#943 wave 4, migration `20261003105147`)

Content works the way the edition does: a player builds what they like, and the
table decides what sits down.

**A player's own books.** `user_enabled_sources` holds the books a player reads
from when a character has no table (own-row RLS; the two SRDs are always on and
are not stored). `useLibrarySourceSlugs()` follows the character in scope
(`useContentScope().standalone`): a character with no table reads its player's
books, a seated one its table's. The player chooses on the pool page
(`PlayerBooksPanel`) and from the wizard's edition step; `SourcesPickerPanel`
takes `scope="player"`. Backgrounds have no shared library table, so a
campaign-less player's are still seeded into their own rows from Open5e, now
from the SRD plus their books.

**The predicate.** `private.assess_content()` is the one function that says what
a table takes: library content from a book the DM enabled and has not blocked,
the official classes the DM has not blocked, and content a DM of that table
owns. Everything a seated character points at is checked: species, background,
class, subclass, spells and feats (feats are ids inside `class_choices.feats`
and `level_choices[n].asi.feat_id`). Not checked: a disguise species and items.

**Who owns a row decides everything; what a row says about itself decides
nothing.** Provenance keys (`source_document_key`, `source_record_key`) are
client-writable, so "this is the SRD Acolyte" is a claim. The first version of
this migration trusted it and a security audit turned that into four working
attacks before it shipped: a forged book entry copied into the DM's content with
no approval, that copy replacing the genuine entry for the next player, a
stranger's private row read through a flag, and a stranger's spell copied
through a species that "granted" it. So:

| Reason | What it is | How the flag clears |
|---|---|---|
| `source` | A library entry from a book the table has not enabled | DM allows it for this character, or enables the book; or the player changes it |
| `blocked` | The table blocked this species or class | DM allows it for this character, or lifts the block; or the player changes it |
| `homebrew` | The player's own row, whatever book it names | DM approves, which copies it into the table; or the player changes it |
| `foreign` | Somebody else's row (another table's DM made it) | Only by changing it. Never named in the flag, never shown, never copied |
| `missing` | A uuid that points at nothing | Only by removing it (`remove_missing_character_content`), by its owner or the DM |

"The character's owner" in that table is `owner_user_id` and nothing else. A
character nobody owns has no homebrew: every row it points at that is not the
table's is `foreign`. Falling back to the row's creator was the second audit's
finding (a DM naming a stranger as creator, then reading and copying their
content through a flag). A player bringing a character they made that nobody
owns becomes its owner in `attach_party_member_to_campaign`, so their own
content is still theirs to have approved.

Ids are read the way Postgres reads them (`private.try_uuid`, null for anything
that is not one), so an id written without hyphens or in capitals is the row it
names, and blocked class names compare without case (blocking and unblocking
both).

The one thing that needs no asking: when the table already has **its own** copy
of the same book entry (a row a DM of the table made, never one adopted from a
player), the character is pointed at that. The result is the DM's row, so
nothing is trusted.

**The bench.** A character with a pending flag still joins. It is at the table
(`campaign_id` set) so the DM can see it and the player can change a choice
from the table's lists, but it cannot be made anyone's active character:
`guard_campaign_member_self_update` raises SQLSTATE `CR001`, for the DM too,
whose way to seat it is to approve what is waiting. Attach, join and admission
fill the seat only when nothing is pending; when the last flag clears, the
character takes the seat it was kept from. The wizard writes the class row and
spells before it attaches, so the review sees the whole character.

One review raises at most 100 new flags (`c_max_flags`), so a character built to
flood the DM's queue cannot. The cap counts only what is newly raised: a flag
the DM already approved is kept without counting, because counting those let a
character padded with a hundred approvable choices sit down with the next one
never shown to anyone. While anything is unapproved, something is pending.

Pointing a character at the table's own copy is best effort. If another rule
refuses the change (a spell limit, a class-source trigger), or the change moves
nothing, the flag stays and the statement the review ran in carries on. It runs inside the DM enabling a
book, among other things, and one character must not be able to fail that.

**Approval copies.** `approve_character_content(review_id, scope)` is the DM's
only way to clear a flag. For the player's own content it calls
`private.adopt_content()`: a deep copy into the campaign owner's content (a
class takes its features, a subclass its features and granted spells, a species
its granted spells), with the character re-pointed at the copy and the original
untouched. It copies only rows the character's owner owns, at every depth; a
nested reference to anyone else's row is dropped from the copy. The copy does
not keep anything the player's row said about where it came from (book keys,
source and licence fields): they are a claim only a row the DM made can stand
behind, and an account holds one row per pair of keys. What was said is kept
for the record under `provenance.adopted_claims`.
`get_character_content_item(review_id)` is how the DM reads a player's content
before approving, since RLS would refuse; it returns nothing for `foreign` and
`missing`. A class is its features and a subclass its features and spells, so
those come with the row (`nested_features`, `nested_spells`) and
`CharacterContentItemDialog` lists them by level; a species shows its ability
bonuses, natural armor, innate spells and variants ahead of its prose. Turning
the stored row into labelled rows is `characterContentRows.ts`, pure and tested
on its own, so the dialog only renders.

A player's row stays theirs to edit while it waits, so an approval made after
looking carries what the DM saw: the dialog passes the item's `seen_at` (the
newest change to the row or to any feature or spell an approval would copy with
it) as `p_seen_updated_at`, and anything edited since is refused with SQLSTATE
`CR002` ("changed after you opened it"), after which the queue reloads the
item. The approval locks those rows before it compares, so nothing changes
between the comparison and the copy.
Approving from the queue without opening it passes null, which is the DM's call
to make. Inside the dialog, Approve stays off until the item is on screen: an
approval from there says the DM looked, and with nothing loaded there is
nothing that was looked at.

**Stay, flagged.** A DM turning a book off or blocking a species later, or a
seated player picking something unapproved, flags the character and moves
nobody. A hand-over reviews the character again too, because whose content is "its
own" turns on its owner. An approval the DM gave for one character survives the table changing
its mind and back; an approval whose reason has changed waits again. Characters
seated when this shipped were recorded as approved (a dry run against
production on 2 Oct 2026 found none with anything to record).

**Where it shows.** The player: `CharacterApprovalNotice` on the champions list
and the sheet, with what is waiting, why, and where to change it. A class
cannot be changed once a character is made, and the notice says so rather than
offering a link that does nothing. The DM: `CharacterApprovalQueue` on the Party
page and the Members tab, grouped by character, with what each approval does
written under its button and a view of homebrew before approving. Both read
`useCharacterContentReviews.ts`, which also holds the sentences, so the two
sides cannot describe one flag differently. `character_content_reviews` is a
subscribed live-sync table.

One thing is known and left: a DM may write a seated character's choices, so a
DM who knows the id of one of that player's private rows can point the
character at it and read it through the flag. Nothing in the app discloses such
an id (a player's content is theirs alone until they bring it to a table), and
the migration records why the fix was weighed and not taken.

`supabase/tests/character_content_approval.test.sql` holds the predicate, the
bench, the approvals and each of the audits' attacks as a refusal. Three audits
ran against this migration on 2 Oct 2026; the third found the first two rounds
closed and nothing above low severity. The pull request's review (CodeRabbit,
PR #948) then found seven more, among them the bare-name rule above and the
importers' relabelling.

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

**2024 background step (#558)** — for a background with `asi_ability_trio` set, `CharacterCreateBackgroundStep.vue` renders `BackgroundAsiPicker.vue`: the player picks either +2/+1 split across two of the trio's abilities or +1/+1/+1 across all three. The choice is stored in `class_choices.background_asi` (via the `backgroundAsiChoice` computed in `useCharacterCreationForm`) and applied to the character's ability scores the same way species ASI is — once, at the point the choice is made. If the background also grants an `origin_feat`, `BackgroundOriginFeatBadge.vue` shows it and resolves it to a full-text `class_features` row by `conceptual_key` when one has been imported; unresolved feats still save their raw name (`class_choices.background_feat`) — a feat grant is never silently dropped just because the matching feature hasn't been imported yet.

**Conversion reviews** — converting a character to the other edition (`convert_party_member_ruleset`, or the converted copy a bounce offers) can invalidate or newly require a choice: a background ASI/Origin-feat pick, a class or subclass with no counterpart, or a spell with no safe counterpart. Each case is a row in `ruleset_reviews` (`flag_type`: `'class' | 'subclass' | 'spell' | 'background'`, plus `character_class_id`/`character_spell_id` when applicable), written by the conversion and keyed on the character alone: the table has no `campaign_id` since #943, so a campaign-less copy can carry reviews. Clients read it via `useRulesetReviews(memberId)`. `PlayerFeaturesTab` (background) and `PlayerSpellsView` (class/subclass and spell) show the shared `RulesetReviewBanner` when a matching row exists. Acknowledging calls `acknowledge_ruleset_reviews(p_party_member_id, p_flag_types)` via `useAcknowledgeRulesetReviews()`, which deletes the matching rows. A conversion suspends the spell count limit for its own statement: it keeps every choice the player made, and the other edition's limit may be lower, so the limit applies again at the next spell change rather than refusing the conversion.

### Character Sheet (`/play` — `PlayerCharacterView.vue`)

The primary player-facing character sheet. Also used by the DM via `PartyMemberView` (with `hide-player-actions` prop) and in DM preview mode.

**Header section** (`PlayerCharacterHeader`):

- Portrait as a plate inset in the paper, name, class/level, species, inspiration star
- Armor Class (in a shield), Initiative, Speed, Proficiency, Hit Dice, boxed as on the 2024 sheet
- Current HP / Max HP with temp HP, a colour-coded meter (green → amber → red → grey at 0) and the damage/heal/temp controls
- Rest, conditions (slotted in from `PlayerConditions`) and the add-condition picker
- The parent card closes with `AbilityScoreTable layout="sheet"`; there is no separate HP bar on any width

**Ability Scores** (`AbilityScoreTable`):

- Two layouts. `statblock` (default): two groups of three rows, score / mod / save, as in the 2024 Monster Manual, for creature panels. `sheet`: the 2024 character sheet's six ability boxes, for a character's own sheet
- Saving throw bonuses (modifier + proficiency if applicable), with the same proficiency pip as the skill rows
- Each ability is exactly two roll targets, the check (name, score and modifier together) and the save, and both answer a hover the same way: the ability's own colour tint deepens and the rolled number turns gold. Clicking prompts a d20 roll (with advantage/disadvantage applied automatically if a condition requires it); result displayed in `RollToast`

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

| Tab        | Component           | Contents                                                                                                                                                                                                                                                                          |
| ---------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Skills     | `PlayerSkillsTab`   | Full skill list with proficiency/expertise indicators, passive scores, clickable roll buttons                                                                                                                                                                                     |
| Features   | `PlayerFeaturesTab` | Class features and species traits from the character's class/archetype data; expandable descriptions via `RichTextViewer`. Multiclass grouping lives in `useClassFeatureGroups`; `PlayerProficienciesCard`, `PlayerChoicesCard`, `PlayerDivineSmiteCard` are extracted sub-cards. |
| Combat     | `PlayerCombatTab`   | Attack entries, spell slots, resource pools; attack rolls with advantage/disadvantage from conditions                                                                                                                                                                             |
| Wild Shape | inline              | Druid-only; usage pips (2/day at level 2+), CR limit display, Circle of Moon label; beast picker showing discovered + DM-pinned beasts filtered by CR/level/type restrictions                                                                                                     |

Wild Shape tab is only shown for Druid characters (detected by class name containing "druid") or when a wildshape is already active.

**Weapon mastery (#557, 2024 campaigns only)** — an equipped weapon row in `PlayerCombatTab` shows its mastery property (from `items.mastery`, definitions in `src/data/weaponMastery.ts` — see `items-spells-crafting.md`) when the item has one, and the player toggles whether that mastery is currently active for their character; active masteries are tracked in `party_members.weapon_masteries`.

**Custom attacks (#568)** — `PlayerCombatTab` also renders a **Custom Attacks** card (between equipped weapons and the always-available melee attacks) for anything not derived from equipment: companion attacks, save-based features, improvised setups. Each entry is a `CustomAttack` (`id`, `name`, `attack_bonus: number | null`, `damage` dice expression, `damage_type`) stored in `party_members.custom_attacks` JSONB; `attack_bonus: null` marks an auto-hit/save-based attack, rendering only the Damage button. Players add/edit/delete entries inline (`src/rules/customAttack.ts`, vitest-covered) with the same local-optimistic persistence pattern as weapon masteries. The DM sees the identical list in the encounter runner — see combat-encounters.md.

**Artificer infusions (licensing-hardened, 2026-07-25)** — `PlayerArtificerInfusions` (rendered by `PlayerFeaturesTab` for Artificer level ≥ 2) drives learn/apply/remove from `useArtificerState`. The Artificer is not in any SRD, so the app ships **mechanics only**: `src/data/artificerInfusions.ts` holds option names + `min_level` gates and must never regain description strings from published books. Effect text is campaign-supplied content in the `class_option_texts` table (`campaign_id`, `class_name`, `choice_key`, `option_name`, `description` Tiptap JSON; member-read/member-write RLS, live-synced via `useCampaignLiveSync`), read/written through `useClassOptionTexts` / `useSaveClassOptionText` — any campaign member transcribes text from their own sourcebook via an inline `RichTextEditor` in the infusion row (empty state: "No effect text yet — add it from your sourcebook."). The table is generic on purpose: any future non-SRD `text_pick` option set (invocations beyond SRD, etc.) reuses it with its own `choice_key`.

**Wild Shape mechanics:**

- Beast forms come from the monster bestiary filtered to: discovered by the player OR pinned by DM, type = "beast", CR ≤ level-appropriate cap, and fly/swim speed gated to level 8+
- Clicking a beast opens a lightbox with full stat block (special abilities, actions, bonus actions, reactions)
- Confirming replaces the member's `wildshape_state` JSONB with beast name, HP, AC, and monster ID
- Beast HP/AC appear on the sheet header while transformed; STR/DEX/CON from beast, INT/WIS/CHA from character
- "Revert" clears `wildshape_state`

### Level Up (`/play/levelup` — `PlayerLevelUpView.vue`)

Wraps `LevelUpWizard` with a target level (from query param or current level + 1) and the player's linked member. Also includes `DeLevelPanel` for correcting level mistakes if character classes are present.

The `LevelUpWizard` (at `src/levelup/LevelUpWizard.vue`) walks through class-defined wizard steps at the relevant level (choose fighting style, pick spells, pick features, etc.) and commits the result to the `character_classes` table. Features unlocked at the new level are displayed with expandable descriptions.

Spell and cantrip choices come from `useLevelUpSpellCandidates`, which reads the merged Spellbook library — see [player-portal.md](player-portal.md) § "Where the spell pickers get their spells" for why it must not query the `spells` table, and for the three guards that keep an empty picker from producing a level-up that can never be confirmed (#736).

---

## Player Portal — Party View

**Route:** `/play/party` — `PlayerPartyView.vue`

### The Party Section

An **Add companion** button beside the section heading opens `CompanionForm` as a side-sheet with the owner locked to the viewer's own character (#569) — see the Companions note above for the RLS/role-gating changes that made this safe.

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

Clicking a companion card opens a lightbox with HP bar, AC, active conditions, and personal notes. For the owning player (`companion.owner_party_member_id` matches the viewer's linked character), the lightbox becomes a full management panel (#569): HP damage/heal steppers, a `combat_ready` "With the party / Elsewhere" status toggle, condition add/remove (with an `ExhaustionChip` for pip-level Exhaustion), and footer **Edit** (opens `CompanionForm` prefilled) / confirm-guarded **Delete** actions. Non-owners see the read-only view unchanged.

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
The player can toggle their own disguise on/off using DB functions `set_shapeshifter_appearance(member_id, target_species)` and `clear_shapeshifter_appearance(member_id)`. They run as the caller (`SECURITY INVOKER` since #936), so `party_members_creator_update` and `party_members_player_update` decide who may write; the functions add their own check on top.

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

## Printable Character Sheet Export (PDF)

Both the DM (`/party/:partyMemberId/sheet` → `views/publishing/CharacterSheetView.vue`) and players (`/play` → `views/play/PlayerCharacterSheetView.vue`, own character only) can export a printable PDF. Both views are thin wrappers around the shared **`CharacterSheetExportPanel.vue`** (toolbar + live preview + export), which persists the export-screen prefs per character in `localStorage` (`cs-mode-*`, `cs-theme-*`, `cs-illus-theme-*`).

The pipeline is `composables/party/useCharacterSheetPdf.ts` → off-screen `createApp()` → `html2canvas` → `jsPDF`. It iterates every `.cs-page` element the renderer emits, so adding pages requires no pipeline changes.

**Two export modes:**

- **Clean** (`CharacterSheetRenderer.vue`, one page) — the original CSS-themed sheet. Themes: `default · horror · fairy · adventure · sumie` (`SHEET_THEMES`), applied as `theme-<id>` classes over `assets/character-sheet.css`.
- **Illustrated** (`components/character-sheet/illustrated/`, **front + back**, two pages) — fully-illustrated baked-PNG "plates" with live data laid over them as absolutely-positioned, `overflow:hidden` value-only overlay fields (the labels are painted into the plate). Themes: `classic · adventure · gothic · fairy · sumie` (`ILLUSTRATED_THEMES`).

**Illustrated module layout** (`components/character-sheet/illustrated/`):

- `IllustratedSheet.vue` — renders one side; resolves its plate from `assets/sheets/{a4,letter}/` via `import.meta.glob`, lays out fields from the active config.
- `IllustratedSheetDocument.vue` — stacks front + back (the two `.cs-page`s). Also the live preview component.
- `sheetConfig.a4.ts` / `sheetConfig.letter.ts` — **independent** coordinate configs per page size; each `(theme, side)` owns its own `box: [left%, top%, width%, height%]` array, so nudging one never affects another. **All 20 (theme × side × size) sets are calibrated by eye against their plates.** Despite the design handoff's claim of a shared front grid, the AI-generated plates each have their **own geometry** (gothic sits ~5% lower than classic, fairy/sumi-e paint section headings mid-panel, letter plates are re-rendered — not squashed — A4), so every set is bespoke; treat any plate regeneration as a recalibration trigger.
- `sheetData.ts` — maps `PartyMember` (+ inventory + vault `items`) to each section's values; ability/save/skill/spell/hit-die math mirrors `CharacterSheetRenderer`; attack bonus/damage math comes from the shared `src/rules/weaponAttack.ts` (extracted from `PlayerCombatTab`, 25 tests). The `items` catalog is supplied per context — DM views pass `useItems()`, player views `usePlayerVisibleItems()`; without it equipped weapons degrade to improvised 1d4. Back narrative fields use existing columns where present (`physical_description`→appearance, `player_description`→backstory, `notes`→general notes, PIBF) and fall back to blank boxes otherwise (no migration).
- `sheetTypes.ts` — config + section types + page-px + per-theme typography/ink tokens.

**Calibration:** the panel's **Boxes** toggle (illustrated mode, preview only — never exported) outlines every overlay box (`.illustrated.dbg .fld`) so coordinates can be nudged by eye against the plate art. For serious calibration work use the DEV-only route **`/dev/sheet-calibration?theme=<t>&side=<front|back>&size=<a4|letter>&debug=1`** (`views/dev/SheetCalibrationView.vue`) — a rich fixture at 100% scale, URL-driven for headless screenshot loops.

**CSS gotchas learned the hard way** (all in `IllustratedSheet.vue` comments): the base `.fld` rule must stay at the same specificity (0,2,0) as the per-section rules — a `.cs-page.illustrated .fld` selector silently overrides every section's `flex-direction`; percentage `padding` on a field resolves against the **page**, not the field, so per-field spacing is px; per-theme art quirks (heart position, skull glyphs instead of blank slots, arch vs rectangular portrait frames) are handled by `.t-<theme>` / `.s-<size>` scoped overrides.

Fonts: the illustrated themes need EB Garamond + Shippori Mincho (added to the `main.css` Google Fonts `@import`); Cinzel + Cormorant Garamond were already loaded.

---

## Key Capabilities / USPs

- **Real-time sync:** `usePartyLive` subscribes to Supabase Postgres changes on `party_members` so DM HP edits instantly update player sheets and vice versa without page refresh.
- **Multiclass support:** `character_classes` table tracks multiple class/level rows per character; `formatMulticlassLabel()` builds display strings like "Fighter 4 / Wizard 3"; total level from `totalLevel()`.
- **Wild Shape as a first-class feature:** Full CR/level/type filtering, stat block preview lightbox, beast HP tracking separate from character HP, ability score override (STR/DEX/CON from beast), automatic tab visibility for Druids only.
- **Custom class/archetype system:** DMs can build fully custom classes with per-level feature tables, custom spell slot grids, ASI scheduling, wizard step flows for player-facing choices, and resource pools — all surfacing automatically in the level-up wizard and character sheet.
- **Open5e integration:** One-click import for species, backgrounds, classes, archetypes, and abilities from the Black Flag SRD. Incremental (upsert-based) so re-importing is safe and reports changes.
- **Re-import clobber protection (#560):** for species, classes, and subclasses, the update path on a re-import is narrowed to fields Open5e actually supplies (name/description/mechanics/source metadata); anything a DM only fills in by hand — notes, custom art, hand-tuned class mechanics like `spell_slots`/`resources`/`steps` — is never touched by a re-run. Full per-field breakdown per entity type in [`docs/library-reimport.md`](../../docs/library-reimport.md).
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
| `current_location_id`           | uuid   | FK → locations. **Override**: NULL = with the party (#786) |
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
