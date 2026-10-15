// The wall tool's kinds. Wall, Grate and Sluice paint an edge; Decal dresses
// an existing wall edge and never creates one.

import type { PackCategory } from "@/cartographer/packSchema";
import type { PaintedWallKind } from "@/cartographer/paintOps";

export type WallKind = PaintedWallKind | "decal";

export const WALL_KINDS: ReadonlyArray<{ value: WallKind; label: string }> = [
  { value: "wall", label: "Wall" },
  { value: "grate", label: "Grate" },
  { value: "sluice", label: "Sluice" },
  { value: "decal", label: "Decal" },
];

/** The pack category a painted kind draws its variants from, per edge direction. */
export function wallKindCategory(kind: PaintedWallKind, side: "N" | "W"): PackCategory {
  const horizontal = side === "N";
  if (kind === "grate") return horizontal ? "edgeGrateH" : "edgeGrateV";
  if (kind === "sluice") return horizontal ? "edgeSluiceH" : "edgeSluiceV";
  return horizontal ? "wallSegmentH" : "wallSegmentV";
}
