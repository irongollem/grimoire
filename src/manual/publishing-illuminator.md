---
title: Illuminator — Image Effects
section: Publishing Tools
section_order: 11
order: 3
summary: Apply colour grading, vignettes, depth of field, and edge effects to campaign art.
keywords: illuminator, image, effect, colour grading, vignette, depth of field, edge, texture, export
---

The **Illuminator** (`/illuminate`) is a client-side image editor optimised for creating atmospheric campaign art. All processing runs in your browser at full resolution — nothing is sent to a server.

## Uploading an image

Drag and drop or click to upload any image. The preview updates as you apply effects.

## Effect sections

Each section is independently toggleable (checkbox) and collapsible. Enable only the effects you need.

### Colour Grading

- **Preset** — quick-apply named grades (Twilight, Dungeon, Heroic, Faded, etc.).
- **Sliders** — Brightness, Contrast, Saturation, Temperature (warm/cool), Hue rotation.

### Vignette

- **Type** — Transparent (fades to alpha at edges) or Colour (fades to a solid colour).
- **Strength** — how dark the vignette is.
- **Softness** — how gradual the transition is.

### Texture Overlay

- **Texture image** — upload a tiling texture (parchment, stone, fabric).
- **Blend mode** — Multiply, Overlay, Screen, Soft Light, Hard Light.
- **Opacity** — how visible the texture is.
- **Tile scale** — size of the texture tile relative to the canvas.

### Depth of Field

Simulates a camera focal point with background blur.

1. Click anywhere on the preview to set the **focal point** (the sharp area).
2. **Falloff curve** — Linear, Quadratic, or Cubic (how quickly sharpness falls off from the focal point).
3. **Focus radius** — the radius of the sharp zone.
4. **Blur strength** — how blurry the out-of-focus areas become.
5. **Desaturation** — slightly desaturates the blurred zones for a more realistic look.

### Edge Treatment

Apply a torn, rough, or faded edge effect to each edge independently (Top, Right, Bottom, Left).

Per edge:

- **Enable** toggle.
- **Roughness** — how irregular the edge is.
- **Fade width** — how far inward the effect extends.
- **Tear depth** — how pronounced the irregular tearing is.
- **Passes** — number of processing iterations (more passes = deeper effect).
- **Variation** — randomness in the edge pattern.

Edge treatment is useful for making digital art look like aged parchment documents, torn maps, or weathered illustrations.

## Exporting

- **Download PNG** — saves the processed image at full resolution.
- **Copy to Clipboard** — copies the image for pasting directly into Grimoire's portrait uploads or Scriptorium.
- **Reset All to Defaults** — clears all effects back to baseline without unloading the image.
