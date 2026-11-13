---
title: "Sites: Maps, Rooms & Running a Dungeon"
section: World Building
section_order: 2
order: 1
summary: Build a floor plan out of layered maps, rooms and doors, then explore the dungeon at the table on the Play screen, with fog, reachability and a room-by-room card.
keywords: site, dungeon, room, map, cartographer, edit map, explore, run, fog, door, plan, drawing, picture, layers, readiness, level, floor, storey, stair, basement, tower
---

A **site** is any [Atlas](#atlas-locations) location with a floor plan: a Building, Dungeon, Store, Tavern, Inn or Wilds. Where an ordinary location places its children with pins on a picture, a site places them as traced **rooms** (or, on a Wilds site, **grounds**) on a real map you can draw, scan or photograph. Select a site in the Atlas and its pane has two tabs, **Overview** and **Map**, and an action bar at the top: **Reveal**, ambience, **Explore** and **Details**. The map itself is edited in a full-screen editor you reach with the **Edit map** button on the Map tab.

## Key ideas

| Term | Meaning |
| --- | --- |
| Overview / Map | The two tabs of every place. The Overview lists the rooms (add, reorder and set ambience right there), the ways out and the prepared material; the Map tab shows the map. There is no separate editing state. |
| Edit map | The gilt button at the top-right of the Map tab. It opens the full-screen map editor and comes back to the Map tab when you press the back link. |
| Explore | The **Explore** button opens the Play screen for the site: the party's tokens walk the map, with the rooms listed on the left and the room ahead on the right. The same screen runs a fight when one starts. |
| The map stack | A site's map is up to three independent layers: **Picture** (a scan, photo, or AI-styled render), **Drawing** (a Cartographer map, shown as a transparent bake so the Picture shows through where nothing's painted), and **Plan** (the rooms, doors and zones traced on top). Any layer can be empty. |
| Room / Grounds | An ordinary child of a site, typed Room (or, on a Wilds site, Grounds). Listed and ordered in the Rooms panel, and optionally traced as a shape on the map. |
| Way out | A named, directional door between two rooms (or a room and a nested site): not the same mechanism as a plain location's "Related Locations." |
| Level | One floor of a site: the site itself is level 1, and each further floor is its own place under it, with its own map and rooms. See "Floors and levels" below. |
| Progress | The durable Explored / Cleared / Looted facts on a room or the site itself: a log, not a checkbox, so "never said" and "said no" stay distinct. |

## Turning a place into a site

Set its **Type** to Building, Dungeon, Store, Tavern, Inn or Wilds in the location editor. The site apparatus (the Explore button, the Rooms panel, the map editor with its Plan) appears automatically once the type qualifies.

## Building the map: Picture, Drawing and Plan

Open the **Map** tab of a site and press **Edit map**. A site with no map yet shows a card instead, with **Draw one**, **Bring a map** and **Blank grid**; each opens the same full-screen editor. A selector in the editor switches between the map's three layers, bottom-up:

1. **Picture**: a scan, screenshot or render. **Upload** (or **Replace**) adds it, and **Line up the grid** lays an amber grid over it: drag the grid to move it, use the arrow keys to nudge it a pixel, type how many squares fit across (the squares down follow from the picture's shape), or draw a box over one square and let the rest follow. Press **Done** to keep it or **Cancel** to drop it. Until the grid is lined up, rooms can't be traced onto the picture. **Remove** clears the picture and its grid. The same layer has a **This is a battle map, not a region** box: it no longer decides whether the map can be played, it only keeps a battle map out of the Atlas's geography zoom.
2. **Drawing**: the editor's own canvas, with the painting tools described in [Cartographer: Overview](#cartographer-overview). The Drawing autosaves; there's no Save button, and the top bar says **Saved** once it has. The Map menu has **Style it with AI…** (see below) and **Export for another VTT**.
3. **Plan**: once a Picture or Drawing exists, tracing happens directly on the canvas; if neither does, **Blank grid** (pick columns × rows) gives you a plan with no image underneath it at all.

### Bringing a map you already have

**Bring a map** (on the card above, on **New map** in the Cartographer, or by dropping a file onto a place's Map tab) takes PNG, JPEG and WebP pictures, GIF, WebM and MP4 moving maps, and Universal VTT files (`.dd2vtt`, `.uvtt`, `.df2vtt`). It shows the picture with the grid laid on it, so you can line it up, and asks where it lives: a new place, or one you already have.

- A grid size in the file name (`crypt_30x20.png`) is read for you.
- **A moving map** plays on the device you added it on. The file is kept in that browser rather than uploaded, and everyone else (players, your other devices) sees a still of it. On another device the map says it doesn't have the file and lets you pick it.
- **A Universal VTT file** brings its picture, its grid, and its walls, doors and lights. The walls are invisible (the picture already shows them) but block sight and light at the table, so the battle map has sight and light from the start. It works without a tile set, and it can't be added to a place that already has a Drawing.
- **Export for another VTT** (in the Map menu) goes the other way, writing your Drawing out as a `.dd2vtt` for Foundry, Roll20 and Owlbear.

### Styling the Drawing with AI

**Style it with AI…** in the Map menu re-renders your tile map in an artistic style, the same generator described in [Cartographer: Export & AI Style](#cartographer-export-ai-style), with the save target fixed to this site: there's no location to pick. Generating asks first, plainly, since saving has a real effect on your map stack: the styled render replaces this site's **Picture**, and the **Drawing** you were editing is set aside rather than deleted. It survives in your Cartographer, so you can reopen it (or start a fresh one), draw fixes on top of the new Picture, and style again. That's the loop: style, correct, style again, as many times as the map needs.

Each pass also sets the Picture's grid to match automatically, so the fresh Drawing you start next lines up with it right away. It's a first guess, not a guarantee, so check that the grid still looks right and use **Calibrate** if the AI drifted it a little.

The Drawing row shows a **Review N changes** link once your Cartographer drawing has moved ahead of what was last published: see "Publishing a drawing" below.

### The Cartographer, full screen

Edit map opens the Cartographer editor over the whole screen, with three tabs: **Base image** (1), **Drawing** (2) and **Zoning** (3). Zoning is where the map learns which areas are rooms, and its tools are on the left, each with its key:

- **Zone** (Z): outline an area and say what kind it is. A **Room** is a place in the Atlas; **Terrain**, **Hazard**, **Light**, **Trigger**, **Entrance** (where the party walks in when you explore the site) and **Marker** only mark the floor.
- **Door** (D): snap to a cell edge to place a door; its endpoints are worked out automatically from the rooms on either side.
- **Fill** (F): pour a zone of the chosen kind over a painted floor region of the Drawing, up to its walls, so you don't re-trace by hand what you just painted.
- **Erase** (E): drag across cells to take them out of any zone.

Most rooms are already there. The moment Zoning opens, every room the Drawing's walls make is in the list, marked **found**, and a header reads "N rooms found from the walls". Name a room, bind it to a place, or reshape it and it is yours from then on; **Find again** redraws only the rooms you never touched. A map with a base image but no drawing has nothing to find, so draw its rooms with the Zone tool.

Three ways to trace a room's shape once you're in the tool: drag-to-paint cells directly, the **pen** (click a genuine polygon outline, useful for angled walls: snap to intersections, hold the modifier key for half-cells), or a **template** (circle, octagon, hex) that drops a ready-made ring you can keep editing with the pen. See [Cartographer: Overview](#cartographer-overview) for the full tool reference and [Cartographer: Export & AI Style](#cartographer-export-ai-style) for styled/AI renders you can use as a site's Picture.

### Publishing a drawing

**Publish to Atlas** (opened via the Map menu's **Review** entry, or from the Cartographer editor itself) reconciles your drawing with the site rather than overwriting it: rooms are matched by their traced shape, ways out by the edge they sit on, and prepared items by cell: nothing you've hand-edited on the Atlas side is silently discarded. The review shows exactly what will be added, matched or left alone before you confirm.

## Rooms (or Grounds)

The **Rooms** panel (headed **Grounds** on a Wilds site) lists every room as a numbered row, in the order you set. It is always editable, on the Overview:

1. Type a name into the **Add a room…** box and press Enter (or click **Add**) to create one.
2. Drag a row by its handle to reorder.
3. Click a room's name to open it; renaming and deleting a room are on its own **Details**.
4. Set each room's own **Ambience**: inherits from the nearest themed ancestor by default; assign a theme label to override it, or pick "silence" to mute the room deliberately.

Rows show **Cleared**/**Looted** markers read-only whenever those facts have been asserted.

### Filling an unwritten room

A room with no description shows **Unwritten** and a **Fill** button, in the quest handoff as well as here. Fill opens an editor in place: write the room yourself, or, when AI is on for the campaign, type an optional steer ("a flooded shrine", "a guard post") and click **Roll it with AI**. The AI reads the site, the level the room is on, the rooms it connects to and the ways out you have recorded, and writes a short passage to read aloud (shown as a quote), a paragraph about the room for you, and a few things worth noting. It never invents exits you have not drawn, and secret doors stay out of the read-aloud.

The result lands in the editor, not in the room: change anything you like, then click **Save**. Rolling costs credits, shown next to the button.

## Ways out

Every room has a **Ways out** section listing its doors. A site-wide view of the whole door graph is also available higher up the page. These lists read the doors; one that is not on the map yet says **not on the map** and offers **Place it**, which opens the editor on the Plan. Doors are added and edited in the editor's Plan:

1. Pick the room or nested site to connect to, a **kind** (Door, Arch, Stair, Shaft, Portal), and an optional **label** (read-aloud text: "iron grille," "collapsed stair").
2. Check **One-way**, **Starts locked** (and add a **lock note**: what opens it), or **Secret** as needed.
3. Click **Add**.

These three flags are what you authored in prep and stay editable as you revise your plans: they are **not** the same as whether the party has actually opened, unlocked or found the door during play. That's tracked separately (see Progress, below) and never overwrites your authored flags. A door only needs its **endpoints** recreated if you want to change what it connects; everything else edits in place.

## Floors and levels

A site with more than one floor (a tower, a house with a cellar, a dungeon that goes down three storeys) is built as **levels**. The site itself is level 1: its own map, its own rooms. Every further floor is a place of its own filed under the site, with its own map and its own rooms, so each floor is drawn, styled with AI, traced and run on its own. That keeps every floor's map at the size it needs and lets the AI styler work on one floor at a time.

**Adding a level.** In the editor, the level control in the top bar offers **Add a level** (or the **+** beside the list once there are several). It creates the next floor, named "Level 2", "Level 3" and so on (rename it whatever you like), and opens it ready to draw. On the Map tab, the levels list beside the map also offers **Draw level N** and **Clone this level**, which copies a level's floor plan, rooms and ways out, never its play state or loot.

**Moving between levels.** In the editor, pick a level from the same control; your drawing is saved before it switches. On the Map tab, click a level in the list beside the map. Whether a place is one of its parent's floors is set in its **Details**.

**Stairs between levels.** Draw a stair where it stands on the floor plan. When you publish that floor, the review asks where each stair leads, and you pick the level. Stairs between two floors further down the stack show in the levels list's **Vertical ways out**.

**A shop or a shrine is not a floor.** A place inside a floor (a shop off a lane, a chapel in a hall) belongs on that floor's map as one of its rooms, even when it is a store or a building of its own. Once the floor's map is published and that place has its area on it, it no longer appears in the levels list: only places with no area on the floor above count as floors. Until you publish, it may briefly show up there.

## Zones

The **Zones on this map** list in Zoning is the one list of everything you can outline: rooms first (found from the walls, or bound to a place), then every other kind, each with its kind and a short state such as "found", "found · renamed", "bound" or "terrain · difficult". An unnamed room reads "Room 3" with a **Name it** button. Draw a zone with the Zone tool after choosing its kind; for a trigger zone, pick the beat it should prompt when the party stands on it (advancing still needs a DM click: nothing fires automatically). Zones other than rooms are DM ink by default; mark one **Shown** to have it show to players, clipped to what the party has actually explored.

## Progress

Every location, room, site, or anything above it, carries three toggles: **Explored**, **Cleared**, **Looted**. Clicking one appends the opposite of its current value; nothing is ever silently edited or erased, so you can always tell "never asserted" (a plain outline pill) from "explicitly false" (a soft red pill) from "explicitly true" (a solid green pill). Hover a pill to see who asserted it and when.

## Loot

Any location with a campaign, most often a room, can hold prepared loot in its **Loot** section: an **Item** from your Vault, a pile of **Currency**, or a **Chest** rolled from a loot table (roll once, hold the result, drop it to chat later; **re-roll** if you don't like it). Dropping loot to chat automatically marks the room **Looted**.

## Exploring the site at the table

Click **Explore** on a site in the Atlas (or on a beat staged there, see below) to open the Play screen, which fills the window. **‹ Atlas** in the top bar brings you back to the site's Map tab. A gilt **Exploring** chip says what you are doing, and **Start a fight** is always one click away.

- **The map.** The party's tokens stand on the site's map, and the fog shows over what the party has not seen, translucent so you can still read the map. It is the same fog the fights on this map use. As the characters walk, what they can see lifts it, and in **Remembered** mode (Campaign Settings) it stays lifted. Your players see their own version on the table screen and their phones. Click a square and everyone moves together, keeping their order. Click one token to send it alone; press Esc, or **Move everyone** on the left, to bring the party back. The tokens remember where they stood, so a fight that starts here begins with everyone in place.
- **Stepping into a room.** When the lead token walks into a room, the party is now in that room and it is recorded as Explored. Nothing asks you first. If a fight is prepared in that room and has not been run, a note appears at the top: *Ambush at the crypt is set here.* **Start it** opens the fight live on the Play screen; **Not now** dismisses it while the party stays in that room.
- **The party and the rooms** (left). Each character with a thin hit point bar, then every room as explored, entering or hidden. Click a room to move the party into it, even before anything is traced.
- **The room ahead** (right). The read-aloud text, then prompts for anything prepared there (traps, roll tables, undiscovered secret ways out), the room's Explored, Cleared and Looted pills, **Waiting here** with any fight staged in the room and a **Fight here** button, and the **ways out** (Move, Unlock, Reveal per door). A fight starts on this same screen: initiative slides in on the left and the room card becomes the turn card, and the top bar's **‹ site name** brings you back here.
- **A site whose map has no grid yet** shows its plan instead: click a room to move the party into it. Line the grid up in Edit map and the party can walk it square by square.

Moving the party into a room is a single write to the campaign's current location; arriving somewhere for the first time is recorded as Explored automatically. Nothing else here fires on its own: unlocking, revealing and looting are all deliberate clicks, never automatic consequences of movement.

### Quests staged at a site

A quest beat can be staged at a site, or at one specific room inside it (see [Running a Quest at the Table](#running-a-quest-at-the-table)). When one is, the room card shows a beat card with a **Resolve beat**/**Back to the beat** link into the quest's opened beat: the room stack you're looking at is the same read-aloud-and-payoff idiom the opened beat itself uses, because a room is, in effect, a zoomed-in beat. A room's **Cleared** fact can also satisfy a quest objective directly, authored from [Quest Story Flow](#quest-story-flow-beats-routes-objectives) or from the room's own Spaces panel in Build.

## What your players see

Players never see your raw map or plan. What they get is composed fresh from what the party has actually explored: explored rooms in full, glimpsed rooms (sharing a known, non-secret door with an explored one) as a bare outline with no name or contents, and ways out only where at least one end has been explored: a locked door still draws as a plain door, with no lock note. Unexplored geometry, secret doors, hazard details, room notes and trap DCs are never sent to the client at all, not merely hidden by the UI.

The site editor has its own **Preview as players** toggle so you can check exactly what a specific shared party member would see before a session, without changing any data.

## Tips

> Line up the grid on the Picture before you try to trace anything on it: an image without a grid shows the map but refuses tracing, because there's no grid to trace onto yet.

- A door with a region on only one side draws dashed: "leads nowhere yet." It resolves itself the moment you trace the far room; there's nothing to fix by hand.
- The readiness meter on the Atlas pane (Mapped / Calibrated / Traced / Bound / Ways out) is a pre-session gap check, not a requirement: a site is fully runnable via its room list alone, traced or not.
- Removing a site's Picture also clears its grid; a Drawing carries its own independent grid, so it isn't affected.
- Cleared/Looted facts belong to the room, not to any one quest: a party returning on a different quest chain four sessions later still finds a looted vault looted.

## Related

- [Atlas: Locations](#atlas-locations)
- [Cartographer: Overview](#cartographer-overview)
- [Cartographer: Export & AI Style](#cartographer-export-ai-style)
- [Quest Story Flow: Beats, Routes & Objectives](#quest-story-flow-beats-routes-objectives)
- [Running a Quest at the Table](#running-a-quest-at-the-table)
