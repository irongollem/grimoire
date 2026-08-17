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

/**
 * How far the parent map is magnified before it hands over — and therefore the
 * assumed ratio between the two maps: the child's map depicts roughly the pin's
 * region, so the parent shown at 7× covers about what the child shows at 1×.
 */
export const ZOOM_PARENT_SCALE = 7;

/**
 * The child's scale when the parent is at 1×, derived rather than chosen.
 *
 * This is the constant that makes the illusion hold. If the child's map is the
 * parent's pin region, then a parent displayed at scale `s` matches a child
 * displayed at `s / ZOOM_PARENT_SCALE`. Both layers must move along that one
 * locked trajectory — parent 1→7 while child 1/7→1 on the way in, and the exact
 * reverse on the way out.
 *
 * An earlier version had the child merely overshoot (1.25 → 1) on the way in.
 * That looks fine descending, because the parent's 7× explosion dominates and
 * hides it — but reversed it put the *departing* map at full opacity growing
 * from 1 → 1.25, with nothing to mask it. Rising visibly began by zooming in.
 *
 * The lock survives any easing, as long as both layers share it: for parent
 * `1 + 6·e(t)` the child is `(1 + 6·e(t)) / 7` at every instant, whatever e is.
 * What breaks it is giving the two layers different curves, durations or delays
 * — so their transforms must be timed identically, and only opacity may differ.
 */
export const ZOOM_CHILD_SCALE = 1 / ZOOM_PARENT_SCALE;

/**
 * When the child starts fading in, as a fraction of the total. Deliberately
 * before the parent finishes: an overlap reads as one continuous move, whereas
 * a sequential fade reads as two shots.
 */
export const ZOOM_CROSSFADE_AT = 0.45;

export const ZOOM_PARENT_BLUR_PX = 6;

/**
 * The sizing rules a map image is displayed under, shared by `LocationMap` and
 * the zoom overlay so the two cannot disagree.
 *
 * They must render the image at *identical* size. `LocationMap` caps a compact
 * map's height, so an overlay that only constrained width drew the map
 * full-width and then snapped to the shorter, narrower box the instant the real
 * map took over — a jump at exactly the moment the transition is supposed to be
 * seamless. Two class strings in two files is how that happened; one constant
 * is why it cannot happen again.
 */
export const MAP_IMAGE_SIZING = "block h-auto max-w-full";

/** Height cap for a map rendered in `compact` mode. */
export const MAP_IMAGE_COMPACT_SIZING = "max-h-200";

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
