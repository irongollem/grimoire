---
title: Spell Damage & Save Effects
section: Spells
section_order: 6
order: 2
summary: How to fill in damage components so the cast button auto-rolls dice in chat.
keywords: spells, damage, dice, fire, save, half, negates, healing, cast, roll, chat
---

## What the cast button does

When a player clicks **Cast**, Grimoire posts a flavour message ("Aria casts Burning Hands (DC 14 DEX)") and then **automatically rolls each damage entry** and posts the result to chat, including a note like *(half on DEX save)* when appropriate.

This only works if the spell's **damage components** are filled in. Without them, the cast message appears but no dice are rolled.

## Published spells leave damage blank

Spells enabled from a published source (via the Spellbook's Sources panel, see [Spellbook: Overview](#spellbook-overview)) come in as text only. The damage fields are **not** populated automatically: they must be filled in by hand.

Since a shared/library spell can't be edited mechanically (only its art), you'll need to use **New Spell** to build an editable version first if you want a published spell's cast button to auto-roll. Open the spell in the Spell editor and complete the **Mechanics** section (see [Creating Custom Spells](#creating-custom-spells) for every field in it):

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

Cantrip scaling (extra dice at levels 5/11/17) is not currently automatic. Enter the dice for the character's current tier and update when they level up.

## Healing spells

Use the **Healing Dice** field (e.g. `1d8+3`) instead of Damage. The cast button auto-rolls the healing and posts the result to chat, the same way damage is rolled. The party can then apply the total to whoever was healed.

## Related

- [Spellbook: Overview](#spellbook-overview)
- [Creating Custom Spells](#creating-custom-spells)
