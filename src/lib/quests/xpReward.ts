/**
 * What a typed XP amount for a quest saves as (#1021 row 27): a whole positive number, or none for anything else. The
 * database takes 1 to 10,000,000 (`quests.xp_reward`), so a larger number is none too rather than a refused save.
 */
export function xpRewardOf(typed: string): number | null {
  const text = typed.trim();
  if (text === "") return null;
  const n = Number(text);
  return Number.isInteger(n) && n >= 1 && n <= 10_000_000 ? n : null;
}
