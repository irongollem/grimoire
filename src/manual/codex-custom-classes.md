---
title: Creating Custom Classes
section: Character Codex
section_order: 9
order: 1
summary: Design homebrew classes with spellcasting, resource pools, wizard steps, and level features.
keywords: class, custom class, homebrew, spellcasting, resource pool, hit die, level, archetype, subclass, oath spells, domain spells, granted spells, ability score, wizard step
---

Custom classes let you design entirely new character classes from the ground up — with full spellcasting, resource pools, and level-up prompts.

## Opening the class editor

Go to **Codex → Classes** and click **New Custom Class**. The editor is split into several sections.

## Identity

- **Name** — required (e.g. "Bloodweaver", "Artificer", "Warden").
- **Hit Die** — d6, d8, d10, or d12.
- **Primary Ability** — the main ability score this class scales from (for flavour and references).
- **Subclass at Level** — which level the character chooses their archetype (typically 1–3).
- **Campaign Scope** — whether this class appears only in the current campaign or across all your campaigns.

## Proficiencies

- **Saving Throw Proficiencies** — check two saves (PHB standard).
- **Armor Tags** — freeform tags matching item armor tags (e.g. `light`, `medium`, `heavy`, `shield`).
- **Weapon Tags** — freeform tags (e.g. `simple`, `martial`, `firearms`).

The tag system links proficiencies to item vault entries automatically — items tagged `light` are considered proficient for characters with the `light` armor proficiency.

## Features per Level

For each class level (1–20), add one or more **abilities** from the Abilities tab. Type the ability name in the search box and click to assign. A chip appears on that level.

This drives what appears in the player's **Features** tab on their character sheet.

## Ability Score Increase levels

The ASI levels default to 4, 8, 12, 16, 19 (PHB standard). Adjust them to match your homebrew design.

## Spellcasting

Toggle **Has Spellcasting** on to reveal the spellcasting configuration:

- **Caster Type** — Prepared (like Cleric/Druid), Spellbook (like Wizard), or Known (like Sorcerer/Bard).
- **Slot Recovery** — Long Rest or Short Rest.
- **Spells Known table** — whether the class has a level-based "spells known" count.
- **Cantrips Known table** — whether the class tracks cantrips known per level.
- **Prepared Ability** — WIS, INT, or CHA.
- **Prepared Spell Scaling** — Full level (Cleric-style) or Half level (Paladin-style).
- **Spell Slot Grid** — a 20×9 grid. Enter how many slots of each level the class has at each character level. Leave cells blank for levels where no slots exist.

## Wizard Steps (level-up prompts)

**Wizard Steps** are prompts that appear during character level-up to guide player choices. Each step has:

- **Level** — which character level triggers this prompt.
- **Type** — Pick One (player chooses a single option) or Accumulate (player collects options across levels).
- **Options Source** — where the options come from:
  - _Abilities_ — picks from the Abilities tab (filtered by type).
  - _Spellbook_ — picks from the campaign's Spellbook.
  - _Custom_ — a fixed list you write manually.
- **Key** — internal identifier (e.g. `fighting_style`, `maneuver`).
- **Label** — displayed to the player (e.g. "Choose a Fighting Style").
- **Description** — context shown to the player during the prompt.

Example: A Fighter class might have a Wizard Step at level 1 with options source "Abilities" filtered by type "Fighting Style". The player picks one and it's stored on their character.

## Resource Pools

Pools track expendable resources — Ki points, Sorcery Points, Superiority Dice, Lay on Hands HP, etc. Each pool has:

- **Key** — internal identifier (e.g. `ki`, `superiority_dice`).
- **Label** — shown on the character sheet (e.g. "Ki Points").
- **Recharges On** — Short Rest, Long Rest, or both.
- **Scaling** —
  - _Fixed_: always the same value.
  - _Per Level_: multiplied by character level (e.g. 1× = "equal to your level").
  - _Custom Table_: a 20-row table mapping each level to a specific pool size.

Pools appear in the **Combat** tab of the player's character sheet with +/− controls.

## Archetypes (Subclasses)

Archetypes are subclasses — Oaths, Domains, Circles, Martial Archetypes, and so on. They attach to a base class (one of the 13 SRD classes **or** a custom class) and add their own features and spells from the subclass-granting level onward. Open the **Archetypes** tab and click **New Archetype** to build one from scratch, **Import from Open5e** to bulk-import SRD archetypes (their features are linked automatically), or **Load example** for a fully-worked demo to edit.

Each archetype editor has these sections:

- **Base Class** — which class this archetype belongs to (e.g. Paladin).
- **Description** — flavour text, with the full rich-text editor (headings, lists, tables).
- **Campaign Scope** — this campaign only, or all your campaigns.

### Subclass Features per Level

Same as class features: for each level, pick **abilities** from the Abilities tab. These appear in the player's **Features** tab. For an Oath of the Ancients paladin you'd add, at level 3: _Oath Spells_, _Channel Divinity: Nature's Wrath_, and _Channel Divinity: Turn the Faithless_.

### Granted Spells per Level

This is how you model **oath spells, cleric domain spells, and druid circle spells** — spells the subclass grants automatically. Add a level, then pick the spells gained at that level from the **SRD or your own custom spells**.

Granted spells are **always prepared** and **do not count toward the character's prepared-spell limit**. On level-up they're added to the character automatically and shown with a locked **"Granted"** badge — players can't unprepare or remove them.

Worked example — **Oath of the Ancients** oath spells:

- **3** — Ensnaring Strike, Speak with Animals
- **5** — Misty Step, Moonbeam
- **9** — Plant Growth, Protection from Energy
- **13** — Ice Storm, Stoneskin
- **17** — Commune with Nature, Tree Stride

> If a granted spell isn't in the SRD (e.g. Ensnaring Strike), create it first as a **custom spell** (see _Creating Spells_), then pick it here. Custom spells live in your own account, so book-only content stays private to your campaign.

### Wizard Steps & Resource Pools

Archetypes support the same **Wizard Steps** (level-up choices) and **Resource Pools** as classes. A Channel Divinity pool, for instance, can be tracked as a resource that recharges on a short or long rest.
