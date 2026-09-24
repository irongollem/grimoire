---
title: Creating Custom Spells
section: Spells
section_order: 6
order: 1
summary: Build homebrew spells in the Spell Editor and assign them to classes.
keywords: spell, create, custom, homebrew, level, school, components, damage, ritual, concentration, class, target, condition, area of effect
---

Open the **Spellbook** (**Spellbook** in the sidebar's Compendium group, `/spells`) and click **New Spell** to open the Spell Editor — or **Edit** on any spell you own. The editor has three columns on wide screens.

## Left column — presentation

- **Portrait** — upload art representing the spell, with focal-point control. AI art generation is available inline if your campaign has AI enabled.
- **Source** — freeform attribution for homebrew spells; read-only (with a link, if one exists) for spells imported from a published sourcebook.

## Centre column — mechanics

**Identity:**

- **Name** — required.
- **Level** — Cantrip through 9th.
- **School** — Abjuration, Conjuration, Divination, Enchantment, Evocation, Illusion, Necromancy, or Transmutation.

**Casting:**

- **Casting Time**, **Range**, **Duration** — text fields with standard preset options (e.g. `1 action`, `60 feet`, `Instantaneous`), each with a **Concentration** and **Ritual** toggle alongside Duration.

**Components:**

- **V** (Verbal), **S** (Somatic), **M** (Material) toggles, plus a **Material** text field for the component description when M is checked.

**Mechanics:**

- **Attack / Targeting** — Ranged Spell Attack, Melee Spell Attack, Saving Throw, Automatic (no roll), or None / Utility.
- **Save Attribute** and **Effect on Successful Save** (shown only when Attack / Targeting is Saving Throw) — effect is one of *Half damage on save*, *No effect on save*, or *Special*.
- **Damage** — one or more dice-expression rows, each with its own damage type.
- **Healing Dice** — a single dice expression (e.g. `1d8+3`) for spells that heal instead of, or alongside, damaging.
- **Target Description** — freeform text describing what the spell hits (e.g. "one creature you can see within range").
- **AoE Shape** and **AoE Size** — for area spells (cone, sphere, cube, line, cylinder, etc. with a size like "20-foot radius").
- **Condition Inflicted** — optional freeform text (e.g. "blinded", "frightened") for reference at the table.

**Description** — rich text. This is the spell text players and DMs see. Write it in plain prose, not stat-block notation.

**At Higher Levels** — rich text describing how the spell scales when cast with a higher-level slot.

## Right column — class list

Check each class that can cast this spell. This drives:

- Filtering in the Spellbook list view.
- Which spells appear in a character's **All [Class] Spells** / browse tab in the Player Portal.
- Automatic class filtering in the monster builder's spellcasting section.

## The Spell Level Advisor

Click **Spell Level Advisor** (shown automatically as a wizard for new spells, or reopenable from the editor) to answer a few questions — primary effect type, damage dice, number of targets, save type, whether it scales — and get a suggested spell level plus pre-filled mechanics fields.

## Generating a spell with AI

There are two entry points, both needing your campaign's AI generation switched on (Campaign Settings → AI Assistant) and enough credits to cover the cost — if AI is off, the same buttons point you at the toggle instead of generating:

- From the Spellbook list, click **Generate** to open a side panel that builds a brand-new spell from a concept you describe, with optional Level/School constraints and an "Generate spell-effect art" toggle.
- While editing a spell (new or existing), click **Generate** in the editor's own header to open a dialog that fills in the *current* form instead of creating a separate record.

Grimoire shows the credit cost before you confirm generation.

## Choosing sources and scope

See **[Spellbook — Overview](#spellbook-overview)** for browsing, the Sources panel (which sourcebooks are enabled for this campaign), and how scope (general vs. this campaign) works.

## Sending to Scriptorium

The **Scriptorium** action in the editor's header formats the spell as a publishable Scriptorium document — useful for printing homebrew spell cards or compiling a spell compendium.

## What your players see

Players never see this editor. Once a spell is assigned to their class (or linked as an innate/item grant), it appears in their own **Spells** tab per **[Spellbook — Overview](#spellbook-overview)**.

## Tips

> Editing an existing spell never changes its scope — a general spell stays general even after you edit it. Change scope deliberately via the Scope control if you want to move it.

- A shared/library spell (one your account didn't create) can only have its art changed here — there's no "Clone to customize" path for spells the way there is for items. Use **New Spell** if you want a fully editable version.
- Damage and healing fields do nothing on their own — see [Spell Damage & Save Effects](#spell-damage-save-effects) for what the **Cast** button needs to actually roll dice.

## Related

- [Spellbook — Overview](#spellbook-overview)
- [Spell Damage & Save Effects](#spell-damage-save-effects)
- [Vault — Overview](#vault-overview)
