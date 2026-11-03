// Moving a token on the Play map (#1125 decision 11): the squares a move crosses, what it costs in feet, and how
// that sits against the creature's speed. Pure and DOM-free. The counter warns and never refuses ("the DM is never
// blocked"), so nothing here says no; it only says how far and how expensive.
//
// Rules, by the book (both PHBs):
// - Every square costs 5 ft, a diagonal step too. PHB 2014 "Movement and Position" / PHB 2024 "Moving".
// - Difficult terrain: each foot costs 1 extra foot. PHB 2014 / 2024 "Difficult Terrain".
// - Squeezing: each foot costs 1 extra foot. PHB 2014 / 2024 "Squeezing into a Smaller Space". The two stack, so
//   a squeeze through rubble is 15 ft a square.
// - Dashing: the action gives extra movement equal to speed, so a move up to twice the speed is a Dash.

import { segmentsIntersect, type Point, type WallSegment } from "@/lib/battlemap/walls";

export interface Cell {
  x: number;
  y: number;
}

/** A grid square is 5 ft (PHB 2024 "Creature Size"). */
const FEET_PER_SQUARE = 5;

/** What the ground and walls under a move are. */
export interface MoveTerrain {
  /** Cells (`"x,y"`) inside a zone with a movement cost above 1. */
  difficult: ReadonlySet<string>;
  /** Blocking wall segments, in cells, for the squeeze test. */
  walls: readonly WallSegment[];
}

export const OPEN_GROUND: MoveTerrain = { difficult: new Set(), walls: [] };

const EPS = 1e-9;

/**
 * The anchor (top-left) cell a token of this footprint takes when its middle is at the pointer: the same rounding the
 * drag uses (`snapPixelToCell`), so a hover ghost and a dropped token agree. A Tiny token sits on the half-cell lattice.
 */
export function snapAnchor(pointer: Cell, footprint: number): Cell {
  const steps = footprint < 1 ? 2 : 1;
  const snap = (v: number) => Math.round((v - footprint / 2) * steps) / steps + 0;
  return { x: snap(pointer.x), y: snap(pointer.y) };
}

const keyOf = (x: number, y: number) => `${x},${y}`;

/** The whole cells a token with this anchor covers. A Tiny token covers the one cell it stands in. */
function footprintCells(at: Cell, footprint: number): string[] {
  const x0 = Math.floor(at.x + EPS);
  const y0 = Math.floor(at.y + EPS);
  const span = footprint < 1 ? 1 : Math.ceil(footprint - EPS);
  const out: string[] = [];
  for (let dy = 0; dy < span; dy++) for (let dx = 0; dx < span; dx++) out.push(keyOf(x0 + dx, y0 + dy));
  return out;
}

const sameCell = (a: Cell, b: Cell) => Math.abs(a.x - b.x) < EPS && Math.abs(a.y - b.y) < EPS;

function stride(delta: number): number {
  if (Math.abs(delta) < EPS) return 0;
  return Math.sign(delta) * Math.min(1, Math.abs(delta));
}

/** The squares from `from` to `to`, `from` excluded: diagonal first while both axes have distance left, then straight. */
function stepsBetween(from: Cell, to: Cell): Cell[] {
  const out: Cell[] = [];
  let at = from;
  // A bound, so a corrupt coordinate cannot spin the UI.
  for (let guard = 0; guard < 2000 && !sameCell(at, to); guard++) {
    at = { x: at.x + stride(to.x - at.x), y: at.y + stride(to.y - at.y) };
    out.push(at);
  }
  return out;
}

// ── Squeezing ───────────────────────────────────────────────────────────────

/** Whether a wall segment cuts through the inside of the box (a wall along its edge does not). */
function boxHitsWall(at: Cell, size: number, walls: readonly WallSegment[]): boolean {
  const inset = 1e-6;
  const x0 = at.x + inset;
  const y0 = at.y + inset;
  const x1 = at.x + size - inset;
  const y1 = at.y + size - inset;
  const corners: Point[] = [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ];
  const inside = (p: Point) => p[0] > x0 && p[0] < x1 && p[1] > y0 && p[1] < y1;
  for (const w of walls) {
    if (Math.max(w.a[0], w.b[0]) < x0 || Math.min(w.a[0], w.b[0]) > x1) continue;
    if (Math.max(w.a[1], w.b[1]) < y0 || Math.min(w.a[1], w.b[1]) > y1) continue;
    if (inside(w.a) || inside(w.b)) return true;
    for (let i = 0; i < 4; i++) if (segmentsIntersect(w.a, w.b, corners[i], corners[(i + 1) % 4])) return true;
  }
  return false;
}

/**
 * A creature squeezes when its box is cut by a wall but a box one size smaller, set in any corner of it, would not be:
 * the gap is big enough for a creature one size smaller (PHB "Squeezing into a Smaller Space") and the creature is
 * wedged in it. Medium and smaller have no smaller box on the grid, so they never squeeze.
 */
function isSqueezing(at: Cell, footprint: number, walls: readonly WallSegment[]): boolean {
  if (footprint < 2 || walls.length === 0 || !boxHitsWall(at, footprint, walls)) return false;
  const smaller = footprint - 1;
  const far = footprint - smaller;
  const spots: Cell[] = [
    { x: at.x, y: at.y },
    { x: at.x + far, y: at.y },
    { x: at.x, y: at.y + far },
    { x: at.x + far, y: at.y + far },
  ];
  return spots.some((spot) => !boxHitsWall(spot, smaller, walls));
}

// ── Plans ───────────────────────────────────────────────────────────────────

export interface MoveStep {
  to: Cell;
  /** What entering this square costs. */
  feet: number;
  difficult: boolean;
  squeezing: boolean;
}

export interface MovePlan {
  from: Cell;
  to: Cell;
  steps: MoveStep[];
  feet: number;
  difficult: boolean;
  squeezing: boolean;
}

/**
 * The path from `from` to `to`, bent through any `via` waypoints, and what it costs. Every step is 5 ft; a step
 * into difficult terrain costs 5 more and a squeeze 5 more (so 10 or 15).
 */
export function planMove(input: {
  from: Cell;
  to: Cell;
  via?: readonly Cell[];
  footprint: number;
  terrain: MoveTerrain;
}): MovePlan {
  const { from, to, via = [], footprint, terrain } = input;
  const stops = [...via, to];
  const steps: MoveStep[] = [];
  let at = from;
  for (const stop of stops) {
    for (const cell of stepsBetween(at, stop)) {
      const difficult = footprintCells(cell, footprint).some((k) => terrain.difficult.has(k));
      const squeezing = isSqueezing(cell, footprint, terrain.walls);
      steps.push({
        to: cell,
        feet: FEET_PER_SQUARE * (1 + (difficult ? 1 : 0) + (squeezing ? 1 : 0)),
        difficult,
        squeezing,
      });
    }
    at = stop;
  }
  return {
    from,
    to,
    steps,
    feet: steps.reduce((sum, s) => sum + s.feet, 0),
    difficult: steps.some((s) => s.difficult),
    squeezing: steps.some((s) => s.squeezing),
  };
}

/** `within` is inside the speed, `dash` is inside twice the speed (the Dash action), `beyond` is past even that. */
export type SpeedState = "within" | "dash" | "beyond";

export function speedState(totalFeet: number, speed: number): SpeedState {
  if (totalFeet <= speed) return "within";
  return totalFeet <= speed * 2 ? "dash" : "beyond";
}

/** The state each step of a plan lands in, counting `usedFeet` already moved this turn. */
export function stepStates(plan: MovePlan, usedFeet: number, speed: number): SpeedState[] {
  let total = usedFeet;
  return plan.steps.map((step) => {
    total += step.feet;
    return speedState(total, speed);
  });
}

// ── Moving together ─────────────────────────────────────────────────────────

export interface GroupMember {
  id: string;
  position: Cell;
  footprint: number;
}

export interface GroupMove {
  moves: { id: string; plan: MovePlan }[];
  /** The dearest member's cost: what "N tokens, X ft each" reports. */
  feet: number;
}

/** Every member moves by the leader's own offset, so the formation keeps its shape. */
export function groupMove(input: {
  members: readonly GroupMember[];
  leaderId: string;
  leaderTo: Cell;
  terrain: MoveTerrain;
}): GroupMove {
  const leader = input.members.find((m) => m.id === input.leaderId);
  if (!leader) return { moves: [], feet: 0 };
  const dx = input.leaderTo.x - leader.position.x;
  const dy = input.leaderTo.y - leader.position.y;
  const moves = input.members.map((m) => ({
    id: m.id,
    plan: planMove({
      from: m.position,
      to: { x: m.position.x + dx, y: m.position.y + dy },
      footprint: m.footprint,
      terrain: input.terrain,
    }),
  }));
  return { moves, feet: Math.max(...moves.map((m) => m.plan.feet)) };
}

/** The label that rides the end of a path: its own feet, then "a Dash" / "past a Dash" against what the turn has already moved, then what made it dear. */
export function moveLabel(plan: { feet: number; difficult: boolean; squeezing: boolean }, usedFeet: number, speed: number | null): string {
  const parts = [`${plan.feet} ft`];
  if (speed !== null) {
    const state = speedState(usedFeet + plan.feet, speed);
    if (state === "dash") parts.push("a Dash");
    if (state === "beyond") parts.push("past a Dash");
  }
  if (plan.difficult) parts.push("difficult terrain");
  if (plan.squeezing) parts.push("squeezing");
  return parts.join(" · ");
}
