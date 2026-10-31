---
title: "Encounter Map: Battle Map & Fog of War"
section: Encounters & Bestiary
section_order: 5
order: 5
summary: The map on the Play screen: tokens and their sizes, moving by the book, the turn card, fog of war, and how it borrows a site's own Atlas plan.
keywords: encounter, map, battle map, play, fog of war, fog, brush, reveal, hide, token, size, move, movement, turn card, room, site, cartographer, difficult terrain, legend
---

The map is part of the Play screen, the one screen that runs a fight. From tablet width up it is full screen: the initiative list (and any unplaced combatants) on the left, the map in the middle with its toolbelt along the bottom, and the turn card or a character sheet on the right. Open it from an encounter with **Run Encounter** (`/encounters/:id/run`). Once you are live, **Open the table screen in a new window** opens the same map in the players' eyes on a second monitor (`/encounters/:id/table`). On a phone the runner has a **List | Map** switch instead.

## Key ideas

| Term | Meaning |
| --- | --- |
| **Battle surface** | Whichever map actually gets drawn: the location's own uploaded image, or (for a room with none of its own) its site's published Atlas plan, focused on that room. |
| **Calibration** | The 5-ft grid scale a map needs before it can be used here at all. Set from the location (own map) or from the Cartographer (a site plan). |
| **Fog mask** | What's currently revealed to players. You paint it; it syncs to them live. |
| **Focus room** | When the battle surface is a site plan, the one room the fight is dimmed down to. |

## Getting to a usable battle map

The Play screen draws a map only once Grimoire can resolve one, and it works out which automatically:

1. **The location has its own calibrated map.** Nothing special needed: the Play screen opens on that image.
2. **The location is a room (or open grounds) with no map of its own, but its site has a published, calibrated Atlas plan.** The battle map opens on that site plan automatically, dimmed everywhere except this room's traced outline, at the grid scale the site publish already established. There's nothing to upload, calibrate, or toggle: a traced room on a calibrated site plan is already a legal battle map.
3. **Neither applies.** The middle of the screen tells you exactly what's missing: link a location, calibrate its map, upload a map for it, or trace and publish the site's plan first (see [Sites: Maps, Rooms & Running a Dungeon](#sites-maps-rooms-running-a-dungeon)).

## The toolbar and menus

- **Toolbelt** (along the bottom of the map): **Move**, **Fog** and **Darkness**. Fog shows its brush (**Reveal** or **Hide**), shape (round or square) and size (`1`, `3` or `5` cells), plus **Reveal all** and **Hide all**. Darkness shows its radius. Doors flip when you click them under any tool.
- **View** menu (in the bar): **As players see it**, **Grid**, **Zones**, **Tokens**, **Fog**, **Follow the turn** and **Legend**, and **Reset view**. The legend is hidden until you turn it on here.
- **Tools** button (in the bar): opens a sheet with surprise, lair and legendary mechanics, events, traps, spawning and your note, so the map keeps the screen.
- Zoom and pan work as on any map: wheel to zoom, drag empty ground with the Move tool to pan.

## Reading the legend

A bar under the map explains what you're looking at: **Party** (the ring colour the Mint's tokens use), **Hostile**, **Large** (a 2-cell footprint, from the creature's size), and **Active turn** (gold highlight), plus one row per difficult-terrain zone actually inside the focus room, named for that zone's own label.

## Placing tokens

A creature's size sets its footprint, for every kind of creature: **Tiny** shares a square (up to four to a square), **Small** and **Medium** take one, **Large** 2 x 2, **Huge** 3 x 3, **Gargantuan** 4 x 4. A monster takes its stat block's size, an NPC its **Size** field, a companion its own size, a character its species' size, and a Wild Shaped druid the beast's. **Enlarge** and **Reduce** (and anything else that changes size) are set per fight in the turn card's **Size** menu.

- **Before combat**, from the builder's Battlefield Setup panel: place enemy and NPC tokens ahead of time; their positions are saved with the encounter. See [Encounter Builder](#encounter-builder).
- **On the Play screen**, combatants without a place wait in the **Not on the map yet** tray under the initiative list: drag one onto the map, or click it and then click a square. Party tokens are dropped for you onto a free square inside the focus room the moment you go live, and Grimoire only fills tokens that have no position, so it never disturbs one you've moved.

## Moving tokens

Click a token, then click the square to go to; or drag the token and watch the ghost snap. The arrow keys step the selected token one square. **Shift-click** adds a waypoint to bend the path; **Shift-drag** a box (or select several) to move a group in formation. Tokens move under any tool. The path is drawn with the feet it costs at its end.

The counts follow the book:

- Every square is 5 ft, a diagonal too (PHB 2014 "Movement and Position", PHB 2024 "Moving").
- **Difficult terrain** (a zone with a movement cost above 1) costs double (both PHBs, "Difficult Terrain"). A big token is slowed if any square it covers is difficult. It counts in a room fight and on a whole-map fight alike.
- **Squeezing** through a gap one size too small costs double too (both PHBs, "Squeezing into a Smaller Space"); with difficult ground that stacks to 15 ft a square.
- A move past the creature's speed reads "a Dash", and past twice the speed "past a Dash" (the Dash action doubles your movement).

**Nothing is ever refused.** The counter warns and you decide, because the DM is never blocked. **Back to start** on the turn card takes the turn's moves back until the turn ends.

## The turn card

On someone's turn the right-hand card reads top to bottom: **1 Move** (how far, as a bar two speeds long, or "Speed unknown" when no speed is on the board), **2 Act** (tap Action, Bonus action and Reaction as they are spent; who the token is next to; the attacks to roll, characters' included, with the same rolls as the full sheet; and the Size menu) and **3 Next turn**. It always shows whose turn it is; select anyone else and their sheet opens in its place. **Open the full sheet** is one click away.

## Fog of war

Going live seeds the fog to reveal the room the party starts in, so they're never staring at a blank map wondering where they are. From there:

1. Pick **Reveal brush** or **Re-hide brush**, a shape, and a size.
2. Paint over the map. Every stroke pushes to players in real time.
3. Use **Reveal all** or **Hide all** for a clean sweep instead of painting by hand.

## Difficult terrain

A zone you've traced as difficult terrain is outlined in dashed cyan on the map (turn on **Zones** and **Legend** in the View menu) and costs double to cross, as described under Moving tokens. Nothing slows anyone for you automatically beyond the feet the counter shows; the speed itself is still yours to keep.

## Ending combat: marking rooms explored

When you end combat, if the fog revealed enough of a room to count (at least half its traced cells), Grimoire asks once ("Mark N rooms revealed in combat as explored?"), covering every qualifying room in one prompt, never room by room. Confirming records each room as explored in the Atlas's location-state log. This only ever adds: brushing fog back to hidden mid-fight never un-explores a room afterward.

## What your players see

Players reach their own view from the **View battle map** button on their encounter panel, on a phone as well as a tablet or desktop. It needs only a calibrated grid on the map: the location does not have to be flagged as a battle map. It's always fog-gated with no "as player" toggle needed, since it already is one: hidden combatants never appear, unseen ones show as an unnamed silhouette, and even a token marked Revealed disappears the moment its cell isn't currently under fog. Tokens obey fog, not just reveal state. Players see the plain map, grid, fog, and tokens; the dimmed-outside-the-room effect and the difficult-terrain outline are DM-only. A campaign-wide setting can hide the token layer for players entirely, showing them only the map and fog.

A player moves only their own character's token, in either of two ways: drag it, or tap the token and then tap a square. A tap shows the path and a ghost of the token, and a **Move here?** card with the feet against their speed ("20 of 30 ft", gilt within the speed, amber for a Dash, red beyond it) and **Cancel** and **Move** buttons. The counter only warns; it never refuses a move.

On a phone the map opens zoomed on the token whose turn it is, with a header that says **Your turn** (and the feet left) or whose turn it is and who acts before the player. **Follow** in the header stops the map chasing the active token. A bottom bar leads to **Map**, **My sheet** and **Roll**.

## Tips

> "Still no VTT" is deliberate: nothing here moves a token on its own, reveals a second area because you revealed the first, or refuses a move. This is prompts, counting and coordinate translation, not a rules engine: every mechanical consequence stays a DM call.

- A room borrowing its site's plan doesn't need its own **Battle map** toggle switched on: any place with a calibrated grid can be played.
- A map with a moving Picture (GIF, WebM, MP4) plays on your own screens, from the file kept on this device. Players see the still picture, and so does any other device that doesn't have the file.

## Related

- [Encounter Runner](#encounter-runner)
- [Encounter Builder](#encounter-builder)
- [Sites: Maps, Rooms & Running a Dungeon](#sites-maps-rooms-running-a-dungeon)
