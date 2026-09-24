---
title: Cartographer — Overview
section: Cartographer
section_order: 10
order: 0
summary: Draw dungeon maps with tile packs, publish them to Atlas sites, and reuse the same editor inside a site's Build mode.
keywords: cartographer, dungeon map, tile map, floor, wall, door, object, annotation, publish, atlas, map editor, space, structure
---

**Cartographer** is Grimoire's tile-based map editor. Draw rooms cell by cell, place walls and doors, stamp furniture and objects, annotate areas, and export the result as a polished image — or publish it into an Atlas site, where Grimoire reads the rooms and doors straight out of your drawing.

Find it two ways: **Compendium → Dungeon Craft**, the **Cartographer** tab (works on phone and desktop); or **Publish → Cartographer** in the sidebar (desktop only) at `/cartographer`. Both open the same list of maps. Maps are independent of campaigns — any map can be published to any Atlas site, and you can have as many as you need.

## Getting started

1. From the map list, click **New Map**.
2. Pick a tile pack from the **Pack picker** on the right — only packs with complete art appear here; which ones that is can change as Grimoire's built-in packs get illustrated, or as you upload/generate your own (see [Cartographer — Tile Packs](#cartographer-tile-packs)). Incomplete slots draw as flat procedural placeholders rather than blocking you.
3. Select the **Floor brush** and paint your rooms by clicking and dragging.
4. Add walls with the **Wall** tool, and doors with the **Door** tool.
5. Click **Save**.

## The canvas

The canvas is infinite — there's no fixed map size, so there's no "how big should this be?" decision to make up front.

| Action | Input |
| --- | --- |
| Paint / place | Left-click or drag |
| Pan | Middle-mouse drag, hold Space and drag, or two-finger trackpad pan |
| Zoom | Scroll wheel (25%–400%) |
| Center map | `C` key |
| Undo / Redo | `Ctrl Z` / `Ctrl Shift Z` |

The status bar along the bottom shows your cursor's cell coordinates, zoom level, active tool, pack, and floor-cell count, plus Center/Undo/Redo buttons.

## Tools

| Tool | Key | What it does |
| --- | --- | --- |
| Floor brush | `B` | Paints floor cells with a random variant from the active pack. |
| Eraser | `E` | Removes floor, walls, and objects from a cell. |
| Wall | `W` | Click a cell edge to place a wall; drag along multiple edges for a run. Shift+click a cell walls all 4 of its edges. |
| Door | `D` | Click a wall edge to add a door; click an existing door to toggle open/closed; right-click removes it, leaving the wall. |
| Solid block | `S` | Fills a cell with a thick, full-cell wall mass (battlement stone, mountain rock) — different from the thin edge-based Wall tool. |
| Object stamp | `O` | Stamps furniture, chests, statues, braziers, rubble, and debris from the pack. |
| Rectangle | `R` | Drag to fill a rectangle of floor. Hold **Shift** to also wrap walls around the perimeter — the fastest way to make a room. |
| Line | `L` | Drag to draw a straight run of floor. |
| Fill | `F` | Flood-fills a contiguous floor region. |
| Wrap walls | `X` | One shot: walls every edge of the selected floor region that faces empty space. |
| Annotate | `T` | Labels a cell with a short text note — also what names a Space (see below). |
| Room template | `M` | Click a centre, drag to size. Three shapes: Circle, Octagon, Hex — fills floor and auto-wraps walls around the perimeter. |
| Cave brush | `V` | Drag to paint organic floor blobs with a new noise pattern each stroke; four brush sizes. |
| Space | `P` | Click a floor region to select the room Grimoire has detected there — doesn't paint anything, drives the Structure panel below. |
| Link entity | `K` | Click a cell, then pick a trap, feature, encounter, or note to attach to it from the side panel. |
| Pan | (drag, badge **RMB**) | Middle-mouse or right-click drag pans from any tool. |

Space and Link entity are grouped as **Structure** tools in the palette, separate from the paint tools above — they claim or annotate what the drawing *means* rather than adding pixels.

## Rooms are detected automatically

You don't declare rooms — Grimoire finds them. As you paint, the **Structure** panel on the right lists every enclosed floor region ("space") it detects by flood-filling the floor layer, cut wherever a wall, closed door, or open door/arch sits. Click **Space** and then a room on the canvas (or a row in the panel) to select it and see:

- Its detected name (taken from the first **Annotate** label on any of its cells — name a room by writing its name with the Annotate tool), with a field to rename it.
- **Ways out** — the doors/arches Grimoire found connecting it to its neighbours.
- Anything you've linked into it with the Link entity tool.

Nothing here writes to your Atlas until you publish. A **Re-detect** button just clears your current selection — detection itself is always live, recomputed on every stroke. Grimoire also tracks how many regions have changed since your last publish and shows it as a caution in the status bar once you've published at least once.

## Layers

Every map paints in this order: **Floor** (base terrain) → **Solid Blocks** (full-cell thick walls) → **Walls** (edge segments, including doors) → **Objects** (furniture/decoration) → **Annotations** (text labels). There is no separate zone-painting layer inside the Cartographer any more — hazard/terrain zones are drawn on a site's **Plan** once it's published; see [Sites — Maps, Rooms & Running a Dungeon](#sites-maps-rooms-running-a-dungeon).

## View mode and edit mode

Saved maps open in **view mode** — a clean, read-only view. Click **Edit** to switch to edit mode; click **Done** to return to the map list. In edit mode, **Cancel** discards unsaved changes and restores the last save; **Delete** (existing maps only) removes the map entirely and returns you to the list.

## Editing inside an Atlas site

The same editor also runs embedded inside a site's **Build** mode in the Atlas, where it works on that site's own drawing and shows a **Drawing / Plan** layer switch — Drawing is this Cartographer canvas, Plan is the Atlas's own room/door/zone layer traced on top of it. That workflow, and how publishing reconciles the two, is covered in [Sites — Maps, Rooms & Running a Dungeon](#sites-maps-rooms-running-a-dungeon); this page and [Cartographer — Export & AI Style](#cartographer-export-ai-style) describe the standalone editor instead.

## What your players see

Nothing directly — the Cartographer itself is DM-only prep. Once you publish a map to an Atlas site, players may see the resulting picture through the site's own Player Portal view, governed by that site's own visibility settings — see [Sites — Maps, Rooms & Running a Dungeon](#sites-maps-rooms-running-a-dungeon).

## Related

- [Cartographer — Export & AI Style](#cartographer-export-ai-style)
- [Cartographer — Tile Packs](#cartographer-tile-packs)
- [Sites — Maps, Rooms & Running a Dungeon](#sites-maps-rooms-running-a-dungeon)
- [Dungeon Craft — Overview](#dungeon-craft-overview)
