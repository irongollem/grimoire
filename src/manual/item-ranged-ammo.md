---
title: Ranged Weapons & Ammunition
section: Item System
section_order: 1
order: 2
summary: How bows, crossbows, slings, and firearms are linked to the right ammo stacks automatically.
keywords: ranged, bow, crossbow, arrow, bolt, ammo, ammunition, sling, blowgun, firearm, bullet, needle, dart
---

## How it works

When a player fires a ranged attack in the Encounter Runner, Grimoire looks at the weapon equipped in their *main hand* or *off hand* slot, determines the ammo type it needs, then finds the best available stack in the character's inventory and deducts one charge or quantity automatically. If no valid ammo is found, the attack button is **greyed out and disabled**.

## Weapon → ammo type mapping

Grimoire detects ranged weapon type by **name or subtype** automatically — no manual setup needed for standard weapons:

| Weapon name / subtype contains | Ammo tag consumed |
|---|---|
| longbow, shortbow, any bow (not crossbow) | `arrow` |
| crossbow, hand crossbow, heavy crossbow, light crossbow | `bolt` |
| sling | `bullet` |
| blowgun | `needle` |
| dart | `dart` |
| item has the `firearm` tag | `firearm-bullet` |

> **Note on slings:** slings consume the `bullet` tag. The SRD "Sling Bullets (20)" item already carries this tag. Stones and Pebbles are included as default items with the `bullet` tag for improvised sling ammo.

> **Note on black powder firearms:** firearms use `firearm-bullet`, which is distinct from sling `bullet`. This prevents a player from accidentally loading a pistol with sling stones.

## Custom / exotic ranged weapons

If your weapon has an unusual name that Grimoire can't recognise (e.g. *Crosswing*, *Stormreaper*, *Hand Ballista*), add the ammo tag **directly to the weapon item**. Grimoire checks the weapon's own tags first, before trying any name or subtype matching.

| Weapon tag | Ammo consumed |
|---|---|
| `arrow` | Any item tagged `arrow` |
| `bolt` | Any item tagged `bolt` |
| `bullet` | Any item tagged `bullet` |
| `needle` | Any item tagged `needle` |
| `dart` | Any item tagged `dart` |
| `firearm-bullet` | Any item tagged `firearm-bullet` |

The subtype field is also a reliable option — set subtype to *crossbow*, *longbow*, etc. and no extra tag is needed.

## Ammo tags — reference

SRD items already carry the right tags. For custom ammo, add the tag to the vault item:

| Tag | Example items |
|---|---|
| `arrow` | Arrows (20), Arrow (Silvered), Arrow (Adamantine) |
| `bolt` | Crossbow Bolts (20), Bolt (Silvered), Bolt (Adamantine) |
| `bullet` | Sling Bullets (20), Stones (20) |
| `needle` | Blowgun Needles (50) |
| `dart` | Dart |
| `firearm-bullet` | Firearm Bullets (10), Black Powder Cartridge |

## Quantity vs. charges

Grimoire tracks ammo in two ways depending on how the item is set up:

- **Charges** (e.g. "Arrows (20)" with charges = 20) — each shot decrements *current charges*. Good for bundled packs.
- **Quantity** — individual items (e.g. a single Silvered Arrow). Each shot removes one from the stack, deleting the item entirely when it hits zero.

## Ammo location priority

When multiple stacks are available, Grimoire picks in this order: **container** (quiver, pouch) → **belt** → **backpack**. Put arrows in a quiver container to make sure the right stack is consumed first.

## Self-charged weapons

Weapons with a *charges* value set (e.g. a Laser Rifle with 50 shots) never look for external ammo — they consume their own charge each shot. Set `charges` on the vault item to enable this.
