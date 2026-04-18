---
title: Containers
section: Item System
section_order: 1
order: 3
summary: How quivers, pouches, and backpacks work as containers for inventory items.
keywords: container, quiver, pouch, backpack, bag
---

## What makes an item a container?

Two things can mark an inventory item as a container:

1. The vault item has the **`container` tag** — when a player adds it to their inventory, Grimoire automatically sets it as a container.
2. The DM or player manually toggles "Make container" on an existing inventory entry via the paper doll.

Containers appear as their own expandable section in the player inventory paper doll, showing what's stowed inside them.

## Why containers matter for ammunition

The ranged attack system checks *location* when choosing which ammo stack to consume. Items inside a container are stored at `location = "container"`, which is the **highest priority** for ammo selection. Giving your archer a Quiver (tagged `container`) and placing arrows inside it ensures arrows come from the quiver first — not loose ones in the backpack.

## SRD containers with the tag pre-applied

| Item | Notes |
|---|---|
| Quiver | Holds up to 20 arrows. Tagged `container`. |
| Component Pouch | For spell components. Tagged `container`. |
| Backpack | General storage. Tagged `container`. |
| Bag of Holding | Tagged `container`. Does not simulate extradimensional weight rules. |

## Custom containers

Create any item in the library and add the `container` tag to make it behave as a container for any player who picks it up.
