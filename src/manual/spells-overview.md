---
title: "Spellbook: Overview"
section: Spells
section_order: 6
order: 0
summary: Browsing, sourcing, and scoping your campaign's spell compendium.
keywords: spell, spells, spellbook, overview, browse, filter, source, library, scope, campaign, generate, known by, cast by
---

The **Spellbook** (`/spells`, **Spellbook** in the Compendium group of the sidebar) is your campaign's spell compendium: published spells alongside anything you write yourself. Every spell here can be assigned to classes, linked from items, cast by NPCs, and learned by player characters.

## Key ideas

| Term | Meaning |
| --- | --- |
| Source | Where a spell came from: a published sourcebook, or "Custom" for anything you wrote by hand |
| Scope | General (available in every campaign you run) or scoped to one active campaign, set per spell in the editor |
| Shared / library spell | A published spell your account did not create. Its mechanical fields are locked; you can only change its art |
| Caster type | How a class prepares spells (spellbook, prepared, known, or none) drives what a player sees in their own Spells tab |

## Browsing and filtering

The list is paginated (50 per page). Use the toolbar to narrow it:

- **Search box**: matches by name.
- **Level row**: Cantrip (labelled **C**) through 9th, or **All**.
- **School filter**: the eight schools of magic.
- **Class filter**: Barbarian, Bard, Cleric, Druid, Fighter, Paladin, Ranger, Rogue, Sorcerer, Warlock, Wizard, and any custom classes.
- **Source filter**: narrows to one sourcebook, or **Custom** for spells with no source.

Click **Clear** (visible only once a filter is active) to reset all of them at once. Your filters persist while you navigate away and come back within the same session.

## Choosing which sources appear

Click the **library icon** button in the toolbar to open **Spell Sources**. This lists every published sourcebook your admin has seeded into Grimoire's shared spell library, each with a running count of how many spells it holds. Check a source to make its spells appear in your Spellbook **instantly**: there is nothing to download or import, and unchecking a source hides its spells again without deleting anything. This choice is per campaign.

The panel also links to **Licenses & attribution** (Reliquary → Licenses tab), which credits every publisher whose content you've enabled.

> Every published spell lives in one shared library that your whole account, and every DM using Grimoire, draws from. There's nothing to import or sync; a source is either toggled on for this campaign or it isn't.

## Creating a spell

See **[Creating Custom Spells](#creating-custom-spells)** for the full editor walkthrough: fields, the Spell Level Advisor, and the AI generator.

## Bulk actions

Click **Select** to turn the grid into a multi-select surface: a checkbox appears on every card. With spells selected, a bar above the grid lets you:

- **Move** the selection to the active campaign or back to "all campaigns" (general).
- **Copy to campaign…**: duplicate the selected spells into a different campaign, picked from a list that excludes any campaign a selected spell is already in. The copy is a second, independent row you can freely diverge from the original.

Only your own custom spells are selectable this way: shared/library spells have no scope of their own to move, and any spell that already belongs to a scope excluded from the current filters is skipped.

## Viewing a spell

Click a spell to open its **read view**: a compact stat-block summary (level, school, ritual, concentration) followed by the full description and higher-level text. Below the source line, two reverse-lookup sections tell you who already uses this spell without you searching for them:

- **Known By**: every party member with the spell in their own spellbook or known-spells list (a "prepared" marker shows if it's currently prepared).
- **Cast By**: every NPC in the active campaign whose stat block lists this spell among its spellcasting.

## Editing a spell

DMs see an **Edit** button on any spell they own (players, and a DM in DM Preview mode, never see it at all). Opening a **shared/library spell** shows only art controls and the note "Reference spell: art only": there is no clone-to-customize path for spells the way there is for items; if you want your own editable version, use **New Spell** and rebuild it.

From the editor, **Send to Scriptorium** formats the spell as a publishable document, and (for your own spells) **Copy to campaign…** duplicates it into another campaign you run.

## What your players see

Each player's own **Spells** tab in the Player Portal adapts to their character's caster type:

| Caster type | Tabs shown |
| --- | --- |
| Spellbook (e.g. Wizard) | Prepared · Spellbook · Innate · All Spells |
| Prepared (e.g. Cleric, Druid) | Prepared · Innate · All [Class] Spells |
| Known (e.g. Sorcerer, Bard, Warlock) | Known [Class] · Innate · All [Class] Spells |
| Non-caster | Innate · All Spells |

Castable spell rows carry roll buttons: an **Atk** badge rolls a spell attack and posts it to chat, a **DC** badge announces the saving throw the target must make, and the **Cast** button rolls any damage or healing dice automatically. See **[Spell Damage & Save Effects](#spell-damage-save-effects)** for how to make sure those buttons actually roll dice.

## Tips

> A spell you import or generate has no mechanical effect until its Mechanics block is filled in: see Spell Damage & Save Effects.

- Scope, once saved, never moves on its own: editing an existing spell keeps it in whatever scope it was created with, even a general one.
- Only your own custom spells count toward any AI credit usage; shared/library spells are free to browse and enable.

## Related

- [Creating Custom Spells](#creating-custom-spells)
- [Spell Damage & Save Effects](#spell-damage-save-effects)
- [Vault: Overview](#vault-overview)
- [Item Tags Overview](#item-tags-overview)
