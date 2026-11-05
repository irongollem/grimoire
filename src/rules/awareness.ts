import { skillCheckBonus, type SkillCheckSource } from "@/rules/skillCheck";
import { CHECK_DIS_CONDITIONS, getExhaustionD20Penalty, getExhaustionLevel, hasCheckDisadvantage } from "@/rules/conditions";
import type { AppliedCondition } from "@/types/condition.types";
import type { RulesetKey } from "@/types/ruleset.types";

/** What a Perception check reads off a character: a `PartyMember` satisfies it. */
export interface AwarenessSource extends SkillCheckSource {
  conditions: readonly AppliedCondition[];
  ruleset: RulesetKey;
}

/** The two dice rolled ahead for one check; the second is read only under disadvantage. */
export interface AwarenessDice {
  d20: number;
  d20Second: number;
}

export interface AwarenessReading {
  total: number;
  /** The die that counts: the first, or the lower of the two under disadvantage. */
  die: number;
  bonus: number;
  /** 2024 Exhaustion, -2 per level; 0 otherwise. */
  penalty: number;
  /** What imposes disadvantage right now ("Poisoned", "Exhaustion"), empty when nothing does. */
  disadvantageFrom: string[];
}

/**
 * A kept Perception roll read the way the character's own sheet rolls Perception, as the
 * character stands at the moment it is used: the check bonus, disadvantage from conditions
 * (Frightened, Poisoned, and 2014 Exhaustion, PHB 2014 / SRD 5.2 "Conditions"), and the 2024
 * Exhaustion penalty to every d20 test (SRD 5.2 "Exhaustion"). The dice were rolled hours
 * earlier, which is why the conditions are read here and not when they were rolled.
 */
export function readAwareness(member: AwarenessSource, dice: AwarenessDice): AwarenessReading {
  const disadvantage = hasCheckDisadvantage(member.conditions, member.ruleset);
  const die = disadvantage ? Math.min(dice.d20, dice.d20Second) : dice.d20;
  const bonus = skillCheckBonus(member, "perception");
  const penalty = getExhaustionD20Penalty(member.conditions, member.ruleset);
  const disadvantageFrom = disadvantage
    ? [
        ...member.conditions.filter((c) => CHECK_DIS_CONDITIONS.has(c.name)).map((c) => c.name),
        ...(member.ruleset === "2014" && getExhaustionLevel(member.conditions) >= 1 ? ["Exhaustion"] : []),
      ]
    : [];
  return { total: die + bonus + penalty, die, bonus, penalty, disadvantageFrom };
}

/** How the total is made, for the hover: "d20 12 + 5", "lower of 12 and 4 (Poisoned) + 5, Exhaustion -2". */
export function explainAwareness(dice: AwarenessDice, reading: AwarenessReading): string {
  const die = reading.disadvantageFrom.length
    ? `lower of ${dice.d20} and ${dice.d20Second} (disadvantage: ${reading.disadvantageFrom.join(", ")})`
    : `d20 ${reading.die}`;
  const bonus = `${reading.bonus < 0 ? "-" : "+"} ${Math.abs(reading.bonus)}`;
  const penalty = reading.penalty ? `, Exhaustion ${reading.penalty}` : "";
  return `${die} ${bonus}${penalty}`;
}

export interface AwarenessUse {
  name: string;
  member: AwarenessSource;
  /** The dice that were used; null when the character had no roll yet. */
  used: AwarenessDice | null;
}

/**
 * The notice after rolls were used, e.g. `Awareness used: Mira 17, Bram 9 (nat 1)`.
 * A natural 20 or 1 is flagged on the die that counts, not the total (a +9 on a 11 is not
 * a nat 20). Characters without a used roll are left out; null when nobody is left.
 */
export function formatAwarenessUse(uses: readonly AwarenessUse[]): string | null {
  const parts: string[] = [];
  for (const use of uses) {
    if (use.used === null) continue;
    const reading = readAwareness(use.member, use.used);
    const notes = [
      reading.die === 20 ? "nat 20" : reading.die === 1 ? "nat 1" : null,
      reading.disadvantageFrom.length ? "disadvantage" : null,
    ].filter((n) => n !== null);
    parts.push(`${use.name} ${reading.total}${notes.length ? ` (${notes.join(", ")})` : ""}`);
  }
  return parts.length === 0 ? null : `Awareness used: ${parts.join(", ")}`;
}
