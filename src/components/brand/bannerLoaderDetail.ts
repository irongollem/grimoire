/**
 * How finely the bookmark loader is cut, and how far it sways, at a given size.
 *
 * The loader is one picture of cloth sliced into strips that each sway a little
 * later than the one above. Both numbers were tuned at the loading screen's size
 * (a 104px flag: 28 strips, a sway of a tenth of its width) and neither survives
 * being scaled down as-is. A 16px flag in a button would be 28 half-pixel strips,
 * each its own animated layer, swaying 0.7px: all of the cost and none of the
 * motion. So the strip count follows the height, and the sway is held to a
 * distance the eye can still see.
 */

/** The flag's box is the rod plus the cloth; this is width : height. */
export const FLAG_ASPECT = 1 / 2.337;
/** Share of the box height the rod takes; the cloth hangs in the rest. */
const ROD_SHARE = 0.167 / 2.337;

export const MAX_STRIPS = 28;
const MIN_STRIPS = 8;
/** Cloth height per strip on the loading screen, which is what looked right. */
const PX_PER_STRIP = 3.4;

const BASE_SWAY = 0.1;
const MAX_SWAY = 0.3;
/** Below this the cloth reads as a still red tick rather than as moving. */
const MIN_SWAY_PX = 1.75;

export interface BannerLoaderDetail {
  strips: number;
  /** Sway of the cloth's free end, as a fraction of the flag's width. */
  sway: number;
}

/** Detail for a flag `height` px tall. An unmeasurable box gets the full cut. */
export function bannerLoaderDetail(height: number): BannerLoaderDetail {
  if (!(height > 0)) return { strips: MAX_STRIPS, sway: BASE_SWAY };
  const cloth = height * (1 - ROD_SHARE);
  const width = height * FLAG_ASPECT;
  return {
    strips: clamp(Math.round(cloth / PX_PER_STRIP), MIN_STRIPS, MAX_STRIPS),
    sway: clamp(MIN_SWAY_PX / width, BASE_SWAY, MAX_SWAY),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
