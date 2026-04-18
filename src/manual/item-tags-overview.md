---
title: Item Tags Overview
section: Item System
section_order: 1
order: 1
summary: How tags drive automation throughout Grimoire.
keywords: tag, tags, overview
---

Tags are free-form labels attached to vault items. They look simple, but many systems in Grimoire read them to drive automatic behaviour — from linking arrows to bows to identifying crafting ingredients. You set them once on the item definition; the systems pick them up silently.

Tags live on the **vault item** (the template in your Items library), not on individual inventory entries. Every character who carries that item benefits from the same tag logic.

## Where tags are set

Open any item in Workshop → Items and edit the *Tags* field. Tags are comma-separated and automatically normalized: lowercased, spaces and underscores converted to hyphens, special characters stripped.

## Systems that read tags

- **Containers** — `container` tag auto-promotes an item to a container slot in the inventory paper doll.
- **Ranged weapons & ammunition** — ammo tags (`arrow`, `bolt`, `bullet`, `needle`, `dart`, `firearm-bullet`) link ammunition to the correct ranged weapon.
- **Firearms** — the `firearm` tag on a weapon makes it consume `firearm-bullet` ammo stacks.
- **Workshop crafting** — recipes match ingredients by tag rather than by exact item name, so any tagged material satisfies the slot.
- **Cooking discipline** — food ingredients use tags like `meat`, `fish`, `vegetable`, `grain`, etc.
