---
title: Spell Damage & Save Effects
section: Spells
section_order: 4
order: 1
summary: How to fill in damage components so the cast button auto-rolls dice in chat.
keywords: spells, damage, dice, fire, save, half, import, open5e, cast, roll, chat
---

## What the cast button does

When a player clicks **Cast**, Grimoire posts a flavour message ("Aria casts Burning Hands (DC 14 DEX)") and then **automatically rolls each damage entry** and posts the result to chat — including a note like *(half on DEX save)* when appropriate.

This only works if the spell's **damage components** are filled in. Without them, the cast message appears but no dice are rolled.

## Open5e imports leave damage blank

Spells imported from Open5e come in as text only. The damage fields are **not** populated automatically — they must be filled in by hand after importing.

Open the spell in the Spell editor and complete the **Damage & Effects** section:

| Field | Example | Notes |
| --- | --- | --- |
| Damage rolls | `3d6 fire` | Add one row per damage type |
| Attack / Save | Save | Choose the delivery type |
| Save attribute | DEX | The ability targets must save with |
| Save effect | Half | *Half* = take half on success; *Negates* = no damage |

Once saved, the cast button will roll the dice and include the correct save context in chat.

## Multiple damage types

Some spells deal more than one type of damage. Add a separate row for each:

- **Chromatic Orb** — one row per element (pick the one being used, or add all)
- **Shadow Blade** — `2d8 psychic`
- **Eldritch Blast** (with Hex) — `1d10 force` + `1d6 necrotic`

Each row is rolled separately and posted as its own message in chat.

## Cantrips that scale

Cantrip scaling (extra dice at levels 5/11/17) is not currently automatic. Enter the dice for the character's current tier and update when they level up.

## Healing spells

Use the **Healing dice** field instead of Damage rolls. The cast button does not auto-roll healing — the player uses the standard dice roller for that.
