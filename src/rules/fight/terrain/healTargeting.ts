// Who a healing spell could be cast at from where the caster stands (#1021): the geometry of a heal, apart from the turn
// options that wrap it (`options/spellOptions.ts`). Pure and edge-importable (relative `.ts` imports only). It stands on the
// range and sight helpers the damage spells use (`rangeFeetOf`, `coverBetween`, `distanceFeet`).
//
// APP CONVENTIONS (the books give a template, not a procedure for a creature):
// - A heal is cast at someone on the caster's own side (`isAllyOf`) or at the caster itself (PHB 2014 "Cure Wounds": "a creature
//   you touch", which includes yourself; "Healing Word": "a creature of your choice that you can see within range"). Never a foe,
//   never a Neutral. Who needs it is `healNeedOf`: hurt, or down and not dead.
// - A spell's range is the record's `range` text, read as for a damage spell: "Touch" is 5 feet, a number of feet is that far;
//   text that cannot be read reaches any distance. The target must be in line of sight (`coverBetween` is not "total").
// - A spell that restores several creatures (Mass Healing Word) is offered once, at the neediest it can reach up to its count; a
//   single-target spell is offered once per target. With no map every ally is in reach.
// - A creature the spell does nothing for (`excludes`, from the creature kind) is never a target; a kind the fight cannot tell is
//   healed, because the spell's text excludes only what is known to be undead or a construct.

import type { Cell } from "../../../lib/battlemap/movement.ts";
import { combatantFootprint } from "../../../lib/battlemap/tokenFootprint.ts";
import type { RunCombatant } from "../../../types/encounter.types.ts";
import { healNeedOf } from "../spells/healNeed.ts";
import type { HealNow } from "../spells/castNow.ts";
import { rangeFeetOf, type SpellScene } from "./spellTargeting.ts";
import { coverBetween, distanceFeet, type Box } from "./sight.ts";

export interface HealTargeting {
  heal: HealNow;
  /** The neediest first. */
  targetIds: string[];
  downIds: string[];
  lowIds: string[];
  /** Feet to the nearest target; null when nothing was measured, or the only target is the caster. */
  distanceFeet: number | null;
}

export interface HealTargetingInput {
  mover: RunCombatant;
  /** Creatures on the mover's side, the mover excluded, whether hurt or not: only the hurt are aimed at. On the board when there is a scene. */
  allies: readonly RunCombatant[];
  scene: SpellScene | null;
  heals: readonly HealNow[];
  kindOf?: (c: RunCombatant) => string | null;
}

function boxOf(c: RunCombatant): Box | null {
  const at: Cell | null | undefined = c.position;
  return at === null || at === undefined ? null : { anchor: at, footprint: combatantFootprint(c) };
}

export function healTargetings(input: HealTargetingInput): HealTargeting[] {
  const out: HealTargeting[] = [];
  const { mover, scene } = input;
  const moverBox = boxOf(mover);
  for (const heal of input.heals) {
    const range = rangeFeetOf(heal.range);
    // A heal cast on the caster alone has no one else to reach: a range of Self covers the caster only.
    const candidates = range === "self" ? [mover] : [mover, ...input.allies];
    const needy = candidates.flatMap((c) => {
      const need = healNeedOf(c);
      if (need === null) return [];
      if (heal.plan.excludes.length > 0 && input.kindOf !== undefined) {
        const kind = input.kindOf(c);
        if (kind !== null && heal.plan.excludes.includes(kind)) return [];
      }
      if (scene === null || c.instance_id === mover.instance_id) return [{ c, need, feet: null as number | null }];
      const box = boxOf(c);
      if (box === null || moverBox === null) return [];
      const feet = distanceFeet(moverBox, box);
      if (typeof range === "number" && feet > range) return [];
      const others = scene.onBoard.filter((o) => o.instance_id !== mover.instance_id && o.instance_id !== c.instance_id).flatMap((o) => boxOf(o) ?? []);
      if (coverBetween(moverBox, box, scene.occluders, others) === "total") return [];
      return [{ c, need, feet: feet as number | null }];
    });
    // The neediest first: the lowest share of hit points, which is down (0), then below half, then the rest (`healNeedOf`'s own lines).
    needy.sort((a, b) => a.c.hp / Math.max(1, a.c.max_hp) - b.c.hp / Math.max(1, b.c.max_hp));
    if (needy.length === 0) continue;
    const feetOf = (list: typeof needy): number | null => {
      const measured = list.flatMap((n) => (n.feet === null ? [] : [n.feet]));
      return measured.length === 0 ? null : Math.min(...measured);
    };
    const offer = (list: typeof needy) => out.push({
      heal,
      targetIds: list.map((n) => n.c.instance_id),
      downIds: list.filter((n) => n.need === "down").map((n) => n.c.instance_id),
      lowIds: list.filter((n) => n.need === "low").map((n) => n.c.instance_id),
      distanceFeet: feetOf(list),
    });
    if (heal.plan.targetCount > 1) offer(needy.slice(0, heal.plan.targetCount));
    else for (const n of needy) offer([n]);
  }
  return out;
}
