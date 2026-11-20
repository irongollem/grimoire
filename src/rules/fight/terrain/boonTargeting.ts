// Who a boon spell (Bless, Shield of Faith) could be cast at from where the caster stands (#1021): the geometry of a boon, apart
// from the turn options that wrap it (`options/spellOptions.ts`). The twin of `healTargeting.ts`. Pure and edge-importable
// (relative `.ts` imports only).
//
// RULE (PHB 2014 and 2024 "Bless": "up to three creatures of your choice that you can see within range"; "Shield of Faith": "a
// creature of your choice that you can see within range"): the targets are chosen, within the spell's range and in sight, up to the
// spell's count at the slot used. Range and sight are read as for a heal (`rangeFeetOf`, `coverBetween`).
// APP CONVENTIONS (the books let the caster choose; a creature the app plays needs a rule):
// - A boon goes to a creature of the caster's own side (`isAllyOf`, the caster included), never a foe or a Neutral, and only to one
//   still standing (hp above 0): a boon does nothing for someone down.
// - A creature that already holds a condition named for the spell is skipped: a second Bless on it only replaces the first, so
//   it would spend the cast for nothing.
// - Order, who is chosen first: for an AC boon (`grants.ac`, Shield of Faith) the creature with the most foes within 5 feet first
//   (it is the one being hit), then the lowest current hit points; for an attack or save boon (Bless) a creature with a foe within
//   5 feet first (it is about to attack and be attacked), then the rest, the caster last among equals. With no map nothing is
//   within 5 feet of anything, so the order falls to hit points (AC boon) or the list's own order, the caster last.
// - One option per spell and level, taking the first `targetCount` of that order.

import type { Cell } from "../../../lib/battlemap/movement.ts";
import { combatantFootprint } from "../../../lib/battlemap/tokenFootprint.ts";
import type { RunCombatant } from "../../../types/encounter.types.ts";
import type { BoonNow } from "../spells/castNow.ts";
import { rangeFeetOf, type SpellScene } from "./spellTargeting.ts";
import { boxesWithinFiveFeet, coverBetween, distanceFeet, type Box } from "./sight.ts";

export interface BoonTargeting {
  boon: BoonNow;
  /** In the order they are chosen, at most the spell's count. */
  targetIds: string[];
  /** Feet to the nearest target; null when nothing was measured, or the only target is the caster. */
  distanceFeet: number | null;
}

export interface BoonTargetingInput {
  mover: RunCombatant;
  /** Creatures on the mover's side, the mover excluded: on the board when there is a scene. */
  allies: readonly RunCombatant[];
  /** The mover's living foes on the board, whose nearness orders the targets. */
  hostiles: readonly RunCombatant[];
  scene: SpellScene | null;
  boons: readonly BoonNow[];
}

function boxOf(c: RunCombatant): Box | null {
  const at: Cell | null | undefined = c.position;
  return at === null || at === undefined ? null : { anchor: at, footprint: combatantFootprint(c) };
}

export function boonTargetings(input: BoonTargetingInput): BoonTargeting[] {
  const out: BoonTargeting[] = [];
  const { mover, scene } = input;
  const moverBox = boxOf(mover);
  const foeBoxes = input.hostiles.flatMap((h) => boxOf(h) ?? []);
  for (const boon of input.boons) {
    const range = rangeFeetOf(boon.range);
    // The caster last among equals: it is listed after the others, and the sort is stable.
    const candidates = range === "self" ? [mover] : [...input.allies, mover];
    const reached = candidates.flatMap((c) => {
      if (c.hp <= 0) return [];
      if (c.conditions.some((x) => x.name === boon.spell)) return [];
      const box = boxOf(c);
      const foesNear = box === null ? 0 : foeBoxes.filter((f) => boxesWithinFiveFeet(box, f)).length;
      if (scene === null || c.instance_id === mover.instance_id) return [{ c, feet: null as number | null, foesNear }];
      if (box === null || moverBox === null) return [];
      const feet = distanceFeet(moverBox, box);
      if (typeof range === "number" && feet > range) return [];
      const others = scene.onBoard.filter((o) => o.instance_id !== mover.instance_id && o.instance_id !== c.instance_id).flatMap((o) => boxOf(o) ?? []);
      if (coverBetween(moverBox, box, scene.occluders, others) === "total") return [];
      return [{ c, feet: feet as number | null, foesNear }];
    });
    if (reached.length === 0) continue;
    const forArmor = boon.plan.grants.ac !== undefined;
    const ordered = [...reached].sort((a, b) =>
      forArmor ? b.foesNear - a.foesNear || a.c.hp - b.c.hp : Number(b.foesNear > 0) - Number(a.foesNear > 0));
    const chosen = ordered.slice(0, boon.plan.targetCount);
    const measured = chosen.flatMap((n) => (n.feet === null ? [] : [n.feet]));
    out.push({ boon, targetIds: chosen.map((n) => n.c.instance_id), distanceFeet: measured.length === 0 ? null : Math.min(...measured) });
  }
  return out;
}
