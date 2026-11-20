// Choosing to cast a boon (#1021): when a creature that can cast Bless or Shield of Faith does, and at whom (the options already
// say at whom, in the order `terrain/boonTargeting.ts` chose). Pure and edge-importable (relative `.ts` imports only).
//
// APP CONVENTION throughout (the books say what a boon does, not when a creature the app plays casts it): "a boon is cast early,
// while the fight is ahead of it".
// RULE boon-early: only in rounds 1 and 2. A blessing of ten rounds cast on round 5 buys little of a fight that is nearly over,
// and an attack made instead is worth more.
// RULE boon-concentration (PHB 2014 ch. 10 "Concentration": casting another concentration spell ends the first): a boon held by
// concentrating is not cast by a creature that already concentrates (on this or any spell), which would end that spell.
// RULE boon-reach: an Action boon is cast only when it reaches at least two creatures (or its whole count when that is one):
// spending the turn's Action to bless one creature with a three-creature spell is a poor trade for an attack. A Bonus Action boon costs no
// Action, so one creature is enough.
// RULE boon-best: among the boons that qualify, the one reaching the most creatures, then the cheaper slot (the lower level).
// RULE boon-bonus-action (PHB 2014 ch. 10 "Casting a Spell", "Bonus Action"; PHB 2024 "Bonus Action Spells": a creature that casts a spell
// with a Bonus Action casts no other spell that turn, except a cantrip with a casting time of one action): a Bonus Action boon (Shield
// of Faith) is no turn of its own. It rides the turn the picker chose, before it, as a Bonus Action heal does (`healChoice.ts`), and not
// beside a leveled cast. APP CONVENTION: nor beside a concentration boon, which it would end.
// Order with the other choices: a heal comes first (`chooseActionHeal`), then an Action boon, then attacks.

import type { RunCombatant } from "../../../types/encounter.types.ts";
import { holdsConcentration } from "../../conditionDurations.ts";
import type { TurnOption, TurnOptionBoon } from "../terrain/options/types.ts";
import { isLeveledCast } from "./healChoice.ts";

export type BoonOption = TurnOption & { boon: TurnOptionBoon };

export const isBoonOption = (o: TurnOption): o is BoonOption => o.kind === "boon" && o.boon !== undefined && o.boon !== null;

/** The last round a boon is cast in (RULE boon-early). */
export const LAST_BOON_ROUND = 2;

/** Whether `mover` is holding a concentration spell: the mark on the creature, or a condition it is the concentrating source of. */
function concentrates(mover: RunCombatant, combatants: readonly RunCombatant[]): boolean {
  return (mover.concentration !== undefined && mover.concentration !== null) || holdsConcentration(combatants, mover.instance_id);
}

function qualifying(options: readonly TurnOption[], slot: TurnOptionBoon["slot"], mover: RunCombatant, combatants: readonly RunCombatant[], round: number | undefined): BoonOption[] {
  // RULE boon-early. With no round named, nothing is known to be early, so nothing is cast.
  if (round === undefined || round > LAST_BOON_ROUND) return [];
  const held = concentrates(mover, combatants);
  return options.filter(isBoonOption).filter((o) => {
    if (o.boon.slot !== slot) return false;
    // RULE boon-concentration.
    if (o.boon.concentration && held) return false;
    // RULE boon-reach: an Action boon reaches at least two creatures (or all it can when it can reach one).
    const needed = slot === "action" ? Math.min(2, o.boon.targetCount) : 1;
    return o.boon.targetIds.length >= needed;
  });
}

function best(candidates: readonly BoonOption[]): BoonOption | null {
  if (candidates.length === 0) return null;
  return [...candidates]
    .map((o, order) => ({ o, order }))
    .sort((a, b) => b.o.boon.targetIds.length - a.o.boon.targetIds.length || a.o.boon.castLevel - b.o.boon.castLevel || a.order - b.order)[0].o;
}

/** Why this cast, in one sentence. */
export function boonReason(o: BoonOption, combatants: readonly RunCombatant[]): string {
  const nameOf = (id: string) => combatants.find((c) => c.instance_id === id)?.name ?? id;
  const level = o.boon.castLevel > 0 ? ` (level ${o.boon.castLevel})` : "";
  const who = o.boon.targetIds.map(nameOf).join(", ");
  const spent = o.boon.spends ? ` and spends a ${o.boon.castLevel > 0 ? `level ${o.boon.castLevel} slot` : "use"}` : "";
  return `Casts ${o.boon.name}${level} on ${who} while the fight is young${spent}.`;
}

/** The Action boon a creature casts as its turn, or null (RULE boon-early, boon-concentration, boon-reach, boon-best). */
export function chooseActionBoon(options: readonly TurnOption[], combatants: readonly RunCombatant[], mover: RunCombatant, round: number | undefined): { option: BoonOption; reason: string } | null {
  if (mover.action_used === true || mover.hp <= 0) return null;
  const chosen = best(qualifying(options, "action", mover, combatants, round));
  return chosen === null ? null : { option: chosen, reason: boonReason(chosen, combatants) };
}

/** The Bonus Action boon that rides this turn, or null (RULE boon-bonus-action). Chosen before the turn is; `rides` then says whether the turn picked can carry it. */
export function chooseBonusBoon(options: readonly TurnOption[], combatants: readonly RunCombatant[], mover: RunCombatant, round: number | undefined): { option: BoonOption; reason: string } | null {
  if (mover.bonus_used === true || mover.hp <= 0) return null;
  const chosen = best(qualifying(options, "bonus_action", mover, combatants, round));
  return chosen === null ? null : { option: chosen, reason: boonReason(chosen, combatants) };
}

/** Whether a Bonus Action boon can ride the turn chosen: not beside a leveled cast, an attack that is itself a Bonus Action, nor beside a boon held by concentrating when it is too (RULE boon-bonus-action). */
export function boonRidesTurn(boon: BoonOption, turn: TurnOption): boolean {
  if (isLeveledCast(turn)) return false;
  // A swing from the Bonus Actions list spends the Bonus Action the boon needs.
  if (turn.attack !== null && turn.attack.list === "bonus_actions") return false;
  if (boon.boon.concentration && isBoonOption(turn) && turn.boon.concentration) return false;
  return true;
}
