// Frame math for the battle map's live layer (epic #1073). Pure: an overlay, the map's screen geometry and a clock
// in, the tile size, tiling offset and alpha out. The component owns the canvas and the animation loop; nothing
// here touches the DOM, so it can be tested with plain numbers.

import type { MapLive, MapLiveGroup, MapLiveLight, MapLiveSprite, MotionOverlay } from "@/types/mapLive.types";

export interface OverlayFrame {
  /** Drawn size of one repeat, in px. */
  size: number;
  /** Screen position of a tile's top-left that sits at or before the clip's origin; wrapped into [0, size). */
  offsetX: number;
  offsetY: number;
  /** 0..1 */
  alpha: number;
}

function wrap(value: number, size: number): number {
  return ((value % size) + size) % size;
}

/**
 * Where one overlay sits at time `t` seconds. The tiling is anchored to the map (image cell (0,0) at `originX/Y`)
 * and slides by `drift` cells per second, so a pan or zoom moves the water with the map instead of under it.
 */
export function overlayFrame(overlay: MotionOverlay, cellPx: number, originX: number, originY: number, t: number): OverlayFrame {
  const size = overlay.cells * cellPx;
  const offsetX = wrap(originX + overlay.drift[0] * t * cellPx, size);
  const offsetY = wrap(originY + overlay.drift[1] * t * cellPx, size);
  const { breathe } = overlay;
  const factor = breathe ? 1 + breathe.amount * Math.sin(breathe.speed * t + breathe.phase) : 1;
  const alpha = Math.min(1, Math.max(0, overlay.alpha * factor));
  return { size, offsetX, offsetY, alpha };
}

/**
 * Which side of the grid a live layer sits on. The ground layer is under the grid, over the ground picture (water,
 * the open mass outside the map, and the extra glow of fires and pulsing lights); the top layer is over the standing
 * picture (swaying props).
 */
export type Stratum = "ground" | "top";

const GROUND_KINDS: ReadonlySet<MapLiveGroup["kind"]> = new Set(["water", "outer"]);

/** The groups of a snapshot that belong to one stratum. */
export function groupsIn(live: MapLive | null, stratum: Stratum): MapLiveGroup[] {
  if (live === null || stratum === "top") return [];
  return live.groups.filter((g) => GROUND_KINDS.has(g.kind));
}

/** The swaying sprites of a stratum: they stand, so they all live in the top layer. */
export function spritesIn(live: MapLive | null, stratum: Stratum): MapLiveSprite[] {
  return live === null || stratum === "ground" ? [] : live.sprites;
}

/** The lights that move (flicker or pulse). They brighten the floor, so they live in the ground layer. */
export function lightsIn(live: MapLive | null, stratum: Stratum): MapLiveLight[] {
  if (live === null || stratum === "top") return [];
  return live.lights.filter((l) => l.flicker !== undefined || l.pulse !== undefined);
}

/** Whether the snapshot has anything to animate in this stratum. */
export function hasMotion(live: MapLive | null, stratum: Stratum): boolean {
  return (
    groupsIn(live, stratum).some((g) => g.overlays.length > 0) ||
    spritesIn(live, stratum).length > 0 ||
    lightsIn(live, stratum).length > 0
  );
}

/**
 * How far a sprite leans at time `t` seconds, in degrees. A slow main sine plus a smaller, faster harmonic (so the
 * lean has a little gust in it instead of ticking like a pendulum), weighted so the sum can never pass `amount`.
 */
export function swayAngle(sway: MapLiveSprite["sway"], t: number): number {
  const main = Math.sin(sway.speed * t + sway.phase);
  const gust = Math.sin(sway.speed * 2.3 * t + sway.phase * 1.7);
  return sway.amount * (0.8 * main + 0.2 * gust);
}

/**
 * How much of its flicker or pulse a light shows at time `t`, 0..1 (the caller multiplies by the light's own
 * fraction). A flame is several fast sines that do not line up, so it never repeats audibly; a pulse is one slow
 * breath. A light that does neither is always 0.
 */
export function lightBoost(light: Pick<MapLiveLight, "flicker" | "pulse" | "phase">, t: number): number {
  if (light.flicker !== undefined) {
    const p = light.phase;
    const mix = (Math.sin(6.3 * t + p) + Math.sin(11.7 * t + p * 2.1 + 1) + Math.sin(19.1 * t + p * 0.7 + 2)) / 3;
    return Math.min(1, Math.max(0, 0.5 + 0.5 * mix));
  }
  if (light.pulse !== undefined) return 0.5 + 0.5 * Math.sin(1.0 * t + light.phase);
  return 0;
}
