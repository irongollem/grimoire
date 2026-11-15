// How many feet a creature may still move this turn. Pure and edge-importable.
//
// The speed itself comes from `combatantSpeed` (`lib/encounters/combatantSpeed.ts`: the stat block, the sheet or the
// beast form). This applies what the conditions say about it and takes off what the turn has already used.
//
// Applied:
// - Speed 0 from a condition. 2014 (PHB Appendix A, SRD 5.1 "Conditions"): Grappled ("its speed becomes 0"),
//   Restrained ("its speed becomes 0"), Paralyzed, Petrified, Stunned and Unconscious ("can't move"). 2024 (SRD 5.2
//   "Conditions"): Grappled, Paralyzed, Petrified, Restrained and Unconscious say "Your Speed is 0"; Stunned there is
//   Incapacitated plus failed Strength and Dexterity saves and says nothing of movement, so it does not stop a walk.
// - 2024 Exhaustion: "Your Speed is reduced by a number of feet equal to 5 times your Exhaustion level"
//   (`getExhaustionSpeedPenaltyFt`, the repo's existing rule).
//
// Not handled: standing up from Prone (costs half the speed), 2014 Exhaustion (level 2 halves, level 5 is 0), and
// "can't benefit from any bonus to its speed" (a bonus is not modelled here at all). Dash is the caller's choice.

import type { AppliedCondition } from "../../../types/condition.types.ts";
import type { RulesetKey } from "../../../types/ruleset.types.ts";
import { getExhaustionSpeedPenaltyFt, hasCondition } from "../../conditions.ts";

const SPEED_ZERO_2014 = ["Grappled", "Paralyzed", "Petrified", "Restrained", "Stunned", "Unconscious"] as const;
const SPEED_ZERO_2024 = ["Grappled", "Paralyzed", "Petrified", "Restrained", "Unconscious"] as const;

/** Whether a condition on the creature sets its Speed to 0. */
export function speedIsZero(conditions: readonly AppliedCondition[], ruleset: RulesetKey): boolean {
  const names = ruleset === "2024" ? SPEED_ZERO_2024 : SPEED_ZERO_2014;
  return names.some((name) => hasCondition(conditions, name));
}

/**
 * The feet of movement left this turn: speed, less what conditions take, less the feet already moved, never below 0.
 * Null when nothing says what the speed is (the caller must not guess one). `movementUsed` is the turn's tally, absent
 * until the creature has moved (it is cleared when the turn starts), which is none.
 */
export function movementBudgetFeet(input: {
  speed: number | null;
  movementUsed: number | undefined;
  conditions: readonly AppliedCondition[];
  ruleset: RulesetKey;
}): number | null {
  if (input.speed === null) return null;
  if (speedIsZero(input.conditions, input.ruleset)) return 0;
  const speed = input.speed - getExhaustionSpeedPenaltyFt(input.conditions, input.ruleset);
  const used = input.movementUsed === undefined ? 0 : input.movementUsed;
  return Math.max(0, speed - used);
}
