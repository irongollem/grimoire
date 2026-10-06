import type { CharacterMemorial, MemorialMourner } from "@/types/memorial.types";

/** Newest first by real_date, then created_at. Memorials that were restored are not on the wall. */
export function onTheWall(memorials: readonly CharacterMemorial[]): CharacterMemorial[] {
  return memorials
    .filter((m) => m.restored_at === null)
    .sort((a, b) => b.real_date.localeCompare(a.real_date) || b.created_at.localeCompare(a.created_at));
}

export function splitWall(
  memorials: readonly CharacterMemorial[],
  /** Nobody signed in owns nothing: every memorial is someone else's. */
  userId: string | null,
): { mine: CharacterMemorial[]; beside: CharacterMemorial[] } {
  const mine: CharacterMemorial[] = [];
  const beside: CharacterMemorial[] = [];
  for (const m of memorials) (userId !== null && m.owner_user_id === userId ? mine : beside).push(m);
  return { mine, beside };
}

export function candleCounts(mourners: readonly MemorialMourner[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const r of mourners) {
    if (r.candle_lit_at !== null) counts.set(r.memorial_id, (counts.get(r.memorial_id) ?? 0) + 1);
  }
  return counts;
}

const WORDS = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven",
  "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty",
];

function countWord(n: number): string {
  return WORDS[n] ?? String(n);
}

/** "Four have fallen. Two laid down their arms." Null for an empty wall. */
export function wallTally(memorials: readonly CharacterMemorial[]): string | null {
  const fallen = memorials.filter((m) => m.kind === "fallen").length;
  const retired = memorials.filter((m) => m.kind === "retired").length;
  const sentences: string[] = [];
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  if (fallen > 0) sentences.push(`${cap(countWord(fallen))} ${fallen === 1 ? "has" : "have"} fallen.`);
  if (retired > 0) sentences.push(`${cap(countWord(retired))} laid down their arms.`);
  return sentences.length ? sentences.join(" ") : null;
}

function mournerFor(mourners: readonly MemorialMourner[], memorialId: string): MemorialMourner | undefined {
  return mourners.find((r) => r.memorial_id === memorialId);
}

/** Memorials I own in campaigns I have left, which I have not yet kept or let go. */
export function pendingKeepPrompts(
  memorials: readonly CharacterMemorial[],
  myMourners: readonly MemorialMourner[],
  myCampaignIds: ReadonlySet<string>,
  myUserId: string,
): CharacterMemorial[] {
  return memorials.filter((m) => {
    if (m.owner_user_id !== myUserId || myCampaignIds.has(m.campaign_id)) return false;
    const row = mournerFor(myMourners, m.id);
    return row !== undefined && row.kept_at === null && row.let_go_at === null;
  });
}

export function hiddenFromMe(memorial: CharacterMemorial, myMourner: MemorialMourner | undefined): boolean {
  return myMourner?.memorial_id === memorial.id && myMourner.let_go_at !== null;
}

/** Fallen memorials of the campaign whose death notice I have not yet seen. */
export function pendingTolls(
  memorials: readonly CharacterMemorial[],
  myMourners: readonly MemorialMourner[],
  campaignId: string,
): CharacterMemorial[] {
  return memorials.filter((m) => {
    if (m.campaign_id !== campaignId || m.kind !== "fallen" || m.restored_at !== null) return false;
    const row = mournerFor(myMourners, m.id);
    return row !== undefined && row.tolled_at === null;
  });
}
