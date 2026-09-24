---
title: Encounter Builder
section: Encounters & Bestiary
section_order: 5
order: 3
summary: Design encounters with combatants, factions, events, loot, traps, pre-placed tokens, and difficulty analysis.
keywords: encounter, builder, combatant, faction, event, loot, trap, difficulty, xp, cr, boss, legendary, lair, token, battlefield, generator, ai
---

The Encounter Builder is where you design a fight before you run it — who's in it, what happens automatically, what it's worth in loot, and how hard it actually is. Everything you set here carries straight into the live Encounter Runner. Find it at **Campaign → Encounters** in the sidebar (`/encounters`).

## Key ideas

| Term | Meaning |
| --- | --- |
| **Combatant** | A slot in the roster: a monster or an NPC, with a count and a faction. |
| **Faction** | A team. Combatants on hostile factions fight each other; the colour shows as a stripe in the runner. |
| **Event** | A trigger (when) plus one or more actions (what) — pre-scripted automation for the runner. |
| **Battlefield Setup** | Pre-placing enemy/NPC tokens on the battle map before combat starts, so the fight opens already arranged. |
| **Difficulty** | The DMG XP-budget calculation, run live as you build the roster. |

## Creating an encounter

Click **New Encounter** on the Encounters list, or **Generate** for an AI-drafted one (see below). A new encounter opens straight into the editor; an existing one opens on its read-only sheet — click **Edit** to change it.

### Details

- **ENCOUNTER NAME** — required.
- **DESCRIPTION** — rich text for scene-setting, terrain, and objectives.
- **LOCATION** — link to an Atlas location. This also decides which battle map the encounter can use — see [Encounter Map](#encounter-map-battle-map-fog-of-war).
- A quest this encounter belongs to shows as a **Part of Quest** card and links straight to it, once you've linked the encounter from the quest side.

### Party Members and Companions

Under **Party Members**, tick which party members are in this fight; their companions appear below a **Companions** divider. A brand-new encounter starts with every current party member and every companion already ticked — uncheck anyone who isn't present rather than building the roster from scratch. Each ticked member or companion gets its own faction dropdown, defaulting to **Players**.

### Combatants

Click **Add NPC** or **Add Monster** to open a search panel (placeholder "Search NPCs with a combat profile…" / "Search monsters…") and pick a creature. Each row you add gets:

- A count, with **+**/**−** buttons.
- A faction combobox.
- An optional custom name (placeholder "Custom name (optional)") — overrides the source name in the runner, e.g. "The Captain" instead of "Veteran".
- A hide-from-search toggle, and a remove button.

Add as many rows as you need — multiple rows can reference the same monster, useful for splitting one creature into different roles (e.g. one row of Goblins as archers, another as melee). Only NPCs with a stat block can be added here.

### Factions

Four factions exist by default:

| Faction | Colour |
| --- | --- |
| Players | Navy |
| Enemy | Red |
| Ally | Green |
| Neutral | Grey |

Click **Add Custom** to add your own, with a name and any colour. A faction's **Hostile to:** row lists which other factions it fights; a custom faction starts hostile to none until you say otherwise. Faction colour shows as a left-border stripe on every combatant row in the runner.

### Events

Click **Add** to script something that happens automatically or on demand. Each event needs a name, a **TRIGGER**, and an **ACTION**:

**Trigger** (exact dropdown options): **Round Start**, **HP Threshold**, **On Death**, **Manual Only**.

**Action** (exact dropdown options): **Spawn Combatants**, **Broadcast Message**. A third action type — an environment hazard that stays "in play" once it fires — exists in the runner, but you can't author one here; it only comes from the mid-fight Complication/Reinforcement generator described on the [Encounter Runner](#encounter-runner) page.

Two checkboxes per event:

- **Fire once** — the event won't repeat after it fires.
- **Show to players** — fired events appear as a narrative beat in the player's own encounter panel.

### Boss mechanics

- **Lair Actions** — toggle it on, then pick a **LAIR OWNER** from the combatant search (combatants whose stat block actually has lair actions are marked with a ★). Without an owner, the runner won't show the lair card. In the runner, the owner's lair actions appear at initiative 20 each round.
- **Legendary Actions** — no toggle needed. Any combatant whose monster entry has legendary actions automatically gets a pool the runner manages during the fight.

### Loot

- Linked vault items, each with quantity **+**/**−** and a **Drop to chat** button.
- Currency pools — a label (placeholder "Label (e.g. Iron Chest)…") plus PP/GP/EP/SP/CP amounts, and a **Drop** button to post the pool to chat (disabled while every coin value is 0).

Use **Add loot item…** or **Add currency pool** to add either.

### Traps & Hazards

Use **Add trap or hazard…** to link entries from your Dungeon Craft trap list. Each linked trap shows its quantity and can be removed; clicking a trap's name opens a preview of its trigger, save DC, and damage. Linked traps also count toward the Difficulty Analysis below and appear in the runner's DM Tools sidebar during the fight.

### Battlefield Setup

**Battlefield Setup** lets you place enemy and NPC tokens on the battle map before the fight ever goes live, so it opens already arranged rather than as a pile of unplaced tokens. It only becomes usable once the encounter's location has a battle map Grimoire can draw — either its own calibrated map, or (for a room) a calibrated map on its parent site. If it isn't ready yet, the panel tells you why (e.g. "This room's map isn't calibrated yet — calibrate it to enable placement.") instead of showing the canvas.

Once ready: drag any combatant's token to a cell on the map. Positions are saved with the encounter and used to seed the runner's starting layout for that combatant when combat begins. Party member tokens aren't pre-placed here — they're placed automatically into the encounter's room the first time you go live in the runner.

### Difficulty Analysis

Calculated live as you add combatants, and shown again on the read-only sheet:

1. Raw XP summed from every enemy's CR.
2. A count multiplier (1×–4×) based on how many enemies there are, adjusted up if the party has fewer than 3 members or down if it has more than 5.
3. Ally XP subtracted, at its own multiplier.
4. Trap/hazard XP added flat.
5. Net XP compared against the party's per-level thresholds.

Labels: **Trivial / Easy / Medium / Hard / Deadly / Legendary**, with a threshold bar and an enemy-by-enemy XP breakdown.

## Generating an encounter with AI

Click **Generate** on the Encounters list (not inside the builder itself) to open the generator panel. This needs a Pro subscription and your campaign's AI generation switched on (Campaign Settings → AI Assistant) — on Free, the same button opens an upgrade paywall instead of generating.

1. Describe the fight in **CONCEPT** — e.g. "Goblin ambush on the forest road, levels 3–5, a betrayal mid-fight".
2. Pick a **DIFFICULTY**: **Auto**, **Easy**, **Medium**, **Hard**, or **Deadly**.
3. Click **Generate with AI**.

Grimoire builds the encounter from your own campaign — your party's levels and classes, and a candidate list of monsters drawn from your homebrew and whichever sourcebooks you've enabled under Monster Sources (see [Bestiary — Overview](#bestiary-overview)) — never from a payload you'd have to trust blind.

Some creature names exist in more than one of your enabled sourcebooks with different stat blocks. When that happens, the row gets its own **Version** picker so you can see and change which stat block will actually be used, with a note explaining why. A creature the AI named that isn't in your Bestiary at all is listed separately under "Not in your Bestiary — add these manually" rather than silently dropped or faked.

Click **Create Encounter** and then **Open Encounter →** to jump straight into the editor — a generated encounter is meant to be treated as a draft, not a finished, ready-to-run fight.

## What your players see

Nothing. The builder is entirely DM-side; nothing here reaches a player until you run the encounter live — see [Encounter Runner](#encounter-runner).

## Tips

> A monster or trap picker here only shows creatures/traps scoped to General or your active campaign — the same rule as the Bestiary list. A combatant already on the roster still resolves correctly even if you later re-scope its source monster elsewhere.

- The Encounters list can filter to a specific quest or show only active (unfinished) encounters — use the filter and the **Active**/**All** toggle if your list is getting long.
- The AI generator's Difficulty control doesn't offer "Legendary" — that label can only appear on the calculated difficulty badge once the roster is actually built.

## Related

- [Bestiary — Overview](#bestiary-overview)
- [Creating Custom Monsters](#creating-custom-monsters)
- [Encounter Runner](#encounter-runner)
- [Encounter Map — Battle Map & Fog of War](#encounter-map-battle-map-fog-of-war)
