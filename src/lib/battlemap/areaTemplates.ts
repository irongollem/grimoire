// Areas of effect on the grid (#1125 frame 11, "Area of effect"): which squares a Sphere, Cone, Line or Cube covers,
// and which creatures stand in them. Pure and DOM-free; coordinates are fractional image cells, sizes are feet.
//
// Shapes, by the book (PHB 2024 and PHB 2014, "Areas of Effect"):
// - Sphere: a radius from its point of origin, which is the centre of the sphere.
// - Cube: a side length; the point of origin is on a face, which the app sets as the cube's middle.
// - Cone: it extends in a direction from its point of origin for its length, and "a cone's width at a given point
//   along its length is equal to that point's distance from the point of origin" (so its half-angle is about 26.6 degrees).
//   The point of origin is not part of the cone.
// - Line: a length and a width, 5 ft wide unless a spell says otherwise.
//
// Which squares the grid counts (app convention): a square is covered when the area covers at least half of it. The
// books draw the shapes on a plain plane and leave a grid to the table; half a square is the usual table ruling.
// A creature is inside when any square it stands on is covered (app convention: the DM still rolls the saves).

export type AreaShape = "sphere" | "cone" | "line" | "cube";

export interface AreaPoint {
  x: number;
  y: number;
}

export interface AreaTemplate {
  shape: AreaShape;
  /** Radius for a sphere, side for a cube, length for a cone or a line. */
  feet: number;
  /** A sphere's or cube's middle; a cone's or line's point of origin. */
  origin: AreaPoint;
  /** Where a cone or line points; unused by the other two. */
  aim?: AreaPoint | null;
}

const FEET_PER_SQUARE = 5;
const EPS = 1e-9;
/** Samples per side of a square when measuring how much of it an area covers; even, so a symmetric area measures symmetrically. */
const SAMPLES = 8;
const LINE_WIDTH_SQUARES = 1;

const cells = (feet: number) => feet / FEET_PER_SQUARE;

function contains(t: AreaTemplate, px: number, py: number): boolean {
  const len = cells(t.feet);
  if (t.shape === "sphere") return Math.hypot(px - t.origin.x, py - t.origin.y) <= len + EPS;
  if (t.shape === "cube") {
    const half = len / 2;
    return Math.abs(px - t.origin.x) <= half + EPS && Math.abs(py - t.origin.y) <= half + EPS;
  }
  const aim = t.aim;
  if (!aim) return false;
  const dx = aim.x - t.origin.x;
  const dy = aim.y - t.origin.y;
  const norm = Math.hypot(dx, dy);
  if (norm < EPS) return false;
  const ux = dx / norm;
  const uy = dy / norm;
  const along = (px - t.origin.x) * ux + (py - t.origin.y) * uy;
  const across = Math.abs((px - t.origin.x) * -uy + (py - t.origin.y) * ux);
  if (along <= 0 || along > len + EPS) return false;
  return t.shape === "cone" ? across <= along / 2 + EPS : across <= LINE_WIDTH_SQUARES / 2 + EPS;
}

function reach(t: AreaTemplate): number {
  return t.shape === "cube" ? cells(t.feet) / 2 : cells(t.feet) + LINE_WIDTH_SQUARES;
}

/** The squares (`"x,y"`) the area covers by at least half. */
export function coveredCells(t: AreaTemplate): Set<string> {
  const out = new Set<string>();
  if (t.feet <= 0) return out;
  const r = reach(t);
  const x0 = Math.floor(t.origin.x - r);
  const x1 = Math.ceil(t.origin.x + r);
  const y0 = Math.floor(t.origin.y - r);
  const y1 = Math.ceil(t.origin.y + r);
  for (let cy = y0; cy < y1; cy++) {
    for (let cx = x0; cx < x1; cx++) {
      let hit = 0;
      for (let sy = 0; sy < SAMPLES; sy++) {
        for (let sx = 0; sx < SAMPLES; sx++) {
          if (contains(t, cx + (sx + 0.5) / SAMPLES, cy + (sy + 0.5) / SAMPLES)) hit++;
        }
      }
      if (hit / (SAMPLES * SAMPLES) >= 0.5) out.add(`${cx},${cy}`);
    }
  }
  return out;
}

export interface AreaCreature {
  id: string;
  /** Top-left square of the token, as the battle map stores it. */
  position: AreaPoint;
  /** Squares across: 1 for Medium, 2 for Large; under 1 for Tiny, which still stands in one square. */
  footprint: number;
}

function squaresOf(c: AreaCreature): string[] {
  const x0 = Math.floor(c.position.x + EPS);
  const y0 = Math.floor(c.position.y + EPS);
  const span = c.footprint < 1 ? 1 : Math.ceil(c.footprint - EPS);
  const out: string[] = [];
  for (let dy = 0; dy < span; dy++) for (let dx = 0; dx < span; dx++) out.push(`${x0 + dx},${y0 + dy}`);
  return out;
}

/** Ids of the creatures with any square under the covered cells. */
export function creaturesInside(covered: ReadonlySet<string>, creatures: readonly AreaCreature[]): string[] {
  return creatures.filter((c) => squaresOf(c).some((k) => covered.has(k))).map((c) => c.id);
}

/**
 * Where a click sets the area down. A sphere sits on a grid intersection; a cube is centred so it covers whole
 * squares (an intersection for an even number of squares across, a square's middle for an odd number); a cone or
 * line starts on an intersection.
 */
export function snapAreaOrigin(shape: AreaShape, feet: number, at: AreaPoint): AreaPoint {
  if (shape === "cube" && Math.round(cells(feet)) % 2 === 1) return { x: Math.floor(at.x) + 0.5, y: Math.floor(at.y) + 0.5 };
  return { x: Math.round(at.x), y: Math.round(at.y) };
}

/**
 * A cone or line cast from a token starts where the ray from the token's middle toward the aim leaves the token's
 * square: its point of origin is on its edge, so the caster is not in their own cone.
 */
export function originOnToken(token: { position: AreaPoint; footprint: number }, aim: AreaPoint): AreaPoint {
  const size = Math.max(token.footprint, 1);
  const mid = { x: token.position.x + size / 2, y: token.position.y + size / 2 };
  const dx = aim.x - mid.x;
  const dy = aim.y - mid.y;
  const far = Math.max(Math.abs(dx), Math.abs(dy));
  if (far < EPS) return mid;
  const t = size / 2 / far;
  return { x: mid.x + dx * t, y: mid.y + dy * t };
}
