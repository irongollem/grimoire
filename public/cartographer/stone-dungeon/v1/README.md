# Stone Dungeon — Starter Tile Pack (v1)

This is the bundled starter pack for [Cartographer](../../../../context/features/cartographer.md). Files in this folder are referenced by `manifest.json` and loaded at runtime.

## Status: Asset generation pending

The manifest declares the full M1+M2 slot list, but the actual WebP files are not yet committed. The pack loader (`src/cartographer/packLoader.ts`) falls back to **procedural placeholder tiles** for any slot whose `.webp` fails to load, so Cartographer works end-to-end before assets land.

Once the AI generation pipeline produces real assets, drop them into the matching folders below — no code change needed.

## Asset list

| Folder | Files needed | Notes |
| --- | --- | --- |
| `floor/` | `0.webp` … `9.webp` | Random variants; subtle wear; dark grey weathered flagstones. Seamless tileable on all four edges. |
| `wallSegmentH/` | `0.webp` … `3.webp` | Horizontal wall segment (see wall-tile convention below). |
| `wallSegmentV/` | `0.webp` … `3.webp` | Vertical wall segment (see wall-tile convention below). |
| `doorClosedH/` | `0.webp` | Closed wooden door. Replaces a horizontal wall segment. |
| `doorClosedV/` | `0.webp` | Closed wooden door. Replaces a vertical wall segment. |
| `doorOpenH/` | `0.webp` | Open variant of the horizontal door. |
| `doorOpenV/` | `0.webp` | Open variant of the vertical door. |
| `solidBlock/` | `0.webp` … `5.webp` | Full-cell thick walls. Dressed stone block, sand-filled mass. |
| `rubble/` | `0.webp` … `3.webp` | Decorative debris, partial-cell coverage with alpha. |
| `wallJoint/` | `L_NE_0.webp` … `CROSS_0.webp` | 9 directional corner joints (optional — falls back to solid square). |
| `stairsUp/` | `N_0.webp` … `W_0.webp` | 4-directional ascending stairs (optional). |
| `stairsDown/` | `N_0.webp` … `W_0.webp` | 4-directional descending stairs (optional). |
| `debris/` | `0.webp` … `3.webp` | Light scatter debris, partial-cell coverage with alpha (optional). |

## Wall-tile convention

Wall segments (`wallSegmentH`, `wallSegmentV`, `doorClosedH`, `doorClosedV`, `doorOpenH`, `doorOpenV`) are **128×128 transparent tiles with the painted strip in the geometric center** of the tile — vertical center for the `*H` set, horizontal center for the `*V` set. The renderer draws each wall tile shifted by half a tile so the painted strip lands ON the gridline, straddling both adjacent cells equally rather than living entirely inside one.

- For `*H` tiles: paint a horizontal strip roughly from y ≈ 53 to y ≈ 75 (≈18 % of tile height, centered on y = 64). The strip must terminate cleanly at the left and right edges so two segments along the same row abut seamlessly.
- For `*V` tiles: paint a vertical strip from x ≈ 53 to x ≈ 75 (≈18 % of tile width, centered on x = 64). Terminate cleanly at top and bottom.
- Outside the strip the tile must be fully transparent — anything else would visually bleed into adjacent cells.

If you adopt a thicker or thinner aesthetic in a future pack, keep the strip centered; the renderer's half-tile shift assumes center-alignment.

## Generation guidelines

All assets must be:

- **128×128 WebP**, quality ≈ 0.85
- **Top-down (orthographic)** view, not isometric
- **Even lighting**, no directional bias
- **Seamless edges** for floor / solidBlock; **clean perpendicular cuts** at cell boundaries for wall segments
- Style: 2024 OneDnD aesthetic — clean, modern, not crusty parchment

See `context/features/cartographer.md` § "Generation prompt template" for the shared prompt template.

### wallJoint/ (9 directional files)

The joint tile fills the small square gap at every H+V wall intersection. The renderer scales the full 128×128 image down to ≈22×22 display pixels, so fill the entire canvas with the joint art.

File naming: `L_NE_0.webp`, `L_SE_0.webp`, `L_SW_0.webp`, `L_NW_0.webp`, `T_N_0.webp`, `T_E_0.webp`, `T_S_0.webp`, `T_W_0.webp`, `CROSS_0.webp`.

Joint shape guide:

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
The intersection of dressed stone walls — [SHAPE: see above].
Dark grey stone, matches the wallSegment style. Fill entire canvas.
2024 OneDnD RPG art style.
```

### stairsUp/ and stairsDown/ (4 directional files each)

Full-cell opaque tiles. Direction = high end of the stairs. File naming: `N_0.webp`, `E_0.webp`, `S_0.webp`, `W_0.webp`.

```text
Top-down orthographic staircase tile, 128x128px, fully opaque.
Stone dungeon stairs — [DIRECTION: steps rise toward the N/E/S/W edge].
Weathered grey stone treads, visible risers between steps. Even ambient light.
stairsUp: lighter at the high end. stairsDown: darker at the descending end.
Fill entire cell. 2024 OneDnD RPG art style.
```

### debris/ (variants 0–3)

```text
Top-down orthographic debris tile, 128x128px, transparent background.
Light scatter of stone chips, mortar dust, and small pebbles on flagstone.
Sparse coverage, transparent where there is no debris. Dark grey palette.
2024 OneDnD RPG art style.
```

## Validation

The validator (`src/cartographer/validatePack.ts`) checks this pack on load. Open the editor and check the status bar / console for any reported missing slots.
