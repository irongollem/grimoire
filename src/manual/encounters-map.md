---
title: "Encounter Map: Battle Map & Fog of War"
section: Encounters & Bestiary
section_order: 5
order: 5
summary: The map on the Play screen: tokens and their sizes, moving by the book, the turn card, fog of war, and how it borrows a site's own Atlas plan.
keywords: measure, area of effect, ping, draw, damage all, encounter, map, battle map, play, fog of war, fog, brush, reveal, hide, token, size, move, movement, turn card, room, site, cartographer, difficult terrain, legend
---

The map is part of the Play screen, the one screen that runs a fight. From tablet width up it is full screen: the initiative list (and any unplaced combatants) on the left, the map in the middle with its toolbelt along the bottom, and the turn card or a character sheet on the right. Open it from an encounter with **Run Encounter** (`/encounters/:id/run`). **Table screen** (always available) opens the map's one Table screen in the players' eyes on a second monitor (`/locations/:id/table`); it follows the party while you explore and shows the fight while one is live. On a phone the runner has a **List | Map** switch instead.

## Key ideas

| Term | Meaning |
| --- | --- |
| **Battle surface** | Whichever map actually gets drawn: the location's own uploaded image, or (for a room with none of its own) its site's published Atlas plan, focused on that room. |
| **Calibration** | The 5-ft grid scale a map needs before it can be used here at all. Set from the location (own map) or from the Cartographer (a site plan). |
| **Map memory** | What the party has seen or you have revealed on this map. It belongs to the map, not the fight, so it carries from exploring into every fight there and back. Hide all clears it. |
| **Sight** | What the party's characters can see right now: in light or within their darkvision, with a clear line (walls and closed doors stop it). Sight lifts the fog by itself. |
| **Focus room** | When the battle surface is a site plan, the one room the fight is set in. You see it outlined and labelled "Fight here"; your players never see that. |

## Getting to a usable battle map

The Play screen draws a map only once Grimoire can resolve one, and it works out which automatically:

1. **The location has its own calibrated map.** Nothing special needed: the Play screen opens on that image.
2. **The location is a room (or open grounds) with no map of its own, but its site has a published, calibrated Atlas plan.** The battle map opens on that site plan automatically, dimmed everywhere except this room's traced outline, at the grid scale the site publish already established. There's nothing to upload, calibrate, or toggle: a traced room on a calibrated site plan is already a legal battle map.
3. **Neither applies.** The middle of the screen tells you exactly what's missing: link a location, calibrate its map, upload a map for it, or trace and publish the site's plan first (see [Sites: Maps, Rooms & Running a Dungeon](#sites-maps-rooms-running-a-dungeon)).

## The toolbar and menus

- **Toolbelt** (along the bottom of the map): **Move** (V), **Measure** (M), **Area** (T), **Fog** (F), **Darkness** (K), **Ping** (P) and **Draw** (D); see Table tools below. Fog is **Room**, **Brush** or **Hide**, with the brush's shape (round or square) and size (`1`, `3` or `5` cells), **Reveal all**, **Hide all** and **As players see it**. Darkness shows its radius. Doors flip when you click them, and tokens move when you drag them, under any tool.
- **View** menu (in the bar): **As players see it**, **Grid**, **Zones**, **Tokens**, **Fog**, **Follow the turn** and **Legend**, and **Reset view**. The legend is hidden until you turn it on here.
- **Tools** button (in the bar): opens a sheet with surprise, lair and legendary mechanics, events, traps, spawning and your note, so the map keeps the screen.
- Zoom and pan work as on any map: wheel to zoom, drag empty ground with the Move tool to pan.

## Reading the legend

A bar under the map explains what you're looking at: **Party** (the ring colour the Mint's tokens use), **Hostile**, **Large** (a 2-cell footprint, from the creature's size), and **Active turn** (gold highlight), plus one row per difficult-terrain zone actually inside the focus room, named for that zone's own label.

## Placing tokens

A creature's size sets its footprint, for every kind of creature: **Tiny** shares a square (up to four to a square), **Small** and **Medium** take one, **Large** 2 x 2, **Huge** 3 x 3, **Gargantuan** 4 x 4. A monster takes its stat block's size, an NPC its **Size** field, a companion its own size, a character its species' size, and a Wild Shaped druid the beast's. **Enlarge** and **Reduce** (and anything else that changes size) are set per fight in the turn card's **Size** menu.

- **Before combat**, from the builder's Battlefield Setup panel: place enemy and NPC tokens ahead of time; their positions are saved with the encounter. See [Encounter Builder](#encounter-builder).
- **On the Play screen**, combatants without a place wait in the **Not on the map yet** tray under the initiative list: drag one onto the map, or click it and then click a square. To seat every waiting foe at once, use **Scatter in a room** under the tray and pick a room (the fight's own room comes first): Grimoire spreads them out across it, clear of everyone already on the map, with big creatures placed first. Anyone the room has no space for stays in the tray. Party tokens are dropped for you onto a free square inside the focus room the moment you go live, and Grimoire only fills tokens that have no position, so it never disturbs one you've moved.

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

## Table tools

Everything you do with these shows on your players' screens too.

- **Measure** (M): drag from anywhere, or click to keep the line and click again to bend it round a pillar. Click the square it already ends at, or press Esc, to let it go. It reads the length by the book, 5 ft a square with diagonals included. While it is there the players see the line.
- **Area** (T): pick **Sphere**, **Cone**, **Line** or **Cube** and a size in feet. A sphere or cube follows the pointer and a click sets it down. A cone or line starts from the selected token and points where you aim; with nobody selected, click once to set where it starts. The squares it covers are tinted, and the creatures inside are ringed and selected for you, so the slip reads, for example, "20 ft · 3 inside". Type an amount and press **Damage all 3** to take it off everyone selected; click tokens first if you want to add someone or leave someone out. You still roll their saves your own way. A square counts as covered when the area covers at least half of it.
- **Fog** (F): **Room** reveals a whole traced room with one click, **Brush** and **Hide** paint as before. Your brush reveals stay on the map. **As players see it** shows the map the way your players see it.
- **Ping** (P): click or hold anywhere. Everyone sees a gilt ripple with "your name pinged". On a phone a player pings by holding a finger on the map for half a second.
- **Draw** (D): draw freehand in your own colour. Strokes fade when the turn ends unless **Pin drawings** is on; **Clear drawings** wipes them all.

The map you use while exploring a site has Move, Measure, Ping and Draw. Its fog is the same map memory the fight uses, so you will see the same fog there.

## Fog of war

The fog belongs to the map, so going live does not wipe it: whatever the party has already seen of this map, while exploring or in an earlier fight, is still revealed. As characters move, what they can see lifts the fog by itself. You can still reveal or hide by hand:

1. Pick **Brush** (reveal) or **Hide** (re-hide), a shape, and a size. Or pick **Room** and click a traced room to reveal all of it.
2. Paint over the map. Every stroke reaches players in real time, and stays on the map after the fight.
3. Use **Reveal all** or **Hide all** for a clean sweep instead of painting by hand. **Hide all** also makes the map forget what the party had seen.

**Doors stay as you left them.** Click a door on the map to open or shut it, with any tool, in a fight or while exploring. A door you open stays open when the fight ends and the party walks on, and players see through it on every screen.

Sight uses each character's real senses: darkvision from their species and their Senses field. A character standing in complete darkness without darkvision sees nothing and reveals nothing; on a map with no lights drawn, daylight is assumed and only walls and closed doors limit sight.

In **Remembered** mode (the default) squares the party has seen stay revealed, shaded a little where nobody can see them right now. In **Strict** mode only what they see now shows, plus what you reveal by hand. Both are set in Campaign Settings (see [Campaign Settings](#campaign-settings)).

## Difficult terrain

A zone you've traced as difficult terrain is outlined in dashed cyan on the map (turn on **Zones** and **Legend** in the View menu) and costs double to cross, as described under Moving tokens. Nothing slows anyone for you automatically beyond the feet the counter shows; the speed itself is still yours to keep.

## Rooms and ending combat

When a player character's token moves into a traced room during a fight, Grimoire marks that room as explored right then, with the note "entered in a fight". Nothing is asked. It only ever adds: it never un-explores a room.

When you end combat, the party is left standing where the fight left them, so the explore screen picks up from those squares.

## The Table screen

The Table screen is the map as your players see it, for a TV or second monitor at the table. Open it with **Table screen** in the Play screen's bar, or while exploring a site; it opens in its own window, so drag it onto the TV and make it full screen. Each map has one Table screen (`/locations/:id/table`), and you can leave it open all session: it shows the party exploring, switches to the fight when one goes live on that map, and goes back to exploring when the fight ends.

It always shows what the players would see, never your view: the fog is solid rather than see-through, monsters show no hit points, every player character's token is shown, and other tokens appear only where the party can see them. It follows whoever's turn it is, and it shows pings, measure lines and drawings as you make them. A moving map plays there too, as long as the window is on the same computer that holds the map's file.

## What your players see

Players reach their own view from the **View battle map** button on their encounter panel, on a phone as well as a tablet or desktop. It needs only a calibrated grid on the map: the location does not have to be flagged as a battle map. It's always fog-gated with no "as player" toggle needed, since it already is one: hidden combatants never appear, unseen ones show as an unnamed silhouette, and even a token marked Revealed disappears when nobody in the party can see its square. Tokens obey sight, not just reveal state. Players see the plain map, grid, fog, and tokens; the "Fight here" outline and the difficult-terrain outline are DM-only, and the rest of the map is never dimmed for them. What a player sees is what the map remembers plus what their characters can see now. Their own token always shows; any other token (a teammate or a monster) shows only where someone in the party can see it. With the **Each their own** Sight setting, a phone shows only what that player's own character can see. A campaign-wide setting can hide the token layer for players entirely, showing them only the map and fog.

A player moves only their own character's token, in either of two ways: drag it, or tap the token and then tap a square. A tap shows the path and a ghost of the token, and a **Move here?** card with the feet against their speed ("20 of 30 ft", gilt within the speed, amber for a Dash, red beyond it) and **Cancel** and **Move** buttons. The counter only warns; it never refuses a move.

On a phone the map opens zoomed on the token whose turn it is, with a header that says **Your turn** (and the feet left) or whose turn it is and who acts before the player. **Follow** in the header stops the map chasing the active token. A bottom bar leads to **Map**, **My sheet** and **Roll**.

## Tips

> "Still no VTT" is deliberate: nothing here moves a token on its own, reveals a second area because you revealed the first, or refuses a move. This is prompts, counting and coordinate translation, not a rules engine: every mechanical consequence stays a DM call.

- A room borrowing its site's plan doesn't need its own **Battle map** toggle switched on: any place with a calibrated grid can be played.
- A map with a moving base image (GIF, WebM, MP4) plays on your own screens, from the file kept on this device. Players see the still picture, and so does any other device that doesn't have the file.

## Related

- [Encounter Runner](#encounter-runner)
- [Encounter Builder](#encounter-builder)
- [Sites: Maps, Rooms & Running a Dungeon](#sites-maps-rooms-running-a-dungeon)
