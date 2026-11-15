// What it takes to carry a chosen turn option out (#1203): the ordered steps, as plain data. The server applies each
// as the command the DM's own hand would have issued (a drag, an attack, the Action ticked off); this file only says
// which and in what order, so it can be read and tested without a fight.
//
// APP CONVENTION throughout: the books do not say how a turn is bookkept, only what each action does. The order is
// move first (an attack is made from where the creature ends), then the swings, then what the turn spent.
//
// Not modelled: the effect of Dodge and Hide (no condition is applied), the opportunity attacks a path provokes.
//
// Pure and edge-importable (relative `.ts` imports only).

import type { Cell } from "../../../lib/battlemap/movement.ts";
import { actionLimit, actionUseKey, type ActionLimit } from "../../encounterTurn.ts";
import type { StatBlockListKey } from "../../statBlock/parseAction.ts";
import type { TurnOption, UsableAttack } from "../terrain/turnOptions.ts";

export type TurnStep =
  /** The token goes to `to` and `feet` count against the turn's movement. */
  | { type: "move"; to: Cell; feet: number }
  /** One resolved attack: a Multiattack is several of these, in printed order. */
  | { type: "swing"; list: StatBlockListKey; action: string; targetId: string }
  /** One use of a limited or recharge ability, as the runner records it. */
  | { type: "spend"; useKey: string; limit: ActionLimit }
  /** The Action or the Bonus Action of the turn is used up. */
  | { type: "use"; slot: "action" | "bonus" };

/** What each kind of turn costs: the Action, the Bonus Action (an attack from that list), or nothing. */
function slotOf(option: TurnOption): "action" | "bonus" | null {
  switch (option.kind) {
    case "attack":
      return option.attack !== null && option.attack.list === "bonus_actions" ? "bonus" : "action";
    case "dash":
    case "flee":
    case "disengage":
    case "dodge":
    case "hide":
      return "action";
    case "move":
    case "surrender":
      return null;
  }
}

/** The steps of one option. `attacks` are the mover's usable entries: where a Multiattack's steps and a limit are found by name. */
export function stepsFor(option: TurnOption, attacks: readonly UsableAttack[]): TurnStep[] {
  const steps: TurnStep[] = [];
  // Only a real walk is a move: no map, or a creature that stays where it is, has no path to take.
  if (option.destination !== null && option.path !== null && option.path.length > 1 && option.feet !== null) {
    steps.push({ type: "move", to: option.destination, feet: option.feet });
  }
  const attack = option.attack;
  if (option.kind === "attack" && attack !== null && option.targetId !== null) {
    const targetId = option.targetId;
    const parts = attack.steps ?? [{ action: attack.action, count: 1 }];
    for (const part of parts) {
      // A Multiattack names other entries; a single attack names itself, from the list the option says.
      const named = attack.steps === null ? undefined : attacks.find((a) => a.entry.name === part.action);
      const list = named === undefined ? attack.list : named.list;
      for (let i = 0; i < part.count; i++) steps.push({ type: "swing", list, action: part.action, targetId });
    }
    const entry = attacks.find((a) => a.list === attack.list && a.entry.name === attack.action);
    if (entry !== undefined) {
      const limit = actionLimit(entry.entry);
      if (limit.recharge !== undefined || limit.per_day !== undefined) {
        steps.push({ type: "spend", useKey: actionUseKey(entry.list, entry.entry), limit });
      }
    }
  }
  const slot = slotOf(option);
  if (slot !== null) steps.push({ type: "use", slot });
  return steps;
}
