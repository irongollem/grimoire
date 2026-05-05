---
title: Atlas — Locations
section: World Building
section_order: 3
order: 0
summary: Build an unlimited location hierarchy from continents down to individual rooms.
keywords: atlas, locations, map, hierarchy, world, region, city, town, dungeon, pin
---

The Atlas is Grimoire's location system. You can model anything from a whole world down to a single room, with interactive maps, NPC lists, and store inventories at every level.

## Location hierarchy

Locations form a tree. Each location can have a parent and any number of children:

**World → Plane → Continent → Region → Country → City → Town → Village → District → Building → Store / Tavern / Inn → Room / Dungeon**

This is flexible — you don't need to use every tier. A small campaign might have World → Region → City → Tavern with no intermediate layers.

## Creating a location

1. Navigate to **Atlas** and click **New Location**.
2. Set the **Type** (17 options: World, Plane, Continent, Region, Country, City, Town, Village, District, Building, Store, Tavern, Inn, Room, Dungeon, Wilderness, Other).
3. Choose a **Parent Location** to nest it in the hierarchy.
4. Write a **Description** (rich text, shared with players if toggled on) and a **Player Summary** (always shown to players who can see this location).
5. Upload a **Sigil or Emblem** image if relevant (focal point controls how it's cropped).

## Interactive maps

Upload an image as a **Map** on any location. Once uploaded, you can drag to place **pins** — each pin links to a child location. Players see the map and clickable pins if you've shared the map (`Share Map` toggle). Individual pins can be hidden even when the map is shared.

## Player visibility controls

Every location has four independent share flags:

| Toggle                 | What it shares                                                  |
| ---------------------- | --------------------------------------------------------------- |
| Share full description | Players see the rich text description (summary is always shown) |
| Share linked NPCs      | Players see which NPCs are in this area                         |
| Share inventory        | Players can see store/tavern/inn wares                          |
| Share map              | Players see the uploaded map and visible pins                   |

Additionally, **Per-player visibility** (`visible_to` field) lets you share a location with specific players only.

## Stores, Taverns, and Inns

Locations of type Store, Tavern, or Inn have an **Inventory** section. Add items from your vault with quantities and optional prices. You can restock without entering edit mode — just adjust quantities directly from the detail view. Link a **Proprietor NPC** to add a face to the establishment.

## Populate from Setting

Clicking **Populate from Setting** (toolbar button in Atlas) seeds iconic locations from your campaign's world setting. For Faerûn this adds ~70 locations including Waterdeep, Baldur's Gate, and the major regions — all in the correct hierarchy. The import is idempotent (safe to re-run).

**Populate Planes** seeds all 21 D&D cosmological planes (Inner, Outer, Transitive) as a separate World node.

## Breadcrumbs and navigation

The Atlas shows a breadcrumb trail above each location showing its ancestor chain. Clicking any ancestor navigates up the tree. Use the **child location reparenting** control in the editor to move a location to a different parent if your hierarchy changes.

## Related locations (non-hierarchical links)

Use **Related Locations** to link two locations that aren't parent/child — useful for trade routes, tunnels between cities, or two connected dungeons in different regions.
