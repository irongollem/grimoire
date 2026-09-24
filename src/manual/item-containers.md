---
title: Containers
section: Item Vault
section_order: 7
order: 3
summary: How quivers, pouches, and backpacks work as containers for inventory items.
keywords: container, quiver, pouch, backpack, bag, extradimensional, holding
---

## What makes an item a container?

Two ways to get a container:

1. The vault item has the **`container` tag** — when a player adds it to their inventory, Grimoire automatically sets it as a container.
2. Click **Add container** above the containers list in the player's Inventory page, pick any item already in the character's inventory from the picker that opens, and it's promoted to a container on the spot — no tag required.

Each container appears as its own expandable section in the inventory view, showing what's stowed inside it and its total weight (see [Vault — Overview](#vault-overview) for the rest of the inventory layout).

## Why containers matter for ammunition

Ranged attacks check where an ammo stack is carried when choosing which one to consume. An item stowed inside a container gets the **highest priority** for ammo selection. Giving your archer a Quiver (tagged `container`) and placing arrows inside it ensures arrows come from the quiver first — not loose ones in the backpack.

## Built-in library containers with the tag pre-applied

| Item | Notes |
|---|---|
| Quiver | Holds up to 20 arrows. Tagged `container`. |
| Component Pouch | For spell components. Tagged `container`. |
| Backpack | General storage. Tagged `container`. |
| Bag of Holding | Tagged `container`. Carried weight is **not** waived by default — add the `extradimensional` tag yourself to zero out its contents' weight (see [Item Tags Overview](#item-tags-overview)). |

## Extradimensional containers

Add the `extradimensional` tag to any container item and everything stowed inside it contributes **zero** carry weight for the character holding it — the container's own weight (if any) still counts. Nothing does this automatically, including the Bag of Holding above; it's on you to tag whichever items in your campaign should behave this way.

## Custom containers

Create any item in the Vault and add the `container` tag to make it behave as a container for any player who picks it up.

## Related

- [Vault — Overview](#vault-overview)
- [Item Tags Overview](#item-tags-overview)
- [Ranged Weapons & Ammunition](#ranged-weapons-ammunition)
