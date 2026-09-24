---
title: Item Tags Overview
section: Item Vault
section_order: 7
order: 1
summary: How tags drive automation throughout Grimoire.
keywords: tag, tags, overview, container, ammo, ammunition, crafting, slot, paper doll
---

Tags are free-form labels attached to vault items. They look simple, but many systems in Grimoire read them to drive automatic behaviour — from linking arrows to bows to identifying crafting ingredients. You set them once on the item definition; the systems pick them up silently.

Tags live on the **vault item** (the template in the Vault), not on individual inventory entries. Every character who carries that item benefits from the same tag logic.

## Where tags are set

Open any item in the **Vault** (`/vault`) and edit its **Tags** field. Type a tag and it's added on its own; Grimoire normalizes it automatically — lowercased, spaces and underscores converted to hyphens, and anything that isn't a letter, digit, or hyphen stripped out. So `Bag Of Holding` becomes `bag-of-holding` and always matches other items tagged the same way.

## Systems that read tags

- **Containers** — the `container` tag auto-promotes an item to a container section in the inventory paper doll; the editor also exposes this as a **Container** checkbox, which is the same thing.
- **Ranged weapons & ammunition** — ammo tags (`arrow`, `bolt`, `bullet`, `needle`, `dart`, `firearm-bullet`) link ammunition to the correct ranged weapon. Grimoire also recognises a weapon's name/subtype directly for standard weapons — tags matter most for anything with an unusual name.
- **Firearms** — the `firearm` tag on a weapon makes it consume `firearm-bullet` ammo stacks, kept separate from ordinary sling `bullet` ammo on purpose.
- **Extradimensional containers** — the `extradimensional` tag on a container (e.g. a Bag of Holding) makes everything stored inside it contribute zero carry weight.
- **Workshop crafting** — recipe ingredients can match by tag rather than by exact item name, so any tagged material satisfies the slot. Every built-in starter recipe uses tag-based ingredients exclusively.
- **Cooking discipline** — food ingredients use tags like `food`, `meat`, `fish`, `vegetable`, `grain`, etc.
