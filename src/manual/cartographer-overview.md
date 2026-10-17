---
title: Cartographer: Overview
section: Cartographer
section_order: 10
order: 0
summary: Draw dungeon maps with tile packs, publish them to Atlas sites, and reuse the same editor inside a site's Build mode.
keywords: cartographer, dungeon map, tile map, floor, wall, door, water, grate, sluice, decal, stairs, shadow, object, annotation, publish, atlas, map editor, space, structure
---

**Cartographer** is Grimoire's tile-based map editor. Draw rooms cell by cell, place walls and doors, stamp furniture and objects, annotate areas, and export the result as a polished image, or publish it into an Atlas site, where Grimoire reads the rooms and doors straight out of your drawing.

Find it two ways: **Compendium → Dungeon Craft**, the **Cartographer** tab (works on phone and desktop); or **Publish → Cartographer** in the sidebar (desktop only) at `/cartographer`. Both open the same list of maps. Maps are independent of campaigns: any map can be published to any Atlas site, and you can have as many as you need.

## Getting started

1. From the map list, click **New Map**.
2. Pick a tile set from the **tile set menu** in the bar along the top: only sets with complete art appear here; which ones that is can change as Grimoire's built-in packs get illustrated, or as you upload/generate your own (see [Cartographer: Tile Packs](#cartographer-tile-packs)). Incomplete slots draw as flat procedural placeholders rather than blocking you.
3. Select the **Tiles** tool in the rail on the left and paint your rooms by clicking and dragging.
4. Add walls with the **Wall** tool, and doors with the **Door** tool.
5. Click **Save**.

## The canvas

The canvas is infinite: there's no fixed map size, so there's no "how big should this be?" decision to make up front.

While you edit, the map gets the whole screen: the app's sidebar steps aside and one slim bar runs along the top with the map's name, the tile set, the light, the Spaces drawer, the map's settings, undo and redo, and Delete, Cancel and Save. The tools are an icon rail down the left edge (hover for the name and key). The active tool and its options float in a slip at the top left of the map, and the Spaces and Dressing panels open over its right edge. On a phone the rail lies along the bottom and the panels open as sheets.

| Action | Input |
| --- | --- |
| Paint / place | Left-click or drag |
| Pan | Middle-mouse drag, hold Space and drag, or two-finger trackpad pan |
| Zoom | Scroll wheel (25%–400%) |
| Center map | `C` key |
| Undo / Redo | `Ctrl Z` / `Ctrl Shift Z` |

The status bar along the bottom shows your cursor's cell coordinates, zoom level and floor-cell count, plus a Center button. Undo and Redo are in the bar at the top.

## Tools

| Tool | Key | What it does |
| --- | --- | --- |
| Brush | `V` | Drag to paint a round area of floor, not cell by cell. Hold Alt to erase; `[` and `]` shrink and grow the brush. |
| Tiles | `B` | Paints floor cells with a random variant from the active pack. |
| Eraser | `E` | Removes floor, walls, and objects from a cell. |
| Wall | `W` | Click a cell edge to place a wall; drag along multiple edges for a run. Shift+click a cell walls all 4 of its edges. The tool's options, at the top left of the map, pick what it places: **Wall**, **Grate**, **Sluice** or **Decal** (see Walls, grates and decals below). |
| Door | `D` | Click a wall edge to add a door; click an existing door to toggle open/closed (the door swings on its hinge); right-click removes it, leaving the wall. |
| Water | `H` | Paints water (or whatever the pack's liquid is) over the floor; a cell with no floor gets one. Hold **Alt** to erase the water and keep the floor. |
| Rock | `S` | Fills a cell with a thick, full-cell wall mass (battlement stone, mountain rock), different from the thin edge-based Wall tool. |
| Object stamp | `O` | Stamps furniture, chests, statues, braziers, stairs up and down, rubble, and debris from the pack. Each stamp carries the pack's own name, so a forest pack offers an "Old tree" where a dungeon offers a pillar. Turn a stair with `Q` and `E` to choose which side you climb or descend from. |
| Dressing | `G` | Places props from the library (tables, beds, coffins) at any angle, above the stamped objects. See Dressing below. |
| Rectangle | `R` | Drag to fill a rectangle of floor. Hold **Shift** to also wrap walls around the perimeter: the fastest way to make a room. |
| Line | `L` | Drag to draw a straight run of floor. |
| Fill | `F` | Flood-fills a contiguous floor region. |
| Wrap | `X` | One shot: walls every edge of the selected floor region that faces empty space. |
| Label | `T` | Labels a cell with a short text note: also what names a Space (see below). |
| Room | `M` | Click a centre, drag to size. Three shapes: Circle, Octagon, Hex, fills floor and auto-wraps walls around the perimeter. |
| Space | `P` | Click a floor region to select the room Grimoire has detected there: doesn't paint anything, drives the Spaces drawer below. |
| Link | `K` | Click a cell, then pick a trap, feature, encounter, or note to attach to it from the options at the top left. |
| Pan | (drag, badge **RMB**) | Middle-mouse or right-click drag pans from any tool. |

The rail groups the tools: **Look** (Select, Pan), **Floor** (Brush, Tiles, Rectangle, Line, Room, Fill, Water, Rock), **Walls** (Wall, Door, Wrap), **Things** (Object stamp, Dressing), **Notes** (Label, Link, Space) and the Eraser. Space and Link claim or annotate what the drawing *means* rather than adding pixels.

## Walls, grates and decals

With the Wall tool active, the options slip offers four kinds:

- **Wall** is the ordinary wall.
- **Grate** is bars across an opening in a wall, such as a canal passing under it. Grimoire does not treat it as a way out of a room.
- **Sluice** is a gate in a wall, for water leaving a room.
- **Decal** dresses a wall that is already there: a pipe mouth, a rat hole, a carving. Choose the decal from the list (a pack names its own), then click a wall. Hold **Alt** and click to take it off again. If the pack has no decals, the slip says so.

Grates and sluices paint like walls and replace a wall underneath. They never replace a door.

## Water and banks

Paint water with the **Water** tool (`H`). The water is drawn instead of the floor in that cell, and Grimoire adds a low curb along every edge where water meets dry floor, with a post where a curb meets a wall or turns a corner. The water sits sunk below its banks, darker along the top and left. You do not place curbs yourself. A pack without water art simply has none to paint, and a pack without curbs still gets the sunken look.

Erasing a floor cell takes its water with it.

## Shadows and depth

Grimoire draws shadows for you, from a light at the top left: walls, rock, statues and furniture throw soft shadows down and to the right, and low things like curbs throw short ones. Flat things (rubble, heaps, trap and feature markers) get only a thin dark line where they meet the floor, so they stay lying down. A staircase up is drawn above the shadows, because it climbs to the height of the walls. A staircase down looks like a hollow, with its top and left edges darkened. Lanterns, fires, torches and glowing things light up the floor around them in their own colour, and where two glows meet they mix. The same shadows and lights are in the picture you export or publish.

## Dressing

Dressing is a library of top-down props: long tables, beds, coffins, barrels. Unlike the Object stamp, a prop can be several cells big, sits above the objects, and turns to any angle.

Open the Dressing tool (`G`), pick a prop in the Dressing drawer on the right, and click the map to place it. A faint copy follows your cursor so you can see where it will land. After the click the prop stays selected: `Q` and `E` turn it a quarter turn, `[` and `]` nudge it one degree, and `Delete` removes it. The buttons under **Rotate** in the drawer do the same. With no prop selected, those keys turn the next one you place.

To move a prop, put it down first (click the picked prop again in the panel, or press `Esc`), then drag it on the map. Right-click, or hold **Alt** and click, removes the prop under the cursor, and the Eraser takes props before anything beneath them. Every placement, move, turn and removal is one step in Undo.

Props come in books, and every book is off until you switch it on. Click the **book icon** at the top of the Dressing panel to choose which books this campaign uses. Props already on a map keep showing even if you later switch their book off.

## Rooms are detected automatically

You don't declare rooms: Grimoire finds them. As you paint, the **Spaces** drawer (the Spaces button in the top bar) lists every enclosed floor region ("space") it detects by flood-filling the floor layer, cut wherever a wall, closed door, or open door/arch sits. Click **Space** and then a room on the canvas (or a row in the drawer) to select it and see:

- Its detected name (taken from the first **Label** on any of its cells; name a room by writing its name with the Label tool), with a field to rename it.
- **Ways out**: the doors/arches Grimoire found connecting it to its neighbours.
- Anything you've linked into it with the Link tool.

Nothing here writes to your Atlas until you publish. A **Re-detect** button just clears your current selection: detection itself is always live, recomputed on every stroke. Grimoire also tracks how many regions have changed since your last publish and shows it as a caution in the status bar once you've published at least once.

## Layers

Every map paints in this order: **Floor** (base terrain, with water drawn in place of the floor where you painted it) → **Solid Blocks** (full-cell thick walls) → **Walls** (edge segments, including doors, grates and sluices) → **Objects** (furniture/decoration) → **Annotations** (text labels). There is no separate zone-painting layer inside the Cartographer any more: hazard/terrain zones are drawn on a site's **Plan** once it's published; see [Sites: Maps, Rooms & Running a Dungeon](#sites-maps-rooms-running-a-dungeon).

## View mode and edit mode

Saved maps open in **view mode**, a clean, read-only view. Click **Edit** to switch to edit mode; click **Done** to return to the map list. In edit mode, **Cancel** discards unsaved changes and restores the last save; **Delete** (existing maps only) removes the map entirely and returns you to the list.

## Editing inside an Atlas site

The same editor also runs embedded inside a site's **Build** mode in the Atlas, where it works on that site's own drawing and shows a **Drawing / Plan** layer switch: Drawing is this Cartographer canvas, Plan is the Atlas's own room/door/zone layer traced on top of it. That workflow, and how publishing reconciles the two, is covered in [Sites: Maps, Rooms & Running a Dungeon](#sites-maps-rooms-running-a-dungeon); this page and [Cartographer: Export & AI Style](#cartographer-export-ai-style) describe the standalone editor instead.

## What your players see

Nothing directly: the Cartographer itself is DM-only prep. Once you publish a map to an Atlas site, players may see the resulting picture through the site's own Player Portal view, governed by that site's own visibility settings, see [Sites: Maps, Rooms & Running a Dungeon](#sites-maps-rooms-running-a-dungeon).

## Related

- [Cartographer: Export & AI Style](#cartographer-export-ai-style)
- [Cartographer: Tile Packs](#cartographer-tile-packs)
- [Sites: Maps, Rooms & Running a Dungeon](#sites-maps-rooms-running-a-dungeon)
- [Dungeon Craft: Overview](#dungeon-craft-overview)
