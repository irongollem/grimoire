---
title: Cartographer: Export & AI Style
section: Cartographer
section_order: 10
order: 1
summary: Publish a map into an Atlas site, download it as PNG, and re-render it with AI styles.
keywords: cartographer, export, download, PNG, picture, publish to atlas, review changes to the site, AI style, style it with AI, map style, isometric, parchment, woodcut, tactical, AI map, vtt, dd2vtt, foundry, roll20, structure
---

Use the editor's **Map** menu to get a finished map out of the Cartographer: **Review changes to the site** (publish it into an Atlas site), **Download a picture**, **Export for another VTT (.dd2vtt)** and **Style it with AI…** (shown only when AI is on for the campaign).

## Publish to Atlas

**Publish to Atlas** (the window **Review changes to the site** opens) is not a picture upload: it's a diff. Grimoire reads the rooms, doors, and placements your drawing implies (see [Cartographer: Overview](#cartographer-overview)'s "Rooms are detected automatically") and reconciles them against whatever's already in the target site, without silently overwriting anything you've hand-edited there and without ever deleting.

### How to use it

1. Choose **Review changes to the site** in the **Map** menu. A small number beside it counts the changes waiting to publish. It opens the **Publish to Atlas** window. (Opening the map from a site's own map editor already targets that site.)
2. If no site is picked yet, search for one in the site combobox at the top of the modal. Click **Change place…** to switch sites later.
3. Review the plan: a rendered preview of what will publish, plus a row-by-row list grouped by what will happen: new rooms, region updates, new or updated doors, and any placements getting re-anchored to a different room. Unresolved stairs prompt you to pick their target room right there.
4. The footer names exactly what gets written (e.g. "Writes 3 rooms, 2 doors, 1 image."); it also always writes the baked picture itself.
5. Click **Publish N changes**.

### What actually gets written

- The baked picture, uploaded and linked to the site.
- **Spaces**: a new room + region for every space Grimoire detected that isn't matched to one already there; an existing region whose shape changed is reshaped; a region you've hand-edited in the Atlas, or one that matches exactly, is left untouched. A previously-bound region with no matching space any more is orphaned (kept, not deleted) rather than removed.
- **Doors**: created for new edges; an existing door's kind updates only if you haven't set a lock, secret flag, note, or label on it by hand in the Atlas; any of those makes it yours to keep. A resolved stair becomes a one-time stair connection.
- **Placements**: a trap/feature link with no matching placement anywhere in the site becomes a new one; one whose cell now falls in a different room gets re-anchored to it; one that falls in no room at all is kept at the room level rather than deleted.

Nothing here is ever silently discarded: anything Grimoire can't confidently match is left alone or flagged, never dropped. If you're not happy with a publish, the footer note tells you: undo is simply publishing again from the previous revision.

## Props on the battle map: publish again

Props (the tables, beds, coffins and barrels you place from the **Place** tool) are part of your drawing, but the battle map does not read your drawing directly. It plays on the picture that **Publish to Atlas** bakes. So a prop you place, move or turn shows up at the table only after you publish again.

- Place or move props as you like, then open **Review changes to the site** in the Map menu and publish. The new picture carries the props.
- Until you do, the site in the Atlas is behind your drawing, and the editor shows that it has changed since the last publish.
- Props never create, reshape or block a room, door or wall. They are scenery, so publishing a map with only new props changes the picture and nothing in the plan.
- You cannot yet hide or reveal a single prop during play. A prop is in the picture for everyone who can see that part of the map.

## Download a picture

Choose **Download a picture** in the **Map** menu to export the map as a full-resolution PNG rendered right in your browser: nothing is uploaded. Use this for sharing outside Grimoire or printing.

## Export for another VTT

Choose **Export for another VTT (.dd2vtt)** to save the map with its walls, doors and lights in the universal VTT file format that other virtual tabletops (Foundry VTT, Roll20 and similar) can import. It is the reverse of **Bring a map**, which accepts such files.

## AI Style

**Style it with AI** passes your baked tile map through an image model and re-renders it in a chosen artistic style. The tile data is never changed: the result is a new standalone image you save or download separately, with no rooms/doors/placements to reconcile (there's nothing structural in a styled image to publish a plan for).

**This uses AI credits.** Using your own API key (BYOK) skips the credit charge.

### How to use it

1. Choose **Style it with AI…** in the **Map** menu.
2. Pick a style preset.
3. Optionally add freeform details in the text field: describe specific features, mood, or elements you want emphasised (up to 300 characters).
4. Click **Generate** and wait (usually 15–30 seconds).
5. Preview the result, then choose:
   - **Save to Atlas**: pick a location from a simple inline picker; this uploads the styled image, overwrites that location's map, and sets its grid to match automatically. Deliberately the older, simpler flow otherwise: a styled picture has no structure behind it to reconcile, unlike Publish to Atlas above.
   - **↓ Download**: save the image locally as a WebP file.
   - **Retry**: re-generate with the same settings (a fresh render).
   - **Back**: return to the preset picker to change settings.

All styled images include a small `dungeongrimoire.com` watermark. Closing the result without saving or downloading loses it for good: nothing here is auto-recovered.

The grid it sets automatically is a first guess: the AI can shrink or grow it a little in its own render, so check that it lines up and use **Line up the grid** on the map editor's Base image tab to fine-tune it if it's drifted, the same action you'd use on any scanned picture.

### Styling a site's own Drawing

A site's map editor (**Edit map** on its Map tab; see [Sites: Maps, Rooms & Running a Dungeon](#sites-maps-rooms-running-a-dungeon)) has its own **Style it with AI** entry in its Map menu. It works the same way, with two differences:

- There's no location picker: the target is always the site you're already in, so the result button reads **Use as the base image**.
- Saving asks first, plainly: the styled render replaces the site's base image, and its Drawing (the Cartographer map you were just editing) is set aside rather than deleted. It stays in your Cartographer, ready to reopen, so you can draw fixes on top of the new base image and style again, as many times as you like.

Each pass sets the base image's grid automatically too, so tracing and doors keep working right away. Check it and line the grid up again if needed, same as above.

### Style presets

| Preset | Best for |
| --- | --- |
| **Playable** | Session-ready maps with clear zones, warm lighting and detailed dressing |
| **Explorer's Sketch** | In-world props, handouts, and atmospheric flavour: parchment and ink, charmingly imperfect |
| **Isometric** | Scene illustrations and social posts: a 3D perspective view that may reinterpret the layout spatially |
| **Tactical Grid** | VTT imports: bold zone outlines and high-contrast surfaces optimised for Foundry VTT and Roll20 |
| **Ancient Tome** | Chapter art, opening spreads, or when the map should feel like a discovered relic |
| **Woodcut Print** | Stark, high-contrast illustration for print or a gritty low-fantasy aesthetic |

## Tips

- Add specific details in the freeform field: *"flooded corridors, green bioluminescent fungus"* or *"torchlight, cobwebs, collapsed section to the north"*. The model picks these up reliably.
- The Explorer's Sketch preset is intentionally imperfect: walls may be skewed and rooms simplified. That's by design; it looks like a real adventurer sketched it.
- Isometric results look best on maps with clear room shapes; very dense or irregular layouts may become abstract.
- You can Publish to Atlas and generate an AI Style separately for the same map, saving each to a different (or the same) location.

## Related

- [Cartographer: Overview](#cartographer-overview)
- [Cartographer: Tile Packs](#cartographer-tile-packs)
- [Sites: Maps, Rooms & Running a Dungeon](#sites-maps-rooms-running-a-dungeon)
