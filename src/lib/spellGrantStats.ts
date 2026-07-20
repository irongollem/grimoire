/** The subset of a character_spells row this module needs (fixed overrides + innate casting ability). */
export interface SpellGrantStats {
  fixed_attack_bonus?: number | null;
  fixed_save_dc?: number | null;
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
 * 1. An explicit `fixed_attack_bonus` override (e.g. a magic item's stated bonus).
 * 2. The grant's own `casting_ability` (innate spells cast off a fixed ability,
 *    independent of any class — e.g. a racial cantrip cast with CHA).
 * 3. The source class's computed spellcasting stats (multiclass-aware).
 * 4. `fallback` — the character's single-class spell attack bonus.
 */
export function grantAttackBonus(
  grant: SpellGrantStats,
  member: GrantCastingMember | null,
  classStats: GrantClassStats | null,
  fallback: number | null,
): number | null {
  if (grant.fixed_attack_bonus !== null && grant.fixed_attack_bonus !== undefined) return grant.fixed_attack_bonus;
  if (grant.casting_ability && member) {
    return member.proficiency_bonus + Math.floor((member[grant.casting_ability] - 10) / 2);
  }
  return classStats?.attack ?? fallback;
}

/**
 * Save DC for a character_spells grant. Computed INDEPENDENTLY of
 * `grantAttackBonus` — a `fixed_attack_bonus` override does not imply a fixed
 * DC, and vice versa. Precedence mirrors `grantAttackBonus`:
 * 1. An explicit `fixed_save_dc` override.
 * 2. 8 + proficiency + the grant's own `casting_ability` modifier.
 * 3. The source class's computed spellcasting stats (multiclass-aware).
 * 4. `fallback` — the character's single-class spell save DC.
 */
export function grantSaveDc(
  grant: SpellGrantStats,
  member: GrantCastingMember | null,
  classStats: GrantClassStats | null,
  fallback: number | null,
): number | null {
  if (grant.fixed_save_dc !== null && grant.fixed_save_dc !== undefined) return grant.fixed_save_dc;
  if (grant.casting_ability && member) {
    return 8 + member.proficiency_bonus + Math.floor((member[grant.casting_ability] - 10) / 2);
  }
  return classStats?.dc ?? fallback;
}
