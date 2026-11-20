// The proficiency bonus. Pure and edge-importable (relative `.ts` imports only).

/**
 * A member's proficiency bonus: the stored one, else the level's (PHB "Proficiency Bonus" table). A caller that holds
 * no level (the server's sheet row) passes the stored bonus, which a played character always has.
 */
export function proficiencyBonusOf(member: { proficiency_bonus: number; level?: number }): number {
  if (member.proficiency_bonus) return member.proficiency_bonus;
  const l = member.level ?? 1;
  if (l >= 17) return 6;
  if (l >= 13) return 5;
  if (l >= 9) return 4;
  if (l >= 5) return 3;
  return 2;
}
