/**
 * Pure composition policy for seating a Meshy figure onto one of our curated
 * bases (SIMULACRUM_PLAN.md §2 BASELESS decision, #542): the mm-per-meter
 * scale factors, the sanity clamp, and the STL seating transform. NO Deno
 * imports on purpose — unit-tested with vitest (mesh-compose.test.ts) and
 * imported unmodified by poll-meshy-jobs and forge-mini's `set_base` action.
 *
 * Meshy figures arrive with `auto_size` (AI-estimated real-world size,
 * METERS numerically) + `origin_at:"bottom"` (feet at y=0, Y-up) — see
 * mesh-y params in simulacrum.ts. Composition happens in millimetres.
 */
import { parseBinaryStl, stlBounds, transformStl, writeBinaryStl, type StlBounds } from "./stl.ts";

/**
 * mm-per-meter conversion, calibrated on an average human (1.75 m): a
 * 1.75 m figure lands at exactly 28mm (28mm scale, "true 28mm") or 32mm
 * (32mm "heroic" scale). This is a SIZE-FAITHFUL scale, not a uniform
 * per-mini multiplier — a halfling stays visibly smaller than an ogre at the
 * same target scale, because both are converted through the same
 * mm-per-meter factor rather than each being normalized to a fixed height.
 * 1.75 * 16 = 28; 1.75 * 18.285714... ≈ 32 (32.0 pinned, not the repeating
 * decimal, since Meshy's auto_size is itself an estimate — extra precision
 * here buys nothing).
 */
export const SCALE_FACTORS: Record<28 | 32, number> = {
  28: 16,
  32: 18.3,
};

/**
 * After mm-per-meter conversion, clamp the figure's height into a sane
 * tabletop range: a size-faithful conversion could otherwise put a pixie at
 * 3mm (unprintable) or a dragon at 400mm (not a "mini" anymore, and blows
 * past what a 25mm base can visually anchor). Figures outside the clamp are
 * rescaled to the nearest bound instead of failing composition outright.
 */
export const FIGURE_HEIGHT_CLAMP_MM = { min: 12, max: 60 } as const;

/**
 * Resolves the scale factor to apply to a figure's RAW (meter) coordinates
 * so its height lands at the target tabletop scale, clamped into
 * FIGURE_HEIGHT_CLAMP_MM. Returns a millimetres-per-source-unit multiplier —
 * NOT the raw SCALE_FACTORS entry — so callers can feed it straight into
 * transformStl/composeGlb without re-deriving anything.
 */
export function figureScaleFor(figureBounds: StlBounds, scaleMm: 28 | 32): number {
  const heightMeters = figureBounds.max[1] - figureBounds.min[1];
  if (!(heightMeters > 0)) {
    throw new Error(`Invalid figure bounds: non-positive height (${heightMeters})`);
  }
  const projectedHeightMm = heightMeters * SCALE_FACTORS[scaleMm];
  const clampedHeightMm = Math.min(
    Math.max(projectedHeightMm, FIGURE_HEIGHT_CLAMP_MM.min),
    FIGURE_HEIGHT_CLAMP_MM.max,
  );
  return clampedHeightMm / heightMeters;
}

/**
 * Composes a figure STL onto a base STL: scales the figure to
 * `figureScaleFor`'s clamped tabletop height, centers it on x/z (the base is
 * itself origin-centered per the plinth convention — base-bottom center at
 * (0,0,0)), and seats its scaled minY exactly on the base's maxY (its top
 * surface). Both inputs are Y-up. No boolean union — binary-STL triangle
 * concat is enough; slicers merge touching shells at print time.
 *
 * NOTE (axis convention): this stays in the Y-up space shared with Meshy and
 * glb-compose.ts. Printers/slicers expect Z-up — that remap is verified at
 * the Phase 4 live smoke test (SIMULACRUM_PLAN.md §7 Phase 4), not here.
 */
export function composeStl(figureStl: Uint8Array, baseStl: Uint8Array, scaleMm: 28 | 32): Uint8Array {
  const figureTris = parseBinaryStl(figureStl);
  const baseTris = parseBinaryStl(baseStl);

  const figureBounds = stlBounds(figureTris);
  const baseBounds = stlBounds(baseTris);
  const scale = figureScaleFor(figureBounds, scaleMm);

  const centerX = ((figureBounds.min[0] + figureBounds.max[0]) / 2) * scale;
  const centerZ = ((figureBounds.min[2] + figureBounds.max[2]) / 2) * scale;
  const translateY = baseBounds.max[1] - figureBounds.min[1] * scale;

  const scaledFigure = transformStl(figureTris, scale, [-centerX, translateY, -centerZ]);
  return writeBinaryStl([scaledFigure, baseTris]);
}
