---
title: Creating Custom Monsters
section: Encounters & Bestiary
section_order: 5
order: 1
summary: Build a full D&D 5e stat block by hand, or generate one with AI.
keywords: monster, create, stat block, builder, custom, cr, hp, ac, actions, legendary, lair, spellcasting, generator, ai, scope, duplicate, copy
---

The Monster Builder is a full D&D 5e stat block editor — everything from ability scores to legendary actions, with roll buttons wired up for the Encounter Runner. Open it by clicking **New Monster** in the Bestiary toolbar (**Compendium → Bestiary**, `/monsters`), or by opening any existing custom monster and clicking **Edit**.

## Key ideas

| Term | Meaning |
| --- | --- |
| **Scope** | Whether this monster is available in every campaign you run, or only the active one. |
| **Legendary action pool** | A budget of actions (5e default: 3) the runner automatically gives a legendary creature each round, spent by cost parsed from the action's name. |
| **Lair actions** | A list on the stat block that only does anything once you also enable lair actions on an *encounter* (see [Encounter Builder](#encounter-builder)). |
| **Frequency groups** | How a monster's spell list is organized: At Will, 3/Day, 2/Day, 1/Day, or a standard spell-slot level. |

## Basic identity

- **Name** — required.
- **Type** — the standard D&D creature type.
- **Size** — Tiny through Gargantuan.
- **Alignment**.
- **Source** — freeform attribution text.
- **Scope** — a two-option control: **General — all campaigns**, or **Campaign — _{active campaign name}_**.
- **Habitat** — freeform text describing where the creature lives.
- **Lair Location** — an optional link to an Atlas location; pick it from the combobox to mark that place as this monster's lair.
- **Portrait** — upload an image and set its focal point.

## Combat statistics

- **Challenge Rating (CR)** — supports fractional values (1/8, 1/4, 1/2) as well as whole numbers.
- **Armor Class**.
- **Hit Points** — a fixed number or a dice expression (e.g. `12d8 + 36`).
- **Proficiency Bonus**.
- **Initiative** — leave blank to use the creature's DEX modifier; set a number here only to override it with a fixed 2024-style initiative bonus.
- **Speed** — walk, fly, swim, burrow, and climb, each independently.

## Ability scores

Enter STR, DEX, CON, INT, WIS, and CHA. Modifiers are computed automatically.

## Proficiencies, senses & damage

- **Saving Throws** and **Skills** — proficiencies with their own bonus.
- **Damage Vulnerabilities**, **Damage Resistances**, **Damage Immunities** — per damage type.
- **Condition Immunities**.
- **Senses** — darkvision, tremorsense, blindsight, and so on.
- **Languages**.

## Traits, actions & reactions

Special Abilities, Actions, Bonus Actions, and Reactions are each a list of named entries — a **Name** and a rich-text **Description**.

Write attack and damage text in standard 5e notation, e.g. `+5 to hit, reach 5 ft., one target. Hit: 7 (1d8+3) piercing damage`. The Encounter Runner parses this to produce clickable attack and damage roll buttons during combat — free-form phrasing won't parse.

## Legendary and lair mechanics

- **Legendary Resistance** — how many uses per day this creature has.
- **Legendary Actions** — a list of named entries. Give an action a name like "Costs 2 Actions" and the runner reads that cost automatically. As soon as a monster has any legendary actions, the runner gives it a pool of 3 each round (5e default) with no separate toggle, and refills the pool at the start of its turn.
- **Lair Actions** — a list of named entries. They only fire in the runner once an *encounter* has lair actions enabled and this monster is set as the lair owner there — see [Encounter Builder](#encounter-builder).

## Spellcasting

Enable the Spellcasting section to set a spellcasting ability (INT, WIS, or CHA), a Spell Save DC, a Spell Attack Bonus, and a spell list organized by frequency group (At Will, 3/Day, 2/Day, 1/Day, or a standard slot level).

## Generating a monster with AI

1. Click **Generate** — in the Bestiary toolbar, or inside the Monster Builder itself.
2. Describe the creature you want in the **Concept** field.
3. Grimoire returns a full stat block you can save as-is or keep editing.

This needs the active campaign's AI switched on (Campaign Settings) and enough credits to cover the cost — with AI off, only **New Blank Monster** is offered.

When it's available, the button shows its cost in credits before you confirm — or, if you've set your own API key for this campaign, it shows that you're using your own key and nothing will be charged.

## Duplicating and copying a monster

- **Duplicate** (on the monster's own page) makes an independent copy in the same campaign.
- **Copy to campaign…** (from the monster's own overflow menu, or from the Bestiary list's bulk action bar after selecting several monsters) copies the monster into another campaign you DM.

## Tips

> Shared monsters — SRD or library — can't be edited directly; their Edit button doesn't appear at all. Duplicate one, or start fresh, to make your own version.

- Roll buttons in the Encounter Runner depend entirely on the standard-notation text described above — a description that doesn't follow that pattern still displays fine, it just won't get a roll button.
- Re-scoping a monster only changes who can find it in pickers from then on; encounters, loot tables and quests that already reference it keep working.

## Related

- [Bestiary — Overview](#bestiary-overview)
- [Monster Discovery](#monster-discovery)
- [Encounter Builder](#encounter-builder)
- [AI Generation & Credits](#ai-generation-credits)
