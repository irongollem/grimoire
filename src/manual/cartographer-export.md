---
title: Cartographer: Export & AI Style
section: Cartographer
section_order: 10
order: 1
summary: Publish a map into an Atlas site, download it as PNG, and re-render it with AI styles.
keywords: cartographer, export, PNG, publish to atlas, AI style, map style, isometric, parchment, woodcut, tactical, AI map, structure
---

Once a map is saved, Grimoire offers three actions from the **view mode** action bar: **↓ PNG**, **AI Style**, and **Publish to Atlas**.

## Publish to Atlas

**Publish to Atlas** is not a picture upload: it's a diff. Grimoire reads the rooms, doors, and placements your drawing implies (see [Cartographer: Overview](#cartographer-overview)'s "Rooms are detected automatically") and reconciles them against whatever's already in the target site, without silently overwriting anything you've hand-edited there and without ever deleting.

### How to use it

1. Click **Publish to Atlas** in the view-mode action bar (or arrive here already targeting a site, the Atlas's **Re-publish**/**Preview** buttons and its "draw a level" flow open the map with the site preselected).
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

## Download PNG

Click **↓ PNG** to export the map as a full-resolution PNG rendered right in your browser: nothing is uploaded. Use this for sharing outside Grimoire or printing.

## AI Style

**AI Style** passes your baked tile map through an image model and re-renders it in a chosen artistic style. The tile data is never changed: the result is a new standalone image you save or download separately, with no rooms/doors/placements to reconcile (there's nothing structural in a styled image to publish a plan for).

**This uses AI credits.** Using your own API key (BYOK) skips the credit charge.

### How to use it

1. Click **AI Style** in the view-mode action bar.
2. Pick a style preset.
3. Optionally add freeform details in the text field: describe specific features, mood, or elements you want emphasised (up to 300 characters).
4. Click **Generate** and wait (usually 15–30 seconds).
5. Preview the result, then choose:
   - **Save to Atlas**: pick a location from a simple inline picker; this uploads the styled image, overwrites that location's map, and sets its grid to match automatically. Deliberately the older, simpler flow otherwise: a styled picture has no structure behind it to reconcile, unlike Publish to Atlas above.
   - **↓ Download**: save the image locally as a WebP file.
   - **Retry**: re-generate with the same settings (a fresh render).
   - **Back**: return to the preset picker to change settings.

All styled images include a small `dungeongrimoire.com` watermark. Closing the result without saving or downloading loses it for good: nothing here is auto-recovered.

The grid it sets automatically is a first guess: the AI can shrink or grow it a little in its own render, so check that it lines up and use **Calibrate** on the Layers panel to fine-tune if it's drifted, the same action you'd use on any scanned picture.

### Styling a site's own Drawing

A site's **Build** screen (see [Sites: Maps, Rooms & Running a Dungeon](#sites-maps-rooms-running-a-dungeon)) has its own **Style with AI** action on the Layers panel's Drawing row. It works the same way, with two differences:

- There's no location picker: the target is always the site you're already in, so the result button reads **Save to Picture**.
- Saving asks first, plainly: the styled render replaces the site's Picture, and its Drawing (the Cartographer map you were just editing) is set aside rather than deleted. It stays in your Cartographer, ready to reopen, so you can draw fixes on top of the new Picture and style again, as many times as you like.

Each pass sets the Picture's grid automatically too, so tracing and doors keep working right away. Check it and Calibrate if needed, same as above.

### Style presets

| Preset | Best for |
| --- | --- |
| **Playable** | Session-ready maps with clear zones and warm lighting, matching the OneDnD 2024 PHB aesthetic |
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
