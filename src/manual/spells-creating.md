---
title: Creating Custom Spells
section: Spells
section_order: 6
order: 0
summary: Build homebrew spells in the Spell Editor and assign them to classes.
keywords: spell, create, custom, homebrew, level, school, components, damage, ritual, concentration, class
---

The Spellbook (`/spells`) stores all spells available in your campaign — SRD imports, Open5e third-party content, and your own homebrew creations. Custom spells appear alongside imported ones everywhere: in the monster builder's spell list, the character sheet, item links, and the encounter runner's roll buttons.

## Creating a spell

Click **New Spell** to open the Spell Editor. The editor has three columns on desktop.

### Left column — presentation

- **Portrait** — upload art representing the spell. Used in Card Forge spell cards and the spellbook list.
- **Source** — freeform attribution for homebrew spells.

### Centre column — mechanics

**Identity:**

- **Name** — required.
- **Level** — 0 (Cantrip) through 9. The Spell Level Advisor (button top-right) can suggest an appropriate level based on what the spell does.
- **School** — Abjuration, Conjuration, Divination, Enchantment, Evocation, Illusion, Necromancy, or Transmutation.

**Casting:**

- **Casting Time** — e.g. `1 action`, `1 bonus action`, `1 minute`, `1 reaction`.
- **Range** — e.g. `60 feet`, `Self`, `Touch`, `Sight`.
- **Duration** — e.g. `Instantaneous`, `1 hour`, `Until dispelled`.
- **Concentration** toggle — marks the spell as requiring concentration.
- **Ritual** toggle — marks the spell as castable as a ritual.

**Components:**

- **V** (Verbal), **S** (Somatic), **M** (Material) toggles.
- **Material** — description of the material component if M is checked.

**Mechanics block:**

- **Attack or Targeting type** — melee spell attack, ranged spell attack, or no attack.
- **Save attribute** — which saving throw the target makes (STR through CHA, or None).
- **Effect on save** — Half damage, No damage, or No effect.
- **Damage rolls** — one or more dice expressions and damage types (Fire, Cold, etc.).
- **Area of Effect** — cone, sphere, cube, line, cylinder with radius/length values.

**Description** — rich text. This is the spell text players and DMs see. Write it in plain prose, not stat-block notation.

**At Higher Levels** — rich text describing how the spell scales when cast with a higher-level slot.

### Right column — class list

Check each class that can cast this spell. This drives:

- Filtering in the Spellbook list view.
- Which spells appear in the character's **Browse** tab in the player portal.
- Automatic class filtering in the monster builder's spellcasting section.

## The Spell Level Advisor

Click **Spell Level Advisor** to open an interactive calculator. Answer questions about:

- Primary effect type (Damage, Control, Buff, Debuff, Utility, Healing)
- Damage dice and damage type (if Damage)
- Number of targets
- Save type
- Whether it scales

The advisor suggests a spell level and pre-fills the school and some mechanics fields.

## AI spell generator

Click **Generate** in the Spellbook toolbar (requires OpenAI API key in Campaign Settings). Enter a concept prompt; Grimoire writes the full spell including mechanics and flavour text.

## Importing SRD and Open5e spells

Click **Sync from Open5e** in the toolbar. A source-picker popover lists all available published sources. Select the ones you want and click Import. The process is upsert-safe — existing spells are updated without overwriting your customisations.

## Sending to Scriptorium

The **Scriptorium** button on any spell's detail view formats the spell as a publishable Scriptorium document — useful for printing homebrew spell cards or compiling a spell compendium.
