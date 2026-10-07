/**
 * Measuring on a world, region or city map (#932).
 *
 * A map's scale is two points and a distance the DM typed ("these are 120 mi
 * apart"), not a stored ratio. The points are fractions of the image's natural
 * size, so the scale is independent of how big the map is drawn; the ratio
 * (distance per natural pixel) is derived here when a route is measured, which
 * keeps the calibration editable and correct if the picture is later replaced
 * with a higher-resolution copy of the same map.
 *
 * Distances are taken over natural pixels, not fractions, because a fraction of
 * width and a fraction of height are different lengths on a map that is not
 * square.
 */
import type { MapScale } from "@/types/location.types";
import type { DistanceUnit } from "@/rules/travelPace";

export interface ImagePoint {
  x: number;
  y: number;
}

/** The image's natural size, as `MapFrame` reports it (0 until it has loaded). */
export interface ImageSize {
  width: number;
  height: number;
}

export const DISTANCE_UNITS: readonly DistanceUnit[] = ["mi", "km"];

export const DISTANCE_UNIT_LABELS: Record<DistanceUnit, string> = {
  mi: "Miles",
  km: "Kilometres",
};

function isFraction(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1;
}

function parsePoint(raw: unknown): ImagePoint | null {
  if (typeof raw !== "object" || raw === null) return null;
  const { x, y } = raw as Record<string, unknown>;
  return isFraction(x) && isFraction(y) ? { x, y } : null;
}

/**
 * A `locations.map_scale` value, or null when it is absent or malformed.
 *
 * The database CHECK holds the same shape, but a jsonb column reaches the
 * client untyped, and a bad value must read as "no scale" rather than put NaN
 * on the map. The two points must differ: a zero-length reference has no ratio.
 */
export function parseMapScale(raw: unknown): MapScale | null {
  if (typeof raw !== "object" || raw === null) return null;
  const { unit, distance, a, b } = raw as Record<string, unknown>;
  if (unit !== "mi" && unit !== "km") return null;
  if (typeof distance !== "number" || !Number.isFinite(distance) || distance <= 0) return null;
  const pa = parsePoint(a);
  const pb = parsePoint(b);
  if (!pa || !pb) return null;
  if (pa.x === pb.x && pa.y === pb.y) return null;
  return { unit, distance, a: pa, b: pb };
}

export type BuildScaleResult = { scale: MapScale; error: null } | { scale: null; error: string };

/** Validates what the scale dialog holds into a savable `MapScale`. */
export function buildMapScale(input: {
  a: ImagePoint;
  b: ImagePoint;
  distance: number | null;
  unit: DistanceUnit;
}): BuildScaleResult {
  const { a, b, distance, unit } = input;
  if (a.x === b.x && a.y === b.y) return { scale: null, error: "Place the two points on different spots." };
  if (distance === null || !Number.isFinite(distance) || distance <= 0) {
    return { scale: null, error: "Enter a distance greater than zero." };
  }
  return { scale: { unit, distance, a: { ...a }, b: { ...b } }, error: null };
}

function pixelLength(p: ImagePoint, q: ImagePoint, size: ImageSize): number {
  return Math.hypot((q.x - p.x) * size.width, (q.y - p.y) * size.height);
}

/**
 * How much distance one natural pixel stands for, or null while the image has
 * not been measured (size 0) or the reference is degenerate.
 */
export function distancePerPixel(scale: MapScale, size: ImageSize): number | null {
  if (size.width <= 0 || size.height <= 0) return null;
  const reference = pixelLength(scale.a, scale.b, size);
  return reference > 0 ? scale.distance / reference : null;
}

/** Distance between two image-fraction points, in the scale's unit. */
export function distanceBetween(p: ImagePoint, q: ImagePoint, scale: MapScale, size: ImageSize): number | null {
  const perPixel = distancePerPixel(scale, size);
  return perPixel === null ? null : pixelLength(p, q, size) * perPixel;
}

/** Length of the path through `points`, in the scale's unit. Zero for fewer than two. */
export function routeLength(points: readonly ImagePoint[], scale: MapScale, size: ImageSize): number | null {
  const perPixel = distancePerPixel(scale, size);
  if (perPixel === null) return null;
  let pixels = 0;
  for (let i = 1; i < points.length; i++) pixels += pixelLength(points[i - 1], points[i], size);
  return pixels * perPixel;
}

/**
 * "84 mi", "12.5 km". One decimal under ten (a short hop is worth the detail),
 * whole numbers above (a 400-mile route is not accurate to the tenth).
 */
export function formatDistance(distance: number, unit: DistanceUnit): string {
  const rounded = distance < 10 ? Math.round(distance * 10) / 10 : Math.round(distance);
  return `${rounded.toLocaleString("en-US")} ${unit}`;
}
