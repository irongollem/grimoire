---
title: Creating Custom Classes
section: Characters
section_order: 11
order: 1
summary: Design homebrew classes with spellcasting and level features, and subclasses that add their own.
keywords: class, custom class, homebrew, spellcasting, hit die, level, archetype, subclass, oath spells, domain spells, granted spells, ability score improvement, features per level
---

Custom classes let you design entirely new character classes from the ground up, with full spellcasting and a feature at every level you choose, for your players to pick during character creation.

## Opening the class editor

Go to **Character Codex → Classes** and click **New Class** (or open an existing custom class and click **Edit**). The editor is split into several sections; a read-only summary sheet is shown until you click Edit.

## Generating a class with AI

If AI is switched on for your campaign, **Character Codex → Classes** also has a **Generate** button. Describe the class in a few sentences, and optionally pick a hit die or a spellcasting style (full, half, third or pact). Grimoire designs a whole class from levels 1 to 20 and, before it writes anything, shows you what it is about to create: the class name, hit die, saving throws, spellcasting, and how many abilities it has at each stretch of levels. A resource the AI invents (such as a pool of charges) becomes an ability with its own uses, so it shows on the character sheet like any other. Choose **Create** to save it, or **Back** to change your idea.

A few things are not left to the AI. The spell slot table is always built from the published full, half, third or pact caster tables, so a generated caster is never stronger than a book caster. The official Ability Score Improvement ability is placed at the usual levels (4, 8, 12, 16 and 19), and the subclass level follows your campaign's edition (level 3 in the 2024 rules, level 1 to 3 in the 2014 rules). Each ability is saved as its own entry in **Character Codex → Abilities**, so you can edit them one by one.

The generator reads your campaign setting and your ruleset, and each generation costs credits (the cost is shown on the button). Once you edit a generated class, it is marked as edited.

## Identity

- **Class Name**: the class's name. **Create** stays disabled until you give it one.
- **Hit Die**: d6, d8, d10, or d12.
- **Primary Ability**: free text describing the main ability score this class scales from (e.g. "Strength or Dexterity").
- **Subclass-Granting Level**: which level the character chooses their archetype (typically 1–3).
- **Campaign Scope**: the current campaign, or **All my campaigns**.

## Proficiencies

- **Saving Throws**: check the proficient saves (STR/DEX/CON/INT/WIS/CHA).
- **Armor Proficiencies**: freeform tags (e.g. `Light armor`, `Shields`).
- **Weapon Proficiencies**: freeform tags (e.g. `Simple weapons`, `Firearms`).

## Features per Level

For each class level (1–20), add one or more **abilities** from the Abilities compendium. Type the ability name in the search box and click to assign it. This drives what appears on the player's character sheet **Features** tab once they reach that level.

### Ability Score Improvement

Ability Score Improvement is an ability like any other: the official **Ability Score Improvement** ability, granted at the levels you choose. Under **Features per Level**, click **Add Ability Score Improvement at levels…**, tick the levels (4, 8, 12, 16 and 19 are ticked to start), and click **Add**. A level that already has it is left alone. To remove one, take the ability off that level with the **×** on its chip. If the button says the official ability is missing, it has not been loaded for your campaign's edition yet.

### Uses, choices and scaling

A class no longer has separate lists of resource pools or level-up prompts. What an ability does (its uses and when they come back, a table that grows with level, a pick at level-up such as a fighting style or expertise) is set on the ability itself, under **Mechanics** in [Abilities Compendium](#abilities-compendium). Create or edit the ability there, then assign it to a level here.

## Spellcasting

Toggle the **Spellcasting** switch on to reveal the configuration:

- **Caster Type**: Prepared (Cleric, Druid), Spellbook (Wizard), or Known (Bard, Sorcerer, Warlock).
- **Slot Recovery**: Long rest or Short rest.
- **Spells Known Table**: check to track a level-based "spells known" count (Known casters).
- **Cantrips Known Table**: check to track cantrips known per level.
- **Prepared Spell Ability**: WIS, INT, or CHA (Prepared/Spellbook casters only).
- **Prepared Spell Scaling**: Full level (Cleric, Druid, Wizard) or Half level (Paladin, Artificer).
- **Spell slot grid**: a 20-row × 9-column table. Enter how many slots of each level the class has at each character level; leave a cell at 0 where no slots exist.

## Archetypes (Subclasses)

Archetypes are subclasses: Oaths, Domains, Circles, Martial Archetypes, and so on. They attach to a base class (one of the SRD classes or a custom class) and add their own features (and, for casters, granted spells) from the subclass-granting level onward.

Open **Character Codex → Archetypes** and click **New Archetype**. The official subclasses (the SRD ones and those of the other open books) come with the app and are listed already; you can read them but not edit them. When the list is empty you'll also see **Load example** (a fully-worked demo archetype to edit).

The archetype editor has:

- **Archetype Name**: the archetype's name. **Create** stays disabled until you give it one.
- **Description**: flavour text, full rich-text editor.
- **Base Class**: which class this archetype belongs to.
- **Campaign Scope**: this campaign, or all your campaigns.

### Generating an archetype with AI

If AI is switched on for your campaign, **Character Codex → Archetypes** also has a **Generate** button. First pick the base class (required, because the archetype's features arrive at that class's subclass levels), then describe the archetype. Grimoire writes the description and the abilities, shows you a short summary, and saves everything when you choose **Create**. Each ability becomes its own entry in the Abilities compendium. Generating costs credits and reads your campaign setting and ruleset.

### Subclass Features per Level

Same as class features: for each level, pick **abilities** from the Abilities compendium. These appear on the player's **Features** tab. For an Oath of the Ancients paladin you might add, at level 3: *Oath Spells*, *Channel Divinity: Nature's Wrath*, and *Channel Divinity: Turn the Faithless*.

### Granted Spells per Level

This is how you model **oath spells, cleric domain spells, and druid circle spells**: spells the subclass grants automatically. Pick a level, then use **Add spell…** to pick a spell from the shared spell library or your own custom spells for that level.

Granted spells are **always prepared** and **do not count toward the character's prepared-spell limit**. On level-up they're added to the character automatically and shown with a locked "Granted" badge: players can't unprepare or remove them.

Worked example: **Oath of the Ancients** oath spells:

- **3**: Ensnaring Strike, Speak with Animals
- **5**: Misty Step, Moonbeam
- **9**: Plant Growth, Protection from Energy
- **13**: Ice Storm, Stoneskin
- **17**: Commune with Nature, Tree Stride

> If a granted spell isn't in the shared spell library, create it first as a custom spell (Spellbook), then pick it here. Custom spells live in your own account, so book-only content stays private to your campaign.

## What your players see

Custom classes and archetypes surface automatically wherever a player builds or levels a character: the class/archetype picker during character creation, the level-up wizard's choices and features, uses and spell slots on the **Combat** tab, and granted spells with a locked badge on the **Spells** tab. A player never sees the editor, only the finished result.

## Tips

- Custom classes/archetypes are never blocklisted by the per-campaign content gate (unlike SRD classes, which can be disabled): they're already campaign-scoped by design.
- To change an official class or archetype, make your own: open it and use **Duplicate** where offered, or build a new one with the same features. Official content is the same for every table and only the app's admin updates it.

## Related

- [Character Codex: Overview](#character-codex-overview)
- [Species and Backgrounds](#species-and-backgrounds)
- [Abilities Compendium](#abilities-compendium)
