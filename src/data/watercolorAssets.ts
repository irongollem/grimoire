/*
 * Watercolor / ink splatter assets (Phase D, #456).
 *
 * Single source of truth for the decoration art shipped under
 * public/assets/scriptorium/watercolor/. A furniture item stores a 1-based
 * `variant` index into this list (kept numeric so saved docs stay stable even
 * if the underlying filenames change); the renderer paints the asset as a CSS
 * mask filled with the item's tint colour, so `aspect` is needed to size the
 * (height-less) masked box correctly.
 *
 * Lives in `data/` rather than `lib/scriptorium/furniture/` (#721) because it
 * has two consumers on opposite sides of a one-way boundary: the furniture
 * renderer, and the legacy `lib/tiptap/watercolor` node kept registered for
 * pre-v3 documents. `lib/tiptap` is infrastructure and must not import from a
 * feature folder, and parking the table in `lib/tiptap` instead would only
 * invert the same problem — furniture, which owns this art, would depend on
 * the editor subsystem for it. A neutral asset table lets both sides point
 * outward at it.
 */

export interface WatercolorAsset {
  file: string;
  /** width / height of the source art — drives the masked box's aspect-ratio. */
  aspect: number;
}

export const WATERCOLOR_ASSETS: readonly WatercolorAsset[] = [
  { file: "ink_asset_01_heavy_blot.png", aspect: 1 },
  { file: "ink_asset_02_diagonal_splash.png", aspect: 1448 / 1086 },
  { file: "ink_asset_03_dragged_smear.png", aspect: 1448 / 1086 },
  { file: "ink_asset_04_corner_seep.png", aspect: 1 },
  { file: "ink_asset_05_round_drips.png", aspect: 1086 / 1448 },
  { file: "ink_asset_06_light_speckle.png", aspect: 1 },
  { file: "ink_asset_07_cluster_spill.png", aspect: 1 },
  { file: "ink_asset_08_starburst.png", aspect: 1 },
  { file: "ink_asset_09_diffuse_wash.png", aspect: 1 },
] as const;

export const WATERCOLOR_COUNT = WATERCOLOR_ASSETS.length;

/** Resolve a 1-based variant index to its asset record (clamped into range). */
export function watercolorAsset(variant: number): WatercolorAsset {
  const i = Math.min(WATERCOLOR_COUNT, Math.max(1, Math.round(variant || 1))) - 1;
  return WATERCOLOR_ASSETS[i];
}

/** Resolve a 1-based variant index to its asset URL. */
export function watercolorSrc(variant: number): string {
  return `/assets/scriptorium/watercolor/${watercolorAsset(variant).file}`;
}
