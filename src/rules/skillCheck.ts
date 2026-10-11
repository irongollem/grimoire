import { SKILLS } from "@/types/party.types";
import type { SkillProficiencies } from "@/types/party.types";
import type { AbilityScores } from "@/types/multiclass.types";
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
 * Total bonus for a skill check: ability modifier (doubled proficiency for
 * expertise, single for proficient, none otherwise). `overrideScores` swaps in
 * beast STR/DEX/CON etc. while keeping the member's proficiency bonus and
 * proficiencies — the wildshape case. Returns 0 for an unknown skill key.
 *
 * Single source of truth for both the player Skills tab and the Hide action's
 * Stealth roll; see `PlayerSkillsTab.vue` / `PlayerCombatTab.vue`.
 */
export function skillCheckBonus(
  source: SkillCheckSource,
  skillKey: keyof SkillProficiencies,
  overrideScores?: AbilityScores,
): number {
  const skill = SKILLS.find((s) => s.key === skillKey);
  if (!skill) return 0;
  const score = (overrideScores ?? source)[skill.ability];
  const mod = abilityMod(score);
  const level = source.skill_proficiencies?.[skillKey] ?? "none";
  const pb = source.proficiency_bonus;
  return mod + (level === "expertise" ? pb * 2 : level === "proficient" ? pb : 0);
}

/**
 * Passive score for a skill (passive Perception is `passiveScore(m, "perception")`):
 * 10 plus the skill's check bonus. Same inputs as `skillCheckBonus`, so a
 * wild-shaped character's beast scores flow through `overrideScores`.
 */
export function passiveScore(
  source: SkillCheckSource,
  skillKey: keyof SkillProficiencies,
  overrideScores?: AbilityScores,
): number {
  return 10 + skillCheckBonus(source, skillKey, overrideScores);
}
