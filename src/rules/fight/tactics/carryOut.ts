// What it takes to carry a chosen turn option out (#1203): the ordered steps, as plain data. The server applies each
// as the command the DM's own hand would have issued (a drag, an attack, the Action ticked off); this file only says
// which and in what order, so it can be read and tested without a fight.
//
// APP CONVENTION throughout: the books do not say how a turn is bookkept, only what each action does. The order is
// move first (an attack is made from where the creature ends), then the swings or the cast, then what the turn spent, and last,
// for a creature that fled off the map, its leaving.
//
// Dodge and Disengage are modelled: the creature takes the Dodging or Disengaged condition (`stance` steps, applied
// before any move) and the shared rules read it. Not modelled: Hide (the Action is used and nothing more).
// Carrying out a turn does not resolve the opportunity attacks a path provokes either: the server resolves them
// before it applies a move (`supabase/functions/encounter-command/opportunity.ts`, from `opportunityAttacks` in
// `terrain/sight.ts`). A creature that uses a way out (Etherealness, Invisible Passage) does not
// also move on that turn.
//
// Pure and edge-importable (relative `.ts` imports only).

import type { Cell } from "../../../lib/battlemap/movement.ts";
import { actionLimit, actionUseKey, type ActionLimit } from "../../encounterTurn.ts";
import { DISENGAGED, DODGING } from "../stances.ts";
import type { StatBlockListKey } from "../../statBlock/parseAction.ts";
import type { TurnOption, UsableAttack } from "../terrain/turnOptions.ts";

export type TurnStep =
  /** The Dodge or Disengage action's condition goes on the mover, until its next turn starts. */
  | { type: "stance"; name: typeof DODGING | typeof DISENGAGED }
  /** The token goes to `to` and `feet` count against the turn's movement. */
  | { type: "move"; to: Cell; feet: number }
  /** One resolved attack: a Multiattack is several of these, in printed order. */
  | { type: "swing"; list: StatBlockListKey; action: string; targetId: string }
  /** One spell cast (#1021): `cast_spell` spends the slot or use and marks the Action itself, so no `spend` or `use` step goes with it. */
  | { type: "cast"; spell: string; castLevel: number; targetIds: string[] }
  /** An ability check to end a condition a spell holds the mover in (#1021): `break_free` takes the Action itself, so no `use` step goes with it. */
  | { type: "break_free"; name: string; ability: string }
  /** One use of a limited or recharge ability, as the runner records it. */
  | { type: "spend"; useKey: string; limit: ActionLimit }
  /** The Action or the Bonus Action of the turn is used up. */
  | { type: "use"; slot: "action" | "bonus" }
  /** A flee that ends on a way off the map (#1203): the creature is taken out of the fight, after everything else it did. */
  | { type: "leave" }
  /** An escape that only hides: the creature turns Invisible (the app applies the SRD condition; what it does for the creature is the DM's to rule). */
  | { type: "condition"; name: "Invisible" };

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
    case "escape":
      return option.escape === undefined ? "action" : option.escape.slot;
    // `cast_spell` marks the Action itself (and spends the slot), so a cast needs no `use` step here.
    case "spell":
    case "break_free":
    case "move":
    case "surrender":
      return null;
  }
}

/** The steps of one option. `attacks` are the mover's usable entries: where a Multiattack's steps and a limit are found by name. */
export function stepsFor(option: TurnOption, attacks: readonly UsableAttack[]): TurnStep[] {
  const steps: TurnStep[] = [];
  // An escape is a power, not a walk: use its slot, spend its limit, then it either leaves the fight or turns Invisible.
  if (option.kind === "escape" && option.escape !== undefined) {
    const way = option.escape;
    steps.push({ type: "use", slot: way.slot });
    if (way.useKey !== null && way.limit !== null) steps.push({ type: "spend", useKey: way.useKey, limit: way.limit });
    steps.push(way.effect === "leaves" ? { type: "leave" } : { type: "condition", name: "Invisible" });
    return steps;
  }
  // First, so the stance is already on the creature for anything that follows in the turn (Disengage, then walk away).
  if (option.kind === "dodge") steps.push({ type: "stance", name: DODGING });
  if (option.kind === "disengage") steps.push({ type: "stance", name: DISENGAGED });
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
  // A cast is one command: it spends the slot or use and takes the Action itself.
  if (option.kind === "spell" && option.spell !== undefined && option.spell !== null) {
    steps.push({ type: "cast", spell: option.spell.name, castLevel: option.spell.castLevel, targetIds: option.spell.targetIds });
  }
  if (option.kind === "break_free" && option.breakFree !== undefined) steps.push({ type: "break_free", name: option.breakFree.name, ability: option.breakFree.ability });
  const slot = slotOf(option);
  if (slot !== null) steps.push({ type: "use", slot });
  // Only a flee leaves, and only when its destination is a way off: nothing else ever offers one (decision 4, #1203).
  if (option.kind === "flee" && option.leavesMap === true) steps.push({ type: "leave" });
  return steps;
}
