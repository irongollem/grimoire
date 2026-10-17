// What a player's token sees of a lit map (epic #1073 story 5), by the 5e rules, the same in 2014 and 2024. Light
// decides first (`illumination.ts`: 1 bright, 0.5 dim, 0 darkness): a creature without darkvision sees bright light
// normally, dim light lightly obscured and darkness not at all. Darkvision within its range lifts that by one step:
// dim light counts as bright and darkness as dim, seen only in shades of grey. Sight needs a clear line from a viewer
// (story 6, `occlusion.ts`): nothing behind a wall, a closed door or solid rock is seen, lit or not, and darkvision
// does not reach round them. With no viewer (no token placed) there is no line to test. Class features and spells that grant sight are the DM's to adjudicate, so nothing here reads them.
//
// Pure and DOM-free.

import { FEET_PER_CELL } from "@/cartographer/packSchema";
import { lightLevelAt, type LitSource } from "@/lib/battlemap/illumination";
import { clearLine, nudgedOrigins, type Occluders } from "@/lib/battlemap/occlusion";

/** A creature that sees for a player: centre in image cells and its darkvision range (0 for none). */
export interface Viewer {
  x: number;
  y: number;
  darkvisionFeet: number;
}

/** The light a scene has before any viewer looks at it. */
export interface LitScene {
  ambient: number;
  sources: readonly LitSource[];
  occluders: Occluders;
}

/** Per-sample sight: `seen` 1 clear, 0.5 lightly obscured, 0 blind; `grey` 1 where darkvision shows only shades of grey. */
export interface Vision {
  seen: Float32Array;
  grey: Float32Array;
}

/** A darkvision range's edge is softened like a light's, across this many cells centred on the boundary. */
const SOFT_BAND_CELLS = 1 / 3;
const HALF_BAND = SOFT_BAND_CELLS / 2;

/** A cell whose centre sees this much or less counts as unseen. */
const SEEN_THRESHOLD = 0.25;

/** The veil strength of a creature that sees at the dim step: lightly obscured. */
const LIGHTLY_OBSCURED_ALPHA = 0.45;

function smoothstep(edge0: number, edge1: number, v: number): number {
  const t = Math.min(1, Math.max(0, (v - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** What darkvision makes of a light level: dim and brighter read as bright, darkness as dim (and grey). */
function throughDarkvision(level: number): { seen: number; grey: number } {
  if (level >= 0.5) return { seen: 1, grey: 0 };
  // Fades with the level so the edge of a light ring does not snap from grey to colour.
  return { seen: 0.5 + level, grey: 1 - 2 * level };
}

/** Sight at one point given its light level; the best viewer wins. */
export function sightAt(level: number, viewers: readonly Viewer[], x: number, y: number): { seen: number; grey: number } {
  let seen = level;
  let grey = 0;
  if (level >= 1) return { seen, grey };
  for (const v of viewers) {
    if (v.darkvisionFeet <= 0) continue;
    const range = v.darkvisionFeet / FEET_PER_CELL;
    const reach = 1 - smoothstep(range - HALF_BAND, range + HALF_BAND, Math.hypot(x - v.x, y - v.y));
    if (reach <= 0) continue;
    const lifted = throughDarkvision(level);
    const s = level + reach * (lifted.seen - level);
    if (s > seen) {
      seen = s;
      grey = reach * lifted.grey;
    }
  }
  return { seen, grey };
}

/** Where each viewer looks from: a viewer on a cell edge or corner (a large token's centre) looks from each cell it touches. */
function lookFrom(viewers: readonly Viewer[]): { viewer: Viewer; origins: [number, number][] }[] {
  return viewers.map((viewer) => ({ viewer, origins: nudgedOrigins(viewer.x, viewer.y) }));
}

/**
 * Sight at one point through the occluders: only a viewer with a clear line counts, for light and for darkvision both.
 * With viewers but none that can see the point, it is unseen. With no viewers nothing is tested.
 */
function sightThrough(
  occ: Occluders,
  level: number,
  eyes: ReturnType<typeof lookFrom>,
  viewers: readonly Viewer[],
  x: number,
  y: number,
): { seen: number; grey: number } {
  const all = sightAt(level, viewers, x, y);
  if (viewers.length === 0 || all.seen <= 0) return all;
  const open = eyes.filter((e) => e.origins.some(([ox, oy]) => clearLine(occ, ox, oy, x, y)));
  if (open.length === 0) return { seen: 0, grey: 0 };
  return open.length === eyes.length ? all : sightAt(level, open.map((e) => e.viewer), x, y);
}

export interface VisionGridOptions {
  /** Light levels from `illuminationGrid` over the same window. */
  illumination: Float32Array;
  minX: number;
  minY: number;
  cols: number;
  rows: number;
  samplesPerCell: number;
  viewers: readonly Viewer[];
  occluders: Occluders;
}

/** Sight at every sample of the illumination grid. Sample i sits at cell `minX + (i + 0.5) / samplesPerCell`. */
export function visionGrid(opts: VisionGridOptions): Vision {
  const { illumination, minX, minY, cols, rows, samplesPerCell: spc, viewers, occluders: occ } = opts;
  const eyes = lookFrom(viewers);
  const w = cols * spc;
  const h = rows * spc;
  const seen = new Float32Array(w * h);
  const grey = new Float32Array(w * h);
  for (let j = 0; j < h; j++) {
    const y = minY + (j + 0.5) / spc;
    for (let i = 0; i < w; i++) {
      const at = j * w + i;
      const s = sightThrough(occ, illumination[at], eyes, viewers, minX + (i + 0.5) / spc, y);
      seen[at] = s.seen;
      grey[at] = s.grey;
    }
  }
  return { seen, grey };
}

/** The player veil's strength at a seen level: clear at 1, lightly obscured at 0.5, opaque at 0, linear between. */
export function playerVeilAlpha(seen: number): number {
  if (seen >= 1) return 0;
  if (seen <= 0) return 1;
  return seen >= 0.5
    ? LIGHTLY_OBSCURED_ALPHA * (1 - seen) * 2
    : LIGHTLY_OBSCURED_ALPHA + (1 - LIGHTLY_OBSCURED_ALPHA) * (1 - seen * 2);
}

/** Whether the viewers see the centre of a cell. Computed pointwise so a view need not build a grid to hide a token. */
export function canSee(scene: LitScene, viewers: readonly Viewer[], cellX: number, cellY: number): boolean {
  const x = cellX + 0.5;
  const y = cellY + 0.5;
  const level = lightLevelAt(scene.ambient, scene.sources, scene.occluders, x, y);
  return sightThrough(scene.occluders, level, lookFrom(viewers), viewers, x, y).seen > SEEN_THRESHOLD;
}

interface Placed {
  instance_id: string;
  position?: { x: number; y: number } | null;
  footprint?: number;
}

/**
 * The tokens a player can see on a lit map: their own always, a token with no position (not placed yet) as before,
 * and any other when the viewers see at least one cell it stands on.
 */
export function seenCombatants<T extends Placed>(
  list: readonly T[],
  scene: LitScene,
  viewers: readonly Viewer[],
  ownId: string | null,
): T[] {
  return list.filter((c) => {
    if (c.instance_id === ownId || !c.position) return true;
    const size = Math.max(1, Math.round(c.footprint ?? 1));
    for (let dx = 0; dx < size; dx++) {
      for (let dy = 0; dy < size; dy++) {
        if (canSee(scene, viewers, c.position.x + dx, c.position.y + dy)) return true;
      }
    }
    return false;
  });
}
