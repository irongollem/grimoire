# Icy Cave — Tile Pack (v1)

This pack targets Icewind Dale / arctic underdark settings. Files are referenced by `manifest.json` and loaded at runtime. The runtime falls back to procedural placeholder tiles for any slot whose `.webp` fails to load.

## Asset list

| Folder            | Files needed        | Notes                                                                           |
| ----------------- | ------------------- | ------------------------------------------------------------------------------- |
| `floor/`          | `0.webp` … `9.webp` | Varied frozen cave floor — mix of cracked glacial ice, frost-covered stone slab, thin snow crust, exposed bare rock. Subtle blue-white tint. Seamless tileable on all four edges. |
| `wallSegmentH/`   | `0.webp` … `3.webp` | Horizontal wall segment — icy stalactite formation viewed from above (see wall-tile convention). |
| `wallSegmentV/`   | `0.webp` … `3.webp` | Vertical wall segment — same motif rotated 90°.                                 |
| `doorClosedH/`    | `0.webp`            | Closed iron-banded door (frost-rimed wood), horizontal orientation.             |
| `doorClosedV/`    | `0.webp`            | Same, vertical orientation.                                                     |
| `doorOpenH/`      | `0.webp`            | Open variant — door ajar, icy passage visible.                                  |
| `doorOpenV/`      | `0.webp`            | Same, vertical orientation.                                                     |
| `solidBlock/`     | `0.webp` … `5.webp` | Solid ice/rock mass — deep blue-grey glacial formations, opaque full-cell fill. No transparency. |
| `rubble/`         | `0.webp` … `3.webp` | Ice shard debris and frost chunks, partial coverage with alpha channel.         |

## Wall-tile convention

Wall segments and door tiles are **128×128 transparent tiles with the painted strip centered in the tile** — vertical center for `*H` tiles (horizontal strip ≈ y 53–75), horizontal center for `*V` tiles (vertical strip ≈ x 53–75). The renderer draws each wall tile shifted by half a tile so the painted strip lands ON the gridline. Outside the strip must be fully transparent.

## Generation prompt template

Use the following shared parameters for all tiles in this pack:

**Style brief**: 2024 OneDnD aesthetic — clean, modern, high-contrast. Top-down orthographic view, NOT isometric. Even ambient lighting, no directional shadows. Palette: cold blue-white glacial ice, dark blue-grey rock, occasional frost crystals. **NOT** parchment or antique style.

**Technical spec**: 128×128 WebP, quality ≈ 0.85, RGB(A) — alpha only where noted.

### floor/ (variants 0–9)

```text
Top-down orthographic dungeon floor tile, 128x128, seamless tileable all four edges.
Icy arctic cave floor — [VARIANT: see below]. Cold blue-grey palette, subtle frost detail.
Even ambient light, no shadows, no vignette. 2024 OneDnD RPG art style, clean and modern.
```

Variant guidance (use as seed for variation, not word-for-word):
- 0–2: cracked blue-white glacier ice, fissure lines in random directions
- 3–4: frost-covered dark stone slab, thin white frost coating
- 5–6: thin snow crust on grey rock, irregular edge
- 7–8: wet bare stone with ice patches
- 9: exposed dark rock with frozen puddle

### wallSegmentH/ and wallSegmentV/ (variants 0–3)

```text
Top-down orthographic wall segment tile, 128x128px, fully transparent background.
A horizontal strip of jagged icy stalactite formations, as seen from directly above,
painted centered vertically in the tile (approximately y=53 to y=75, 22px thick).
Strip terminates cleanly at both left and right edges for seamless tiling.
Icy cave aesthetic — translucent blue-white ice formations, cold stone backing.
2024 OneDnD RPG art style. Everything outside the strip must be alpha=0.
```

For `wallSegmentV/`: rotate 90° — the strip is vertical, centered horizontally (x=53–75).
Variant 0–3: subtle positional variation in the stalactite shapes.

### doorClosedH/ and doorClosedV/

```text
Top-down orthographic door tile, 128x128px, fully transparent background.
A closed iron-banded door made of frost-rimed timber, set in a rough ice/stone frame.
The door is painted as a horizontal strip centered vertically (y=53–75) for the H variant.
Door wood shows heavy frost coating, iron bands are dark with ice crystals.
2024 OneDnD RPG art style. Everything outside the door strip must be alpha=0.
```

### doorOpenH/ and doorOpenV/

Same as doorClosed but the door is open/ajar — the planks are pushed aside, revealing
the icy passage interior (dark void with frost-rimmed edges).

### solidBlock/ (variants 0–5)

```text
Top-down orthographic dungeon solid block tile, 128x128px, fully opaque, no alpha.
Dense glacial ice and rock formation viewed from directly above — solid fill, no transparency.
Deep blue-grey palette, lighter blue highlights where ice surfaces catch ambient light.
Subtle variation in surface texture. Seamless tileable. Even ambient light.
2024 OneDnD RPG art style.
```

### rubble/ (variants 0–3)

```text
Top-down orthographic dungeon rubble tile, 128x128px, transparent background.
Ice shard debris and frost chunks scattered on bare stone — partial coverage,
transparent where there is no rubble. Shards cast tiny drop shadows on the stone.
Cold blue-white palette. 2024 OneDnD RPG art style.
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
The intersection of icy stalactite wall formations — [SHAPE: see above].
Blue-grey glacial ice, matches the wallSegment style. Fill entire canvas.
2024 OneDnD RPG art style.
```

### stairsUp/ and stairsDown/ (4 directional files each)

Full-cell opaque tiles. The direction letter (N/E/S/W) indicates the high end of the stairs — "N" means the steps rise toward the north edge of the cell. File naming: `N_0.webp`, `E_0.webp`, `S_0.webp`, `W_0.webp`.

```text
Top-down orthographic staircase tile, 128x128px, fully opaque.
Icy cave stairs carved from stone — [DIRECTION: steps rise toward the N/E/S/W edge].
Frost-covered stone treads, visible risers. Cold blue-grey palette.
stairsUp: lighter at the high end. stairsDown: darker at the descending end.
Fill entire cell. 2024 OneDnD RPG art style.
```

### debris/ (variants 0–3)

Like rubble but lighter scatter — sparse individual shards rather than heaped piles.

```text
Top-down orthographic debris tile, 128x128px, transparent background.
Light scatter of ice chips and frost crystals on bare cave stone — sparse coverage,
transparent elsewhere. Cold blue-white palette. 2024 OneDnD RPG art style.
```
