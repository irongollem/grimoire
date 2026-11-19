// Who can this creature attack from where it stands, with what cover, at what range, and which opportunity attacks
// does a path provoke (#1202). Pure and edge-importable (relative `.ts` imports only). It reports facts; it does not
// compute advantage, disadvantage or damage, and it never touches attack resolution.
//
// Not modelled: sight beyond walls (darkness, invisibility, blindness). A "clear line" here means no wall, closed
// door or solid rock between two points, nothing about whether either creature can perceive the other.
//
// Geometry is in cell units, y down. A creature is a `Box` (anchor cell + footprint); the squares it occupies come from
// `coverCells`, the same function the movement search uses. One square is 5 ft, a diagonal is 5 ft (PHB 2014 ch. 9
// "Playing on a Grid", the default grid rule).

import type { Cell } from "../../../lib/battlemap/movement.ts";
import { clearLine, type Occluders } from "../../../lib/battlemap/occlusion.ts";
import { combatantFootprint } from "../../../lib/battlemap/tokenFootprint.ts";
import type { RunCombatant } from "../../../types/encounter.types.ts";
import type { AttackStructure } from "../../../types/statBlock.types.ts";
import { isIncapacitated } from "../../conditions.ts";
import { isHostileTo, type FactionSides } from "../sides.ts";
import { coverCells } from "./reach.ts";

const EPS = 1e-9;
/** Feet in one square. */
const SQUARE_FEET = 5;
/** PHB 2014 ch. 9 "Melee Attacks": most creatures have a 5-foot reach, so a melee attack naming none has 5 ft. */
export const DEFAULT_REACH_FEET = 5;
/**
 * Cover corners sit this far (cells) INSIDE their square. A wall on the near edge of the target's square is then
 * crossed by the line and blocks; a wall on its far edge is not; and a wall on the attacker's own back edge is behind
 * every line. `clearLine` itself only trims 1e-6 off the far end, which is far smaller than this.
 */
const CORNER_INSET = 0.01;

export interface Box {
  /** Top-left anchor cell (fractional for Tiny). */
  anchor: Cell;
  footprint: number;
}

export type Cover = "none" | "half" | "three_quarters" | "total";
export type CoverRank = Exclude<Cover, "total">;
export interface CoverBonus {
  /** Added to AC. */
  ac: 0 | 2 | 5;
  /** Added to Dexterity saving throws. */
  dexSave: 0 | 2 | 5;
}

/** PHB 2014 ch. 9 "Cover". Total cover has no bonus: such a target cannot be targeted directly, so the type refuses it. */
export function coverBonus(cover: CoverRank): CoverBonus {
  if (cover === "half") return { ac: 2, dexSave: 2 };
  if (cover === "three_quarters") return { ac: 5, dexSave: 5 };
  return { ac: 0, dexSave: 0 };
}

/** Empty squares between two boxes on one axis; 0 when they touch or overlap (the rule `boxesWithinFiveFeet` uses). */
function gap(p: number, pSide: number, q: number, qSide: number): number {
  return Math.max(p - (q + qSide), q - (p + pSide), 0);
}

/**
 * Distance between two creatures in feet: 5 ft per square of the larger axis gap, touching (diagonally too) is 5 ft.
 * A fractional gap (a Tiny token) counts whole squares only, so `boxesWithinFiveFeet` agrees (under one square
 * away is 5 ft).
 */
export function distanceFeet(a: Box, b: Box): number {
  const gx = gap(a.anchor.x, a.footprint, b.anchor.x, b.footprint);
  const gy = gap(a.anchor.y, a.footprint, b.anchor.y, b.footprint);
  return SQUARE_FEET * (Math.floor(Math.max(gx, gy) + EPS) + 1);
}

/**
 * Within 5 feet (PHB 2014 ch. 9 "Playing on a Grid"): the gap between the two spaces is under one square, so they
 * touch, overlap, or stand in neighbouring squares, diagonals included. Same measure as `distanceFeet`, so the two
 * cannot disagree.
 */
export function boxesWithinFiveFeet(a: Box, b: Box): boolean {
  return distanceFeet(a, b) <= SQUARE_FEET;
}

type P = [number, number];

/** The four corners of the bounding box of some squares, each pulled in by CORNER_INSET. */
function insetCorners(cells: readonly Cell[]): P[] {
  const xs = cells.map((c) => c.x);
  const ys = cells.map((c) => c.y);
  const x0 = Math.min(...xs) + CORNER_INSET;
  const y0 = Math.min(...ys) + CORNER_INSET;
  const x1 = Math.max(...xs) + 1 - CORNER_INSET;
  const y1 = Math.max(...ys) + 1 - CORNER_INSET;
  return [
    [x0, y0],
    [x1, y0],
    [x0, y1],
    [x1, y1],
  ];
}

/** Whether the open segment p..q passes through the interior of square (cx,cy) (Liang-Barsky). */
function crossesSquare(p: P, q: P, cx: number, cy: number): boolean {
  let t0 = 0;
  let t1 = 1;
  const clip = (d: number, lo: number, hi: number, o: number): boolean => {
    // Parametrised axis o + d*t must stay within (lo, hi).
    if (Math.abs(d) < EPS) return o > lo && o < hi;
    const ta = (lo - o) / d;
    const tb = (hi - o) / d;
    t0 = Math.max(t0, Math.min(ta, tb));
    t1 = Math.min(t1, Math.max(ta, tb));
    return true;
  };
  if (!clip(q[0] - p[0], cx, cx + 1, p[0])) return false;
  if (!clip(q[1] - p[1], cy, cy + 1, p[1])) return false;
  return t1 - t0 > EPS;
}

const BY_RANK: CoverRank[] = ["none", "half", "three_quarters"];

/**
 * The cover the target has against the attacker, by the grid rule (DMG 2014 ch. 8 "Using Miniatures", "Cover"):
 * the attacker picks a corner of its space and traces lines to the four corners of ONE square the target occupies;
 * one or two blocked lines is half cover, three or four is three-quarters. Conventions:
 * - The attacker takes the corner and the target square that give the LEAST cover (the rule lets it choose).
 * - Total (PHB 2014 ch. 9 "Cover"): every line from every attacker corner to every corner of every target square is
 *   blocked by a wall, closed door or rock. Otherwise a clear line exists, so even four blocked lines at the best
 *   choice read as three-quarters (app convention for "the attack can still reach the target").
 * - Another creature on a line gives at most half cover (PHB 2014 "Cover" lists a creature as half cover): a line not
 *   blocked by a wall but crossing a square in `others` counts as half. Walls decide anything above that.
 * `others` are the other creatures' boxes, not the attacker or the target.
 */
export function coverBetween(attacker: Box, target: Box, occ: Occluders, others: readonly Box[]): Cover {
  const from = insetCorners(coverCells(attacker.anchor, attacker.footprint));
  const blockers = others.flatMap((o) => coverCells(o.anchor, o.footprint));
  let best = Infinity;
  for (const square of coverCells(target.anchor, target.footprint)) {
    const to = insetCorners([square]);
    for (const a of from) {
      let walled = 0;
      let screened = false;
      for (const b of to) {
        if (!clearLine(occ, a[0], a[1], b[0], b[1])) walled++;
        else if (blockers.some((c) => crossesSquare(a, b, c.x, c.y))) screened = true;
      }
      if (walled === 4) continue;
      const byWalls = walled === 0 ? 0 : walled <= 2 ? 1 : 2;
      best = Math.min(best, Math.max(byWalls, screened ? 1 : 0));
    }
  }
  return best === Infinity ? "total" : BY_RANK[best];
}

export type AttackRefusal = "out_of_reach" | "out_of_range" | "total_cover";

export interface HostileNearby {
  box: Box;
  incapacitated: boolean;
}

export interface AttackFromInput {
  attacker: Box;
  attack: AttackStructure;
  target: Box;
  occluders: Occluders;
  /** Other creatures that stand on lines (not the attacker or target). */
  others: readonly Box[];
  /** Creatures hostile to the attacker near it; the caller decides who is hostile. */
  hostiles: readonly HostileNearby[];
}

export interface AttackFromResult {
  possible: boolean;
  reason?: AttackRefusal;
  cover: Cover;
  distanceFeet: number;
  /** Ranged beyond its normal range (PHB 2014 ch. 9 "Ranged Attacks", "Range"). */
  longRange: boolean;
  /** Ranged with a conscious hostile within 5 ft and a clear line (PHB 2014 ch. 9 "Ranged Attacks in Close Combat"). */
  closeCombat: boolean;
}

/** The centres of the nearest pair of squares of two boxes: where "a clear line between them" is drawn. */
function nearestCentres(a: Box, b: Box): { from: P; to: P } {
  let best: { from: P; to: P } | null = null;
  let bestKey: [number, number] | null = null;
  for (const ca of coverCells(a.anchor, a.footprint)) {
    for (const cb of coverCells(b.anchor, b.footprint)) {
      const dx = ca.x - cb.x;
      const dy = ca.y - cb.y;
      const key: [number, number] = [Math.max(Math.abs(dx), Math.abs(dy)), dx * dx + dy * dy];
      if (!bestKey || key[0] < bestKey[0] || (key[0] === bestKey[0] && key[1] < bestKey[1])) {
        bestKey = key;
        best = { from: [ca.x + 0.5, ca.y + 0.5], to: [cb.x + 0.5, cb.y + 0.5] };
      }
    }
  }
  if (!best) throw new Error("a box covers no square");
  return best;
}

/** Centre of the nearest square of each, to centre of the nearest square of the other. */
function hasClearLine(occ: Occluders, a: Box, b: Box): boolean {
  const { from, to } = nearestCentres(a, b);
  return clearLine(occ, from[0], from[1], to[0], to[1]);
}

/**
 * Can this attack be made against this target from here, and under what terms. Melee needs the target within `reach`
 * (default 5 ft); ranged within `range.long` when there is one, else `range.normal`. `melee_or_ranged` is melee when
 * the target is in reach, otherwise ranged; a ranged-capable attack naming no range cannot reach past its reach, so it
 * is `out_of_reach`/`out_of_range`. Total cover makes it impossible, but an out-of-reach target is reported as that first.
 */
export function attackFrom(input: AttackFromInput): AttackFromResult {
  const { attacker, attack, target, occluders: occ } = input;
  const feet = distanceFeet(attacker, target);
  const cover = coverBetween(attacker, target, occ, input.others);
  const reach = attack.reach === undefined ? DEFAULT_REACH_FEET : attack.reach;
  const inReach = feet <= reach;
  const melee = attack.delivery === "melee" || (attack.delivery === "melee_or_ranged" && inReach);
  const base = { cover, distanceFeet: feet, longRange: false, closeCombat: false };
  const refuse = (reason: AttackRefusal): AttackFromResult => ({ ...base, possible: false, reason });

  if (melee) {
    if (!inReach) return refuse("out_of_reach");
    return cover === "total" ? refuse("total_cover") : { ...base, possible: true };
  }
  const range = attack.range;
  if (!range) return refuse(attack.delivery === "ranged" ? "out_of_range" : "out_of_reach");
  const furthest = range.long === undefined ? range.normal : range.long;
  if (feet > furthest) return refuse("out_of_range");
  if (cover === "total") return refuse("total_cover");
  return { ...base, possible: true, longRange: feet > range.normal, closeCombat: hostileBeside(attacker, input.hostiles, occ) };
}

/**
 * PHB 2014 ch. 9 "Ranged Attacks in Close Combat"; SRD 5.2 "Ranged Attacks": a hostile creature within 5 feet of the
 * attacker that is not Incapacitated, with a clear line to it. Any hostile counts, not only the target.
 *
 * Known limit: the book says the hostile must also be able to SEE the attacker. This app does not model sight (see the
 * header), so a hostile that is blinded or cannot see the attacker is still counted here.
 */
function hostileBeside(attacker: Box, hostiles: readonly HostileNearby[], occ: Occluders): boolean {
  return hostiles.some((h) => !h.incapacitated && distanceFeet(attacker, h.box) <= SQUARE_FEET && hasClearLine(occ, attacker, h.box));
}

export interface RangedAttackFactsInput {
  attacker: RunCombatant;
  /** Whoever the attack is aimed at. It counts as a hostile beside the attacker when it stands within 5 feet and is hostile. */
  target: RunCombatant;
  /** Everyone in the fight; positionless and downed creatures are ignored. */
  combatants: readonly RunCombatant[];
  factions: FactionSides;
  /** The weapon's or spell's range; null when it names none (then no long range is claimed). */
  range: { normal: number; long?: number } | null;
  occluders: Occluders;
}

/**
 * The two facts a ranged attack roll needs and that are NOT "the attacker is within 5 feet of the target"
 * (`attackRollMode`'s `hostileWithinFiveFeetOfAttacker` and `longRange`).
 * - `hostileWithinFiveFeetOfAttacker`: `hostileBeside` over every living hostile on the map.
 * - `longRange`: the target is beyond the normal range (PHB 2014 ch. 9 "Long Range"; SRD 5.2 "Long Range").
 * Both are false when the attacker or the target has no place on the map: nothing is measured, so nothing is claimed.
 */
export function rangedAttackFacts(input: RangedAttackFactsInput): { hostileWithinFiveFeetOfAttacker: boolean; longRange: boolean } {
  const { attacker, target } = input;
  if (!attacker.position || !target.position) return { hostileWithinFiveFeetOfAttacker: false, longRange: false };
  const boxAt = (c: RunCombatant, anchor: Cell): Box => ({ anchor, footprint: combatantFootprint(c) });
  const from = boxAt(attacker, attacker.position);
  const hostiles: HostileNearby[] = [];
  for (const c of input.combatants) {
    if (!c.position || c.hp <= 0 || !isHostileTo(attacker, c, input.factions)) continue;
    hostiles.push({ box: boxAt(c, c.position), incapacitated: isIncapacitated(c.conditions) });
  }
  const feet = distanceFeet(from, boxAt(target, target.position));
  return {
    hostileWithinFiveFeetOfAttacker: hostileBeside(from, hostiles, input.occluders),
    longRange: input.range !== null && feet > input.range.normal,
  };
}

export interface OpportunityEnemy {
  id: string;
  box: Box;
  /** Feet; the reach of the enemy's melee attack. */
  reachFeet: number;
  reactionUsed: boolean;
  /** Surprised under the 2014 rules (`cannotReactWhileSurprised`): it has its reaction on paper but cannot take it yet. */
  cannotReact: boolean;
  incapacitated: boolean;
}

export interface OpportunityInput {
  /** Anchor cells from the start (included). */
  path: readonly Cell[];
  moverFootprint: number;
  enemies: readonly OpportunityEnemy[];
  occluders: Occluders;
  /** The mover took the Disengage action (PHB 2014 ch. 9): no opportunity attacks this turn. */
  disengaged?: boolean;
}

export interface ProvokedAttack {
  enemyId: string;
  /** Index in `path` of the square the mover is leaving; the attack comes right before it leaves. */
  step: number;
}

/**
 * Opportunity attacks a path provokes (PHB 2014 ch. 9 "Opportunity Attacks"; SRD 5.2 the same). Going from position i
 * to i+1 provokes an enemy that has the mover within its reach at i and not at i+1, has its reaction, is not
 * Incapacitated, and has a clear line to the mover at i (centre of the nearest squares of each). An enemy provokes at
 * most once per path, at its first qualifying step, because the attack spends its one reaction. Ordered by step, then
 * by input order.
 */
export function opportunityAttacks(input: OpportunityInput): ProvokedAttack[] {
  if (input.disengaged) return [];
  const at = (i: number): Box => ({ anchor: input.path[i], footprint: input.moverFootprint });
  const out: ProvokedAttack[] = [];
  for (const enemy of input.enemies) {
    if (enemy.reactionUsed || enemy.cannotReact || enemy.incapacitated) continue;
    for (let i = 0; i + 1 < input.path.length; i++) {
      const here = at(i);
      if (distanceFeet(here, enemy.box) > enemy.reachFeet) continue;
      if (distanceFeet(at(i + 1), enemy.box) <= enemy.reachFeet) continue;
      if (!hasClearLine(input.occluders, here, enemy.box)) continue;
      out.push({ enemyId: enemy.id, step: i });
      break;
    }
  }
  return out.sort((a, b) => a.step - b.step);
}
