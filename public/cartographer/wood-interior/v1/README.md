# Wood Interior — Tile Pack (v1)

This pack targets warm timber interiors — taverns, noble manors, military barracks, hunting lodges, guild halls. Files are referenced by `manifest.json` and loaded at runtime. The runtime falls back to procedural placeholder tiles for any slot whose `.webp` fails to load.

## Asset list

| Folder            | Files needed        | Notes                                                                                 |
| ----------------- | ------------------- | ------------------------------------------------------------------------------------- |
| `floor/`          | `0.webp` … `9.webp` | Varied wooden plank floors — oak/pine boards, varied grain direction and wear. Seamless tileable on all four edges. |
| `wallSegmentH/`   | `0.webp` … `3.webp` | Horizontal wall segment — timber-frame plank wall viewed from above (see convention). |
| `wallSegmentV/`   | `0.webp` … `3.webp` | Vertical wall segment — same, rotated 90°.                                             |
| `doorClosedH/`    | `0.webp`            | Closed wooden interior door with iron handle, horizontal orientation.                  |
| `doorClosedV/`    | `0.webp`            | Same, vertical orientation.                                                            |
| `doorOpenH/`      | `0.webp`            | Open door variant — door ajar inward, warm interior light.                             |
| `doorOpenV/`      | `0.webp`            | Same, vertical orientation.                                                            |
| `solidBlock/`     | `0.webp` … `5.webp` | Thick timber structure — load-bearing post, stone chimney breast, or reinforced wall fill. No transparency. |
| `rubble/`         | `0.webp` … `3.webp` | Scattered wood splinters, overturned crockery, broken furniture fragments. Alpha channel for partial coverage. |

## Wall-tile convention

Wall segments and door tiles are **128×128 transparent tiles with the painted strip centered in the tile** — vertical center for `*H` tiles (horizontal strip ≈ y 53–75), horizontal center for `*V` tiles (vertical strip ≈ x 53–75). The renderer draws each wall tile shifted by half a tile so the painted strip lands ON the gridline. Outside the strip must be fully transparent.

## Generation prompt template

Use the following shared parameters for all tiles in this pack:

**Style brief**: 2024 OneDnD aesthetic — clean, modern. Top-down orthographic view, NOT isometric. Even warm ambient lighting (candlelight/lantern tone), no harsh directional shadows. Palette: warm oak and pine tones (amber, tan, honey-brown), iron and brass hardware accents. **NOT** parchment, cartoon, or fantasy-illustration style.

**Technical spec**: 128×128 WebP, quality ≈ 0.85, RGB(A) — alpha only where noted.

### floor/ (variants 0–9)

```text
Top-down orthographic interior floor tile, 128x128, seamless tileable all four edges.
Wooden plank floor — [VARIANT: see below]. Warm oak/pine palette, subtle wood grain.
Even warm ambient light, no harsh shadows, no vignette. 2024 OneDnD RPG art style.
```

Variant guidance:
- 0–2: straight-run planks, varying board widths, aligned horizontally
- 3–4: straight-run planks aligned vertically (alternate run direction)
- 5–6: aged and worn planks with knots and colour variation
- 7–8: darker stained oak, more polished (great hall / tavern common room)
- 9: wide-board pine with gap lines and nail marks (rustic cabin)

### wallSegmentH/ and wallSegmentV/ (variants 0–3)

```text
Top-down orthographic wall segment tile, 128x128px, fully transparent background.
A horizontal cross-section of a timber-frame plank wall, viewed from directly above.
The wall cross-section is painted as a strip centered vertically (approximately y=53 to y=75, 22px thick).
Shows the cut end-grain of vertical studs between plank cladding layers — wood with nails.
Warm brown timber palette. Strip terminates cleanly at left and right edges.
2024 OneDnD RPG art style. Everything outside the strip must be alpha=0.
```

For `wallSegmentV/`: rotate 90° — vertical strip centered horizontally (x=53–75).
Variants 0–3: subtle variation in stud positions and plank grain.

### doorClosedH/ and doorClosedV/

```text
Top-down orthographic door tile, 128x128px, fully transparent background.
A closed interior wooden door with iron latch handle, set in a timber door frame.
Painted as a horizontal strip centered vertically (y=53–75) for the H variant.
Door surface shows panel detail from above — warm oak tone, iron handle visible.
2024 OneDnD RPG art style. Everything outside the door strip must be alpha=0.
```

### doorOpenH/ and doorOpenV/

Same as doorClosed but the door is open/ajar — the panel is rotated showing its
thin edge, with the doorway opening revealing void beyond the threshold.

### solidBlock/ (variants 0–5)

```text
Top-down orthographic solid block tile, 128x128px, fully opaque, no alpha.
Dense timber structural element viewed from above — could be a thick load-bearing timber post,
a stone fireplace/chimney section, or a reinforced timber partition. Fully fills the cell.
Warm brown and grey palette. Subtle surface texture. Seamless tileable. Even ambient light.
2024 OneDnD RPG art style.
```

### rubble/ (variants 0–3)

```text
Top-down orthographic rubble tile, 128x128px, transparent background.
Scattered debris on a wooden floor — mix of wood splinters, pottery shards, papers/scrolls.
Partial coverage, transparent where there is no debris. Warm palette.
2024 OneDnD RPG art style.
```

### wallJoint/ (9 directional files)

The joint tile fills the small square gap at every intersection where an H and V wall strip meet. The renderer scales the full 128×128 image down to ≈22×22 display pixels, so fill the entire canvas with the joint art.

File naming: `L_NE_0.webp`, `L_SE_0.webp`, `L_SW_0.webp`, `L_NW_0.webp`, `T_N_0.webp`, `T_E_0.webp`, `T_S_0.webp`, `T_W_0.webp`, `CROSS_0.webp`.

Joint shape guide (top-down view of wall-strip intersection, drawn at full 128×128):

- **L_NE** — wall runs E + N from corner (open SW quadrant)
- **L_SE** — wall runs E + S from corner (open NW quadrant)
- **L_SW** — wall runs W + S from corner (open NE quadrant)
- **L_NW** — wall runs W + N from corner (open SE quadrant)
- **T_N** — 3-way: E + W + N (missing S arm)
- **T_E** — 3-way: N + S + E (missing W arm)
- **T_S** — 3-way: E + W + S (missing N arm)
- **T_W** — 3-way: N + S + W (missing E arm)
- **CROSS** — full 4-way intersection

```text
Top-down orthographic wall-joint tile, 128x128px, fully opaque.
The intersection of two timber-frame walls meeting at a corner — [SHAPE: see above].
Cut cross-section showing end-grain wood and nails where walls meet.
Warm brown timber palette, matches the wallSegment style. Fill entire canvas.
2024 OneDnD RPG art style.
```

### stairsUp/ and stairsDown/ (4 directional files each)

Full-cell opaque tiles. The direction letter (N/E/S/W) indicates the high end of the stairs — "N" means the steps rise toward the north edge of the cell. File naming: `N_0.webp`, `E_0.webp`, `S_0.webp`, `W_0.webp`.

```text
Top-down orthographic staircase tile, 128x128px, fully opaque.
Wooden interior stairs — [DIRECTION: steps rise toward the N/E/S/W edge].
Warm oak/pine treads, visible risers between steps. Even warm ambient light.
stairsUp: lighter at the high end (closer to viewer perspective).
stairsDown: darker at the descending end (receding into shadow).
Fill entire cell. 2024 OneDnD RPG art style.
```

### debris/ (variants 0–3)

Like rubble but lighter scatter — single broken items rather than heaped piles.

```text
Top-down orthographic debris tile, 128x128px, transparent background.
Light scatter of broken interior objects on a wooden floor — a shattered mug,
torn papers, a snapped chair leg. Sparse coverage, transparent elsewhere.
Warm palette. 2024 OneDnD RPG art style.
```
