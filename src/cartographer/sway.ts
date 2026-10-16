// What sways in the live battle map (epic #1073). One predicate for both the bake and the snapshot: the standing
// bake without sway leaves out exactly the things the snapshot animates, so nothing is ever drawn twice (a still
// copy under a moving one) or not at all. No vue, no DOM.

import { isFlatCategory, type PackCategory, type SwayMotion } from "@/cartographer/packSchema";
import type { TilePackRuntime } from "@/cartographer/packLoader";
import type { DressingProp } from "@/cartographer/dressing";
import type { ObjectCell } from "@/types/dungeonMap.types";

/** A swaying thing: how it moves, and the art the live layer draws it from. */
export interface SwayingArt {
  sway: SwayMotion;
  url: string;
}

/** Stairs are directional art cut into the wall, not things that stand and lean. */
function standsUp(category: PackCategory): boolean {
  return category !== "stairsUp" && category !== "stairsDown" && !isFlatCategory(category);
}

/**
 * The sway of a stamped object, with the url of its art. Only a standing object whose pack declares a sway for its
 * variant AND has a (sideless) asset slot with a url for it: a variant with no art of its own is drawn from a
 * stand-in tile, which the live layer cannot reproduce, so it stays in the bake.
 */
export function objectSway(obj: ObjectCell, runtime: TilePackRuntime | null): SwayingArt | null {
  if (!runtime || !standsUp(obj.category)) return null;
  const sway = runtime.manifest.sway?.[obj.category]?.[obj.variant];
  if (!sway) return null;
  const slot = runtime.manifest.assets[obj.category]?.find((s) => s.side === undefined && s.variant === obj.variant);
  return slot?.url ? { sway, url: slot.url } : null;
}

/** The sway of a Dressing prop: set on the row and painted. A flat prop lies on the floor and never sways. */
export function dressingSway(prop: DressingProp | undefined): SwayingArt | null {
  if (!prop || prop.flat || !prop.sway || prop.url === null) return null;
  return { sway: prop.sway, url: prop.url };
}

/**
 * A phase in 0..2pi from a position, so neighbouring trees and lights never move in lockstep. Deterministic: a
 * republish of the same map gives the same phases.
 */
export function phaseAt(x: number, y: number): number {
  const h = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return (h - Math.floor(h)) * Math.PI * 2;
}
