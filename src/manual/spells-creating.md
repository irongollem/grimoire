---
title: Creating Custom Spells
section: Spells
section_order: 6
order: 1
summary: Build homebrew spells in the Spell Editor and assign them to classes.
keywords: spell, new spell, create, custom, homebrew, level, school, components, damage, ritual, concentration, class, target, condition, area of effect, healing, advisor, generate, upcast, scope
---

Use the Spell Editor to write a homebrew spell. Open the **Spellbook** (**Compendium → Spellbook**) and click **New Spell** to open the Spell Editor, or **Edit** on any spell you own. The editor has three columns on wide screens.

## Left column: presentation

- **Portrait**: upload art representing the spell, with focal-point control. AI art generation is available inline if your campaign has AI enabled.
- **Source**: freeform attribution for homebrew spells ("e.g. Homebrew, PHB, XGtE…"); read-only (with a link, if one exists) for spells from a published sourcebook.
- **Scope**: **General · all campaigns** or **Campaign · its name**.

## Centre column: mechanics

**Identity:**

- **Name**: required.
- **Level**: Cantrip through 9th.
- **School**: Abjuration, Conjuration, Divination, Enchantment, Evocation, Illusion, Necromancy, or Transmutation.

**Casting:**

- **Casting Time**, **Range**, **Duration**: dropdowns of standard options (e.g. `1 action`, `60 feet`, `Instantaneous`) with a custom text box when none fits (a Reaction also asks "Reaction to what?"). **CONCENTRATION** and **RITUAL** checkboxes sit alongside.

**Components:**

- **V** (Verbal), **S** (Somatic) and **M** (Material) checkboxes, plus a **Material component** text box for the component description when M is checked.

**Mechanics:**

- **Attack / Targeting**: Ranged Spell Attack, Melee Spell Attack, Saving Throw, Automatic (no roll), or None / Utility.
- **Save Attribute** and **Effect on Successful Save** (shown only when Attack / Targeting is Saving Throw): effect is one of *Half damage on save*, *No effect on save*, or *Special*.
- **Damage**: one or more dice-expression rows (e.g. `1d8, 2d6+mod`), each with its own damage type.
- **Healing Dice**: a single dice expression (e.g. `1d8+3`) for spells that heal instead of, or alongside, damaging.
- **Target Description**: freeform text describing what the spell hits (e.g. "one creature you can see within range").
- **AoE Shape** and **AoE Size**: for area spells (cone, sphere, cube, line, cylinder, etc. with a size like "20-foot radius").
- **Besides damage, this spell**: tells the Encounter Runner what the spell does to a creature beyond damage. Choose **Not said yet**, **Does nothing a fight needs to know**, **Imposes a condition**, or **Is too involved to state; rule it at the table**. With **Imposes a condition** you then pick the **Conditions** (a creature can get several), whether it **Stops spellcasting** or **Their speed becomes 0**, **It lands** (on a hit, on a failed save, automatically), **Who it reaches** (one creature, several, an area), **Only these kinds of creature**, and **How long** it lasts, plus how it ends.

**Description**: rich text. This is the spell text players and DMs see. Write it in plain prose, not stat-block notation.

**At Higher Levels**: rich text describing how the spell scales when cast with a higher-level slot.

## Right column: class list

Check each class that can cast this spell. This drives:

- Filtering in the Spellbook list view.
- Which spells appear in a character's "All (class) Spells" browse tab in the Player Portal.
- Automatic class filtering in the monster builder's spellcasting section.

## The Spell Level Advisor

The **Spell Level Advisor** (shown automatically as a wizard for new spells, or reopenable from the editor) to answer a few questions (primary effect type, damage dice, number of targets, save type, whether it scales) and get a suggested spell level plus pre-filled mechanics fields.

## Generating a spell with AI

There are two entry points, both needing your campaign's AI generation switched on (Campaign Settings → AI Assistant) and enough credits to cover the cost: if AI is off, the same buttons point you at the toggle instead of generating:

- From the Spellbook list, click **Generate** to open the Familiar on the right with a spell card. It builds a brand-new spell from what you describe, with optional Level and School and a spell-effect art switch.
- While editing a spell (new or existing), click **Generate** in the editor's own header to open a **Fill the sheet** card in the Familiar. It fills in the *current* form instead of creating a separate record.

The card shows the credit cost before you confirm generation.

## Choosing sources and scope

See **[Spellbook: Overview](#spellbook-overview)** for browsing, the Sources panel (which sourcebooks are enabled for this campaign), and how scope (general vs. this campaign) works.

## Sending to Scriptorium

**Send to Scriptorium** in the editor's header formats the spell as a publishable Scriptorium document: useful for printing homebrew spell cards or compiling a spell compendium.

## What your players see

Players never see this editor. Once a spell is assigned to their class (or linked as an innate/item grant), it appears in their own **Spells** tab per **[Spellbook: Overview](#spellbook-overview)**.

## Tips

> Editing an existing spell never changes its scope: a general spell stays general even after you edit it. Change scope deliberately via the Scope control if you want to move it.

- A shared spell from a book can only have its art changed here: there's no **Customize** path for spells the way there is for monsters and items. Use **New Spell** if you want a fully editable version.
- Damage and healing fields do nothing on their own: see [Spell Damage & Save Effects](#spell-damage-save-effects) for what the **Cast** button needs to actually roll dice.

## Related

- [Spellbook: Overview](#spellbook-overview)
- [Spell Damage & Save Effects](#spell-damage-save-effects)
- [Vault: Overview](#vault-overview)
