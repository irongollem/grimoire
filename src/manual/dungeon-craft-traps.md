---
title: Dungeon Craft — Traps
section: Dungeon Craft
section_order: 8
order: 1
summary: Create mechanical and magical traps with damage, saves, DCs, and CR balancing.
keywords: trap, traps, dc, damage, save, cr, mechanical, magical, trigger, detect, disarm
---

Traps in Grimoire are fully defined mechanical entries that can be linked to encounters and appear in the runner's DM sidebar during combat.

## Trap types

- **Mechanical** — physical devices: blades, arrows, falling blocks, pit traps.
- **Magical** — spell-powered traps: glyphs of warding, explosive runes.
- **Hybrid** — mechanical trigger with magical effect (e.g. a pressure plate that summons fire).
- **Environmental** — hazards that aren't strictly "traps" but work the same mechanically: lava floors, antimagic zones, vacuum chambers.

## Core fields

**Identity:**
- **Name** — required.
- **Type** — one of the four above.
- **CR** — Challenge Rating (supports fractions). Drives XP calculation in encounter difficulty.
- **Tags** — freeform labels.
- **Description** — rich text narrative description.
- **DM Notes** — private notes for yourself.
- **Image** — optional art.

**Trigger:**
- **Trigger type** — Tripwire, Pressure Plate, Proximity, Visual, Sound, Magic Sensor, Manual, or Other.
- **Detection DC** — Perception check to notice the trap.
- **Disarm DC** — Thieves' Tools (or other skill) check to safely disarm.
- **Trap HP** — hit points the trap has if it can be physically destroyed.
- **Trap AC** — armour class for that same purpose.
- **Damage immunities** — damage types the trap is immune to.
- **Reset** — None (one use), Automatic (resets each round), or Manual (someone has to reset it).

**Effect:**
- **Effect description** — what happens when the trap triggers.
- **Attack bonus** — if the trap makes a ranged or melee attack (e.g. crossbow bolt).
- **Save type** — the saving throw victims make (STR through CHA).
- **Save DC** — the difficulty class of that save.
- **Damage entries** — one or more dice expressions with damage types (e.g. `3d6 fire`, `2d8 piercing`). Multiple entries support secondary effects like ongoing poison.

## CR Advisor

Click **CR Advisor** to open a guided calculator. Answer five questions:

1. **Primary effect** — Damage, Condition, Terrain, Alarm, or Death.
2. **Damage dice** (if Damage) — how many dice and what size.
3. **Area of Effect** — Single target, Small (≤3), or Large (4+).
4. **DC Difficulty** — Low (≤13), Moderate (14–16), High (17–19), or Extreme (20+).
5. **Secondary effect** — None, Minor condition, Major condition (stunned/paralysed), Ongoing, or Barrier/split party.

The advisor outputs a suggested CR with a range, the contributing factors, and five comparable example traps for reference. Click **Use CR X** to accept the suggestion and close the dialog.

## Linking traps to encounters

In any encounter's **Traps** section, add references to your trap entries. During the live encounter runner, these traps appear in the **DM Tools sidebar** with their type, DC, and damage dice visible at a glance — no need to remember the details during a fast-paced session.

## Populate Examples

Click **Populate Examples** to seed ~40 pre-built trap entries covering all four types and a range of CRs. Use them as-is or as reference templates.
