// The sampled outline of a material shape. Its own module because both the shapes (`groundRegions.ts`) and the room
// finder (`roomOutline.ts`) read it, and the shapes already import the room finder.
import type { GroundRegion } from "@/types/dungeonMap.types";
import { buildGraph } from "./wallEdit/graph";
import { detectRooms } from "./wallEdit/rooms";
import { wallsAsPieces } from "./wallGeometry";

type P = [number, number];
const loopsCache = new WeakMap<GroundRegion["boundary"], P[][]>();

/** The exact sampled curves shared by drawing, projection, boolean operations, room finding and node hit testing. */
export function groundLoops(region: GroundRegion): P[][] {
  const hit = loopsCache.get(region.boundary);
  if (hit) return hit;
  const loops = detectRooms(buildGraph(wallsAsPieces(region.boundary))).map((r) => r.polygon);
  loopsCache.set(region.boundary, loops);
  return loops;
}
