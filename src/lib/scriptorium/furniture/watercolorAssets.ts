/*
 * Watercolor / ink splatter assets (Phase D, #456).
 *
 * Single source of truth for the decoration art shipped under
 * public/assets/scriptorium/watercolor/. A furniture item stores a 1-based
 * `variant` index into this list (kept numeric so saved docs stay stable even
 * if the underlying filenames change), and `watercolorSrc` resolves it to a URL.
 */

export const WATERCOLOR_ASSETS = [
  "ink_asset_01_heavy_blot.png",
  "ink_asset_02_diagonal_splash.png",
  "ink_asset_03_dragged_smear.png",
  "ink_asset_04_corner_seep.png",
  "ink_asset_05_round_drips.png",
  "ink_asset_06_light_speckle.png",
  "ink_asset_07_cluster_spill.png",
  "ink_asset_08_starburst.png",
  "ink_asset_09_diffuse_wash.png",
] as const;

export const WATERCOLOR_COUNT = WATERCOLOR_ASSETS.length;

/** Resolve a 1-based variant index to its asset URL (clamped into range). */
export function watercolorSrc(variant: number): string {
  const i = Math.min(WATERCOLOR_COUNT, Math.max(1, Math.round(variant || 1))) - 1;
  return `/assets/scriptorium/watercolor/${WATERCOLOR_ASSETS[i]}`;
}
