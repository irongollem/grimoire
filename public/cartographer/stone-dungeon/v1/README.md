# Stone Dungeon — Starter Tile Pack (v1)

This is the bundled starter pack for [Cartographer](../../../../context/features/cartographer.md). Files in this folder are referenced by `manifest.json` and loaded at runtime.

## Status: Asset generation pending

The manifest declares the full M1+M2 slot list, but the actual WebP files are not yet committed. The pack loader (`src/cartographer/packLoader.ts`) falls back to **procedural placeholder tiles** for any slot whose `.webp` fails to load, so Cartographer works end-to-end before assets land.

Once the AI generation pipeline produces real assets, drop them into the matching folders below — no code change needed.

## Asset list (M1 + M2)

| Folder            | Files needed                    | Notes                                                                                                              |
| ----------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `floor/`          | `0.webp` … `9.webp`             | Random variants; subtle wear; dark grey weathered flagstones. Seamless tileable on all four edges.                 |
| `wallSegmentH/`   | `0.webp` … `3.webp`             | Wall painted in the top ~15% of a 128×128 transparent tile. Terminates cleanly at left/right edges.                |
| `wallSegmentV/`   | `0.webp` … `3.webp`             | Wall painted in the left ~15% of the tile. Terminates cleanly at top/bottom edges.                                 |
| `doorClosedH/`    | `0.webp`                        | Closed wooden door. Replaces a horizontal wall segment.                                                            |
| `doorClosedV/`    | `0.webp`                        | Closed wooden door. Replaces a vertical wall segment.                                                              |
| `doorOpenH/`      | `0.webp`                        | Open variant of the horizontal door.                                                                               |
| `doorOpenV/`      | `0.webp`                        | Open variant of the vertical door.                                                                                 |
| `solidBlock/`     | `0.webp` … `5.webp`             | Full-cell thick walls. Dressed stone block, sand-filled mass.                                                      |
| `rubble/`         | `0.webp` … `3.webp`             | Decorative debris, partial-cell coverage with alpha.                                                               |

## Generation guidelines

All assets must be:

- **128×128 WebP**, quality ≈ 0.85
- **Top-down (orthographic)** view, not isometric
- **Even lighting**, no directional bias
- **Seamless edges** for floor / solidBlock; **clean perpendicular cuts** at cell boundaries for wall segments
- Style: 2024 OneDnD aesthetic — clean, modern, not crusty parchment

See `context/features/cartographer.md` § "Generation prompt template" for the shared prompt template.

## Validation

The validator (`src/cartographer/validatePack.ts`) checks this pack on load. Open the editor and check the status bar / console for any reported missing slots.
