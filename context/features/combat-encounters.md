# Combat: Encounter Builder, Runner & Bestiary

## Overview

The combat features span three interconnected modules: the **Bestiary** (a custom monster compendium), the **Encounter Builder** (pre-combat setup), and the **Encounter Runner** (live combat tracker). Together they form a full DM-facing combat management system with real-time player sync.

Routes:

- `/monsters` — Bestiary list
- `/monsters/:id` — Monster detail / editor
- `/encounters` — Encounter list
- `/encounters/new` — New encounter builder
- `/encounters/:id` — Encounter sheet (read) or editor (`?edit=true`)
- `/encounters/:id/run` — Live runner
- `/play/encounter` — Player encounter panel (player portal)
- `/play/bestiary` — Player bestiary (discovered monsters + wild forms)

---

## Bestiary (Monster Builder)

### DM View

The Bestiary (`/monsters`) is the DM's custom monster compendium. It is a union of three sources rendered as a single unified list:

1. **Static SRD 5.1 bundle** — built into the client, no network fetch required. ~322 SRD monsters are available immediately on a fresh account.
2. **Open5e imported monsters** — the DM can sync monsters from any Open5e source document (Tome of Beasts, Creature Codex, etc.) via the "Sync from Open5e" button. Source selection is a persistent popover; leaving all sources unchecked imports everything. Deduplication rule: if a DB row exists with the same name as a static SRD entry, the DB row wins, so edits survive re-syncs.
3. **Custom monsters** — created directly in the app.

The shared `library_monsters` table behind the Open5e-sourced content is seeded dual-edition by `npm run seed-library-monsters` — 325 `srd-2014` + 331 `srd-2024` rows (see the SRD seed pipeline note in `items-spells-crafting.md`, #560).

**List filters** (stored in `useUiStore`):

- Text search
- Source: All / SRD / Custom (desktop-only pill group)
- Monster type: dropdown covering all 14 standard D&D creature types

The list is also implicitly scoped by campaign (below) — general monsters plus the active campaign's own, with no "show all campaigns" override the way the Item Vault has one (`items-spells-crafting.md`); switching the active campaign changes which custom monsters appear.

**Campaign scope (`campaign_id`, #597).** Custom monsters gained a nullable `campaign_id` (migration `20260809000003`), following the same rule `items`/`species`/`locations` already use: `NULL` means available in every campaign, a set value means visible only while that campaign is active. A `CampaignScopeField` control in the editor ("General — all campaigns" vs "Campaign — _active campaign name_") writes it; new monsters default to the active campaign. Existing rows were deliberately **not** backfilled — a monster's original campaign can't be recovered from the data (no authored-in-campaign timestamp, and an encounter reference only proves where a creature was _used_, not where it belongs), so a wrong guess was judged worse than leaving it visible everywhere until the DM re-scopes it by hand (see the migration's own comment for the full reasoning).

Anything that resolves an **already-stored** monster id rather than letting the DM pick one — an encounter's `combatants[].monster_id`, a quest's `quest_refs`, a companion's source monster, a wildshape form, a loot table's `monster_ids` — opts out of the scope filter with `includeAllScopes: true` on `useMonsters()`/`useAllMonsters()`. A scoped-away monster must still resolve wherever it's already referenced, or it silently disappears from a fight or sheet with no error. Pickers (this list, the encounter builder's Combatants/Events search, the quest editor's monster link search, the loot table's monster picker) always stay scoped to general + active campaign.

**Monster creation and editing** (`MonsterDetail.vue`):

Each monster stores a full `stat_block` JSONB object with:

- Basic: name, size, monster_type, alignment, CR, habitat, source, tags
- Scope: the `CampaignScopeField` control described above
- Lair location: optional `lair_location_id` FK to `locations` (migration `20260720000001`, #168) — picked via `EntityCombobox` next to the Habitat field; rendered on `MonsterSheet`/`MonsterSheetMobile` as a nav link to `/locations/:id`. User monsters only; SRD monsters have no FK, and a lair set in another campaign simply doesn't render (the link resolves against the active campaign's location tree)
- Combat: AC, HP (with dice expression), speed, initiative, and (2024 monsters only, #559) `initiative_bonus` — a new key on the `stat_block` JSONB (`MonsterStatBlock.initiative_bonus`; no migration needed since it rides inside the existing JSONB column), editable in `StatBlockEditor` and shown in `StatBlockPanel`. Import maps it only for 2024-ruleset creatures; 2014 creatures and everything else fall back to their DEX modifier.
- Ability scores: STR/DEX/CON/INT/WIS/CHA
- Derived: saving throws, skills, senses, languages
- Ability/save rolling: `StatBlockPanel` wires `AbilityScoreTable`'s `roll-ability`/`roll-save` emits to `usePromptedRoll`, so clicking an ability or save in a monster/NPC sheet rolls it and posts to campaign chat attributed to the creature (`:name` prop). Right-click / long-press opens the advantage-disadvantage picker (`v-roll-mode`). `AbilityScoreTable` only emits — a consumer that renders it without both listeners silently swallows every click (the original bug: tooltips worked on `/monsters/:id`, clicks did nothing); if you add a new consumer, wire both.
- Resistances / immunities / condition immunities
- Trait sections: Traits, Actions, Bonus Actions, Reactions, Legendary Actions, Lair Actions, Mythic Actions
- Spellcasting block (spell list per level)
- Portrait image with focal point (for `FocalImage` focal-aware display)

**Template presets** — `src/data/monsterTemplates.ts` ships 12 SRD stat block presets (e.g. Goblin, Dragon, Lich) that pre-populate the form.

**AI monster generator** — `MonsterGeneratorPanel.vue` is accessible from the Bestiary toolbar ("Generate" button) and creates a stat block from a text prompt.

**Read-only sheet view** (`MonsterSheet.vue`) is shown by default when navigating to an existing monster; the Edit button switches to the editable form (`MonsterDetail.vue`). The URL query `?edit=true` also activates the editor directly.

**Visibility / discovery system** — the DM can share individual monsters with specific players or the whole party, through `MonsterRevealControl` (#741). It is the app's one reveal control, mounted on the bestiary list card (`overlay` form), the detail header, and the mobile app bar and action bar — before this, the only monster reveal that offered a stat-block gate was on a phone.

- **Who** — per-party-member toggles plus a "Whole party" shortcut, and "Hide from all players" to revoke
- **What** — "Full stat block": off, the player sees name, art and CR only

Monsters are the **second storage model**: there is no `player_visible_to` column but a `discovered_monsters` row, whose absence means "not discovered" and whose `visible_to === null` means "everyone". `useMonsterVisibility` already exposed exactly the four `RevealAdapter` operations, so it satisfies the interface as-is and the control never learns which model it is talking to (see `src/lib/reveal.ts`).

This powers the player bestiary (see Player View below).

### Player View

Players see only monsters the DM has shared with them, via their Bestiary tab at `/play/bestiary`. This view is deliberately **not** filtered by the campaign scope above: `usePlayerVisibleMonsters` skips it on both branches (SRD and custom), because the `get_player_visible_monsters` projection it queries is already gated on this campaign's `discovered_monsters` — a row reaching a player is one the DM revealed here, and re-filtering it by `campaign_id` would only risk hiding a creature the party has already met. The projection returns `campaign_id` as `null` regardless of the row's real scope, the same way it nulls `lair_location_id` — DM-side library organisation with no player-facing meaning, and passing it through would hand a player the uuid of a campaign they are not in whenever a creature discovered here happens to be scoped elsewhere. Note that widening `monsters` at all requires recreating this projection in the same migration: it is `returns setof monsters` with a positional column list, validated only when it executes, so a forgotten recreate breaks every player read rather than the deploy (see `player_projections.test.sql`, which executes all six projections in CI for exactly this reason).

**Bestiary tab:**

- Grid of monster cards (`MonsterFormCard.vue`) — one card per discovered creature
- Each card shows name, image, type, CR color badge
- Clicking opens a lightbox with:
  - Focal-aware portrait
  - Name, size/type/alignment
  - If `reveal_stats` is true: AC, HP, Speed, full ability score table, trait sections (with inline roll buttons for attack and damage)
  - Player notes widget (personal annotations about the creature, stored per-player)
- Searchable with debounced input
- Hidden combatants are filtered server-side; the player never sees them

**Wild Forms tab** (Druids and Rangers only — class detection is automatic):

- Shows "Pinned by DM" and "Eligible Forms" sections
- Eligible forms are beasts from discovered monsters that meet the druid's CR and speed-type constraints (calculated from level and Circle of Moon subclass)
- DM preview mode shows an "unshared eligible beasts" banner with a batch-share button
- Pinned forms are stored via `usePinnedForms` / `useTogglePinnedForm`
- Lightbox shows full stat block and roll buttons; also works as a wildshape picker for the runner

---

## Encounter Builder

The builder (`EncounterDetail.vue`) is the pre-combat setup form. It has two modes: a full edit form and a read-only sheet (`EncounterSheet.vue`). The URL query `?edit=true` switches to the editor; the sheet also has an inline Edit button.

### Encounter metadata

- **Name** and **Rich text description** (Tiptap, scene-setting notes, terrain, objectives)
- **Location** — optional link to a campaign location (EntityCombobox)
- **Quest link** — assignable to a quest for filtering in the encounter list

### Party Members and Companions

- Checkbox selection of party members from the Party Tracker
- Companions are shown in a separate subsection
- New encounters auto-select **all** party members and companions by default (`EncounterDetail.vue` watches `party`/`companions` once on load); the DM unchecks anyone not present rather than building the roster from scratch. Companion auto-select is #569 — a companion's `combat_ready` flag (see Data Model / Runner below) plays no part in the builder, it's a runtime-only gate applied at combat start
- Each selected member/companion gets a faction assignment dropdown (colour-coded by faction colour)
- Player initiative starts blank each encounter (no longer pre-seeded from `party_members.current_initiative`, which carried stale values between fights — see #504). Players roll their own from the player encounter panel; the runner ingests the value live via its `party_members` subscription. One residual case is knowingly accepted: DM closes the runner mid-live, a player rolls, DM reopens. Fixing it properly needs encounter-scoped initiative, which #504's fresh-roll design deliberately avoided — so it is left open rather than reintroducing the stale-seed behaviour that made #504 necessary in the first place. The DM's "Roll Initiative" still fills in anyone who hasn't rolled (it skips **every** combatant that already has a value, not just players)

### Combatants (`EncounterCombatants.vue`)

The enemy/ally/neutral roster. Each combatant definition (`CombatantDef`) stores:

- Monster or NPC reference (mutually exclusive)
- Count (how many instances to spawn)
- Faction assignment
- Optional custom name (overrides the source name in the runner)

Multiple combatant slots can point to the same monster with different counts or factions.

The monster-search picker here (and in the Events panel's spawn action) is scoped to general + the active campaign (`pickableMonsters`, #597). `EncounterDetail.vue` separately loads an unscoped `monsters` list (`includeAllScopes: true`) for naming/rendering combatants already on the roster, so a monster the DM later re-scopes to another campaign still shows its real name and CR here instead of "Unknown".

### Factions (`EncounterFactions.vue`)

Encounters ship with four default factions:

| ID        | Name    | Default colour | Hostile to        |
| --------- | ------- | -------------- | ----------------- |
| `players` | Players | Navy           | `enemy`           |
| `enemy`   | Enemy   | Dark red       | `players`, `ally` |
| `ally`    | Ally    | Dark green     | `enemy`           |
| `neutral` | Neutral | Dark grey      | _(none)_          |

The DM can add custom factions, each with a name and hex colour. Faction colour appears as a left border stripe on every combatant row in the runner.

### Events (`EncounterEvents.vue`)

Pre-scripted automation that fires automatically or on demand during the run. Each event has:

**Triggers** (one per event):

- `round_start` — fires when the specified round begins
- `combatant_hp_pct` — fires when a specific combatant's HP drops to or below a percentage
- `combatant_dies` — fires when a specific combatant reaches 0 HP
- `manual` — never auto-fires; DM clicks ▶ in the runner sidebar

**Actions** (one per event):

- `spawn_combatants` — adds N combatants of a chosen faction, with automatic initiative if combat is already started. Each spawn (`SpawnDef`) carries an optional `kind: "monster" | "npc"` (#604) selecting which roster its id resolves against — absent means `"monster"`, so every event authored before #604 keeps working untouched. The builder's own Add/Edit form only offers a monster picker for this action; an NPC spawn can currently only be produced by the complication generator below, though the summary line for an existing event renders either kind correctly
- `broadcast_message` — posts a system message to the campaign chat
- `environment_effect` — pins a hazard or terrain change (label + description) that stays "in play" for the rest of the fight once fired (#604). Carries no mechanical payload on purpose — no conditions, no damage, no forced movement. Firing it only posts the description to chat; which creatures a collapsing floor actually restrains stays a DM call made with the existing condition picker. Not authorable in the builder form — generator-only, same as an NPC spawn

**Options:**

- `fire_once` — if checked, the event is greyed out after firing and won't repeat
- `is_player_visible` — when set, fired events appear as parchment-style narrative beat callouts in the player's combat panel (`PlayerEncounterPanel`). If the event has a `broadcast_message` action, that message text is shown prominently; the event name is shown as a smaller label below it. Events appear in the order they were defined and remain visible for the rest of the encounter.

### Mid-fight Complication / Reinforcement Generator (#604)

Mid-fight, a DM can ask for one of two things without leaving the runner: a **complication** — something that changes the shape of the fight without just adding more HP to grind through — or **reinforcements** — pressure to restore when the party is winning too easily. Both are proposals, never applied automatically: the whole point of this feature is that nothing happens in the fight the DM did not explicitly approve — the model is never asked for a trigger, the client never reads one from it, and a generated proposal only joins the encounter as an unfired event the DM still has to press ▶ on.

**One edge function, two modes.** `supabase/functions/generate-complication/index.ts` picks between the `complication` and `complication_reinforcements` rows in `ai_system_prompts` by the `mode` the client sends. Two rows rather than one prompt with a mode switch, so an admin tuning the reinforcement wording can't break complications by accident (seeded in migration `20260805000004_complication_generator_ai.sql`, alongside the `complication_generation` credit cost — 1 credit for either mode, sharing the `ai_generation` rate-limit bucket rather than a higher per-press price, because a DM pressing the button several times hunting for a complication they like is expected use, not abuse). Server-path only, like `generate-loot` — the candidate blocks below come from service-role reads the browser can't make, and `useComplicationGeneration.ts` throws immediately in local-key mode rather than attempting a weaker client-direct path.

**The fight, as sent by the client.** Rather than reading `encounter_state` server-side, the edge function takes an `EncounterSnapshot` (name, round, faction names, and up to 30 combatants as name/side/HP%) built by `useComplicationGeneration.buildSnapshot()` from the live `useEncounterRunStore`. This is deliberate: the store is the live truth, while the DB row lags behind it by up to the 300ms `useEncounterLive` debounce, and a DM who hasn't gone live yet has no row at all. Trusting the client here costs nothing — it's the DM's own encounter, the snapshot grants no privilege, and it only flavors a proposal the DM must still approve. HP is sent as a rounded percentage rather than exact numbers: the model needs "badly hurt" vs. "untouched," not DM-side bookkeeping detail.

**Grounding.** One embedding query — the DM's typed steer if they gave one, else the encounter name plus up to 10 combatants' names, else the literal string "a mid-combat complication" — feeds both `retrieveCampaignEntities` (npcs/locations/factions, #600) and `retrieveMonsterCandidates` (bestiary, #595) in parallel, in one try/catch: a proposal with real NPCs but hallucinated creatures is a worse failure than a fully ungrounded one, so retrieval failing degrades both corpora together rather than one silently. Reinforcements lean harder on the bestiary than complications do (`MONSTERS_PER_SIDE`: 12/side vs. 6/side), since a complication is as likely to be a hostage or a collapsing exit as a creature.

**Bestiary retrieval, shared.** `retrieveMonsterCandidates` moved out of `generate-encounter` into `supabase/functions/_shared/monsterRetrieval.ts` when this generator became its second consumer — the alternative was a second copy of the custom/library merge-and-dedupe that would have drifted the first time either the tie-break or the unembedded window changed. `generate-encounter`'s compact-index fallback (a name-ordered slice of the whole bestiary used when retrieval is unavailable) deliberately did _not_ move: encounter _building_ must always offer some creatures, but a mid-fight complication has no such duty — if retrieval is down it just generates narration with no creature candidates.

**Resolution (`src/ai/resolveGeneratedComplication.ts`).** The model returns creature _names_, not ids. Each name is checked against the runner's own loaded rosters (`store.availableMonsters` first, then `store.availableNpcs` — a name in both is almost always a homebrew stat block written for that NPC, and combat needs the stat block); an unmatched name is never dropped or turned into a stub — it comes back as `{ kind: "unmatched", name, reason }` so the preview can show the DM exactly what the model asked for and why it can't land. `side` resolves against the encounter's _own_ factions (never trusted as an id from the model) by name or id, falling back to the `enemy` faction when unspecified or unrecognised. Every count is clamped to 8 per entry and every proposal to 6 entries (`MAX_COUNT_PER_ENTRY` / `MAX_REINFORCEMENT_ENTRIES`) regardless of what the model asked for, and anything the clamp or the resolution silently changed is surfaced in a `warnings[]` list rather than just quietly happening — a proposal that lost half its content on the way through must not look complete.

**The event this becomes.** `buildComplicationEvent()` always produces `trigger: { type: "manual" }` and `fire_once: true`. `checkEvents()` only auto-fires non-manual triggers, so a generated event physically cannot go off on a round boundary while the DM is still deciding about it — it can only fire from the ▶ button, exactly like a hand-authored manual event. Confirming a proposal calls `store.addGeneratedEvent()`, which pushes the event onto `store.events` **unfired**, identical to a hand-authored one.

**Store support for what the event carries.** `spawnFromDef()` now branches on `SpawnDef.kind`: absent (every pre-#604 event) means monster, `"npc"` calls `addNpc()` instead. `executeEvent()` handles the new `environment_effect` action by posting its label + description to the pending-broadcast queue, the same path `broadcast_message` uses. `activeEnvironmentEffects` is a computed derived from `eventsFired` ∩ each fired event's `environment_effect` actions — no new persisted field, so there is nothing extra to add to live-sync: the hazard list falls out of state (`events`, `eventsFired`) that already syncs.

**DM-facing surface.** `RunnerDmTools.vue`'s EVENTS panel carries two header buttons — **Complication** and **Reinforce** — which open `ComplicationGeneratorDialog.vue` in the matching mode. The panel now always renders while a run is active (it used to be hidden until an event existed, which would have put the buttons out of reach in exactly the common mid-fight case: an encounter with no pre-scripted events). The dialog is a preview-then-confirm gate, and that gate is the feature's whole safety story: it shows the narration, every resolved reinforcement with its side, the hazard, every `warnings[]` line, and the unmatched names struck through — and only on **Add to Events** does anything reach the encounter. Regenerate and Discard cost nothing but a credit.

### Boss Mechanics

A dedicated card in the builder for boss-fight features:

- **Lair Actions** — a checkbox enables lair action support for this encounter. When enabled, the DM picks a "lair owner" from the encounter's combatant list. In the runner, a persistent panel appears at initiative 20 each round listing the owner's lair actions (sourced directly from their stat block `lair_actions` array). Clicking one marks it as fired for that round and posts a chat message.
- **Legendary Actions** — enabled automatically on any combatant whose monster stat block has a `legendary_actions` array. No builder toggle needed. The runner primes a pool of 3 actions (5e default). The pool resets at the start of that combatant's turn.

### Loot (`EncounterLoot.vue`)

Pre-planned loot attached to the encounter:

- Linked vault items (with quantity controls, drop-to-chat button)
- Currency pools (gold/silver/copper amounts)
- Art objects (name, GP value, optional image)

### Traps (`EncounterTraps.vue`)

A list of trap references (from the Traps module — see dungeon-craft.md). Each trap shows in the runner's DM Tools sidebar. Clicking a trap in the sidebar opens its detail panel so the DM can reference trigger, save DC, and damage expressions mid-combat.

Traps gained the same `campaign_id` scope as monsters (#597, dungeon-craft.md's Traps section). The trap-search picker here (`pickableTraps`) is scoped to general + the active campaign; the encounter's already-linked `trap_ids` resolve against an unscoped `allTraps` list so a trap re-scoped to another campaign later doesn't drop out of an encounter that already references it.

### Difficulty Analysis (`EncounterDifficulty.vue`)

Shown on the read-only encounter sheet and computed live in the editor. Implements the 5e DMG XP budget system:

- Raw XP summed from all enemy CRs
- Count multiplier applied (1× to 4× based on number of monsters)
- Party size adjustment: < 3 players bumps the multiplier tier up; > 5 bumps it down
- Ally offset: ally XP subtracted (with its own multiplier) from net XP
- Trap/hazard XP added flat
- Net XP compared against per-level thresholds for each party member
- Labels: Trivial / Easy / Medium / Hard / Deadly / Legendary
- Threshold bar visualisation with a net-XP marker dot
- Enemy breakdown list: name, CR, XP per entry

### AI Encounter Generator

The "Generate" button on the Encounters list (`EncountersView.vue`) opens a right-side slide-in panel (`EncounterGeneratorPanel.vue`, mounted in `AiGeneratorPanels.vue`, toggled via `ui.encounterGeneratorOpen`) — the same pattern as every other AI generator panel in the app. The DM provides:

- **Concept** — a free-text prompt (e.g. "Goblin ambush on the forest road, levels 3–5, a betrayal mid-fight")
- **Difficulty** — Auto / Easy / Medium / Hard / Deadly

Generation is dual-path like the other generators (`useEncounterGeneration.ts`): by default it calls the `generate-encounter` edge function; in local-vault BYOK mode (`grimoire_key_local_mode === "local"` in `localStorage`) it calls the model directly from the browser instead.

**Server-side context building.** Rather than trusting a context payload from the request body, the edge function builds the model's context itself from the campaign's own data and passes it as constraints alongside the difficulty:

- **Party summary** — one line per party member, e.g. "Level 5 Fighter/Rogue". Multiclass characters use the sum of `character_classes.levels` (the authoritative level) and their class names joined with "/"; a character with no `character_classes` rows falls back to `party_members.level`/`class`. With no party members at all, the summary is "Party: unknown — assume 4 characters of level 3".
- **Candidate monster block** — the monsters the model is told it may use, one per line as `Name|CR|type`, wrapped in `---BEGIN AVAILABLE MONSTERS---`/`---END AVAILABLE MONSTERS---` markers and included only when at least one row exists. The system prompt instructs the model to prefer the DM's own creations by exact name when one fits thematically, and to use the exact name shown since resolution is by name. As of #595 this block is normally populated by semantic retrieval rather than a flat dump of the bestiary — see below. It falls back to the pre-#595 compact index — the campaign owner's own homebrew that's either scoped to this campaign or left global (`campaign_id`, #597), filtered further by the campaign's ruleset and excluding Open5e-imported rows (the model already knows standard 5e monsters), capped at 200 rows via `MAX_CUSTOM_MONSTERS` — whenever retrieval is unavailable for any reason.

**Monster retrieval (#595).** Before #595 the candidate block _was_ the compact index above, and it only ever reached the DM's own homebrew — the model had no reliable way to reach the shared `library_monsters` table. That table holds 3,541 rows, but only 656 are WotC SRD; the other ~2,885 come from Kobold Press, EN Publishing and eight more sources the model may know as concepts from training but not by exact name — and resolution is by name (see below), so those ~2,885 were effectively invisible to the generator. #595 replaces the paste-the-whole-index approach with retrieval: the edge function embeds the DM's flavor prompt with the platform's embedding provider, then calls two `SECURITY INVOKER` nearest-neighbour RPCs — `match_custom_monsters` and `match_library_monsters` (`supabase/migrations/20260803000001_rag_monster_embeddings.sql`) — each returning up to 15 rows (`RETRIEVAL_PER_SIDE`), and unions the two into the same `Name|CR|type` candidate block described above. The result is typically _smaller_ than the old pasted index and, unlike the old 200-row cap, does not scale with how much homebrew the DM has written.

**Campaign-aware since #597.** `match_custom_monsters` takes `p_campaign_id` alongside `p_owner_id` and its `WHERE` mirrors `match_custom_items`' shape (`20260805000005`), verbatim: campaign rows plus the campaign owner's global (null-campaign) rows — a DM's homebrew is only retrieved when it's scoped to the requesting campaign or left global. Before this, retrieval filtered on ownership alone, so a monster the DM scoped to a _different_ campaign of theirs could still surface as a suggestion here — a subtle failure, since the suggestion looks perfectly good. `retrieveMonsterCandidates` (`MonsterRetrievalArgs.campaignId`) threads the id through from both callers (`generate-encounter` and the complication generator), and the unembedded-append query in `monsterRetrieval.ts` applies the same `campaign_id` predicate, or a DM's newest homebrew could bypass the gate entirely on its way through that fallback path.

**Getting the corpus embedded in the first place.** `supabase/functions/embed-monsters/index.ts` is the endpoint that actually writes embeddings, in two modes: `mode: "batch"` (admin-only, driven in bounded pages of 100 rows per call by `useEmbeddingBackfill.ts` — see Switching vendor below) and `mode: "single"` (fire-and-forget after any monster create/update, via `queueMonsterEmbedding()` in `src/composables/useMonsters.ts`, so a DM's save never waits on an embedding call to finish). Both build the embedded text from one shared function, `buildMonsterEmbedText()` (`supabase/functions/_shared/monsterEmbedText.ts` — name, then size/type/CR, then tags, then habitat, then a word-boundary-truncated description, each clause omitted rather than left dangling when its source field is empty), so `monsters` and `library_monsters` rows land in the same region of the embedding space and stay comparable. A SHA-256 hash of that text (`monsterEmbedHash()`) is stored as each row's `source_hash`; a row whose hash and `embedding_model` are unchanged is skipped, so an edit that didn't touch anything semantically relevant costs no provider call.

Custom and library monsters get a **guaranteed 15-row share each** rather than one merged top-30 ranking — with 3,541 library rows in play, a single ranking would crowd out the DM's ~98 homebrew monsters almost every time, making the feature worst at exactly the thing it should be best at: surfacing the DM's own creations.

The **enabled-sources gate** (`campaign_enabled_sources`) is applied inside `match_library_monsters`'s `WHERE` clause, before the similarity ordering runs — never as a filter on the already-ranked top-K. Filtering after ranking would silently shrink (potentially to zero) the candidate set for a DM who has enabled few sources, and surfacing a disabled source's content into a campaign is the exact licensing mistake #567 and #583 fixed. When a campaign has enabled no sources at all, the library query is skipped entirely rather than called with an empty array.

**Graceful degradation is the whole design.** No embedding vendor enabled, more than one enabled, a missing platform key, an embedding API failure, an RPC error, or nothing matching — every one of these is caught by a single try/catch around the retrieval block and falls back to the pre-#595 compact index; retrieval can only cost recall, never take the feature down. The **truncation note** ("this is the first N of M custom monsters…") is only ever emitted on that fallback path — a relevance-ranked retrieval set is not a partial alphabetical slice, so telling the model it's "incomplete" would be misleading there.

A custom monster with no embedding row cannot be returned by `match_custom_monsters` — that's exactly the DM's newest homebrew, made during a backfill window or before embed-on-write has run for it. Those are appended to the candidate block explicitly (capped at 25, `MAX_UNEMBEDDED_APPEND`) and de-duplicated by name against the retrieved set, so a DM's latest creation never silently vanishes from suggestions.

**Vendor-agnostic, but platform-wide — never per-campaign or BYOK.** Embedding vectors from different models are not comparable — cosine distance between an OpenAI vector and a Gemini vector is meaningless — so exactly one embedding vendor can be active at a time, for the whole platform, configured in `provider_config.embedding_model` / `embedding_enabled`. Of the three vendors the app integrates, only OpenAI and Gemini have an embeddings endpoint at all (Anthropic has none). Three separate guards enforce "exactly one": the `embedding_model` column plus a same-model predicate in both RPCs (`p_embedding_model`, so a query never compares vectors across models); a partial unique index (`provider_config_single_embedding_vendor`, on `(true) where embedding_enabled`) that turns two enabled vendors into a constraint violation rather than a silent bug; and `resolveEmbeddingProvider()` (`supabase/functions/_shared/embeddings.ts`) throwing an `EmbeddingProviderConfigError` if zero or more than one row comes back enabled, rather than picking one arbitrarily.

**Switching vendor is one admin action.** `set_embedding_provider()` — a `SECURITY INVOKER` RPC, since `provider_config`'s own RLS already gates writes on `app_metadata.role = 'admin'` — flips `embedding_enabled`/`embedding_model` atomically in a single `UPDATE`, so the invalid two-enabled state can't exist even transiently. `EmbeddingVendorControl.vue` (admin panel) calls it and then immediately runs the backfill (`useEmbeddingBackfill.ts`, shared with the standalone "Re-embed" button in `MonsterEmbeddingBackfill.vue`; since #600 the same driver also sweeps the npc/faction/location embeddings via `embed-content` — five targets in one run, see world-building.md) to completion. A model-only change (e.g. `text-embedding-3-small` → `text-embedding-3-large`) needs exactly the same re-embed, for the same reason — the resulting vectors are just as incomparable to the old ones, so there is no special-casing for "same vendor, different model." While re-embedding is in progress, rows still keyed to the old model are simply not eligible for `match_*` (their `embedding_model` no longer matches the configured one) and fall back to the compact index — degraded, not broken.

**Cost and tracking.** Embedding the whole ~3,541-row corpus once against `text-embedding-3-small` ($0.02 / million input tokens, per `ai_model_pricing`) costs on the order of $0.011; a single per-generation query embedding (one short prompt) costs on the order of $0.0000006. Both are recorded via `recordFreeGeneration()` — a `delta: 0` row in `ai_credit_ledger` with `is_byok: false`, because the platform key paid for the call, not the user — so the spend is visible in cost reporting without charging anyone. `ai_generation_credit_costs` seeds the same story explicitly (`monster_embedding`, 0 credits), and `ai_model_pricing` carries rows for `text-embedding-3-small`, `text-embedding-3-large`, and `gemini-embedding-001` so a vendor flip always has pricing ready. All of this is separate from the encounter generation's own cost, which is unchanged — still 1 credit, see Credit cost below.

**Side tables, not columns.** Embeddings live in `library_monster_embeddings` / `monster_embeddings`, keyed on `library_monster_id`/`monster_id` with `on delete cascade`, rather than as a `vector(1536)` column on `library_monsters`/`monsters` directly. Two call sites would have regressed if it were a column: `fetchMonsters()`/`fetchLibraryMonsters()` (`src/composables/useMonsters.ts`) both `select("*")`, so a ~6 KB vector column would add roughly 21 MB to every bestiary load across 3,541 library rows; and `get_player_visible_monsters` returns `SETOF monsters` — a new column there would silently start shipping raw embedding vectors to players through a projection that exists specifically to strip DM-only data.

**Where the enabled-sources gate is actually tested.** `supabase/tests/monster_retrieval.test.sql` (pgTAP, runs in CI's `spell-database` job) plants a hermetic `t595-*` fixture and asserts the gate is a `WHERE` predicate applied _before_ the similarity ranking. The fixture's shape is the point: a post-filter implementation does not leak disabled rows, it drops them too — just after they have already consumed the top-K. So the disabled source gets **three** rows at distance 0 and the query asks for `match_count = 2`; filter-first returns the distant enabled monster, filter-after returns nothing at all. The same file covers the ruleset and `embedding_model` gates, concept dedup happening before the limit, the `on delete cascade`, and `match_custom_monsters` owner _and_ campaign scoping (#597) — including the case that pins down campaign scope is doing real work: two campaigns owned by the same DM, where a monster scoped to the _other_ one is excluded, so the exclusion can't be explained by the ownership check alone. The caller-side half — which slugs are passed, that the library RPC is **not called at all** when a campaign has enabled nothing, the homebrew-first merge order, and that a failed `campaign_enabled_sources` read throws rather than being read as "no sources" — is in `supabase/functions/_shared/monsterRetrieval.test.ts`, because those are properties of the TypeScript, not of the query plan.

**pgvector lives in `extensions`, and the RPCs' `search_path` must say so.** `20260803000001` originally created the extension in `public`; `20260805000006` relocated it to clear the security advisor's `extension_in_public` finding. That migration had to repin all eight `match_*` RPCs to `SET search_path = public, extensions` in the same change, because a `language sql` body resolves `<=>` against its pinned path at first execution — with `= public` alone it raises `operator does not exist: extensions.vector <=> extensions.vector`. **That failure is invisible:** every generator wraps retrieval in a try/catch that degrades to an ungrounded prompt, so the symptom is not an outage but silently worse output across encounters, loot, complications and note/entity grounding at once. Any new `match_*` RPC must pin `public, extensions` from the start; the migration ends with a `DO` block that aborts the deploy if a pgvector-dependent function in `public` is missing `extensions` from its path.

This is deliberately server-side rather than client-supplied as #337 originally specified: a client-supplied context payload could be inflated to drive up generation cost, or spoofed to steer the model toward monster names that don't actually exist in the DM's bestiary. **The local-key (BYOK) path cannot build any of this** — the party summary, the compact-index fallback, and the #595 retrieval block are all DB reads (and, for retrieval, a platform-embedding-provider call) done with the edge function's service-role access, which the browser doesn't have. It generates from the campaign setting and the difficulty constraint alone; this is a deliberate parity gap, not an oversight.

**Name resolution (`resolveGeneratedCombatants.ts`).** The AI returns monster names, not ids, so the app resolves each against the DM's bestiary (`useAllMonsters()`, scoped to general + the active campaign since #597 — the same picker rule as the manual builder's Combatants search above) through a three-tier cascade — exact name → case-insensitive → normalized (lowercased, alphanumeric-only, with a single trailing "s" dropped, so "Goblins" matches "Goblin" and "dire-wolf" matches "Direwolf") — stopping at the first tier that produces any candidate. Among tied candidates within that tier, the DM's own homebrew (non-empty `user_id`) is preferred over a same-named shared-library monster. A match becomes a `CombatantDef` with `faction_id: "enemy"` and, when the AI supplied a role, `custom_name` set to `"{Monster Name} ({Role})"`.

**Ambiguous names get a version picker, not silent resolution (#601).** 660 library names exist in more than one sourcebook, each copy with its own stat block (publishers rebalance), so a name can resolve to a different version than the one retrieval showed the model — and the client cannot know which copy the model budgeted against, because `20260803000003`'s concept dedup happens server-side and only `Name|CR|type` reaches the prompt. Decision (of #601's three options): **surface and swap** — `resolveGeneratedCombatants` returns every same-tier candidate alongside each match, and the generator panel shows a per-row `EntityCombobox` (labelled source + CR) whenever there is more than one, so the DM sees which stat block will be used and can swap it before "Create Encounter" (`swapCombatantVersion` rebuilds the def, including the role suffix, around the picked version). The encounter stores the actually-picked `monster_id`, so the builder's XP-budget analysis reflects the real stat block with no further plumbing. Option 1 (the model echoing an opaque id for retrieval-sourced candidates) was deliberately deferred until name/version mismatches demonstrably matter in practice — it complicates the training-knowledge fallback path, which must keep working: a name the model knew but that isn't in the candidate block still resolves by name, and an unmatched name still degrades to "add manually".

`parseEncounterAiResult.ts` is the validation boundary for the raw model response before any of this runs — it drops any combatant entry with no usable name, defaults a missing/invalid `difficulty` to `medium` (the badge is cosmetic; the combatants are what matter), and throws if the combatants array ends up empty, which the panel shows as an error state with no encounter created.

**Unmatched names are not turned into stub combatants.** `EncounterRunView.vue` builds run combatants with `if (entry.monster_id) … else if (entry.npc_id) …` and no `else` branch, so a `CombatantDef` with a null `monster_id` would render fine in the builder but be silently dropped the moment the DM runs the encounter. Unmatched entries are instead listed in the panel under "Not in your Bestiary — add these manually," and folded into the created encounter's description as an "Add manually: …" line alongside the AI's Environment/Tactics/Twist text, so they aren't lost once the panel closes.

**Creating the encounter.** "Create Encounter" persists the result — name, matched combatants, default factions, and every current party member auto-selected (companions are not, unlike the manual builder's default described above) — and the button becomes "Open Encounter →", which navigates to the encounter sheet on click. It does not auto-navigate. This is a deliberate compromise between CLAUDE.md's post-mutation-navigation rule (which would send the DM back to the encounter list) and #337's original request to drop the DM straight into the editor: the Roll Table Generator's create-then-"View Table →" link is the established precedent that satisfies both, landing the DM on the create action's own success feedback while leaving the next step a click away.

**Credit cost.** The system prompt is stored in `ai_system_prompts` (`generator_type = 'encounter'`); the credit cost is `encounter_generation` in `ai_generation_credit_costs` (1 credit). Both seeded in migration `20260802000002_encounter_generator_ai.sql`. Cost is multiplied by the active text provider's `text_multiplier`, same as every other text generator. BYOK generations are charged 0 credits but still recorded via `recordGeneration`, so generation history stays complete even when nothing was spent. The #595 retrieval step layered on top is separately zero-cost by design — see Monster retrieval above for how its own (platform-paid) spend is still tracked via `recordFreeGeneration`.

---

## Encounter Runner (Live Combat)

The runner is a full-screen layout at `/encounters/:id/run`. It loads from the Pinia store `useEncounterRunStore` and is composed of these components:

- `EncounterRunner.vue` — shell: top bar, layout wiring, end/abandon, live sync
- `RunnerCombatantList.vue` — the initiative order list (desktop grid rows / mobile cards)
- `RunnerInitiativeField.vue` — initiative input + per-combatant roll button, shared by `RunnerCombatantRow.vue` and `RunnerCombatantCard.vue`. Note the desktop grid template lives in **both** `RunnerCombatantList.vue` (header) and `RunnerCombatantRow.vue` (rows) — they must be changed together or the columns drift apart
- `RunnerEntityDetail.vue` — slide-in stat block panel
- `RunnerDmTools.vue` — events + traps sidebar
- `RunnerBossMechanics.vue` — surprise panel, lair actions, legendary actions
- `RunnerSpawnPanel.vue` — mid-encounter spawn form

### Initialisation and State Persistence

When the DM navigates to the run view, `EncounterRunView.vue` checks the `encounter_states` table for an existing live state. If one is found (`is_running = true`), the store is **hydrated** from it — surviving page refreshes and navigate-away-and-back. If not, the store is initialised fresh from the encounter definition.

Party member HP, conditions, death saves, and curses are seeded from `party_members` at init. Monster HP is initialised from the stat block's `hit_points` field (integer part only). Companions selected on the encounter are seeded from `companions` the same way (`c-{compId}` instance ids), except any with `combat_ready === false` are skipped entirely (#569) — benching a companion in the party tracker or player portal keeps it out of the initial roster without touching the encounter's stored `companion_ids`.

The fresh-init path is built by `buildRunCombatants()` (`src/lib/encounters/buildRunCombatants.ts`, extracted from `EncounterRunView.vue` so the resolution rule is unit-testable, alongside `legendaryActionCaps()` for the legendary-action pool priming that follows it). Every roster it's given — `useAllMonsters()`, `useTraps()`, `useParty()`, `useCompanions()`, `useNpcs()` — must be **unscoped** (`includeAllScopes: true` where the composable supports it): an encounter's `combatants[].monster_id` and `trap_ids` are stored references that outlive any later campaign re-scoping (#597), so resolving them against a campaign-filtered bestiary would silently drop a creature the DM deliberately put in this fight, with no error and no toast. A reference that resolves to nothing is still skipped rather than faked — a genuinely deleted monster has no stat block to run.

### DM Controls

**Top bar:**

- Back to Builder link
- Round counter with Previous Turn / Next Turn buttons
- Encounter name
- Roll Initiative button (pre-combat only) — rolls `d20 + initiativeModifier(combatant)` for every combatant that **doesn't have an initiative yet**; a value already in the list (a player's own roll, a monster the DM typed by hand) is never overwritten, whatever its type. `initiativeModifier()` (`src/rules/combatantSort.ts`) uses a monster's 2024 `initiative_bonus` when the stat block declares one, and the plain DEX modifier for everyone else (2014 monsters, NPCs, players). The d20 itself goes through `usePromptedRoll`, so a DM on **physical** dice mode gets one manual-entry prompt per combatant (labelled with its name) instead of an auto-roll — the runner registers that roller on the store via `setInitiativeRoller()`; the store falls back to `Math.random()` when none is registered. Rolls are silent (not posted to chat) — the order reaches players through the live encounter state, and posting each monster's roll would leak hidden combatants. Cancelling a prompt stops the run and leaves the remaining combatants blank, so pressing the button again picks up where it left off. Mid-combat spawns keep their automatic roll rather than interrupting the turn with a modal
- Per-combatant roll button (pre-combat only) — a die button next to every initiative input in the combatant list (`RunnerInitiativeField.vue`, shared by the desktop row and the mobile card), calling `store.rollInitiative(instanceId)`. Unlike the top-bar button this is an explicit request, so it **does** replace an existing value (it re-rolls a single monster whose roll you don't like). It disappears once combat starts — the order is locked and a stray re-roll would shuffle the turn everyone is standing in; the initiative input stays editable for a manual correction. `store.rollingInitiative` is the shared busy flag: while a manual-entry prompt is open (a single global slot) the top-bar and every per-combatant button disable together
- Start Combat button (only when the encounter is live; disabled in pre-combat mode)
- Dice Roller widget
- Go Live / Live badge (only when a campaign is active)
- Abandon — ends the live state without syncing player HP/conditions (roster-NPC death/reveal already happened live during combat)
- End Combat — syncs HP/conditions/death saves/curses back to `party_members` and returns to the encounter sheet. (Roster-NPC death/reveal is handled live as it happens, not here — see "Live roster-NPC sync" below.)

**Initiative order (combatant list):**

Desktop layout is a grid table (INIT / NAME / HP / AC / CONDITIONS). Mobile uses a stacked card per combatant with separate rows for identity, stats, and HP controls.

Per combatant row:

- **Portrait** — focal-aware thumbnail; falls back to faction-coloured initials
- **Active indicator** — gold border ring on the avatar and blue-tinted row highlight for the current turn
- **Faction stripe** — 3px coloured left border from the faction definition
- **INIT cell** — editable number input; typed values take effect immediately
- **Reveal toggle button** (monsters only, overlaid on portrait) — cycles hidden → unseen → revealed. Auto-triggers monster discovery in `discovered_monsters` when cycled to revealed
- **HP cell** — inline editable with +/- buttons; debounced 500ms so rapid tapping accumulates. Animated damage/heal flash overlays the number
- **Quick HP panel** — expands below the row when the row is selected; shows an amount input with Dmg / Heal / +Temp buttons
- **AC** — read-only display; uses beast AC when wildshaped
- **CONDITIONS** — badge row, click a badge to remove; "+" button opens a dropdown of available conditions. Exhaustion uses a pip chip with level control. Concentration is shown as an indigo chip (auto-cleared by concentration-breaking conditions). Reaction is a ⚡ chip, toggled per turn, reset automatically at the start of each new round

**"Hidden" condition + player Hide action** — the pickable condition list (`CONDITIONS` in `src/rules/conditions.ts`) carries a 16th, non-SRD entry, **Hidden**, for tracking a creature that has taken the Hide action. It's a full shared condition: it appears in the DM's condition picker (`ConditionPicker.vue` / `PlayerCharacterHeader` / `PartyConditionsPanel`) and renders as a chip everywhere the others do. Because Open5e has no such entry, its edition-aware rules text lives in `CONDITION_PATCHES` (both `2014` and `2024`) rather than the generated base arrays. On the player side, the **Combat tab** (`PlayerCombatTab.vue`) has a Hide action: it rolls Dexterity (Stealth) via `promptRoll` (using the shared `skillCheckBonus` in `src/rules/skillCheck.ts`, honouring check-disadvantage/Exhaustion-penalty like the Skills tab) and, on a completed roll, marks the character Hidden; the card doubles as a live "you are Hidden / Reveal" indicator. Making any attack from the Combat tab auto-clears Hidden (5e RAW — attacking reveals you), as does the Reveal button or removing the chip; attacks the DM rolls for that PC from the encounter runner (`RunnerPcAttacks.vue` melee/ranged/thrown) clear it too, via the `roll-attack` resolved-callback path.

**Dual-edition conditions (#556)** — condition text is edition-sensitive: `getCondition(name, ruleset)` (`src/rules/conditions.ts`) resolves the campaign's active ruleset against `src/data/srdConditions2014.ts` / `srdConditions2024.ts`, with `CONDITION_PATCHES` (`src/data/conditionPatches.ts`) applied last as an override/fill-gap layer — the 2024 texts there were verified line-by-line against the official 2024 rules glossary (SRD 5.2, CC-BY-4.0) since Open5e has no structured 2024 condition data yet (upstream open5e-api#793); the patch layer is the regeneration point once that data ships. 2024 Exhaustion is mechanically different from 2014: a flat −2×level penalty on every d20 Test (`getExhaustionD20Penalty`) instead of the 2014 disadvantage-based effects, −5ft×level Speed reduction (`getExhaustionSpeedPenaltyFt`), and death at level 6 in both editions. Both resolvers live in `src/rules/conditions.ts` and are wired through the runner's combatant rows/cards, the condition picker, and the player-facing condition views.

- **Surprised badge** — can be set pre-combat or during round 1; auto-cleared when the combatant ends their first turn. A subtle "✦?" button appears on non-surprised combatants during the setup window

**Turn management:**

`nextTurn()` skips dead monsters (HP = 0) while always including players. Round number increments when the turn wraps back to position 0. `prevTurn()` steps backwards. At the start of each combatant's turn: their reaction is restored and their legendary action pool is refilled (extracted as `refreshTurnStart()` in the store so the round-wrap reshuffle path reuses it).

**Optional combat rules (Turn Timer + Random Initiative):**

Two encounter mechanics live in the built-in optional-rule registry (`src/rules/optionalRules.ts`), toggled per campaign in **Campaign Settings → Rules** like every other `OptionalRuleDef`. Both `dmOnly: false` so they also list in the player Reliquary; both default off.

- **`turn_timer`** — a _configurable_ rule (the first one). The DM sets **seconds per turn** (default 60, clamped 5–600). Config is the general mechanism added here: `campaign_rules` gained a nullable `config jsonb` column (migration `20260724000006`), `OptionalRuleDef.config?: RuleConfigField[]` declares the tunable fields, `CampaignRule.config: RuleConfig | null` holds the stored values, and `resolveRuleConfig(rows, key)` (`useOptionalRules`) merges stored values over registry defaults (dropping any non-numeric stray). `RulesTab.vue` renders a number input per field only while the rule is enabled; both the toggle and config writes persist through the single `useUpsertCampaignRule` mutation hook (config optional — flipping the switch passes the existing `config` through so it never wipes tuned values). `campaign_rules` is in `useCampaignLiveSync`'s `SYNC_TABLES`, so a DM toggling/tuning a rule reaches already-mounted players live. The countdown itself is `TurnTimer.vue` (`src/components/encounters/`) — a purely-visual, self-contained clock taking `:seconds` + `:reset-key` (round + active combatant instance id). It restarts whenever the key changes, flashes amber ≤10s, pulses red at 0, and never force-ends a turn. Rendered in the runner top bar (`EncounterRunner.vue`, gated on `store.round > 0`) and on the player panel (`PlayerEncounterPanel.vue`, gated on `!isInLobby`); both derive `turnTimerSeconds`/`turnResetKey` from the shared `useTurnTimerConfig(round, activeCombatantId)` composable (`src/composables/useTurnTimerConfig.ts`) — only the round/active-combatant source differs (store vs. liveState). Each side runs its own copy — a sub-second drift is fine for a nudge, so no start-timestamp is synced.
- **`random_initiative`** — a plain boolean. When on, the store re-rolls **every** combatant's initiative and re-sorts at the start of each new round, then hands the turn to the top of the fresh order. Implemented as `store.reshuffleInitiative()` (silent `autoRollInitiative` for all — deliberately **never** the physical-dice prompt, since it fires once per round; a modal storm each round would be unusable), called from `nextTurn()` on the round-wrap branch when `store.randomizeInitiativeEachRound` is set. The runner keeps that store flag in sync with the campaign rule via a `watch` on `isRuleEffectivelyEnabled(..., "random_initiative")` → `store.setRandomizeInitiativeEachRound()`, so toggling mid-fight takes effect on the next wrap. Live sync is automatic: the reshuffled initiatives ride the existing `combatants_live` push, so players see the new order without extra plumbing. Both the flag and reshuffle are reset in `store.reset()`.

**Wildshape tracking:**

When a player enters wildshape (from `RunnerEntityDetail`), the combatant gets a `wildshape` overlay. The overlay stores beast HP, max HP, and AC independently — the player's real stats are never modified. Damage lands on temp HP first, then beast HP; excess overflows to real HP on revert (5e RAW). The avatar switches to the beast portrait. Reverting clears the overlay and restores display to real stats.

The DM picks the form via `RunnerPcWildshape` ("Choose Form"). The picker is **teleported to `<body>`** as a `position: fixed` floating popover anchored to the toggle button (`useAnchoredPopover` + `computeAnchoredPosition` in `src/lib/floatingPosition.ts`). This is deliberate: the detail panel's `.detail-panel`/`.panel-shell` ancestors are `overflow: hidden`, so an inline (or `position:absolute`) picker gets clipped and appears to render nothing — the original #503 bug. Teleporting sidesteps all ancestor clipping. The available list is the same discovered/pinned-gated set as the player sheet; when it's empty the popover shows a "📌 Pin a form" affordance listing every _eligible_ beast (CR/speed rules only), and pinning one via `useTogglePinnedForm` unlocks it immediately without leaving the runner. The eligibility rules (max CR, beast-only, no fly/swim below level 8) live in `src/rules/wildshape.ts` (`wildshapeMaxCr` / `isEligibleWildshapeForm`) and are shared by the runner, the player character sheet and the player bestiary.

**Temp HP:**

Temp HP absorbs damage first, in beast form as well as normal form — it is a buffer in front of whichever HP pool is active, and Wild Shape does not remove it. Does not stack: a new source only replaces the pool if it is larger. Shown as a sky-blue "+N tmp" badge.

The arithmetic (temp → beast HP → real HP, with overflow on revert) lives in `src/rules/hitPoints.ts` (`applyDamage` / `applyHealing` / `betterTempHp`) and is shared by `encounterRun.adjustHp`, the player character sheet (`PlayerCharacterHeader`) and the DM party tracker (`PartyTrackerRow`), so all three agree. `hitPoints.test.ts` covers the beast-form and overflow cases.

**Where a PC's temp HP comes from during a run:** the party member row is the authority. `EncounterRunView.initStore` seeds `temp_hp` onto the player combatant at init, `EncounterRunner`'s `party_members` realtime subscription ingests later changes via `store.ingestTempHp` (assign-only, no write-back — the DB is the source), and the runner row/card read `displayTempHp` from the live party row exactly as they already do for HP, AC and conditions. Without all three a player's temp HP was invisible to the DM, and the first HP write persisted `temp_hp: 0` over it.

**Concentration:**

Concentration on player characters is tracked via `party_members.concentration`. When a concentration-breaking condition is applied via the runner, concentration is automatically ended. When the Dmg button is used against a concentrating PC, a concentration saving throw is prompted (auto-calculates DC as max(10, damage/2)).

**Boss mechanics panel (`RunnerBossMechanics.vue`):**

Appears above the combatant list when relevant.

- **Surprise panel** (pre-combat only): a toggle strip lets the DM mark creatures as surprised before rolling initiative. Surprised count is shown as a summary.

- **Lair Actions panel** (when lair is enabled and combat started): shows the lair owner's lair action list from their stat block. The panel is violet-highlighted when the action is available (once per round, at initiative 20). Clicking an action marks it fired for that round and posts to campaign chat.

- **Legendary Actions panel**: appears for each legendary creature that is NOT the active combatant and still has actions remaining. Lists all legendary actions from the stat block with cost parsed from the action name ("Costs 2 Actions"). Disabled buttons for actions the creature can't afford. Clicking spends actions and posts to chat.

**Stat block detail panel (`RunnerEntityDetail.vue`):**

Opens to the right when a combatant row is clicked. Width is user-resizable by dragging the left border (mouse and touch, 200–700px). On mobile it overlays the list.

For each combatant type the panel shows:

- _Monsters_: portrait, type/alignment, AC/HP/Speed/CR stats row, full ability score table (with clickable roll buttons), skills grid, senses/languages/resistances/immunities, full trait sections with inline attack roll and damage roll buttons, spellcasting list, legendary action pip tracker with "Use 1" button
- _NPCs_: portrait, race/occupation/alignment, stat block if defined (same sections as monsters), fallback message if no stat block
- _Players_: portrait, species/class/level, AC/HP/Speed/Prof Bonus, full ability scores with saves, skills grid with proficiency indicators, melee + ranged attacks section, death saves (tracked live with success/failure pips)
- _Companions_: portrait, type, AC/HP/Speed, ability scores if stat block defined, trait sections

**Ammunition (`useAmmoConsumption` + `src/rules/ammunition.ts`):** Firing a ranged weapon depletes the carried ammo — arrows/bolts/bullets/needles/darts/firearm rounds — resolved from the member's inventory (quiver/container → belt → backpack) or, for self-charged weapons (laser rifle, internal-magazine firearms), the weapon's own `charges`. `weaponAmmoTag`/`ammoTagFromName` (pure, unit-tested) classify weapons and stacks — tags/subtype/name tiers, with the imported 5e `"ammunition"` property as the final tier yielding the generic `"any"` tag (matches any recognised ammo stack) so a renamed/homebrew ranged weapon still tracks ammo; `weaponUsesChargesAsAmmo` (charges + `isRangedWeaponItem`) gates the self-charged path so a charged _melee_ weapon's charges are never burned by basic attacks. `useAmmoConsumption` owns selection + the decrement (`consumeOneFromStack` shared with `useThrownWeapon`) and is shared by both the DM runner (`RunnerPcAttacks.vue`) and the player's own combat tab (`PlayerCombatTab.vue`) so the two paths cannot diverge; both consume only after the attack roll actually resolves (a cancelled physical-dice prompt spends nothing — the runner passes an `onResolved` callback through the `roll-attack` emit, relayed via `RunnerPcPanel` and resolved in `RunnerEntityDetail`). Both surfaces disable the Attack button and show a remaining count when a weapon needs ammo it doesn't have.

**Thrown weapons (`useThrownWeapon` + `src/rules/thrownWeapon.ts`):** A weapon with the `thrown` property (javelin, dagger, handaxe, spear, light hammer, trident) shows a **Throw** action alongside its melee **Attack** — on the player combat tab as a second button, on the DM runner as a "Thrown Attacks" section. Throw rolls the same to-hit as melee (STR, or best of STR/DEX for finesse — the shared `src/rules/weaponAttack.ts` math) and then the weapon leaves the hand: `useThrownWeapon.throwWeapon` drops one to the ground as a recoverable `item_drop` in campaign chat (reuses `useCampaignMessages.sendItemDrop` + the existing grab flow — no new routes) and decrements the equipped stack, removing the row when the last one is thrown. `isThrownWeapon` (pure, unit-tested) trusts a vault item's `thrown` property and word-boundary name-matches item-less custom stacks — "Longspear" does _not_ match "spear" (Javelin/Spear/Light Hammer/Trident are also seeded as real weapons in `src/data/provisions.ts`). Throw consumption is gated on the roll resolving on both surfaces (see Ammunition above for the runner's callback path).

**Custom attacks (`src/rules/customAttack.ts`, #568):** Player-defined attack buttons for anything not derived from equipment — companion attacks, save-based features, improvised setups. Stored as `party_members.custom_attacks` JSONB (`CustomAttack[]`: `id`, `name`, `attack_bonus: number | null`, `damage` dice expression, `damage_type`); `attack_bonus: null` marks an auto-hit/save-based attack, so only the Damage button renders. The player's combat tab lists them in `PlayerCustomAttacks.vue` (between equipped weapons and the always-available melee card) with inline add/edit/delete, the same `v-roll-mode`/condition-driven attack-disadvantage handling as weapon attacks, and an `attacked` emit that clears Hidden on a completed to-hit roll. `validateCustomAttack` (name + `parseExpression`-parseable damage) gates saving; vitest-covered in `customAttack.test.ts`. The DM sees the identical list in the runner's `RunnerPcAttacks.vue`, in a "Custom Attacks" section after Class Features, emitting `roll-attack`/`roll-damage` through the same pipeline as the thrown/ranged sections so the two surfaces can't diverge.

**Roll mode bar** (top of detail panel, per combatant):

- Normal / Advantage / Disadvantage — affects all roll buttons in the panel
- Results shown in a transient banner (die result, modifier, crit/fumble highlighting, rolled-and-dropped die for adv/disadv)

**Chat mode bar**: toggles whether rolls are posted to campaign chat (public / private / off).

**Runner → chat write path**: everything the runner posts goes through `useCampaignMessages` — the pending-broadcast flush in `EncounterRunner` uses `sendSystemMessages` (array form, so a burst is one insert), lair/legendary announcements in `RunnerBossMechanics` and the spell-save call in `RunnerEntityDetail` use `sendSystemMessage`, and the flat-damage roll uses `sendRoll`. Never hand-build a `campaign_messages` insert here: the composable owns the row shape and the optimistic local push, so the DM sees their own runner message immediately rather than waiting for the realtime echo (#722).

**Events sidebar (`RunnerDmTools.vue`):**

A 200px-wide panel on the right edge of the runner. Appears only when the encounter has events defined.

- Lists all events with name, trigger description, Fired/Pending badge
- Manual events and multi-fire events always show a ▶ fire button
- Auto-triggered events are greyed out after firing (if fire_once); they still show the button so the DM can force re-fire
- `checkEvents()` is called after every HP change and turn advancement; auto-triggers are evaluated against current state
- Firing an `environment_effect` action (#604) posts its label + description to the same pending-broadcast queue a `broadcast_message` action uses (`store.executeEvent`), and the hazard then stands in the **⚠ IN PLAY** list under the events — rendered from `store.activeEnvironmentEffects`, the computed over fired events' `environment_effect` actions, so it survives a reload without a field of its own. The two generator buttons live in this panel's header — see Mid-fight Complication / Reinforcement Generator above

**Traps sidebar:**

Below the events panel (or standalone if no events). Lists traps associated with the encounter with their type colour stripe, DC badge, and damage dice badge. Clicking a trap opens its detail in the entity panel (the same slot used by combatants).

**Spawn panel (`RunnerSpawnPanel.vue`):**

Collapsible panel at the bottom of the combatant list. Allows the DM to add monsters or NPCs mid-combat:

- Monster / NPC tabs
- EntityCombobox search across all available monsters / NPCs with stat blocks
- Faction selector and count input
- "Add" button: injects the combatant(s) into the live initiative list with automatic initiative roll if combat is already started. Legendary action pools are primed for newly spawned legendary creatures.

**Live mode and real-time player sync:**

When the DM clicks "Go Live" (requires an active campaign), the current combat state is written to the `encounter_states` table. Players subscribed via `useEncounterLive` see changes in real time (Supabase Realtime subscription).

State pushed on every change: round number, active combatant index, full `combatants_live` array (including HP, conditions, reveal state, wildshape), fired event IDs.

Auto-discovery: when going live, any monster already in the "revealed" reveal state is automatically added to `discovered_monsters` for all party members.

Bidirectional HP sync: while live, player HP changes in the runner are debounced (400ms) and written to `party_members`. Conversely, a Supabase Realtime subscription on `party_members` pushes HP updates from outside the runner (e.g. a player updating their own sheet) back into the runner store. Loop-breaking relies on Vue's same-value no-op.

**Companion bench sync, lobby only (#569):** A companion's `combat_ready` flag can flip while the encounter still sits in the lobby (round 0) — the DM benches one from the party-tracker `CompanionCard`, or the owning player toggles their own from the player panel (see Player View below). `EncounterRunner.vue` watches the live `companions` query (kept fresh by `useCampaignLiveSync` — `companions` was already in its table list, so this rides the existing subscription) and reconciles the roster against it: benched → `store.removeCombatant(instanceId)`, un-benched → `store.addCompanionCombatant(comp, factionId)`. Runs `immediate` so a bench toggle made while no one had the runner open is still reconciled the moment it mounts. Once combat starts (round > 0) the roster is locked — a companion already in the fight stays in it regardless of a later bench toggle.

**End / Abandon:**

- **End Combat**: confirms, cancels any pending HP debounce, ends the live state, syncs all player combatants' HP + conditions + curses + death saves back to `party_members`, resets the store, navigates to the encounter sheet. Companion combatants get the same write-back — HP + conditions to `companions` (#569; previously companion combatants were silently dropped at End Combat, so damage taken never persisted). (Roster-NPC death/reveal is handled live during combat — see below — not here.)
- **Abandon**: ends live without syncing player HP; useful when a combat didn't actually happen or was a mistake. Skips the companion write-back too, matching party members.

**Live roster-NPC sync:**

Roster NPCs run as combatants of `type: "monster"` carrying an `npc_id` (never `monster_id`), and their records are written back **the moment it happens, not at conclusion** — mirroring how monster discovery fires on reveal. Driven by a `watch` over the NPC combatants in `EncounterRunner.vue` (`src/lib/npcEncounterSync.ts`, `buildNpcSyncUpdate` + test), reacting to two events:

- **Revealed** — the DM cycles a token to `reveal_state === "revealed"`. The reveal toggle renders for any `type === "monster"` combatant, so roster NPCs are cyclable hidden → unseen → revealed exactly like monsters — that is how an NPC becomes "seen". On reveal the NPC joins the party's seen list: a _widening_ union on `npcs.player_visible_to` (never narrows an existing partial share) with `player_visible_fields` gaining `name`/`portrait` (`NPC_DEFAULT_REVEAL_FIELDS` in `lib/npcDisplay.ts`, shared with `NpcRevealControl` — note the sync *unions* the defaults in, where a first reveal only seeds them when the DM has chosen nothing). An NPC left `hidden`/`unseen` is never added.
- **Died** — a token drops to 0 HP. **Death is a world fact**, written `status: "dead"` whether or not the party saw it — but **reveal always requires being seen**: a hidden NPC that dies is recorded dead and _not_ disclosed to players. A seen NPC that dies is both marked dead and revealed (same union, plus the `status` field so its death shows). If a hidden death is later seen (the DM cycles it to "revealed"), the reveal fires then, carrying the `status` field.

The builder (`buildNpcSyncUpdate`) takes the NPC's current `{ seen, died }` state and returns `null` when nothing would change (already dead + already revealed, or a DM pre-reveal), so writes happen only on real transitions; the watcher patches the local `store.availableNpcs` snapshot after each write so re-fires stay no-ops (healing-then-re-killing or a reveal→hide→reveal cycle won't spam writes). Reveal needs a party to reveal to; with none, death is still marked. Monster combatants have no persistent per-instance record and are untouched — this is separate from the monster **bestiary** discovery (`discovered_monsters`, `monster_id` only, fired on reveal-cycle + Go Live).

### Player View

Players see a live encounter panel in their portal. On mobile it renders as a full-page panel at `/play/encounter`; on tablet+ it lives in the layout sidebar (the same panel, just positioned differently by CSS).

**`PlayerEncounterPanel.vue`:**

- When no encounter is running: empty state with a message
- When live, but pre-combat (round 0): "Gathering Party…" lobby header
- Lobby only, and only if the player owns any: a "Your companions" strip (#569) toggles each companion Joining/Elsewhere before combat starts, writing `companions.combat_ready` directly (optimistic, reverts on failure) — see the runner's bench-sync note above
- When combat starts: round number + active combatant name displayed prominently; "YOUR TURN!" banner pulses when it is the player's turn
- On your-turn transition: screen shake animation + optional audio chime (player preference in settings)

**Combatant list (player-visible only):**

- Hidden monsters (reveal_state = "hidden") are completely invisible
- Unseen monsters (reveal_state = "unseen") appear as a "???" row with a grey placeholder portrait and NPC badge
- Revealed monsters and all players appear normally with name, type badge, initiative, portrait
- Active combatant has a highlighted row

**HP display** — controlled by the campaign-level `health_visibility` setting:

- `strategic`: PCs show exact HP and a colour bar; monsters show a descriptive label (Healthy / Hurt / Wounded / Bloodied / Dead) with a colour bar
- `immersive`: PCs still show exact HP; monsters show only the label with no bar
- `unknown`: no HP information shown

HP bar colour thresholds: >75% green, >50% amber, >25% red, 0 grey.

**Clicking a combatant** opens a lightbox. Every visible row is tappable — a tap must never be a no-op, since enlarging the portrait to read a face is the whole point:

- Player / Companion: party member lightbox (portrait, stats, conditions, etc.)
- NPC the party has already met — i.e. present in the `get_player_visible_npcs` projection (`useSharedNpcs`): `PlayerNpcLightbox` — portrait (if the DM enabled it in NPC visibility settings), relationship badge, status dot, occupation, personal connection note (DM-written per PC), player notes widget, star rating (1–5 relevance)
- Everything else — monsters, and NPCs the party has **not** met: `EncounterCombatantLightbox` — enlarged portrait + name straight off the live combatant, plus a player notes widget keyed on `npc_id`/`monster_id` when one is present

That last fallback matters: an enemy NPC the DM revealed only inside the encounter is not in the player's NPC roster, so there is nothing to look up. The live combatant already carries the name, portrait and focal point the row is drawing, and the DM authorised showing it by setting `reveal_state` — so the lightbox renders from the combatant directly. Never gate the player panel's NPC lookup on the raw `npcs` table (`useNpcs`): RLS there requires the NPC to list this player in `player_visible_to`, which is a different visibility axis than encounter reveal, and it also hands the client DM-only columns and the true identity of disguised NPCs.

---

## Key Capabilities / USPs

1. **Unified initiative tracker and stat block browser in one panel.** Clicking any combatant instantly opens their full stat block in a resizable side panel without navigating away. Every ability score, save, skill, and action has a roll button. The DM never needs to look up a second window.

2. **Faction system with automatic colour coding.** Every combatant has a faction with a hex colour. The left border stripe gives a consistent visual grouping across the list. Custom factions support any alignment (e.g. "Town Guard", "Cultists of X", "Mind-Controlled Party Member").

3. **Three-level monster reveal system.** Hidden / Unseen / Revealed is per-combatant and controls what players see. Unseen gives players a "something is there" slot without naming the creature. Cycling to Revealed auto-discovers the monster in the player bestiary.

4. **Pre-scripted encounter events.** The event system handles common "boss phase" patterns without any mid-session fiddling. A phase-2 wave spawn (On Death → Spawn 4 Skeletons) or a timed reinforcement (Round 3 → Spawn Archers) is defined once at build time and fires automatically. Manual events serve as bookmarked DM prompts.

5. **Full boss fight support.** Lair actions appear at initiative 20 with one click per round. Legendary action pools reset automatically at turn start and are tracked with pip indicators in both the combatant list and the detail panel. Action costs parsed from stat block names.

6. **Wildshape overlay.** Beast form HP is tracked independently without touching real character stats. Overflow damage carries through to real HP on revert. The combatant portrait and AC switch to beast form display automatically.

7. **Live player sync via Supabase Realtime.** Players see the initiative order, active turn, HP bars, conditions, and turn indicators on their own device in real time. HP changes in the runner are debounced and written to `party_members`; changes made externally are pushed back in. No separate "sync" button needed.

8. **Bidirectional HP persistence.** Ending combat is a one-click operation that writes HP, conditions, curses, and death saves to all party members (and, as of #569, companion HP + conditions) atomically. Nothing is lost if the DM closes the tab mid-combat — hydration from `encounter_states` restores the full live state on reload.

9. **Mid-combat spawn** — monsters or stat-block NPCs can be injected into the live initiative order at any time, with automatic initiative rolls and legendary action pool priming.

10. **Difficulty calculator integrated into the builder.** The DMG XP budget calculation (with count multiplier, party size adjustment, ally offset, and trap XP) runs live as the DM adds combatants. Visual threshold bars and an enemy breakdown table make it immediately clear whether a planned encounter is worth balancing differently.

11. **Re-import clobber protection (#560).** Re-syncing monsters from Open5e into the shared `library_monsters` table only refreshes fields Open5e actually supplies — name, type/size, source metadata, `stat_block`. DM-authored notes, portrait, description, habitat, and lair link are never touched by a re-run. Full field breakdown in [`docs/library-reimport.md`](../../docs/library-reimport.md).

12. **Party-aware AI encounter suggester (#337), now retrieval-backed (#595).** One concept prompt plus a difficulty tier returns a themed encounter — name, environment, tactics, twist, and a combatant list resolved directly against the DM's own Bestiary, preferring their homebrew monsters by name over same-named library monsters. The party summary and candidate monster block that ground the suggestion are built server-side from the campaign's own data, never trusted from the client — the candidate block is normally populated by semantic (embedding) retrieval over the DM's homebrew and the shared library, falling back to a compact index of the DM's own monsters whenever retrieval is unavailable.

---

## Data Model

### `Encounter` (database table)

| Field                   | Type                       | Notes                            |
| ----------------------- | -------------------------- | -------------------------------- |
| `id`                    | uuid                       | PK                               |
| `campaign_id`           | uuid                       | FK                               |
| `name`                  | text                       |                                  |
| `description`           | text/Tiptap JSON           | Rich text                        |
| `party_member_ids`      | uuid[]                     | Selected PCs                     |
| `companion_ids`         | uuid[]                     | Selected companions              |
| `party_member_factions` | Record\<string, string\>   | memberId/companionId → factionId |
| `combatants`            | CombatantDef[] JSONB       | Monster/NPC slots                |
| `factions`              | FactionDef[] JSONB         | Faction definitions              |
| `item_ids`              | uuid[]                     | Loot items                       |
| `trap_ids`              | uuid[]                     | Associated traps                 |
| `reward_currency_pools` | RewardCurrencyPool[] JSONB |                                  |
| `art_objects`           | ArtObject[] JSONB          |                                  |
| `location_id`           | uuid                       | Optional location link           |
| `is_finished`           | boolean                    |                                  |
| `events`                | EncounterEvent[] JSONB     | Pre-scripted events              |
| `lair_enabled`          | boolean                    | Boss mechanics                   |
| `lair_owner_def_id`     | string                     | References CombatantDef.id       |

### `CombatantDef` (JSONB, inside `Encounter.combatants`)

```ts
interface CombatantDef {
  id: string; // local UUID for this slot
  monster_id: string | null;
  npc_id: string | null;
  count: number;
  faction_id: string;
  custom_name: string | null;
}
```

### `FactionDef` (JSONB, inside `Encounter.factions`)

```ts
interface FactionDef {
  id: string; // "players" | "enemy" | "ally" | "neutral" | custom UUID
  name: string;
  color: string; // hex
  hostile_to: string[];
}
```

### `EncounterEvent` (JSONB, inside `Encounter.events`)

```ts
type EventTrigger =
  | { type: "round_start"; round: number }
  | { type: "combatant_hp_pct"; combatant_def_id: string; pct: number }
  | { type: "combatant_dies"; combatant_def_id: string }
  | { type: "manual" };

interface SpawnDef {
  monster_id: string; // bestiary monster, or (kind: "npc") the NPC to bring in
  kind?: "monster" | "npc"; // absent = "monster" (#604) — every pre-#604 row has no kind field
  count: number;
  faction_id: string;
  custom_name?: string;
}

type EventAction =
  | { type: "spawn_combatants"; spawns: SpawnDef[] }
  | { type: "broadcast_message"; message: string }
  // #604 — a hazard/terrain change that stays in play once fired; no mechanical payload
  | { type: "environment_effect"; label: string; description: string };

interface EncounterEvent {
  id: string;
  name: string;
  trigger: EventTrigger;
  actions: EventAction[];
  fire_once: boolean;
  is_player_visible?: boolean;
}
```

### `RunCombatant` (ephemeral, inside `EncounterState.combatants_live`)

The live in-memory (and Supabase-persisted) combatant object during a run.

Key fields beyond the definition: `instance_id` (format: `p-{memberId}`, `m-{defId}-{i}`, `n-{defId}-{i}`, `c-{compId}`, `spawn-{monsterId}-{ts}-{i}`), `initiative`, `hp`, `max_hp`, `ac`, `conditions[]`, `curses[]`, `death_saves`, `reveal_state` (`"hidden" | "unseen" | "revealed"`), `wildshape?: WildshapeState`, `temp_hp?`, `concentration?`, `surprised?`, `legendary_action_cap?`, `legendary_actions_remaining?`, `reactionUsed?`.

### `EncounterState` (database table — live sync)

```ts
interface EncounterState {
  id: string;
  encounter_id: string;
  campaign_id: string;
  user_id: string;
  is_running: boolean;
  current_round: number;
  active_combatant_index: number;
  combatants_live: RunCombatant[];
  events_fired?: string[];
  started_at: string | null;
  updated_at: string;
}
```

### `RevealState`

```ts
type RevealState = "hidden" | "unseen" | "revealed";
```

- `hidden` — invisible to players entirely
- `unseen` — player sees a "???" slot (knows something is there)
- `revealed` — player sees name, portrait, conditions; triggers auto-discovery

### `HealthVisibility`

```ts
type HealthVisibility = "strategic" | "immersive" | "unknown";
```

Campaign-level setting in `campaigns.health_visibility`.

### Difficulty system

The `calculateDifficulty()` utility in `encounter.types.ts` implements the full DMG XP budget. Exports `CR_XP` (CR → XP map), `XP_THRESHOLDS` (level 1–20 × Easy/Medium/Hard/Deadly), `crToXp()`, `monsterMultiplier()`, `calculateDifficulty()`. Labels: Trivial / Easy / Medium / Hard / Deadly / Legendary (Legendary = > 2× deadly threshold).
