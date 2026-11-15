// Where can this creature go this turn, what does it cost, and by which way (#1202). Pure: no DOM, no Vue, and
// edge-importable (relative `.ts` imports only), so the browser and the server answer the same question the same way.
//
// The search is Dijkstra over whole-cell anchors in 8 directions. Every step is priced by `stepCost` in
// `lib/battlemap/movement.ts`, the very function the DM's move counter uses, so the two cannot disagree. Rules:
// - A wall or closed-door segment between the two positions blocks the step; solid rock blocks entering it; so does
//   the edge of the map (`terrain.bounds`): no cell the mover would cover may lie off the picture.
// - Other creatures (PHB 2014 ch. 9 "Moving Around Other Creatures"; PHB 2024 "Moving around Other Creatures"):
//   see `creatureRule`. A creature never ends its move in another's space.
// - Dash, cover, opportunity attacks and speed-changing conditions are not here: the caller passes the budget.
//
// Determinism: neighbours are tried in the order N, NE, E, SE, S, SW, W, NW. Nodes settle in order of (cost, steps,
// y, x). A cell keeps the first path found at its lowest (cost, steps): so the cheapest path wins, then the one with
// fewer steps, then the one through the earlier-settled neighbour, then the earlier direction.

import { segmentsIntersect, type Point, type WallSegment } from "../../../lib/battlemap/walls.ts";
import { stepCost, type Cell } from "../../../lib/battlemap/movement.ts";
import type { MonsterSize } from "../../../types/monster.types.ts";
import type { RulesetKey } from "../../../types/ruleset.types.ts";

const EPS = 1e-9;

const SIZE_RANK: Record<MonsterSize, number> = { tiny: 0, small: 1, medium: 2, large: 3, huge: 4, gargantuan: 5 };

export interface ReachCreature {
  /** Top-left anchor cell (fractional for Tiny). */
  anchor: Cell;
  footprint: number;
  size: MonsterSize;
  /** Hostile to the mover. Use `isHostileTo`. */
  hostile: boolean;
  incapacitated: boolean;
}

/** The cells a map has, inclusive: cell (0,0) is the picture's top-left. */
export interface ReachBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface ReachInput {
  mover: { anchor: Cell | null; footprint: number; size: MonsterSize };
  budgetFeet: number;
  terrain: {
    /** Cells (`"x,y"`) with a movement cost above 1. */
    difficult: ReadonlySet<string>;
    /** Walls plus CLOSED doors, in image cells. */
    blocking: readonly WallSegment[];
    /** Solid rock cells (`"x,y"`). */
    solid: ReadonlySet<string>;
    /** The cells the map has, inclusive. A step is refused when any cell the mover would cover lies outside them. */
    bounds: ReachBounds;
  };
  others: readonly ReachCreature[];
  ruleset: RulesetKey;
}

export interface ReachCell {
  cell: Cell;
  feet: number;
  /** Anchor cells from the start (included) to `cell` (included). */
  path: Cell[];
}

export interface ReachResult {
  start: Cell | null;
  /** Every anchor the mover can END in, by `"x,y"`. */
  cells: ReadonlyMap<string, ReachCell>;
}

/** The same "who is an opponent" convention as `targetCandidates`: a different faction. */
export function isHostileTo(mover: { faction_id: string }, other: { faction_id: string }): boolean {
  return mover.faction_id !== other.faction_id;
}

const keyOf = (x: number, y: number) => `${x},${y}`;

/** The whole cells a token covers. A Tiny token covers the one cell it stands in. */
export function coverCells(at: Cell, footprint: number): Cell[] {
  const x0 = Math.floor(at.x + EPS);
  const y0 = Math.floor(at.y + EPS);
  const span = footprint < 1 ? 1 : Math.ceil(footprint - EPS);
  const out: Cell[] = [];
  for (let dy = 0; dy < span; dy++) for (let dx = 0; dx < span; dx++) out.push({ x: x0 + dx, y: y0 + dy });
  return out;
}

/**
 * What moving through another creature's space means. `passable` false means the step is refused.
 * 2014: through a nonhostile creature, or a hostile one at least two sizes larger or smaller; every creature's space
 * is difficult terrain. 2024 (SRD 5.2 "Moving around Other Creatures"): also through a Tiny or an Incapacitated
 * creature, and an ally's or a Tiny creature's space is not difficult terrain.
 */
function creatureRule(mover: ReachInput["mover"], other: ReachCreature, ruleset: RulesetKey): { passable: boolean; difficult: boolean } {
  const gap = Math.abs(SIZE_RANK[mover.size] - SIZE_RANK[other.size]);
  const tiny = other.size === "tiny";
  if (ruleset === "2014") return { passable: !other.hostile || gap >= 2, difficult: true };
  return {
    passable: !other.hostile || gap >= 2 || tiny || other.incapacitated,
    difficult: other.hostile && !tiny,
  };
}

// N, NE, E, SE, S, SW, W, NW (y grows downward).
const DIRECTIONS: readonly Cell[] = [
  { x: 0, y: -1 }, { x: 1, y: -1 }, { x: 1, y: 0 }, { x: 1, y: 1 },
  { x: 0, y: 1 }, { x: -1, y: 1 }, { x: -1, y: 0 }, { x: -1, y: -1 },
];

/** Whether any wall segment lies between the two positions: each covered cell's centre, before to after. Touching blocks. */
function wallBetween(from: Cell, to: Cell, footprint: number, blocking: readonly WallSegment[]): boolean {
  if (blocking.length === 0) return false;
  const before = coverCells(from, footprint);
  const after = coverCells(to, footprint);
  for (let i = 0; i < before.length; i++) {
    const a: Point = [before[i].x + 0.5, before[i].y + 0.5];
    const b: Point = [after[i].x + 0.5, after[i].y + 0.5];
    for (const w of blocking) if (segmentsIntersect(a, b, w.a, w.b)) return true;
  }
  return false;
}

interface Node {
  cell: Cell;
  feet: number;
  steps: number;
  parent: string | null;
}

const before = (a: Node, b: Node) => a.feet - b.feet || a.steps - b.steps || a.cell.y - b.cell.y || a.cell.x - b.cell.x;

export function reachable(input: ReachInput): ReachResult {
  const { mover, budgetFeet, terrain, others, ruleset } = input;
  if (mover.anchor === null) return { start: null, cells: new Map() };
  // Tiny movers search on whole cells like everyone else (app convention): the start is the cell it stands in.
  const start: Cell = { x: Math.floor(mover.anchor.x + EPS), y: Math.floor(mover.anchor.y + EPS) };
  const startKey = keyOf(start.x, start.y);

  // Each creature as the cells it covers, once.
  const occupants = others.map((o) => ({ cells: new Set(coverCells(o.anchor, o.footprint).map((c) => keyOf(c.x, c.y))), rule: creatureRule(mover, o, ruleset) }));
  const occupantsAt = (at: Cell) => {
    const keys = coverCells(at, mover.footprint).map((c) => keyOf(c.x, c.y));
    return occupants.filter((o) => keys.some((k) => o.cells.has(k)));
  };
  const squeezeTerrain = { difficult: terrain.difficult, walls: terrain.blocking };

  const best = new Map<string, Node>([[startKey, { cell: start, feet: 0, steps: 0, parent: null }]]);
  const settled = new Set<string>();
  const open: Node[] = [best.get(startKey) as Node];
  while (open.length > 0) {
    open.sort(before);
    const node = open.shift() as Node;
    const nodeKey = keyOf(node.cell.x, node.cell.y);
    if (settled.has(nodeKey) || best.get(nodeKey) !== node) continue;
    settled.add(nodeKey);
    for (const d of DIRECTIONS) {
      const to: Cell = { x: node.cell.x + d.x, y: node.cell.y + d.y };
      const toKey = keyOf(to.x, to.y);
      if (settled.has(toKey)) continue;
      // Wherever the mover starts: a creature that old data left off the map may step back onto it, never further off.
      const covered = coverCells(to, mover.footprint);
      if (covered.some((c) => c.x < terrain.bounds.minX || c.x > terrain.bounds.maxX || c.y < terrain.bounds.minY || c.y > terrain.bounds.maxY)) continue;
      if (covered.some((c) => terrain.solid.has(keyOf(c.x, c.y)))) continue;
      if (wallBetween(node.cell, to, mover.footprint, terrain.blocking)) continue;
      const there = occupantsAt(to);
      if (there.some((o) => !o.rule.passable)) continue;
      const feet = node.feet + stepCost(to, mover.footprint, squeezeTerrain, there.some((o) => o.rule.difficult)).feet;
      if (feet > budgetFeet) continue;
      const next: Node = { cell: to, feet, steps: node.steps + 1, parent: nodeKey };
      const known = best.get(toKey);
      if (known === undefined || before(next, known) < 0) {
        best.set(toKey, next);
        open.push(next);
      }
    }
  }

  const cells = new Map<string, ReachCell>();
  for (const [key, node] of best) {
    // A creature never ends its move in another's space (the start is where it already stands).
    if (key !== startKey && occupantsAt(node.cell).length > 0) continue;
    const path: Cell[] = [];
    for (let at: Node | undefined = node; at; at = at.parent === null ? undefined : best.get(at.parent)) path.push(at.cell);
    cells.set(key, { cell: node.cell, feet: node.feet, path: path.reverse() });
  }
  return { start, cells };
}

/** The cheapest path to `cell` (start included), or null when the mover cannot end there. */
export function pathTo(result: ReachResult, cell: Cell): Cell[] | null {
  return result.cells.get(keyOf(cell.x, cell.y))?.path ?? null;
}
