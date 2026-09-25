---
title: Abilities Compendium
section: Characters
section_order: 11
order: 3
summary: Manage the pool of individual features, feats, and options that classes and species reference.
keywords: ability, feat, feature, fighting style, metamagic, maneuver, invocation, infusion, class feature, trait, passive, reaction, bonus action, legendary
---

The **Abilities** tab (**Character Codex → Abilities**) is the pool of individual features that classes, archetypes, and species reference. Think of it as a library of atomic building blocks: a class assigns abilities to levels, an archetype adds abilities at its unlocking levels, and a Wizard Step can present a set of abilities as a player choice.

## Key ideas

Each ability's **Type** describes how it plays at the table, not what kind of source it came from:

| Type | Meaning |
| --- | --- |
| Passive | Always-on: no action required (e.g. Darkvision) |
| Active | Uses an action to activate |
| Reaction | Triggered by another creature's action or a specific event |
| Bonus Action | Uses a bonus action |
| Legendary | A legendary action, for creatures/characters that have them |

Narrative categorisation (whether something is a class feature, a species trait, a feat, a fighting style, and so on) is handled with **Tags** instead of a fixed type list, so you're free to tag an ability however makes sense for your table (e.g. `feat`, `fighting-style`, `invocation`).

## Creating an ability

Click **New Ability**. Fields:

- **Name**: the large text field at the top.
- **Type**: one of the five above.
- **Source**: attribution (e.g. "PHB", "Homebrew").
- **Campaign Scope**: this campaign, or all your campaigns.
- **Prerequisite**: free text (e.g. "Dexterity 13 or higher").
- **Tags**: freeform labels for filtering and for your own narrative categorisation.
- **Description**: rich text. Write the full mechanical text here: this is what appears on the player's character sheet.

## Importing from Open5e

Click **Sync from Open5e** in the toolbar to import features, feats, fighting styles, metamagic, maneuvers, invocations, and infusions. The same sync also backfills descriptions for any built-in abilities that were previously name-only, and reports how many entries were added, updated, and had descriptions filled. Safe to run repeatedly.

## How abilities flow to players

1. A **class** or **archetype** assigns ability X to level N.
2. A player's character reaches level N.
3. Ability X appears on the **Features** tab of the player's character sheet, with the full description text.

If a **Wizard Step** at that level asks the player to choose, the ability only appears after the player makes their selection during level-up.

## Keeping abilities organised

The list is filterable by:

- **Text search**: matches name and tags.
- **Type filter**: Passive / Active / Reaction / Bonus Action / Legendary.

Both filters persist while you navigate away and back.

## Tips

> Looking for "Class Feature" or "Species Trait" as a filter? That grouping doesn't exist as a field anymore: use **Tags** to build your own categories, and search by tag.

## Related

- [Character Codex: Overview](#character-codex-overview)
- [Creating Custom Classes](#creating-custom-classes)
- [Species and Backgrounds](#species-and-backgrounds)
