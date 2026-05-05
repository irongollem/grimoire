---
title: Abilities Compendium
section: Character Codex
section_order: 9
order: 3
summary: Manage the pool of individual features, feats, and options that classes reference.
keywords: ability, feat, feature, fighting style, metamagic, maneuver, invocation, infusion, class feature, trait
---

The **Abilities** tab is the pool of individual features that classes, archetypes, and species reference. Think of it as a library of atomic building blocks — a class assigns abilities to levels; an archetype adds abilities at its unlocking levels; a Wizard Step presents abilities as player choices.

## Ability types

| Type | Typical use |
|---|---|
| Class Feature | Standard class progression features (Sneak Attack, Martial Arts) |
| Species Trait | Racial abilities (Darkvision, Fey Ancestry) |
| Background Feature | Background-granted abilities (False Identity, Researcher) |
| Feat | Optional feats players can take at ASI levels |
| Fighting Style | Fighter/Paladin/Ranger fighting style options |
| Metamagic | Sorcerer metamagic options |
| Maneuver | Battle Master maneuvers |
| Invocation | Warlock eldritch invocations |
| Infusion | Artificer infusion options |
| Other | Anything that doesn't fit the above |

## Creating an ability

Click **New Ability**. Fill in:

- **Name** — required.
- **Type** — from the list above.
- **Description** — rich text. Write the full mechanical text here. This is what appears on the player's character sheet.
- **Tags** — freeform labels for filtering.

## Importing from Open5e

Click **Sync from Open5e** in the toolbar to import all SRD features, feats, fighting styles, metamagics, maneuvers, invocations, and infusions. The sync also backfills descriptions for any system-level abilities that were previously name-only. This is safe to run repeatedly.

## How abilities flow to players

1. A **class** assigns ability X to level N.
2. A player's character reaches level N.
3. Ability X appears in the **Features** tab of the player's character sheet, with the full description text.

If a **Wizard Step** at that level asks the player to choose, the ability only appears after the player makes their selection during the level-up flow.

## Abilities and Wizard Steps

When a custom class has a Wizard Step with Options Source = "Abilities", it filters the Abilities list by type. For example, a "Choose a Fighting Style" step filters for type = Fighting Style. Players only see the relevant options.

## Keeping abilities organised

With many abilities in the list, use:

- **Text search** — searches name and description.
- **Type filter** — filter by any of the ability types above.

Both filters are stored in the session — they persist while you navigate.
