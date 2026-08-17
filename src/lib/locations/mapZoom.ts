import type { Location, MapPin } from "@/types/location.types";

/**
 * The descend-into-a-map transition.
 *
 * An atlas is about zoom, so moving from a region's map to a town's map should
 * feel like continuing to zoom rather than like loading a different picture.
 * The illusion is cheap because the eye tracks *velocity*, not pixels: scale the
 * parent toward the pin, and hand over to the child while it is still moving.
 * The child enters slightly enlarged and settles, so the motion never stops at
 * the seam — that overlap is the whole trick, and removing it makes the join
 * read as a cut.
 *
 * Two details keep it honest at high magnification. The parent blurs and
 * desaturates as it grows, which both sells speed and hides the fact that a
 * 2000px JPEG at 7× is mush. And the cross-fade lands where detail is already
 * ambiguous, so the two images are never legible enough to disagree.
 */

/** Total wall-clock of the transition. */
export const ZOOM_DURATION_MS = 900;

/** How far the parent map is magnified before it hands over. */
export const ZOOM_PARENT_SCALE = 7;

/** The child arrives already enlarged and settles to 1 — the "still moving" cue. */
export const ZOOM_CHILD_ENTRY_SCALE = 1.25;

/**
 * When the child starts fading in, as a fraction of the total. Deliberately
 * before the parent finishes: an overlap reads as one continuous move, whereas
 * a sequential fade reads as two shots.
 */
export const ZOOM_CROSSFADE_AT = 0.45;

export const ZOOM_PARENT_BLUR_PX = 6;

/**
 * `in` descends into a child's map; `out` rises to the parent's.
 *
 * Ascending is the descent's timeline played backwards rather than a second
 * animation: the map being left grows slightly and fades, while the destination
 * resolves from magnified-and-blurred down to rest. Anything else would make
 * going back feel like a different mechanism from going in.
 */
export type ZoomDirection = "in" | "out";

export interface ZoomPlan {
  direction: ZoomDirection;
  /** The map currently on screen. */
  fromUrl: string;
  /** The map to end on. */
  toUrl: string;
  /**
   * CSS transform-origin, e.g. "42% 68%". Always the child's pin *on the parent
   * map* — the point the two images agree about, and therefore the only anchor
   * that keeps the place still while the scale changes. Shared by both
   * directions, which is what makes them reverses of each other.
   */
  origin: string;
  /** The location to select once the motion lands. */
  targetId: string;
}

/**
 * Whether a descent can be animated at all.
 *
 * Requires a map at both ends: with only one, there is nothing to zoom *into*
 * and the honest thing is an ordinary selection. Battle maps are excluded on
 * both sides — they are tactical encounter art rather than geography, and the
 * Atlas does not show them.
 */
export function canZoomBetween(
  parent: Pick<Location, "map_url" | "is_battle_map"> | null | undefined,
  child: Pick<Location, "map_url" | "is_battle_map"> | null | undefined,
): boolean {
  if (!parent?.map_url || parent.is_battle_map) return false;
  if (!child?.map_url || child.is_battle_map) return false;
  return true;
}

/** Pin position as a CSS transform-origin, clamped to the image. */
export function pinOrigin(pin: Pick<MapPin, "x" | "y">): string {
  return `${pct(pin.x)}% ${pct(pin.y)}%`;
}

function pct(fraction: number): number {
  if (!Number.isFinite(fraction)) return 50;
  return Math.min(100, Math.max(0, fraction * 100));
}

/** Centre, used when the parent has no pin for this child to anchor on. */
const CENTRE_ORIGIN = "50% 50%";

/** The child's pin on the parent's map — the anchor both directions share. */
function anchorOrigin(parent: Location, childId: string): string {
  const pin = parent.map_pins.find((p) => p.child_location_id === childId);
  return pin ? pinOrigin(pin) : CENTRE_ORIGIN;
}

/**
 * Descending from a parent's map into a child's, or null when the pair cannot
 * be animated. Callers fall back to plain selection on null.
 */
export function planDescent(
  parent: Location | null | undefined,
  child: Location | null | undefined,
): ZoomPlan | null {
  if (!parent || !child || !canZoomBetween(parent, child)) return null;
  return {
    direction: "in",
    fromUrl: parent.map_url!,
    toUrl: child.map_url!,
    origin: anchorOrigin(parent, child.id),
    targetId: child.id,
  };
}

/**
 * Rising from a child's map back to its parent's. Same anchor as the descent
 * that would reach this child, so going back retraces the way in rather than
 * pulling out from an arbitrary point.
 */
export function planAscent(
  child: Location | null | undefined,
  parent: Location | null | undefined,
): ZoomPlan | null {
  if (!child || !parent || !canZoomBetween(parent, child)) return null;
  return {
    direction: "out",
    fromUrl: child.map_url!,
    toUrl: parent.map_url!,
    origin: anchorOrigin(parent, child.id),
    targetId: parent.id,
  };
}

/**
 * Decodes an image before the animation starts. A cross-fade to an undecoded
 * image flashes white at exactly the moment the eye is following the motion,
 * which is the one frame that must not be wrong. Resolves either way — a failed
 * preload should degrade to a slightly rougher transition, never to no
 * navigation at all.
 */
export function preloadImage(url: string): Promise<void> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = () => resolve();
    img.src = url;
    if (img.complete) resolve();
  });
}
