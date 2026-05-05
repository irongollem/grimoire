---
title: Creating Custom Monsters
section: Bestiary
section_order: 5
order: 1
summary: Build a full D&D 5e stat block with the Monster Builder.
keywords: monster, create, stat block, builder, custom, cr, hp, ac, actions, legendary, spellcasting, template
---

Custom monsters are created in the **Monster Builder**. Click **New Monster** in the Bestiary toolbar or click the edit button on any existing custom monster. The builder is a full D&D 5e stat block editor.

## Basic identity

- **Name** — required.
- **Size** — Tiny, Small, Medium, Large, Huge, Gargantuan.
- **Monster Type** — the standard D&D type (Beast, Dragon, Undead, etc.).
- **Alignment** — nine standard alignments, plus Unaligned and Any.
- **Challenge Rating (CR)** — supports all standard CR values including fractions (1/8, 1/4, 1/2).
- **Habitat** — freeform text describing where this creature lives.
- **Source** — freeform attribution.
- **Tags** — freeform labels.
- **Portrait** — upload an image; use the focal-point control to set the crop centre.

## Combat stats

- **Armour Class** — a number.
- **HP** — either a fixed number or a dice expression (e.g. `12d8 + 36`). Both formats are accepted.
- **Speed** — walk, fly, swim, burrow, climb speeds.
- **Initiative bonus** — if the creature has a non-standard initiative.

## Ability scores

Enter values for STR, DEX, CON, INT, WIS, and CHA. Modifiers are computed automatically.

## Derived stats

- **Saving throw proficiencies** — add saves that use the proficiency bonus.
- **Skill proficiencies** — add skill bonuses (expertise is supported).
- **Senses** — darkvision, tremorsense, blindsight, etc.
- **Languages** — any languages the creature speaks or understands.
- **Damage resistances, immunities, vulnerabilities** — per damage type.
- **Condition immunities** — which conditions can't affect this creature.

## Trait sections

Traits, Actions, Bonus Actions, Reactions, Legendary Actions, Lair Actions, and Mythic Actions are all separate sections. Each section is a list of named entries. In each entry:

- **Name** — the action or trait name.
- **Description** — rich text. Use standard 5e notation for attack rolls (e.g. `+5 to hit, reach 5 ft., one target. Hit: 7 (1d8+3) piercing damage`).

The Encounter Runner parses attack and damage notation in descriptions to produce roll buttons — write them in standard format so rolls work during play.

## Spellcasting

Enable the **Spellcasting** section to add a spell list:

- **Spellcasting ability** — INT, WIS, or CHA.
- **Spell Save DC** and **Spell Attack Bonus** — enter values directly.
- **Spells by frequency** — At Will, 3/Day, 2/Day, 1/Day, and standard spell-slot levels. Add spells from your Spellbook to each frequency group.

## Legendary mechanics

Enter **Legendary Actions** in the Legendary Actions section. The runner automatically provides a **3-action pool** (5e default) for any monster with legendary actions, and resets the pool at the start of the monster's turn.

**Lair Actions** appear in the Lair Actions section. Enable lair actions on the Encounter detail to have the runner prompt you at initiative 20 each round.

## Stat block templates

The **Template** button (top of the builder) provides 12 pre-built SRD-style presets:

Goblin, Orc, Skeleton, Zombie, Wolf, Bear, Dragon (Young), Lich, Vampire, Giant, Troll, Basilisk.

Selecting a template pre-fills the full stat block — edit from there rather than starting from scratch.

## AI monster generator

Click **Generate** in the Bestiary toolbar to open the AI generator (requires an OpenAI API key in Campaign Settings). Enter a concept prompt and Grimoire produces a full stat block.

## Linking to NPCs

On the NPC sheet, the **Bestiary link** field lets you import a stat block from an existing monster entry — or promote an NPC with a stat block to a new Bestiary entry. This keeps monster data in sync between the NPC tracker and the compendium.
