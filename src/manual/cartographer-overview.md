---
title: Cartographer: Overview
section: Cartographer
section_order: 10
order: 0
summary: Draw dungeon maps with tile packs, publish them to Atlas sites, and reuse the same editor full screen from a site's Edit map button.
keywords: cartographer, dungeon map, tile map, floor, wall, door, water, grate, sluice, decal, stairs, shadow, object, annotation, publish, atlas, map editor, space, structure
---

**Cartographer** is Grimoire's tile-based map editor. Draw rooms cell by cell, place walls and doors, stamp furniture and objects, annotate areas, and export the result as a polished image, or publish it into an Atlas site, where Grimoire reads the rooms and doors straight out of your drawing.

Find it two ways: **Compendium → Dungeon Craft**, the **Cartographer** tab (works on phone and desktop); or **Publish → Cartographer** in the sidebar (desktop only) at `/cartographer`. Both open the same list of maps. Maps are independent of campaigns: any map can be published to any Atlas site, and you can have as many as you need.

## Getting started

1. From the map list, click **New Map**.
2. Pick a tile set from the two small squares at the foot of the tool rail (click one to open the sets as a grid of pictures; hover a picture for its name): only sets with complete art appear here; which ones that is can change as Grimoire's built-in packs get illustrated, or as you upload/generate your own (see [Cartographer: Tile Packs](#cartographer-tile-packs)). Incomplete slots draw as flat procedural placeholders rather than blocking you.
3. Select the **Tiles** tool in the rail on the left and paint your rooms by clicking and dragging.
4. Add walls with the **Wall** tool, and doors with the **Door** tool.
5. That's it: the map saves itself a moment after each change, and the bar says **Saved**.

## The canvas

The canvas is infinite: there's no fixed map size, so there's no "how big should this be?" decision to make up front.

While you edit, the map gets the whole screen: the app's sidebar steps aside and one slim bar runs along the top with the map's name, the light, the map's settings, undo and redo, the save state, and the **Map** menu (style, publish, download, delete). The tools are an icon rail down the left edge (hover for the name and key). At its foot sit two overlapping squares, like Photoshop's two colours: the top one is the tile set you paint with, the one behind it is a second set. **X**, or a click on the small X in the corner of the pair, swaps the two, the way Photoshop's X swaps its colours. Each map remembers its own second set. The active tool and its options float in a slip at the top left of the map, and the Spaces and Place panels open over its right edge. On a phone the rail lies along the bottom and the panels open as sheets.

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
| Brush | `V` | Drag to paint a round room with its own smooth wall. A stroke that starts inside a room grows it; one on empty ground makes a new room. Hold Alt to carve floor out. `[` and `]` shrink and grow the brush. |
| Tiles | `B` | Paints floor cells with a random variant from the active pack. |
| Eraser | `E` | Removes floor, walls, and objects from a cell. |
| Wall | `W` | Click a cell edge to place a wall; drag along multiple edges for a run. Shift+click a cell walls all 4 of its edges. The tool's options, at the top left of the map, pick what it places: **Wall**, **Grate**, **Sluice** or **Decal** (see Walls, grates and decals below). |
| Door | `D` | Click a wall edge to add a door; click an existing door to toggle open/closed (the door swings on its hinge); right-click removes it, leaving the wall. |
| Water | `H` | Paints water (or whatever the pack's liquid is) over the floor; a cell with no floor gets one. Hold **Alt** to erase the water and keep the floor. |
| Rock | `S` | Fills a cell with a thick, full-cell wall mass (battlement stone, mountain rock), different from the thin edge-based Wall tool. |
| Place | `O` | Puts down objects from the tile set (chests, statues, braziers, stairs up and down, rubble, debris) and props from the library (tables, beds, coffins). Pick from the pictures in the Place panel. See Place below. Turn a stair with `Q` and `E` to choose which side you climb or descend from. |
| Rectangle | `R` | Drag to fill a rectangle of floor. Hold **Shift** to also wrap walls around the perimeter: the fastest way to make a room. |
| Line | `L` | Drag to draw a straight run of floor. |
| Fill | `F` | Flood-fills a contiguous floor region. |
| Wrap | `J` | One shot: walls every edge of the selected floor region that faces empty space. |
| Label | `T` | Labels a cell with a short text note: also what names a room Grimoire finds (see below). |
| Room | `M` | Click a centre, drag to size. Three shapes: Circle, Octagon, Hex, fills floor and auto-wraps walls around the perimeter. |
| Link | `K` | Click a cell, then pick a trap, feature, encounter, or note to attach to it from the options at the top left. |
| Pan | (drag, badge **RMB**) | Middle-mouse or right-click drag pans from any tool. |

The rail groups the tools: **Look** (Select, Pan), **Floor** (Brush, Tiles, Rectangle, Line, Room, Fill, Water, Rock), **Walls** (Wall, Door, Wrap), **Things** (Place), **Notes** (Label, Link) and the Eraser. Label and Link annotate what the drawing *means* rather than adding pixels.

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

## Place

Place puts things on the map from one panel of pictures. Press `O` and the Place panel opens on the right. At the top is a search box that looks through everything below it by name, label and tag. Under it, newest first, are the last things you picked.

**The tile set's own objects** come first. Kinds with a single picture are one captioned tile each. A kind with several (chests, say) has its own row: an **Any** tile, which mixes the variants by position the way the stamp always did, and then one picture per variant, so you can choose the exact chest you want. Hover a picture for its name.

**Props** come next: long tables, beds, coffins, barrels. A prop can be several cells big, sits above the objects, and turns to any angle. They come in books, grouped by kind under each book's name. Below your books is **More books**: every book you have not switched on, with how many props it holds, a few of its pictures, and an **Enable** button. Enable one and its props appear in the panel at once. The book icon at the bottom of the panel manages the list, and props already on a map keep showing even if you later switch their book off.

Pick a picture and click the map to place it; for an object, drag to paint a run of them. A prop shows a faint copy that follows your cursor, and after the click it stays selected: `Q` and `E` turn it a quarter turn, `[` and `]` nudge it one degree, and `Delete` removes it. The **Rotate** buttons in the slip at the top left of the map do the same, and with nothing selected those keys turn the next thing you place.

The quickest way to move or turn a prop is the **Select** tool (`V`): click a prop, a light or a wall and it is picked, with its own options at the top left (turn and Delete for a prop, colour and reach for a light, the segments and doors for a wall); drag a prop or a light to move it. Click empty floor to pick the cell instead, and `Esc` puts down whatever is picked. **Shift**+click adds a piece to the pick or takes it out, and a drag on empty ground draws a box that picks everything whose centre is inside it. Drag any picked piece and the whole pick moves together, as one step in Undo. Hold **Space** and drag, or use the middle button, the wheel or the Pan tool (`H`), to move the map. Select reaches a prop even while you hold something in Place. You can also put what you are holding down first (`Esc`), then drag the prop with Place. Right-click, or hold **Alt** and click, takes away the prop under the cursor, or the object if there is no prop, and the Eraser takes props before anything beneath them. Every placement, move, turn and removal is one step in Undo.

## Reshaping walls

Click a wall with **Select** and that one segment is picked, with a handle on each end (a **node**) and the slip at the top left counting it ("Wall · 1 segment"). **Alt**+click picks the whole wall instead, every segment joined to it ("Wall · 12 segments · 3 doors"). **Shift**+click adds a segment, or takes a picked one out, and a box drawn with **V** picks the nodes inside it and the segments between them. Drag a picked wall by its middle and every picked piece moves with it; drag a node to move that node alone (or all of a Shift or box pick).

- **Drag a node** and every wall meeting there follows. Drop it on another wall and it snaps on and joins it; a loop that closes fills with floor, and squares left outside lose theirs.
- The floor follows the wall: where a wall runs at an angle, the floor is cut to its line, so no corner of a square pokes out past it and none is left bare under it.
- **Double-click a wall** to put a node there, or drag the middle of a wall to do the same and bend it as you go.
- **Double-click a node** to switch it between a **curve** (round handle: the wall bends smoothly through it) and a **corner** (square handle: a sharp angle). Walls you draw start with corners. A node where three walls meet, or where a door ends, stays a corner. Drag a curved node and the wall bends with it.
- **Delete** on a node joins its two walls into one. Delete on picked segments takes just those away.
- **Shift**-drag a picked segment to slide it sideways; **Shift** while dragging a node holds it to 45 degrees. **Alt** skips the grid. **Esc** lets go of a drag, and one gesture is one step in Undo.
- Off the grid, tile walls become lines in the tile set's wall colour; back on the grid they are tiles again.

## The round brush and walls

The Brush never removes a wall. A stroke that starts inside a room grows that room: its wall moves out to the new edge, and the stroke stops at any other room's wall. To join two rooms, select the wall between them and press **Delete**. Hold **Alt** to carve floor out instead, and the room's wall follows the new edge. A stroke that starts on empty ground makes a new room with a wall of its own. The wall a round brush makes is smooth and has only a few nodes, so you can select it and drag a node like any other wall.

Maps drawn with the older brush, which had no walls of its own, are converted the first time you open them: their round edges become walls and the floor stays where it was.

## Rooms are found on the Zoning tab

You don't declare rooms: Grimoire finds them from your walls. On a site's **Zoning** tab (`3`) the list shows every enclosed floor region it detects, cut wherever a wall, closed door, or open door/arch sits. Pick **Zone** (`Z`) and click a room to name it, bind it to a place in your Atlas, or trace a zone over it. `D` places a door, `F` fills a region and `E` erases; on the Drawing tab those letters are the Drawing's own tools.

Nothing here writes to your Atlas until you publish. Grimoire also tracks how many regions have changed since your last publish and shows it as a caution in the status bar once you've published at least once.

## Motion

Flowing water, swaying trees and every light play on every map that has them, the editor included, exactly as the battle map shows them. Warm, flame-coloured lights (a campfire, brazier, torch or candelabra) flicker: the circle of light swells and shrinks by about a seventh, unevenly, out of step with the next fire. Every other light (glowing moss, a crystal, a magical glow) pulses, a slow even breath of about a tenth over three seconds. In the Light tool you can switch a placed light between Flicker and Pulse. The **Motion** button in the map's corner pauses them while you edit and plays them again; this device remembers the choice. If your device asks for reduced motion, they stay still.

## Layers

Every map paints in this order: **Floor** (base terrain, with water drawn in place of the floor where you painted it) → **Solid Blocks** (full-cell thick walls) → **Walls** (edge segments, including doors, grates and sluices) → **Objects** (furniture/decoration) → **Annotations** (text labels). There is no separate zone-painting layer inside the Cartographer any more: hazard/terrain zones are drawn on a site's **Zoning** tab once it's published; see [Sites: Maps, Rooms & Running a Dungeon](#sites-maps-rooms-running-a-dungeon).

## Saving and leaving

A saved map opens straight in the editor; there is no separate view mode, and no Save, Cancel or Done. The map saves itself a moment after you stop drawing, and the back link in the bar returns you to the map list (a pending save finishes first). A new map is created by its first change. **Delete** in the **Map** menu (existing maps only) removes the map entirely and returns you to the list.

## Editing inside an Atlas site

The same editor also opens full screen from a site's **Edit map** button in the Atlas, where it works on that site's own drawing and shows three tabs, **Base image / Drawing / Zoning** (keys `1`, `2`, `3`): Base image is the scan or render under everything, Drawing is this Cartographer canvas, and Zoning is the Atlas's own room/door/zone layer traced on top of it. Only the active tab's tools show in the rail, and the tabs below it show dimmed underneath. A base image whose grid is not lined up yet still shows, on a guessed grid, with a **Grid not lined up** chip that takes you to the line-up.

The **Grid** button in the bar (key `G`) shows or hides the square grid on every tab. Its caret opens the grid options: how strong the lines are (Faint, Clear or Bold), how big a square is on the base image, and **Line up with the base image**. Your choice is remembered on this device. Zoning and Drawing open fitted to the whole map the first time you enter them. That workflow, and how publishing reconciles the two, is covered in [Sites: Maps, Rooms & Running a Dungeon](#sites-maps-rooms-running-a-dungeon); this page and [Cartographer: Export & AI Style](#cartographer-export-ai-style) describe the standalone editor instead.

## What your players see

Nothing directly: the Cartographer itself is DM-only prep. Once you publish a map to an Atlas site, players may see the resulting picture through the site's own Player Portal view, governed by that site's own visibility settings, see [Sites: Maps, Rooms & Running a Dungeon](#sites-maps-rooms-running-a-dungeon).

## Related

- [Cartographer: Export & AI Style](#cartographer-export-ai-style)
- [Cartographer: Tile Packs](#cartographer-tile-packs)
- [Sites: Maps, Rooms & Running a Dungeon](#sites-maps-rooms-running-a-dungeon)
- [Dungeon Craft: Overview](#dungeon-craft-overview)
