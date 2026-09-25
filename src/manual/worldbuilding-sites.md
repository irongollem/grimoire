---
title: "Sites: Maps, Rooms & Running a Dungeon"
section: World Building
section_order: 2
order: 1
summary: Build a floor plan out of layered maps, rooms and doors, then run the dungeon at the table with fog, reachability and a room-by-room stack.
keywords: site, dungeon, room, map, cartographer, build, browse, run, fog, door, plan, drawing, picture, layers, readiness
---

A **site** is any [Atlas](#atlas-locations) location with a floor plan: a Building, Dungeon, Store, Tavern, Inn or Wilds. Where an ordinary location places its children with pins on a picture, a site places them as traced **rooms** (or, on a Wilds site, **grounds**) on a real map you can draw, scan or photograph. Select a site in the Atlas and its pane offers three states in the action bar at the top: **Build**, **Run**, and **Details**. All three open right there in the Atlas.

## Key ideas

| Term | Meaning |
| --- | --- |
| Browse / Build | A site's two working states. Browse (the default) only lets you take play actions: Explored/Cleared/Looted, loot, reveal, restock, clicking into a room. Click **Build** to switch to the state where every structural edit lives (adding rooms, doors, tracing the plan) and nothing in it is ever live in Browse. |
| Run | A separate layout, opened with the **Run** button, for running the dungeon at the table: the room list, the map and a room-by-room stack, side by side. |
| The map stack | A site's map is up to three independent layers: **Picture** (a scan, photo, or AI-styled render), **Drawing** (a Cartographer map, shown as a transparent bake so the Picture shows through where nothing's painted), and **Plan** (the rooms, doors and zones traced on top). Any layer can be empty. |
| Room / Grounds | An ordinary child of a site, typed Room (or, on a Wilds site, Grounds). Listed and ordered in the Rooms panel, and optionally traced as a shape on the map. |
| Way out | A named, directional door between two rooms (or a room and a nested site): not the same mechanism as a plain location's "Related Locations." |
| Progress | The durable Explored / Cleared / Looted facts on a room or the site itself: a log, not a checkbox, so "never said" and "said no" stay distinct. |

## Turning a place into a site

Set its **Type** to Building, Dungeon, Store, Tavern, Inn or Wilds in the location editor. The site apparatus (Build/Run buttons, the Rooms panel, the Layers panel) appears automatically once the type qualifies.

## Building the map: the Layers panel

Open **Build** on a site, and its map area shows the **Layers** panel above the canvas: one row per layer of the stack, bottom-up:

1. **Picture**: upload a scan or photo. Once uploaded, **Calibrate** (or **Re-calibrate**) sets the grid so cells line up with the image; until it's calibrated, rooms can't be traced onto it. **Replace** swaps the image; **Remove** clears both the picture and its calibration.
2. **Drawing**: **Open** an existing Cartographer drawing, or **Start drawing** to create one named after this site. This opens the Cartographer editor **in place**, right below the panel: see [Cartographer: Overview](#cartographer-overview) for the painting tools themselves. The Drawing autosaves; there's no Save button in Build.
3. **Plan**: once a Picture or Drawing exists, tracing happens directly on the map below; if neither does, **Start a blank grid** (pick columns × rows) gives you a plan with no image underneath it at all.

The Drawing row shows a **Review N changes** link once your Cartographer drawing has moved ahead of what was last published: see "Publishing a drawing" below.

### The Cartographer, embedded

Inside Build, the map area **is** the Cartographer editor, with a **Drawing / Plan** layer switcher and a structure tool group (Space, Zone, Door, Claim) alongside the ordinary paint tools. Use it to:

- **Space**: click a floor region to select the room it belongs to.
- **Claim**: flood-fill a region of the Drawing's floor and turn it straight into a traced space, so you don't re-trace by hand what you just painted.
- **Door**: snap to a cell edge to place a door; its endpoints are worked out automatically from the regions on either side.
- **Zone**: paint a hazard/terrain/light/trigger/marker overlay that isn't a room (see "Zones" below).

Three ways to trace a room's shape once you're in the tool: drag-to-paint cells directly, the **pen** (click a genuine polygon outline, useful for angled walls: snap to intersections, hold the modifier key for half-cells), or a **template** (circle, octagon, hex) that drops a ready-made ring you can keep editing with the pen. See [Cartographer: Overview](#cartographer-overview) for the full tool reference and [Cartographer: Export & AI Style](#cartographer-export-ai-style) for styled/AI renders you can use as a site's Picture.

### Publishing a drawing

**Publish to Atlas** (opened via the Layers panel's **Review** link, or from the Cartographer editor itself) reconciles your drawing with the site rather than overwriting it: rooms are matched by their traced shape, ways out by the edge they sit on, and prepared items by cell: nothing you've hand-edited on the Atlas side is silently discarded. The review shows exactly what will be added, matched or left alone before you confirm.

## Rooms (or Grounds)

The **Rooms** panel (headed **Grounds** on a Wilds site) lists every room as a numbered row, in the order you set. In Build you can:

1. Type a name into the **Add a room…** box and press Enter (or click **Add**) to create one.
2. Drag a row by its handle to reorder.
3. Click the pencil icon to rename a row in place, or the × to delete it.
4. Set each room's own **Ambience**: inherits from the nearest themed ancestor by default; assign a theme label to override it, or pick "silence" to mute the room deliberately.

Rows show **Cleared**/**Looted** markers read-only whenever those facts have been asserted, even in Browse.

## Ways out

Every room has a **Ways out** section listing its doors. A site-wide view of the whole door graph is also available higher up the page. In Build:

1. Pick the room or nested site to connect to, a **kind** (Door, Arch, Stair, Shaft, Portal), and an optional **label** (read-aloud text: "iron grille," "collapsed stair").
2. Check **One-way**, **Starts locked** (and add a **lock note**: what opens it), or **Secret** as needed.
3. Click **Add**.

These three flags are what you authored in prep and stay editable as you revise your plans: they are **not** the same as whether the party has actually opened, unlocked or found the door during play. That's tracked separately (see Progress, below) and never overwrites your authored flags. A door only needs its **endpoints** recreated if you want to change what it connects; everything else edits in place.

## Zones

A **zone** is a shape on the plan that isn't a room: a hazard, terrain note, lighting effect, trigger, or a plain marker. Paint one with the Zone tool in Build; give it a kind and, for a trigger zone, the beat it should prompt when the party stands on it (advancing still needs a DM click: nothing fires automatically). Zones are DM ink by default; mark one **visible to players** to have it show, clipped to what the party has actually explored.

## Progress

Every location, room, site, or anything above it, carries three toggles: **Explored**, **Cleared**, **Looted**. Clicking one appends the opposite of its current value; nothing is ever silently edited or erased, so you can always tell "never asserted" (a plain outline pill) from "explicitly false" (a soft red pill) from "explicitly true" (a solid green pill). Hover a pill to see who asserted it and when.

## Loot

Any location with a campaign, most often a room, can hold prepared loot in its **Loot** section: an **Item** from your Vault, a pile of **Currency**, or a **Chest** rolled from a loot table (roll once, hold the result, drop it to chat later; **re-roll** if you don't like it). Dropping loot to chat automatically marks the room **Looted**.

## Running the site at the table

Click **Run** on a site in the Atlas (or on a beat staged there, see below) to open the run surface:

- **Rooms**: a plain click-to-move list, captioned "Reachable," "Not reachable from here," "Secret door: undiscovered," or "Party here · `<zone>` active" as appropriate. This works even before anything is traced.
- **The map**, in run mode: click a room to move the party into it. A **Fog** checkbox shades unexplored rooms on the plan itself: rooms the party has explored are lit, ones reachable from an explored door are hinted at as a shape with no detail, and everything else stays fully hidden.
- **The current room's stack**: read-aloud (the room's own description), then prompts for anything prepared there (traps, roll tables, encounters, undiscovered secret ways out), in that order.
- **Ways out of the room**: **Move**, **Unlock**, **Reveal** per door, right from the run surface.
- **Progress** on the current room.

Moving the party is a single write to the campaign's current location; arriving somewhere for the first time is recorded as Explored automatically. Nothing else here fires on its own: unlocking, revealing and looting are all deliberate clicks, never automatic consequences of movement.

### Quests staged at a site

A quest beat can be staged at a site, or at one specific room inside it (see [Running a Quest at the Table](#running-a-quest-at-the-table)). When one is, the run surface shows a beat card with a **Resolve beat**/**Back to the beat** link into the quest's run cockpit: the room stack you're looking at is the same read-aloud-and-payoff idiom the cockpit itself uses, because a room is, in effect, a zoomed-in beat. A room's **Cleared** fact can also satisfy a quest objective directly, authored from [Quest Story Flow](#quest-story-flow-beats-routes-objectives) or from the room's own Spaces panel in Build.

## What your players see

Players never see your raw map or plan. What they get is composed fresh from what the party has actually explored: explored rooms in full, glimpsed rooms (sharing a known, non-secret door with an explored one) as a bare outline with no name or contents, and ways out only where at least one end has been explored: a locked door still draws as a plain door, with no lock note. Unexplored geometry, secret doors, hazard details, room notes and trap DCs are never sent to the client at all, not merely hidden by the UI.

The Layers panel has its own **Preview as players** toggle so you can check exactly what a specific shared party member would see before a session, without changing any data.

## Tips

> Calibrate the Picture before you try to trace anything on it: an uncalibrated image shows the map but refuses tracing, because there's no grid to trace onto yet.

- A door with a region on only one side draws dashed: "leads nowhere yet." It resolves itself the moment you trace the far room; there's nothing to fix by hand.
- The readiness meter on the Atlas pane (Mapped / Calibrated / Traced / Bound / Ways out) is a pre-session gap check, not a requirement: a site is fully runnable via its room list alone, traced or not.
- Removing a site's Picture also clears its calibration; a Drawing carries its own independent calibration, so it isn't affected.
- Cleared/Looted facts belong to the room, not to any one quest: a party returning on a different quest chain four sessions later still finds a looted vault looted.

## Related

- [Atlas: Locations](#atlas-locations)
- [Cartographer: Overview](#cartographer-overview)
- [Cartographer: Export & AI Style](#cartographer-export-ai-style)
- [Quest Story Flow: Beats, Routes & Objectives](#quest-story-flow-beats-routes-objectives)
- [Running a Quest at the Table](#running-a-quest-at-the-table)
