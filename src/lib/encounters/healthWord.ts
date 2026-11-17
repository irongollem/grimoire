/**
 * The word a player sees for a creature's health instead of its numbers.
 *
 * The thresholds are an app convention, not a 5e rule: the game has no named health bands,
 * so these four cut points are Grimoire's own. Callers pass the hit points they display
 * (a wild-shaped character's beast hit points in preference to the character's own).
 */
export function healthWord(hp: number, maxHp: number): string {
  const pct = hp / maxHp;
  if (pct <= 0) return "Dead";
  if (pct <= 0.25) return "Bloodied";
  if (pct <= 0.5) return "Wounded";
  if (pct <= 0.75) return "Hurt";
  return "Healthy";
}
