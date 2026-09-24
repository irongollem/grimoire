---
title: Creating Custom Classes
section: Characters
section_order: 11
order: 1
summary: Design homebrew classes with spellcasting, resource pools, wizard steps, and level features.
keywords: class, custom class, homebrew, spellcasting, resource pool, hit die, level, archetype, subclass, oath spells, domain spells, granted spells, ability score, wizard step
---

Custom classes let you design entirely new character classes from the ground up — with full spellcasting, resource pools, and level-up prompts — for your players to pick during character creation.

## Opening the class editor

Go to **Character Codex → Classes** and click **New Class** (or open an existing custom class and click **Edit**). The editor is split into several sections; a read-only summary sheet is shown until you click Edit.

## Identity

- **Class Name** — the class's name. **Create** stays disabled until you give it one.
- **Hit Die** — d6, d8, d10, or d12.
- **Primary Ability** — free text describing the main ability score this class scales from (e.g. "Strength or Dexterity").
- **Subclass-Granting Level** — which level the character chooses their archetype (typically 1–3).
- **Campaign Scope** — the current campaign, or **All my campaigns**.

## Proficiencies

- **Saving Throws** — check the proficient saves (STR/DEX/CON/INT/WIS/CHA).
- **Armor Proficiencies** — freeform tags (e.g. `Light armor`, `Shields`).
- **Weapon Proficiencies** — freeform tags (e.g. `Simple weapons`, `Firearms`).

## Features per Level

For each class level (1–20), add one or more **abilities** from the Abilities compendium. Type the ability name in the search box and click to assign it. This drives what appears on the player's character sheet **Features** tab once they reach that level.

## Ability Score Increase levels

Defaults to 4, 8, 12, 16, 19 (PHB standard). Pick a level from the dropdown and click **Add Ability Score Increase level**; click the **×** on a level chip to remove it.

## Spellcasting

Toggle the **Spellcasting** switch on to reveal the configuration:

- **Caster Type** — Prepared (Cleric, Druid), Spellbook (Wizard), or Known (Bard, Sorcerer, Warlock).
- **Slot Recovery** — Long rest or Short rest.
- **Spells Known Table** — check to track a level-based "spells known" count (Known casters).
- **Cantrips Known Table** — check to track cantrips known per level.
- **Prepared Spell Ability** — WIS, INT, or CHA (Prepared/Spellbook casters only).
- **Prepared Spell Scaling** — Full level (Cleric, Druid, Wizard) or Half level (Paladin, Artificer).
- **Spell slot grid** — a 20-row × 9-column table. Enter how many slots of each level the class has at each character level; leave a cell at 0 where no slots exist.

## Wizard Steps (level-up prompts)

**Wizard Steps** are prompts shown to the player during level-up. Click **Add step**; each one has:

- **Level** — which character level triggers the prompt.
- **Type** — **Pick one** (a single choice) or **Accumulate** (options collect across levels).
- **Options from** — **Abilities compendium**, **Spellbook**, or **Custom text**.
- **Key** — a short internal name for the step (not shown to players; e.g. "fighting-style") — pick something you'll recognise if you ever have to look at it again.
- **Label** and **Description** — shown to the player when the prompt appears.

Example: a Fighter class might have a step at level 1 with options from the Abilities compendium, filtered to type Fighting Style — the player picks one and it's saved to their character.

## Resource Pools

Click **Add resource** to track expendable resources — Ki points, Sorcery Points, Superiority Dice, and similar. Each pool has:

- **Key** — a short internal name for the resource (not shown to players; e.g. "ki").
- **Label** — shown on the character sheet (e.g. "Ki Points").
- **Recharges On** — Short Rest or Long Rest.
- **Scaling** — Fixed value, Per class level, or Custom table (20 values, one per character level).

Pools appear on the player's character sheet **Combat** tab with +/− controls.

## Archetypes (Subclasses)

Archetypes are subclasses — Oaths, Domains, Circles, Martial Archetypes, and so on. They attach to a base class (one of the SRD classes or a custom class) and add their own features (and, for casters, granted spells) from the subclass-granting level onward.

Open **Character Codex → Archetypes** and click **New Archetype**. When the list is empty you'll also see **Import from Open5e** (bulk-imports SRD subclasses with their features linked automatically) and **Load example** (a fully-worked demo archetype to edit) as empty-state options.

The archetype editor has:

- **Archetype Name** — the archetype's name. **Create** stays disabled until you give it one.
- **Description** — flavour text, full rich-text editor.
- **Base Class** — which class this archetype belongs to.
- **Campaign Scope** — this campaign, or all your campaigns.

### Subclass Features per Level

Same as class features — for each level, pick **abilities** from the Abilities compendium. These appear on the player's **Features** tab. For an Oath of the Ancients paladin you might add, at level 3: _Oath Spells_, _Channel Divinity: Nature's Wrath_, and _Channel Divinity: Turn the Faithless_.

### Granted Spells per Level

This is how you model **oath spells, cleric domain spells, and druid circle spells** — spells the subclass grants automatically. Pick a level, then use **Add spell…** to pick a spell from the shared spell library or your own custom spells for that level.

Granted spells are **always prepared** and **do not count toward the character's prepared-spell limit**. On level-up they're added to the character automatically and shown with a locked "Granted" badge — players can't unprepare or remove them.

Worked example — **Oath of the Ancients** oath spells:

- **3** — Ensnaring Strike, Speak with Animals
- **5** — Misty Step, Moonbeam
- **9** — Plant Growth, Protection from Energy
- **13** — Ice Storm, Stoneskin
- **17** — Commune with Nature, Tree Stride

> If a granted spell isn't in the shared spell library, create it first as a custom spell (Spellbook), then pick it here. Custom spells live in your own account, so book-only content stays private to your campaign.

### Wizard Steps & Resource Pools

Archetypes support the same **Wizard Steps** and **Resource Pools** as classes — a Channel Divinity pool, for instance, can recharge on a short or long rest.

## What your players see

Custom classes and archetypes surface automatically wherever a player builds or levels a character: the class/archetype picker during character creation, the level-up wizard's steps and features, resource pools and spell slots on the **Combat** tab, and granted spells with a locked badge on the **Spells** tab. A player never sees the editor — only the finished result.

## Tips

- Custom classes/archetypes are never blocklisted by the per-campaign content gate (unlike SRD classes, which can be disabled) — they're already campaign-scoped by design.
- A re-import from Open5e only touches the fields Open5e actually supplies; hand-tuned mechanics (spell slots, resource pools, wizard steps) are never overwritten by a re-sync.

## Related

- [Character Codex — Overview](#character-codex-overview)
- [Species and Backgrounds](#species-and-backgrounds)
- [Abilities Compendium](#abilities-compendium)
