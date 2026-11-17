import { disengagedCondition, dodgingCondition } from "@/rules/fight/stances";
import type { AppliedCondition } from "@/types/condition.types";

/** The four actions the turn's buttons name, besides attacking. */
export type ActKind = "dash" | "dodge" | "disengage" | "hide";

/**
 * What one of those actions does for the played character, beyond spending the Action: the line for the story,
 * whether the turn's speed doubles, and the condition they carry until their next turn. The board carries it out.
 * Hide has no entry here yet beyond its line: it needs a Stealth roll, which is its own piece.
 */
export function actOutcome(kind: ActKind, name: string): { line: string; dashes: boolean; stance: AppliedCondition | null } {
  switch (kind) {
    case "dash":
      return { line: `${name} takes the Dash action`, dashes: true, stance: null };
    case "dodge":
      // PHB 2014 "Dodge": until your next turn, attacks against you have disadvantage and you save on Dexterity with advantage.
      return { line: `${name} takes the Dodge action: attacks against them have disadvantage until their next turn`, dashes: false, stance: dodgingCondition() };
    case "disengage":
      // PHB 2014 "Disengage": your movement provokes no opportunity attacks for the rest of the turn.
      return { line: `${name} takes the Disengage action: their movement provokes no opportunity attacks this turn`, dashes: false, stance: disengagedCondition() };
    case "hide":
      return { line: `${name} tries to hide`, dashes: false, stance: null };
  }
}
