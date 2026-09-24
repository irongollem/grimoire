---
title: Dungeon Craft — Traps
section: Dungeon Craft
section_order: 9
order: 1
summary: Create mechanical and magical traps with damage, saves, DCs, CR balancing, and an AI generator.
keywords: trap, traps, dc, damage, save, cr, mechanical, magical, trigger, detect, disarm, generate, ai, glyph, placed in
---

Traps in Grimoire are fully defined mechanical entries that can be linked to encounters, dropped into rooms on your Atlas sites, and appear in the runner's DM sidebar during combat. Find them under **Compendium → Dungeon Craft**, the **Traproom** tab.

## Key ideas

| Term | Meaning |
| --- | --- |
| Trap type | Mechanical, Magical, Hybrid, or Environmental — what kind of hazard this is |
| Glyph | How the trap draws as an icon on a Cartographer map, independent of its type |
| Scope | General (every campaign) or one specific campaign |
| Placed In | The rooms this trap has been dropped into on your Atlas sites |

## Browsing and filtering

The Traproom tab has a search box and a type filter; both persist as you navigate into a trap and back. A **Clear** button appears once a filter is active. The list shows general traps plus your active campaign's own — there's no "show all campaigns" override.

## Trap types

- **Mechanical** — physical devices: blades, arrows, falling blocks, pit traps.
- **Magical** — spell-powered traps: glyphs of warding, explosive runes.
- **Hybrid** — mechanical trigger with magical effect (e.g. a pressure plate that summons fire).
- **Environmental** — hazards that aren't strictly "traps" but work the same mechanically: lava floors, antimagic zones, vacuum chambers.

## Creating a trap

Click **New Trap**. The editor has several sections:

**Identity:**

- **Name** — required.
- **Type** — one of the four above.
- **CR** — Challenge Rating, 0 through 30 including fractions. Drives XP calculation in encounter difficulty.
- **How it draws on the map** — a **Glyph** picker: Pit, Pressure Plate, Tripwire, Falling Block, Dart Wall, Blade, Flame Jet, Glyph / Rune, Net, Alarm, Collapsing Floor, or leave it as the default **Generic hazard marker**. This controls the icon a Cartographer map shows wherever this trap is linked to a cell — it's a drawing hint, separate from the mechanical **Type** above, and changing it updates every map the trap appears on immediately.
- **Tags** — freeform labels.
- **Description** — rich text narrative description.
- **DM Notes** — private notes for yourself.
- **Image** — optional art.
- **Scope** — **General — all campaigns** or **Campaign — _your campaign's name_**. New traps default to your active campaign; switch to General to make one available everywhere.

**Trigger:**

- **Trigger type** — Tripwire, Pressure Plate, Proximity, Visual, Sound, Magic Sensor, Manual, or Other.
- **Detection DC** — Perception check to notice the trap.
- **Disarm DC** — Thieves' Tools (or other skill) check to safely disarm.
- **Trap HP** — hit points the trap has if it can be physically destroyed.
- **Trap AC** — armour class for that same purpose.
- **Damage immunities** — damage types the trap is immune to (defaults to poison and psychic).
- **Reset** — None (one use), Automatic (resets each round), or Manual (someone has to reset it).

**Effect:**

- **Effect description** — what happens when the trap triggers.
- **Attack bonus** — if the trap makes a ranged or melee attack (e.g. crossbow bolt).
- **Save type** — the saving throw victims make (STR through CHA).
- **Save DC** — the difficulty class of that save.
- **Damage entries** — one or more dice expressions with damage types (e.g. `3d6 fire`, `2d8 piercing`). Multiple entries support secondary effects like ongoing poison.

## CR Advisor

Click **Suggest** next to the CR field to open a guided calculator. Answer five questions:

1. **Primary effect** — Damage, Condition, Terrain, Alarm, or Death.
2. **Damage dice** (if Damage) — how many dice and what size.
3. **Area of Effect** — Single target, Small (≤3), or Large (4+).
4. **DC Difficulty** (highest of detection / save) — Low (≤12), Moderate (13–16), High (17–20), or Extreme (21+).
5. **Secondary effect** — None, Minor condition, Major condition (stunned/paralysed), Ongoing, or Barrier/split party.

The advisor outputs a suggested CR with a range, the contributing factors, and comparable example traps for reference. Click **Use CR X** to accept the suggestion and close the dialog.

## AI trap generator

Click **Generate** to open the Trap Generator panel. This needs a Pro subscription and your campaign's AI generation switched on (Campaign Settings → AI Assistant) — on Free, the button opens the upgrade paywall instead; click **New Blank Trap** to skip AI entirely.

1. Write a **Concept** — what the trap is and does, in plain language (e.g. "a pressure plate in a dungeon corridor that triggers a volley of poisoned darts from hidden alcoves in the walls…").
2. Optionally narrow **Type** and **CR** under Constraints.
3. Toggle **Generate trap illustration**; if your campaign has an OpenAI key and a group portrait, an **Add party to scene** toggle also appears.
4. The credit cost (or **Balance** if you're short) shows above the button. Click **Generate with AI**.

The generator fills in type, DCs, damage, save, effect description, and (if requested) an illustration, then opens the new trap's page. It doesn't suggest a map glyph — pick one yourself in the editor afterward, or leave it as the generic marker.

## Linking traps to encounters

In any encounter's **Traps** section, add references to your trap entries. During the live encounter runner, these traps appear in the **DM Tools sidebar** with their type, DC, and damage dice visible at a glance — no need to remember the details during a fast-paced session.

## Placing a trap in your world

A trap's own page has a **Placed In** panel showing every room it's dropped into across your Atlas sites, each with an editable note ("triggers the portcullis at the far end") and a remove button. Use the picker at the bottom to drop the trap into a new location directly from here, without navigating to that room first. The same trap can be placed in several rooms — it's a reusable template, not a single-use instance. See [Sites — Maps, Rooms & Running a Dungeon](#sites-maps-rooms-running-a-dungeon) for the room-side view, and for how publishing a Cartographer drawing can place a linked trap automatically.

## Moving a trap between campaigns

From the trap's own editor, **Copy to campaign…** makes an independent copy in another campaign you DM. From the Traproom tab, click **Select** to multi-select traps, then **Move** or **Copy** them as a batch.

## Populate Examples

Click **Populate Traproom** to seed ~40 pre-built trap entries covering all four types and a range of CRs. Use them as-is or as reference templates.

## Related

- [Dungeon Craft — Overview](#dungeon-craft-overview)
- [Encounter Builder](#encounter-builder)
- [Encounter Runner](#encounter-runner)
- [Sites — Maps, Rooms & Running a Dungeon](#sites-maps-rooms-running-a-dungeon)
- [Cartographer — Overview](#cartographer-overview)
