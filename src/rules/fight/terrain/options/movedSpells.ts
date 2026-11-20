// Rule 11, moving for a better cast (#1021 row 5b): a damage or condition spell that has no option from where the creature
// stands is looked for from one more square, within the creature's normal move.
//
// APP CONVENTION (the books let a creature move and then cast; they give no procedure for which square a monster picks):
// - A spell that already has a usable option from where the creature stands is never moved: walking is only for a creature
//   that cannot cast from here. A cast that would catch one of its own side from here does not count as usable, so a creature
//   that would blast its friend, or itself, may step to where it would not.
// - The square is chosen the way an approach attack's is (`attacks.ts`): fewest opportunity attacks provoked, then the
//   shortest walk, then top row and leftmost. One moved option per spell and cast level at most.
// - An area spell is placed by `spellTargeting.ts` from the new square, with the same rules as from where the creature
//   stands (nothing here places an area), and a moved cast must catch none of the caster's own side.
// - To stay cheap only the `MAX_CAST_SQUARES` cheapest walks are tried, nearest first, not every square the move reaches (see the constant).

import type { RunCombatant } from "../../../../types/encounter.types.ts";
import type { CastNow } from "../../spells/castNow.ts";
import { spellTargetings, type SpellTargeting, type SpellTargetingInput } from "../spellTargeting.ts";
import type { ReachCell } from "../reach.ts";
import type { ProvokedAttack } from "../sight.ts";
import { byPlace, cellKey, cellsOf, provokesOf, type Scene } from "./scene.ts";

/**
 * How many squares are tried, the cheapest walks first (fewest feet, then top-left). 128 is every square within 5 steps of a start in
 * open ground (11 x 11 = 121) and a few more, about the whole of a 25 ft walk, so a 30 ft mover is not cut short in the squares it
 * is most likely to want; a faster mover is cut at the same count, which is the bound. Each square costs one targeting pass over the
 * casts still pending (a cast is dropped from the pending set once a walk that provokes nothing is found, since squares come in order
 * of walk and none later can beat it), so the most a turn can add is 128 passes.
 */
export const MAX_CAST_SQUARES = 128;

/** One spell and cast level: the unit a moved option is made for. */
export const castKey = (cast: CastNow): string => `${cast.spell}:${cast.castLevel}`;

/** A cast found from a square the creature walks to. */
export interface MovedTargeting {
  targeting: SpellTargeting;
  rc: ReachCell;
  provokes: ProvokedAttack[];
}

/** The cast that catches the most enemies, then the nearest: the order `spellOptionsOf` ranks its own options in, minus the friends (none are allowed here). */
function bestOf(targetings: readonly SpellTargeting[]): SpellTargeting | null {
  const nearest = (t: SpellTargeting) => (t.distanceFeet === null ? 0 : t.distanceFeet);
  const sorted = targetings
    .map((t, order) => ({ t, order }))
    .sort((a, b) => b.t.targetIds.length - a.t.targetIds.length || nearest(a.t) - nearest(b.t) || a.order - b.order);
  return sorted.length === 0 ? null : sorted[0].t;
}

/**
 * Whether `a` is a better square than `b`: fewer opportunity attacks, then fewer feet, then more targets caught, then the square nearest
 * the start as the crow flies (APP CONVENTION: a diagonal costs 5 ft like a straight step, so many squares tie on feet; the straight walk
 * is the one a reader expects, never a corner of the same cost), then top-left.
 */
export function betterSquare(a: MovedTargeting, b: MovedTargeting, start: { x: number; y: number }): boolean {
  if (a.provokes.length !== b.provokes.length) return a.provokes.length < b.provokes.length;
  if (a.rc.feet !== b.rc.feet) return a.rc.feet < b.rc.feet;
  if (a.targeting.targetIds.length !== b.targeting.targetIds.length) return a.targeting.targetIds.length > b.targeting.targetIds.length;
  const crow = (m: MovedTargeting) => (m.rc.cell.x - start.x) ** 2 + (m.rc.cell.y - start.y) ** 2;
  if (crow(a) !== crow(b)) return crow(a) < crow(b);
  return byPlace(a.rc.cell, b.rc.cell) < 0;
}

/**
 * For each of `pending` (casts with no usable option from here), the best square within the normal move that gives one, with
 * the cast from there. A cast no square gives is absent from the result. `base` is the targeting input from where the creature
 * stands: the same hostiles, allies and kind rule apply from the new square, only the mover's place changes.
 */
export function movedSpellTargetings(scene: Scene, base: SpellTargetingInput, pending: readonly CastNow[]): Map<string, MovedTargeting> {
  const found = new Map<string, MovedTargeting>();
  if (pending.length === 0 || base.scene === null || scene.reach.start === null || scene.hostiles.length === 0) return found;
  const start = scene.reach.start;
  const startKey = cellKey(start);
  const candidates = cellsOf(scene.reach)
    .filter((rc) => cellKey(rc.cell) !== startKey)
    .sort((a, b) => a.feet - b.feet || byPlace(a.cell, b.cell))
    .slice(0, MAX_CAST_SQUARES);
  const { scene: board } = base;
  let open = [...pending];
  for (const rc of candidates) {
    // Walks come in order of feet: a cast found with no opportunity attack cannot be beaten by a longer walk (a walk of the same
    // length still can, by the later rules of `betterSquare`).
    open = open.filter((cast) => {
      const known = found.get(castKey(cast));
      return !(known !== undefined && known.provokes.length === 0 && rc.feet > known.rc.feet);
    });
    if (open.length === 0) break;
    const moved: RunCombatant = { ...base.mover, position: rc.cell };
    const targetings = spellTargetings({
      ...base,
      mover: moved,
      spells: open,
      // The mover is on the board where it would stand, not where it stands now: it blocks no line from its old square.
      scene: { ...board, onBoard: board.onBoard.map((c) => (c.instance_id === moved.instance_id ? moved : c)) },
    });
    let provokes: ProvokedAttack[] | null = null;
    for (const cast of open) {
      const key = castKey(cast);
      const best = bestOf(targetings.filter((t) => castKey(t.cast) === key && t.friendsCaught.length === 0));
      if (best === null) continue;
      provokes ??= provokesOf(scene, rc);
      const candidate = { targeting: best, rc, provokes };
      const known = found.get(key);
      if (known === undefined || betterSquare(candidate, known, start)) found.set(key, candidate);
    }
  }
  return found;
}
