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

**List filters** (stored in `useUiStore`):

- Text search
- Source: All / SRD / Custom (desktop-only pill group)
- Monster type: dropdown covering all 14 standard D&D creature types

**Monster creation and editing** (`MonsterDetail.vue`):

Each monster stores a full `stat_block` JSONB object with:

- Basic: name, size, monster_type, alignment, CR, habitat, source, tags
- Combat: AC, HP (with dice expression), speed, initiative
- Ability scores: STR/DEX/CON/INT/WIS/CHA
- Derived: saving throws, skills, senses, languages
- Resistances / immunities / condition immunities
- Trait sections: Traits, Actions, Bonus Actions, Reactions, Legendary Actions, Lair Actions, Mythic Actions
- Spellcasting block (spell list per level)
- Portrait image with focal point (for `FocalImage` focal-aware display)

**Template presets** — `src/data/monsterTemplates.ts` ships 12 SRD stat block presets (e.g. Goblin, Dragon, Lich) that pre-populate the form.

**AI monster generator** — `MonsterGeneratorPanel.vue` is accessible from the Bestiary toolbar ("Generate" button) and creates a stat block from a text prompt.

**Read-only sheet view** (`MonsterSheet.vue`) is shown by default when navigating to an existing monster; the Edit button switches to the editable form (`MonsterDetail.vue`). The URL query `?edit=true` also activates the editor directly.

**Visibility / discovery system** — the DM can share individual monsters with specific players or the whole party. The visibility popover on the monster detail page offers:

- Per-player toggles (Eye/EyeOff per party member)
- "Whole party" shortcut
- "Stats visible" toggle — controls whether the player sees the stat block or only name/image
- "Hide from all players" to revoke

This powers the player bestiary (see Player View below). `useMonsterVisibility` manages the `discovered_monsters` table.

### Player View

Players see only monsters the DM has shared with them, via their Bestiary tab at `/play/bestiary`.

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
- Each selected member/companion gets a faction assignment dropdown (colour-coded by faction colour)
- Player initiative values from `party_members.current_initiative` are pre-seeded into the runner

### Combatants (`EncounterCombatants.vue`)

The enemy/ally/neutral roster. Each combatant definition (`CombatantDef`) stores:

- Monster or NPC reference (mutually exclusive)
- Count (how many instances to spawn)
- Faction assignment
- Optional custom name (overrides the source name in the runner)

Multiple combatant slots can point to the same monster with different counts or factions.

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

- `spawn_combatants` — adds N monsters of a chosen type to a chosen faction, with automatic initiative if combat is already started
- `broadcast_message` — posts a system message to the campaign chat

**Options:**

- `fire_once` — if checked, the event is greyed out after firing and won't repeat
- `is_player_visible` — when set, fired events appear as parchment-style narrative beat callouts in the player's combat panel (`PlayerEncounterPanel`). If the event has a `broadcast_message` action, that message text is shown prominently; the event name is shown as a smaller label below it. Events appear in the order they were defined and remain visible for the rest of the encounter.

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

A list of trap references (from the Traps module). Each trap shows in the runner's DM Tools sidebar. Clicking a trap in the sidebar opens its detail panel so the DM can reference trigger, save DC, and damage expressions mid-combat.

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

---

## Encounter Runner (Live Combat)

The runner is a full-screen layout at `/encounters/:id/run`. It loads from the Pinia store `useEncounterRunStore` and is composed of four components:

- `EncounterRunner.vue` — shell: top bar, layout wiring, end/abandon, live sync
- `RunnerCombatantList.vue` — the initiative order list
- `RunnerEntityDetail.vue` — slide-in stat block panel
- `RunnerDmTools.vue` — events + traps sidebar
- `RunnerBossMechanics.vue` — surprise panel, lair actions, legendary actions
- `RunnerSpawnPanel.vue` — mid-encounter spawn form

### Initialisation and State Persistence

When the DM navigates to the run view, `EncounterRunView.vue` checks the `encounter_states` table for an existing live state. If one is found (`is_running = true`), the store is **hydrated** from it — surviving page refreshes and navigate-away-and-back. If not, the store is initialised fresh from the encounter definition.

Party member HP, conditions, death saves, and curses are seeded from `party_members` at init. Monster HP is initialised from the stat block's `hit_points` field (integer part only).

### DM Controls

**Top bar:**

- Back to Builder link
- Round counter with Previous Turn / Next Turn buttons
- Encounter name
- Roll Initiative button (pre-combat only)
- Start Combat button (only when the encounter is live; disabled in pre-combat mode)
- Dice Roller widget
- Go Live / Live badge (only when a campaign is active)
- Abandon — ends without syncing HP or marking discoveries
- End Combat — syncs HP/conditions/death saves/curses back to `party_members` and returns to the encounter sheet

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
- **Surprised badge** — can be set pre-combat or during round 1; auto-cleared when the combatant ends their first turn. A subtle "✦?" button appears on non-surprised combatants during the setup window

**Turn management:**

`nextTurn()` skips dead monsters (HP = 0) while always including players. Round number increments when the turn wraps back to position 0. `prevTurn()` steps backwards. At the start of each combatant's turn: their reaction is restored and their legendary action pool is refilled.

**Wildshape tracking:**

When a player enters wildshape (from `RunnerEntityDetail`), the combatant gets a `wildshape` overlay. The overlay stores beast HP, max HP, and AC independently — the player's real stats are never modified. Damage goes to beast HP first; excess overflows to real HP on revert (5e RAW). The avatar switches to the beast portrait. Reverting clears the overlay and restores display to real stats.

The DM picks the form via `RunnerPcWildshape` ("Choose Form"). Its available list is the same discovered/pinned-gated set as the player sheet — so on a fresh campaign it can be empty. In that case the picker shows a "📌 Pin a form" affordance listing every _eligible_ beast (CR/speed rules only); pinning one via `useTogglePinnedForm` unlocks it immediately without leaving the runner. The eligibility rules (max CR, beast-only, no fly/swim below level 8) live in `src/lib/wildshape.ts` (`wildshapeMaxCr` / `isEligibleWildshapeForm`) and are shared by the runner, the player character sheet and the player bestiary.

**Temp HP:**

Stored per combatant. Temp HP absorbs damage first (regardless of wildshape state). Does not stack — setting temp HP takes the higher of existing vs new value. Shown as a sky-blue "+N tmp" badge.

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
- _Players_: portrait, species/class/level, AC/HP/Speed/Prof Bonus, full ability scores with saves, skills grid with proficiency indicators, melee attacks section, death saves (tracked live with success/failure pips)
- _Companions_: portrait, type, AC/HP/Speed, ability scores if stat block defined, trait sections

**Roll mode bar** (top of detail panel, per combatant):

- Normal / Advantage / Disadvantage — affects all roll buttons in the panel
- Results shown in a transient banner (die result, modifier, crit/fumble highlighting, rolled-and-dropped die for adv/disadv)

**Chat mode bar**: toggles whether rolls are posted to campaign chat (public / private / off).

**Events sidebar (`RunnerDmTools.vue`):**

A 200px-wide panel on the right edge of the runner. Appears only when the encounter has events defined.

- Lists all events with name, trigger description, Fired/Pending badge
- Manual events and multi-fire events always show a ▶ fire button
- Auto-triggered events are greyed out after firing (if fire_once); they still show the button so the DM can force re-fire
- `checkEvents()` is called after every HP change and turn advancement; auto-triggers are evaluated against current state

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

**End / Abandon:**

- **End Combat**: confirms, cancels any pending HP debounce, ends the live state, syncs all player combatants' HP + conditions + curses + death saves back to `party_members`, resets the store, navigates to the encounter sheet.
- **Abandon**: ends live without syncing HP; useful when a combat didn't actually happen or was a mistake.

### Player View

Players see a live encounter panel in their portal. On mobile it renders as a full-page panel at `/play/encounter`; on tablet+ it lives in the layout sidebar (the same panel, just positioned differently by CSS).

**`PlayerEncounterPanel.vue`:**

- When no encounter is running: empty state with a message
- When live, but pre-combat (round 0): "Gathering Party…" lobby header
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

**Clicking a combatant** opens a lightbox:

- Monster: portrait + player notes widget (personal observations, stored per-player per-monster)
- NPC: portrait (if DM enabled it in NPC visibility settings), relationship badge, status dot, occupation, personal connection note (DM-written per PC), player notes widget, star rating (1–5 relevance)
- Player / Companion: party member lightbox (portrait, stats, conditions, etc.)

---

## Key Capabilities / USPs

1. **Unified initiative tracker and stat block browser in one panel.** Clicking any combatant instantly opens their full stat block in a resizable side panel without navigating away. Every ability score, save, skill, and action has a roll button. The DM never needs to look up a second window.

2. **Faction system with automatic colour coding.** Every combatant has a faction with a hex colour. The left border stripe gives a consistent visual grouping across the list. Custom factions support any alignment (e.g. "Town Guard", "Cultists of X", "Mind-Controlled Party Member").

3. **Three-level monster reveal system.** Hidden / Unseen / Revealed is per-combatant and controls what players see. Unseen gives players a "something is there" slot without naming the creature. Cycling to Revealed auto-discovers the monster in the player bestiary.

4. **Pre-scripted encounter events.** The event system handles common "boss phase" patterns without any mid-session fiddling. A phase-2 wave spawn (On Death → Spawn 4 Skeletons) or a timed reinforcement (Round 3 → Spawn Archers) is defined once at build time and fires automatically. Manual events serve as bookmarked DM prompts.

5. **Full boss fight support.** Lair actions appear at initiative 20 with one click per round. Legendary action pools reset automatically at turn start and are tracked with pip indicators in both the combatant list and the detail panel. Action costs parsed from stat block names.

6. **Wildshape overlay.** Beast form HP is tracked independently without touching real character stats. Overflow damage carries through to real HP on revert. The combatant portrait and AC switch to beast form display automatically.

7. **Live player sync via Supabase Realtime.** Players see the initiative order, active turn, HP bars, conditions, and turn indicators on their own device in real time. HP changes in the runner are debounced and written to `party_members`; changes made externally are pushed back in. No separate "sync" button needed.

8. **Bidirectional HP persistence.** Ending combat is a one-click operation that writes HP, conditions, curses, and death saves to all party members atomically. Nothing is lost if the DM closes the tab mid-combat — hydration from `encounter_states` restores the full live state on reload.

9. **Mid-combat spawn** — monsters or stat-block NPCs can be injected into the live initiative order at any time, with automatic initiative rolls and legendary action pool priming.

10. **Difficulty calculator integrated into the builder.** The DMG XP budget calculation (with count multiplier, party size adjustment, ally offset, and trap XP) runs live as the DM adds combatants. Visual threshold bars and an enemy breakdown table make it immediately clear whether a planned encounter is worth balancing differently.

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

type EventAction =
  | { type: "spawn_combatants"; spawns: SpawnDef[] }
  | { type: "broadcast_message"; message: string };

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
