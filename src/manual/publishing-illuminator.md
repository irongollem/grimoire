---
title: "Illuminator: Image Effects"
section: Publishing
section_order: 14
order: 4
summary: Apply colour grading, vignettes, depth of field, brush masking, and edge effects to campaign art.
keywords: illuminator, image, effect, colour grading, vignette, depth of field, brush, mask, edge, texture, export, scriptorium
---

The **Illuminator** is an image editor for atmospheric campaign art that runs entirely on your own device. Find it in the sidebar under **Compendium → Publish → Illuminator** (route `/illuminate`; desktop only). All processing happens in your browser at full resolution: nothing is uploaded anywhere until you choose to export it.

## Key ideas

| Term | Meaning |
| --- | --- |
| **Auto mode** | Depth-of-field blur radiates outward from a focal point you click, automatic, no painting. |
| **Brush mode** | You paint sharp/blurred areas directly with a brush instead of using a focal point. |
| **Mask** | The brush strokes you've painted in Brush mode. |

## Uploading an image

Drag and drop, or click to upload, any PNG/JPG/WebP. When opened from a Scriptorium document (via its **Edit in Illuminator** button), the image loads automatically and a **Save to Scriptorium** button appears in the export footer.

## Mode

A **Mode** toggle (**Auto** / **Brush**) at the top of the controls panel governs how Depth of Field is applied: see below.

## Effect sections

Each section is independently toggleable and collapsible. Enable only what you need.

### Brush (Brush mode only)

Paint a mask directly on the image instead of relying on a single focal point:

- **Shape**: Round, Splatter, Rough, or Chalk.
- **Pressure →**: whether stylus/touch pressure affects brush **size** or **opacity**.
- Sliders for the active shape (size, hardness, opacity, etc.; hardness is hidden for non-round shapes).
- **Left-drag erases, right-drag restores.** **Undo (Ctrl+Z)** and **Clear mask** are always available.

### Colour Grading

- **Preset**: quick-apply named grades.
- **Sliders**: Brightness, Contrast, Saturation, Temperature (warm/cool), Hue rotation.

### Vignette

- **Type**: Transparent (fades to alpha) or Colour (fades to a solid colour, with a colour picker).
- **Strength** and **Softness** sliders.

### Texture Overlay

- Upload a tiling texture (parchment, stone, fabric).
- **Blend mode**: several canvas compositing modes.
- **Opacity** and **Tile scale** sliders.

### Depth of Field

In **Auto** mode: click anywhere on the preview to set the focal point (the sharp area), then tune **Falloff curve** (Linear/Quadratic/Cubic), **Focus radius**, **Blur strength**, and **Desaturation** (slightly desaturates the blurred zones).

In **Brush** mode, the focal-point click is replaced entirely by your painted mask: the same falloff/blur/desaturation sliders still shape how the masked-out areas render.

### Edge Treatment

A torn, rough, or faded edge effect on each of the four edges (Top, Right, Bottom, Left) independently, each with its own **Enable** toggle, **Roughness**, **Fade width**, **Tear depth**, **Passes** (1–12), and **Variation**. Useful for aged-parchment, torn-map, or weathered looks.

## Exporting

- **Save to Scriptorium**: only shown when you arrived from a Scriptorium document; writes the edited image straight back into that document.
- **Download PNG**: saves the processed image at full source resolution.
- **Copy to Clipboard**: copies the image for pasting directly into a portrait upload or elsewhere.
- **Reset all to defaults**: clears every section without unloading the image.

## Tips

- **Nothing is uploaded until you export.** All processing happens in-browser; closing the tab loses unsaved work.
- **Brush mode replaces the focal point, not the DoF sliders.** Switch modes any time: your falloff/blur/desaturation settings carry over.

## Related

- [Scriptorium: Document Publisher](#scriptorium-document-publisher): the round-trip this tool is built for.
- [The Mint: Tokens and Coins](#the-mint-tokens-and-coins): touch up a portrait here before minting a token.
