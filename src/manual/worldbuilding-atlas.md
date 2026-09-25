---
title: "Atlas: Locations"
section: World Building
section_order: 2
order: 0
summary: Chart your world as a tree of places, from a whole plane down to a single room, with maps, pins and per-player visibility at every level.
keywords: atlas, locations, map, hierarchy, world, region, city, town, dungeon, pin, tree, scale rail
---

The Atlas is Grimoire's location system: every place in your world, nested as deep as you like, each with its own description, art, map and player-visibility rules. Find it under **Campaign → Atlas** in the sidebar (`/locations`). A location that can hold rooms and a floor plan (a building, dungeon, store, tavern, inn or wilds) is called a **site**; running one at the table has its own page, [Sites: Maps, Rooms & Running a Dungeon](#sites-maps-rooms-running-a-dungeon).

## Key ideas

| Term | Meaning |
| --- | --- |
| Hierarchy | Every location has one parent and any number of children. A location's `Type` also gives it a **tier** (cosmic, land, settlement, district, site, or interior) which decides what kind of map it gets and how its children sit on it. |
| Scale rail | The six tiers shown as rungs beside a place's details, lit at the current tier and dimmed where your world has no content yet. |
| Site | A building, dungeon, store, tavern, inn or wilds: the six types with a floor plan of their own (rooms, doors, traced regions). Everything else places its children with pins instead. |
| Vague container | World, Plane, Continent, Region or Country: too broad to be a single map pin, so the Atlas pins straight through them to the nearest concrete place inside. |
| Interior space | A Room or Grounds: bound to its site's floor plan rather than pinned on a map of its own. |

## Browsing the tree

The Atlas is a two-pane explorer: a **location tree** on the left, and a **place pane** on the right showing whatever you've selected. Below a tablet width the two panes swap instead of sharing the screen: tap **All places** to go back to the tree.

- Click a row to select it; click its expander arrow to open or close its children without changing the selection.
- The **collapse arrow** at the top of the tree column folds it out of the way (a thin rail with an arrow to bring it back): useful when you're working a site's map and want the width.
- Search and the **Type** filter (top of the page) flatten the tree to a flat list of matches.
- Selecting a place is remembered in your browser's address bar, so the Back button walks the trail of places you've visited instead of leaving the Atlas.

The place pane shows: a breadcrumb of clickable ancestors, the sigil, name and type badge, a "N quests staged here" note when a quest beat is waiting at this place or one of its rooms, the **scale rail**, then either **Contents** (its children, grouped by tier, followed by the full detail body below) or **Map** (its map, if it has one, see Sites for site-tier places).

## Creating a location

1. Click **New Location** (Atlas list page) or the inline "add a child" box in a place's own Parent/Child panel.
2. Set **Type**: one of 19 options (World, Plane, Continent, Region, Country, City, Town, Village, District, Building, Store, Tavern, Inn, Wilds, Room, Grounds, Dungeon, Wilderness, Other).
3. Pick a **Parent Location**, or leave it top-level.
4. Add a **Description** (rich text) and, once the location exists, a **Player Summary**: a short plain-text line always shown to players who can see this place, even before you share the full description.
5. Upload a **Sigil / Emblem** image if you like: it can be cropped with the focal-point control.
6. Set **Tags**, an optional **Era** (from/to year, the place greys out or hides outside that in-world range), and an **Ambient** theme label (opening this location during a session asks the soundboard for a playlist tagged with that label; leave it blank to inherit from the nearest themed ancestor, or type "silence" to mute this place on purpose).
7. **Scope** the location to the active campaign or make it general (available in every campaign): the same toggle every homebrew entity uses.
8. Click **Create**.

## Generating a location with AI

Click **Generate** on the Atlas list page to open the Location Generator panel. Describe the place in the **Concept** box, optionally constrain it with a **Location Type** and **Parent Location**, and toggle **Generate location art** / **Generate map sketch** if you want the AI to produce art alongside the write-up. Generation runs in the background: you can close the panel and keep working. See [AI Generation & Credits](#ai-generation-credits) for how costs are shown and charged.

## Interactive maps and pins

Upload an image as this location's **Map** (in the editor, or in Build mode for a site, see the Sites page) and you can drag to drop **pins**, each linked to a direct child. Clicking a vague-container child's pin position instead offers the concrete places nested inside it, so a regional map can still pin individual towns. Each pin has its own **visible to players** flag, and the whole map has a **Share Map** toggle. A site-tier place additionally shows traced room regions on the same map: see the Sites page.

Descending into a child that also has its own map plays a zoom transition rather than a flat page change, and an **Up to `<parent>`** control on the map lets you rise the same way.

## Sharing a location with players

Click the reveal control (the eye icon) beside any place, in the tree row or the place pane, to open its sharing panel without leaving where you are:

- **Who**: pick specific party members, or share with everyone.
- **What**: four independent toggles: **Full description**, **People here** (linked NPCs), **Map** (only offered when this place has a shareable map that isn't a battle map), and **Wares** (store/tavern/inn only).

The **Player Summary** field is always shown to anyone who can see the place at all, regardless of the toggles above.

## Stores, taverns and inns

These three types get an **Inventory** section: add items from your Vault with quantities and optional prices, and restock directly from the place in the Atlas without opening its Details. Link a **Proprietor** NPC to put a face on the vendor: it's used as the sender name on in-chat vendor offers.

## Populate Setting and Populate Planes

**Populate Setting** seeds locations appropriate to your campaign's calendar/setting (about 70 for Faerûn, including Waterdeep and Baldur's Gate, already nested correctly). **Populate Planes** seeds all 21 standard D&D cosmological planes as their own World node. Both buttons are idempotent (re-running skips anything that already exists by name) and neither counts against your plan's location cap (see [Billing & Subscription](#billing-subscription)), so a free-tier DM can populate a full setting without hitting it. Locations you add yourself still do.

## Related Locations

A place can link to others that aren't parent/child: trade routes, tunnels, two connected dungeons in different regions. Manage these from the location's own Parent/Child panel; they render as chips labelled "Related Locations." An interior space (room or grounds) shows **Ways out** instead: see the Sites page.

## Reparenting and reordering

Drag a location to a new parent from its own editor's parent picker, or use the inline **create a child** box, which can also re-parent an existing location by picking it from the search results. Sibling order can be set explicitly (drag-to-reorder, most visible inside a site's Rooms panel); unordered siblings sort by tier, then name.

## What your players see

Players reach a read-only, tree-shaped Atlas at **Atlas** in the Player Portal, showing only locations shared with them: a location whose parent wasn't shared still appears at the top level so it's never orphaned out of reach. Each entry expands to a detail panel with the sigil, player summary, shared map (only the pins marked player-visible), shared description, shared wares, and people in the area. Search and per-entry expand state persist across a session.

## Tips

> Set the **Type** correctly before you build anything else on a place: it decides whether the place gets a Rooms panel, a Store panel, or neither, and changing it later can strand content that no longer has a home for it.

- Related Locations and Ways out are two different mechanisms for two different questions: non-hierarchical links between named places versus a room's own doors. Don't try to make one do the other's job.
- The Atlas pane's Map mode folds the tree column automatically to make room, and restores it when you leave: it won't touch a fold you set yourself.

## Related

- [Sites: Maps, Rooms & Running a Dungeon](#sites-maps-rooms-running-a-dungeon)
- [Factions](#factions)
- [Pantheon: Gods & Deities](#pantheon-gods-deities)
- [Calendar System](#calendar-system)
- [Cartographer: Overview](#cartographer-overview)
- [Billing & Subscription](#billing-subscription)
