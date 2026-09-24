---
title: Encounter Map — Battle Map & Fog of War
section: Encounters & Bestiary
section_order: 5
order: 5
summary: The live battle-map view for a running encounter — tokens, fog of war, and how it borrows a site's own Atlas plan.
keywords: encounter, map, battle map, fog of war, fog, brush, reveal, hide, token, room, site, cartographer, difficult terrain, legend
---

The Encounter Map is the tactical grid view for a live fight — tokens on a battlefield, with fog of war you paint to control what players can see. It's reached from the Encounter Runner's top bar, by clicking **Battle Map** (`/encounters/:id/run/map`; a second **↗** button opens the same view in a new browser window or tab, handy for a second monitor).

## Key ideas

| Term | Meaning |
| --- | --- |
| **Battle surface** | Whichever map actually gets drawn: the location's own uploaded image, or — for a room with none of its own — its site's published Atlas plan, focused on that room. |
| **Calibration** | The 5-ft grid scale a map needs before it can be used here at all. Set from the location (own map) or from the Cartographer (a site plan). |
| **Fog mask** | What's currently revealed to players. You paint it; it syncs to them live. |
| **Focus room** | When the battle surface is a site plan, the one room the fight is dimmed down to. |

## Getting to a usable battle map

The **Battle Map** button in the runner is enabled only once Grimoire can resolve a map to draw, and it works out which one automatically:

1. **The location has its own calibrated map.** Nothing special needed — click Battle Map and it opens on that image.
2. **The location is a room (or open grounds) with no map of its own, but its site has a published, calibrated Atlas plan.** The battle map opens on that site plan automatically, dimmed everywhere except this room's traced outline, at the grid scale the site publish already established. There's nothing to upload, calibrate, or toggle — a traced room on a calibrated site plan is already a legal battle map.
3. **Neither applies.** The button is disabled, and its tooltip tells you exactly what's missing — link a location, calibrate its map, upload a map for it, or trace and publish the site's plan first (see [Sites — Maps, Rooms & Running a Dungeon](#sites-maps-rooms-running-a-dungeon)).

## The toolbar

- **Layer toggles** — **Tokens** (shows the live combatant count), **Zones**, **Fog**, and **Grid 5 ft** — switch each layer on or off.
- **Fog tools** — **Pan map**, **Reveal brush**, **Re-hide brush**.
- **Brush shape** — round or square (cell) brush, shown once a paint tool is selected.
- **Brush size** — `1`, `3`, or `5` cells.
- **Reveal all** and **Hide all** — clear or fully reset the fog in one click.
- **As player** — preview the map exactly as your players currently see it.
- **Site / Encounter** — a segmented control that doubles as your way back: **Encounter** is always selected here; clicking **Site** takes you to the Atlas (labelled "Back to the site" when the map is a room riding a site plan, "Back to Runner" when it's a plain location map).
- Zoom percentage and a **Reset** button for the view.

## Reading the legend

A bar under the map explains what you're looking at: **Party** (the ring colour the Mint's tokens use), **Hostile**, **Large** (a 2-cell footprint, from the creature's size), and **Active turn** (gold highlight) — plus one row per difficult-terrain zone actually inside the focus room, named for that zone's own label.

## Placing tokens

Tokens are drag-and-drop, snapping to the nearest grid cell; a creature's size sets its footprint (Large is 2 cells square, Huge 3, Gargantuan 4) so bigger creatures cover more of the grid automatically. Two places let you place them:

- **Before combat**, from the builder's Battlefield Setup panel — place enemy and NPC tokens ahead of time; their positions are saved with the encounter and used to seed the runner. See [Encounter Builder](#encounter-builder).
- **Live, here** — drag any token to reposition it (only while the **Pan map** tool is active; a paint tool intercepts the drag instead). Changes push to players immediately while you're live. A player can drag only their own character's token, on their own screen.

Party member tokens aren't placed by hand at all — the moment you go live, Grimoire drops every unplaced player-type token onto a free cell inside the focus room automatically ("you're standing in it"), and only fills tokens that don't already have a position, so it never disturbs one you've already moved.

## Fog of war

Going live seeds the fog to reveal the room the party starts in, so they're never staring at a blank map wondering where they are. From there:

1. Pick **Reveal brush** or **Re-hide brush**, a shape, and a size.
2. Paint over the map. Every stroke pushes to players in real time.
3. Use **Reveal all** or **Hide all** for a clean sweep instead of painting by hand.

## Difficult terrain

A zone you've traced as difficult terrain inside the focus room is outlined in dashed cyan on the map, and gets its own row in the legend. This is a **read, not an enforcement** — it doesn't halve anyone's speed for you. Apply that by hand with the existing condition/movement tooling, the same as any other terrain effect.

## Ending combat: marking rooms explored

When you end combat, if the fog revealed enough of a room to count (at least half its traced cells), Grimoire asks once — "Mark N rooms revealed in combat as explored?" — covering every qualifying room in one prompt, never room by room. Confirming records each room as explored in the Atlas's location-state log. This only ever adds — brushing fog back to hidden mid-fight never un-explores a room afterward.

## What your players see

Players reach their own view from their encounter panel (desktop/tablet only — on a phone they're kept on the plain encounter panel instead). It's always fog-gated with no "as player" toggle needed, since it already is one: hidden combatants never appear, unseen ones show as an unnamed silhouette, and even a token marked Revealed disappears the moment its cell isn't currently under fog — tokens obey fog, not just reveal state. Players see the plain map, grid, fog, and tokens; the dimmed-outside-the-room effect and the difficult-terrain outline are DM-only. A campaign-wide setting can hide the token layer for players entirely, showing them only the map and fog. Each player can drag only their own linked character's token.

## Tips

> "Still no VTT" is deliberate: nothing here moves a token on its own, reveals a second area because you revealed the first, or applies a difficult-terrain penalty for you. This is prompts and coordinate translation, not a rules engine — every mechanical consequence stays a DM call.

- If **Battle Map** is greyed out, read its tooltip first — it tells you exactly which of the three states above you're missing, rather than just "no map".
- A room borrowing its site's plan doesn't need its own **Battle map** toggle switched on — that toggle only matters for a plain, non-room-anchored location's own uploaded image.

## Related

- [Encounter Runner](#encounter-runner)
- [Encounter Builder](#encounter-builder)
- [Sites — Maps, Rooms & Running a Dungeon](#sites-maps-rooms-running-a-dungeon)
