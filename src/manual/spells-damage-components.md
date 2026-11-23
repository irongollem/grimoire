---
title: Spell Damage & Save Effects
section: Spells
section_order: 6
order: 2
summary: How to fill in damage components so the cast button auto-rolls dice in chat.
keywords: spells, damage, dice, fire, save, half, negates, healing, cast, roll, roll by hand, chat, auto-roll, mechanics, attack, saving throw
---

Use this page to make a spell roll its own dice.

## What the cast button does

When a player clicks **Cast**, Grimoire posts a flavour message ("Aria casts Burning Hands (DC 14 DEX)") and then **automatically rolls each damage entry** and posts the result to chat, including a note like *(half on DEX save)* when appropriate.

This only works if the spell's **damage components** are filled in (or, for a book spell, checked by Grimoire). Without them, the cast message appears but no dice are rolled.

## Spells from published books

A spell enabled from a published source (via the Spellbook's **Spell Sources**, see [Spellbook: Overview](#spellbook-overview)) rolls by itself only when Grimoire has checked that its damage, save and scaling match the spell's own text. A spell that has not passed that check shows **Roll by hand** instead of damage and healing buttons, with the note "Grimoire can't roll this spell for you yet. Roll its dice by hand from the description." Read the spell text and roll the dice yourself, or build your own version of the spell.

A shared spell can't be edited mechanically (only its art), so to make a book spell roll the way you want, use **New Spell** and fill in the **Mechanics** section (see [Creating Custom Spells](#creating-custom-spells) for every field in it). Your own spells always roll from their own fields:

| Field | Example | Notes |
| --- | --- | --- |
| Damage | `3d6 fire` | Add one row per damage type |
| Attack / Targeting | Saving Throw | Choose the delivery type |
| Save Attribute | DEX | The ability targets must save with |
| Effect on Successful Save | Half damage on save | Or *No effect on save* for a save that avoids damage entirely |

Once saved, the cast button will roll the dice and include the correct save context in chat.

## Multiple damage types

Some spells deal more than one type of damage. Add a separate row for each:

- **Chromatic Orb**: one row per element (pick the one being used, or add all)
- **Shadow Blade**: `2d8 psychic`
- **Eldritch Blast** (with Hex): `1d10 force` + `1d6 necrotic`

Each row is rolled separately and posted as its own message in chat.

## Cantrips that scale

Cantrips scale on their own. Enter the dice for the base cantrip (a level 1 character) and the cast roll steps up at character levels 5, 11 and 17. Checked book spells also add the extra dice of a higher-level slot when a player casts them with one; a spell you write yourself rolls the dice you entered at any slot level.

## Healing spells

Use the **Healing Dice** field (e.g. `1d8+3`) instead of Damage. The cast button auto-rolls the healing and posts the result to chat, the same way damage is rolled. The party can then apply the total to whoever was healed.

## Related

- [Spellbook: Overview](#spellbook-overview)
- [Creating Custom Spells](#creating-custom-spells)
