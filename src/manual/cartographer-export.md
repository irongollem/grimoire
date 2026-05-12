---
title: Cartographer — Export & AI Style
section: Cartographer
section_order: 9
order: 1
summary: Download maps as PNG, save them to Atlas locations, and re-render them with AI styles.
keywords: cartographer, export, PNG, save to atlas, AI style, map style, isometric, parchment, woodcut, tactical, AI map
---

Once your map is saved, Grimoire offers three export options from the **view mode** action bar:

## Download PNG

Exports the map as a full-resolution PNG at 128 px per cell. The canvas is rendered at exact 1:1 scale with a small black border. Use this for sharing outside Grimoire or printing.

## Save to Atlas

Bakes the map to a WebP image and attaches it to an Atlas location. The location's map image is updated immediately and the "Edit in Cartographer" link appears on its detail page so you can return to edit the tiles at any time.

Steps:
1. Click **Save to Atlas**.
2. Pick the target location from the dropdown.
3. If the location already has a map, a warning appears — saving will replace it.
4. Click **Save to Atlas** to confirm.

The image is stored in your campaign's location image bucket and linked via `source_map_id` so Grimoire knows which tile map it came from.

## ✦ AI Style

AI Style passes your baked tile map through an image model and re-renders it in a chosen artistic style. The tile data is never changed — the result is a new standalone image you can save or download separately.

**This feature uses AI credits.** Each generation costs credits from your balance. Using your own API key (BYOK) skips the credit charge.

### How to use it

1. Click **✦ AI Style** in the view mode action bar.
2. Pick a style preset.
3. Optionally add freeform details in the text field — describe specific features, mood, or elements you want emphasised.
4. Click **Generate** and wait (usually 15–30 seconds).
5. Preview the result. Then choose:
   - **Save to Atlas** — pick a location and attach the styled image as its map.
   - **↓ Download** — save the image locally as a WebP file.
   - **Retry** — re-generate with the same settings (different random seed).
   - **Back** — return to the preset picker to change settings.

All styled images include a small `dungeongrimoire.com` watermark in the bottom-right corner.

### Style presets

| Preset | Best for |
|---|---|
| **Playable** | Session-ready maps with clear zones and warm lighting — matches the OneDnD 2024 PHB aesthetic |
| **Explorer's Sketch** | In-world props, handouts, and atmospheric flavour — parchment and ink, charmingly imperfect |
| **Isometric** | Scene illustrations and social media posts — a 3D perspective view that may reinterpret the layout spatially |
| **Tactical Grid** | VTT imports — bold zone outlines and high-contrast surfaces optimised for Foundry VTT and Roll20 |
| **Ancient Tome** | Chapter art, opening spreads, or when the map should feel like a discovered relic |
| **Woodcut Print** | Stark, high-contrast illustration for print or a gritty low-fantasy aesthetic |

### Tips

- Add specific details in the freeform field: _"flooded corridors, green bioluminescent fungus"_ or _"torchlight, cobwebs, collapsed section to the north"_. The model picks these up reliably.
- The Explorer's Sketch preset is intentionally imperfect — walls may be skewed and rooms simplified. This is by design; it looks like a real adventurer sketched it.
- Isometric results look best on maps with clear room shapes. Long corridors and open spaces translate well; very dense or irregular layouts may become abstract.
- You can generate multiple times and save different styles to different Atlas locations.
