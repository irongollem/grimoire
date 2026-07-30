/** The subset of a character_spells row this module needs (innate casting ability). */
export interface SpellGrantStats {
  casting_ability?: "int" | "wis" | "cha" | null;
}

export interface GrantCastingMember {
  proficiency_bonus: number;
  int: number;
  wis: number;
  cha: number;
}

export interface GrantClassStats {
  attack: number;
  dc: number;
}

/**
 * Spell attack bonus for a character_spells grant. Precedence:
 * 1. The grant's own `casting_ability` (innate spells cast off a fixed ability,
 *    independent of any class — e.g. a racial cantrip cast with CHA).
 * 2. The source class's computed spellcasting stats (multiclass-aware).
 * 3. `fallback` — the character's single-class spell attack bonus.
 */
export function grantAttackBonus(
  grant: SpellGrantStats,
  member: GrantCastingMember | null,
  classStats: GrantClassStats | null,
  fallback: number | null,
): number | null {
  if (grant.casting_ability && member) {
    return member.proficiency_bonus + Math.floor((member[grant.casting_ability] - 10) / 2);
  }
  return classStats?.attack ?? fallback;
}

/**
 * Save DC for a character_spells grant. Precedence mirrors `grantAttackBonus`:
 * 1. 8 + proficiency + the grant's own `casting_ability` modifier.
 * 2. The source class's computed spellcasting stats (multiclass-aware).
 * 3. `fallback` — the character's single-class spell save DC.
 */
export function grantSaveDc(
  grant: SpellGrantStats,
  member: GrantCastingMember | null,
  classStats: GrantClassStats | null,
  fallback: number | null,
): number | null {
  if (grant.casting_ability && member) {
    return 8 + member.proficiency_bonus + Math.floor((member[grant.casting_ability] - 10) / 2);
  }
  return classStats?.dc ?? fallback;
}
