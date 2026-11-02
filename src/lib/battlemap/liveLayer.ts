// Frame math for the battle map's live layer (epic #1073). Pure: an overlay, the map's screen geometry and a clock
// in, the tile size, tiling offset and alpha out. The component owns the canvas and the animation loop; nothing
// here touches the DOM, so it can be tested with plain numbers.

import { MAP_LIVE_VERSION, type MapLive, type MapLiveDoorState, type MapLiveGroup, type MapLiveLight, type MapLiveSprite, type MotionOverlay } from "@/types/mapLive.types";
import { FIRE_RADIUS_DRIFT, lightMotion, lightReachCells } from "@/cartographer/lights";
import { lightMask, type LightMask } from "@/cartographer/lightMask";
import { NO_DOOR_STATES, occludersOf } from "@/lib/battlemap/occlusion";

/**
 * The snapshot a reader may use: only the current version. A version-1 snapshot's standing bakes hold every door leaf,
 * which the live layer would draw a second time, so a site published before the doors went live reads as a plain
 * picture until it is published again (#1073). The DB may still hold 1, hence the comparison through `number`.
 */
export function currentMapLive(raw: MapLive | null): MapLive | null {
  if (raw === null) return null;
  const version: number = raw.version;
  return version === MAP_LIVE_VERSION ? raw : null;
}

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

/** The lights that move (flicker, pulse, or the colour of a fire). They brighten the floor, so they live in the ground layer. */
export function lightsIn(live: MapLive | null, stratum: Stratum): MapLiveLight[] {
  if (live === null || stratum === "top") return [];
  return live.lights.filter((l) => lightMotion(l) !== null);
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
 * Layered noise in -1..1 that never repeats on a beat anyone can hear: four sines whose rates share no common period,
 * the slow ones heavy and the quick ones a light crackle on top. `seed` offsets each rate separately, so two fires
 * (different `phase`) are out of step in the slow drift as well as in the crackle, not merely shifted in time.
 */
export function flameNoise(seed: number, t: number): number {
  const slow = Math.sin(0.9 * t + seed);
  const mid = Math.sin(2.3 * t + seed * 1.9 + 1.3);
  const quick = Math.sin(5.1 * t + seed * 0.7 + 2.1);
  const crackle = Math.sin(9.7 * t + seed * 2.9 + 0.4);
  return 0.45 * slow + 0.3 * mid + 0.17 * quick + 0.08 * crackle;
}

/**
 * How much of its flicker or pulse a light shows at time `t`, 0..1 (the caller multiplies by the light's own
 * fraction). A flame is layered noise (`flameNoise`) so it never settles into a blink; a pulse is one slow breath.
 * A light that does neither is always 0.
 */
export function lightBoost(light: Pick<MapLiveLight, "color" | "flicker" | "pulse" | "phase">, t: number): number {
  const motion = lightMotion(light);
  if (motion === null) return 0;
  if (motion.flicker !== undefined) return Math.min(1, Math.max(0, 0.5 + 0.5 * flameNoise(light.phase, t)));
  return 0.5 + 0.5 * Math.sin(1.0 * t + light.phase);
}

/**
 * How far a light's reach is stretched at time `t`, around 1: a flame swells and shrinks a few percent, drifting on
 * its own noise (not the brightness's, so the two do not move in lockstep). Pulsing and steady lights keep their reach.
 */
export function lightRadiusScale(light: Pick<MapLiveLight, "color" | "flicker" | "pulse" | "phase">, t: number): number {
  const motion = lightMotion(light);
  if (motion === null || motion.flicker === undefined) return 1;
  return 1 + FIRE_RADIUS_DRIFT * flameNoise(light.phase * 1.7 + 4, t * 0.8);
}

/** A light's line-of-sight mask over its whole square, in image cells from (x0,y0). */
export interface BoostMask {
  mask: LightMask;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const boostMasks = new WeakMap<MapLive, WeakMap<readonly MapLiveDoorState[], Map<MapLiveLight, BoostMask>>>();

/**
 * The part of a moving light's reach it has a clear line to, so its flicker stops at the walls, doors and rock the
 * baked glow already stops at (`renderLightLayer`, the same `lightMask`). The reach does not change as the light
 * flickers, so one mask per light per snapshot and set of door states does (a door the DM opens lets the flicker
 * through). The snapshot holds no floor, so the mask does not know painted ground: the component takes that from the
 * ground picture's own transparency.
 */
export function boostMask(live: MapLive, light: MapLiveLight, doorStates: readonly MapLiveDoorState[] = NO_DOOR_STATES): BoostMask {
  let perLive = boostMasks.get(live);
  if (!perLive) {
    perLive = new WeakMap();
    boostMasks.set(live, perLive);
  }
  let perStates = perLive.get(doorStates);
  if (!perStates) {
    perStates = new Map();
    perLive.set(doorStates, perStates);
  }
  let held = perStates.get(light);
  if (!held) {
    const reach = lightReachCells(light);
    const x0 = Math.floor(light.x - reach);
    const y0 = Math.floor(light.y - reach);
    const x1 = Math.ceil(light.x + reach);
    const y1 = Math.ceil(light.y + reach);
    held = { mask: lightMask(occludersOf(live, doorStates), light.x, light.y, reach, x0, y0, x1, y1, () => true), x0, y0, x1, y1 };
    perStates.set(light, held);
  }
  return held;
}
