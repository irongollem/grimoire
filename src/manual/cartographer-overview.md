---
title: Cartographer — Overview
section: Cartographer
section_order: 9
order: 0
summary: Draw dungeon maps with tile packs, export them, and link them to Atlas locations.
keywords: cartographer, dungeon map, tile map, floor, wall, door, object, annotation, export, PNG, atlas, map editor
---

**Cartographer** (`/cartographer`) is Grimoire's tile-based dungeon map editor. Draw rooms cell by cell, place walls and doors, stamp furniture and objects, annotate areas, and export the result as a polished image — or run it through AI to re-render it in a completely different artistic style.

Maps are independent from campaigns. Any map can be linked to any Atlas location, and you can have as many maps as you need.

## Getting started

1. Click **New Map** from the Cartographer list.
2. Pick a **tile pack** from the toolbox on the left — _Stone Dungeon_ is the default.
3. Select the **Floor** tool and paint your rooms by clicking and dragging.
4. Add walls with the **Wall** tool, and doors with the **Door** tool.
5. Click **Save** when you're happy.

## The canvas

The canvas fills the editor area. Zoom with the scroll wheel, pan with **right-click drag** or the dedicated **Pan** tool.

| Action | Input |
|---|---|
| Paint / place | Left-click or drag |
| Pan | Right-click drag (any tool) |
| Zoom | Scroll wheel |
| Center map | `C` key |
| Undo / Redo | `Ctrl Z` / `Ctrl Shift Z` |

## Tools

| Tool | Key | What it does |
|---|---|---|
| Floor | `F` | Paint floor cells |
| Eraser | `E` | Remove floor, walls, and objects from a cell |
| Pan | `Space` | Drag to pan the viewport |
| Wall | `W` | Click cell edges to place walls |
| Door | `D` | Click edges to place closed/open doors |
| Solid Block | `B` | Fill a cell with a solid block (wall-like tile) |
| Rect Fill | `R` | Drag to fill a rectangle of floor cells |
| Line | `L` | Drag to draw a straight run of walls or floor |
| Flood Fill | `G` | Fill a contiguous region |
| Wrap Walls | `A` | Auto-place walls around the boundary of a floor region |
| Object Stamp | `O` | Stamp furniture, chests, pillars, and other objects |
| Annotate | `T` | Label a cell with a short text note |
| Entity Link | `K` | Link a cell to a note or encounter |

## Tile packs

Tile packs control the visual style of your map. Each pack includes floor variants, wall segments, door tiles, solid blocks, and optional objects. You can switch the active pack at any time during painting — different regions of the map can use different packs.

Available packs: Stone Dungeon, Icy Cave, Wood Interior, Sandy Ruins, Forest, Black Rock, Lava Cavern, Underdark, Water, Sewer/Swamp, Marble Palace.

## Layers

Every map has four layers, painted in order:

1. **Floor** — base terrain
2. **Solid Blocks** — walls that fill an entire cell
3. **Walls** — edge segments on cell boundaries (includes doors)
4. **Objects** — furniture and decorative stamps
5. **Annotations** — text labels overlaid on cells

## View mode and edit mode

Saved maps open in **view mode** — a clean read-only view with no toolboxes. The full canvas width is used for display.

- Click **Edit** to enter edit mode (`?edit=true` URL parameter).
- Click **Done** to return to the map list.
- Changes made in edit mode can be discarded with **Cancel**, which restores the last saved state.

→ _See Cartographer: Export & Atlas_ for exporting maps and the AI Style feature.
