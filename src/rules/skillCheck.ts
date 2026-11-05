import { SKILLS } from "@/types/party.types";
import type { SkillProficiencies } from "@/types/party.types";
import type { AbilityScores } from "@/types/multiclass.types";
import type { RulesetKey } from "@/types/ruleset.types";
import { abilityMod } from "@/rules/weaponAttack";

/**
 * Minimal shape needed to score a skill check — a `PartyMember` satisfies it,
 * but so does any object carrying the six scores, a proficiency bonus and the
 * proficiency map. Keeping the input structural lets `skillCheckBonus` be
 * unit-tested without fabricating a whole member.
 */
export interface SkillCheckSource extends AbilityScores {
  proficiency_bonus: number;
  skill_proficiencies?: SkillProficiencies | null;
}

/**
 * Jack of All Trades, the Bard's 2nd-level feature: half the proficiency bonus,
 * rounded down, on a check that does not already use it. Which checks differs
 * by edition, so it is read once per character and passed to every check:
 *
 * - `"any_check"` (PHB 2014 / SRD 5.1): every ability check without the
 *   proficiency bonus, so an unproficient skill, a plain ability check, and
 *   initiative, which is a Dexterity check.
 * - `"skill_check"` (SRD 5.2): only a check "that uses a skill proficiency you
 *   lack", so a plain ability check and initiative get nothing.
 * - `"none"`: the character does not have the feature.
 */
export type JackOfAllTrades = "any_check" | "skill_check" | "none";

/** The capability a class definition carries when it grants Jack of All Trades (#1147). */
export const JACK_OF_ALL_TRADES = "jack_of_all_trades";
/** Both editions grant it at 2nd level in the class (PHB 2014 / SRD 5.2 "Bard"). */
const JACK_OF_ALL_TRADES_LEVEL = 2;

/** The part of a `character_classes` row Jack of All Trades reads. */
export interface JackOfAllTradesClassRow {
  capabilities: readonly string[];
  levels: number;
}

/**
 * Whether the character has Jack of All Trades, from its class rows. It is the
 * `jack_of_all_trades` capability of the row's class definition (#934's rule,
 * stamped onto the row by trigger), never the class name, so a homebrew class
 * can grant it and a class merely named "Bard" need not. The level is the
 * level in that class, not the character's total: a Fighter 5 / Bard 1 has not
 * got it yet.
 */
export function jackOfAllTrades(
  classRows: readonly JackOfAllTradesClassRow[],
  ruleset: RulesetKey,
): JackOfAllTrades {
  // A row restored from a persisted cache older than #934 has no `capabilities`
  // and is refetched at once; for that beat it grants nothing.
  const has = classRows.some(
    (row) => Array.isArray(row.capabilities) && row.capabilities.includes(JACK_OF_ALL_TRADES) && row.levels >= JACK_OF_ALL_TRADES_LEVEL,
  );
  if (!has) return "none";
  return ruleset === "2024" ? "skill_check" : "any_check";
}

/**
 * What Jack of All Trades adds to a check made without the proficiency bonus:
 * a `"skill"` check in an unproficient skill, or a plain `"ability"` check
 * (initiative is one). The caller decides the check does not already use the
 * proficiency bonus.
 */
export function jackOfAllTradesBonus(
  jack: JackOfAllTrades,
  proficiencyBonus: number,
  check: "skill" | "ability",
): number {
  if (jack === "none") return 0;
  if (check === "ability" && jack !== "any_check") return 0;
  return Math.floor(proficiencyBonus / 2);
}

/**
 * Total bonus for a skill check: ability modifier (doubled proficiency for
 * expertise, single for proficient, Jack of All Trades or nothing otherwise).
 * `overrideScores` swaps in beast STR/DEX/CON etc. while keeping the member's
 * proficiency bonus and proficiencies — the wildshape case. Returns 0 for an
 * unknown skill key.
 *
 * The one place a skill check is scored: the sheet, Hearth, the Hide action,
 * passive scores, the DM's forms and runner, and Awareness Rolls all read it.
 */
export function skillCheckBonus(
  source: SkillCheckSource,
  skillKey: keyof SkillProficiencies,
  jack: JackOfAllTrades,
  overrideScores?: AbilityScores,
): number {
  const skill = SKILLS.find((s) => s.key === skillKey);
  if (!skill) return 0;
  const score = (overrideScores ?? source)[skill.ability];
  const mod = abilityMod(score);
  const level = source.skill_proficiencies?.[skillKey] ?? "none";
  const pb = source.proficiency_bonus;
  if (level === "expertise") return mod + pb * 2;
  if (level === "proficient") return mod + pb;
  return mod + jackOfAllTradesBonus(jack, pb, "skill");
}

/**
 * Passive score for a skill (passive Perception is `passiveScore(m, "perception", jack)`):
 * 10 plus the skill's check bonus. Same inputs as `skillCheckBonus`, so a
 * wild-shaped character's beast scores flow through `overrideScores`.
 */
export function passiveScore(
  source: SkillCheckSource,
  skillKey: keyof SkillProficiencies,
  jack: JackOfAllTrades,
  overrideScores?: AbilityScores,
): number {
  return 10 + skillCheckBonus(source, skillKey, jack, overrideScores);
}
