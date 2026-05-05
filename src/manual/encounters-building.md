---
title: Encounter Builder
section: Encounters
section_order: 7
order: 0
summary: Design encounters with combatants, factions, events, loot, traps, and difficulty analysis.
keywords: encounter, builder, combatant, faction, event, loot, trap, difficulty, xp, cr, boss, legendary
---

The Encounter Builder (`/encounters`) is where you design combat encounters before play. Every detail you set here carries into the live Encounter Runner.

## Creating an encounter

Click **New Encounter**. The editor has several sections — fill in what you need and leave the rest blank.

### Metadata

- **Name** — required.
- **Description** — rich text for scene-setting, terrain notes, and objectives.
- **Location** — link to an Atlas location.
- **Quest** — associate this encounter with a quest.

### Party and companions

Select which party members are participating. Companions associated with those members appear in a subsection. Each participant gets a **faction** assignment (which team they're on in combat).

### Combatants

The Combatants section defines your enemy and ally roster. Each slot has:

- **Monster or NPC** (mutually exclusive) — the combatant's stat block source.
- **Count** — how many instances of this creature appear.
- **Faction** — which faction this group belongs to.
- **Custom name** — override the source name (e.g. "The Captain" instead of "Veteran").

Add as many slots as you need. Multiple slots can reference the same monster — useful for grouping creatures by role (e.g. two slots of Goblin: one as archers, one as melee).

### Factions

Factions give combatants a colour-coded team identity. Four defaults exist:

| Faction | Colour |
| ------- | ------ |
| Players | Navy   |
| Enemy   | Red    |
| Ally    | Green  |
| Neutral | Grey   |

Add custom factions with any hex colour you like. Faction colours appear as a left-border stripe on combatant rows in the runner.

### Events (scripted automation)

Events let you pre-script things that happen during combat. Each event has a **trigger** and one or more **actions**.

**Trigger types:**

| Trigger        | When it fires                                            |
| -------------- | -------------------------------------------------------- |
| Round Start    | At the start of a specified round number                 |
| Combatant HP % | When a specific combatant drops to/below a HP percentage |
| Combatant Dies | When a specific combatant reaches 0 HP                   |
| Manual         | DM clicks the play button in the runner sidebar          |

**Action types:**

| Action            | What it does                                              |
| ----------------- | --------------------------------------------------------- |
| Spawn Combatants  | Adds N monsters from the bestiary to a faction mid-combat |
| Broadcast Message | Posts a message to the campaign chat                      |

**Fire Once toggle** — the event won't repeat after firing (prevents re-spawning when an HP threshold is crossed multiple times).

**Player visible** — whether players see the event name in their encounter panel when it fires.

### Boss mechanics

**Lair Actions** — enable and designate a lair owner. The runner will prompt you at initiative 20 each round to use lair actions from the owner's stat block.

**Legendary Actions** — automatically enabled for any combatant whose monster entry has a `legendary_actions` array. The runner manages the 3-action pool per turn.

### Loot

Pre-define the rewards for this encounter:

- **Items** — vault items with quantities and a "Drop to Chat" button.
- **Currency** — gold, silver, copper amounts.
- **Art Objects** — named art objects with GP value and optional image.

### Traps

Add trap references from your Dungeon Craft trap list. Traps appear in the runner's DM Tools sidebar during combat with their DC and damage dice visible.

### Difficulty Analysis

The Difficulty panel calculates encounter difficulty automatically:

1. Raw XP from all enemy CRs (using the standard XP table).
2. Multiplied by the multiple-monsters multiplier (1×–4× based on count, and adjusted up/down if the party is smaller or larger than 3–5).
3. Ally XP subtracted (at the same multiplier).
4. Trap/hazard XP added flat.
5. Net XP compared to the party's per-level thresholds.

**Difficulty labels:** Trivial / Easy / Medium / Hard / Deadly / Legendary.

A bar visualisation shows where net XP falls across the five thresholds.
