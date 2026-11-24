/**
 * Shares of a whole, in percent: the one rule behind the peoples of the world (#1255 item 30) and what lives in each
 * habitat (item 31). A list of shares may not pass 100, a share lies between 0 and 100, and what the shares leave over is
 * "anyone else" / "anything else" (a roll that lands there picks nobody). Both tables refuse a total past 100 at commit;
 * {@link sharesProblem} says the same first, in words, so nothing is sent that the database would refuse.
 *
 * It imports nothing: the words the world block says for a list (`sharesLine`) are the server's, in
 * `@edge-shared/worldBlock.ts`, and a chunk that only wants a roll does not carry the world block.
 */
export interface Share {
  /** The record's name; a placeholder when this reader may not read the record. */
  name: string;
  percent: number;
  /** False for a record on another DM's own shelf: its share counts, but it is never rolled or named to a generator. */
  readable: boolean;
}

export function sharesTotal(list: readonly Pick<Share, "percent">[]): number {
  return Math.round(list.reduce((sum, s) => sum + s.percent, 0) * 100) / 100;
}

/**
 * A plain sentence for what the table would refuse, or null when the list can be saved. `whole` names what the shares
 * divide ("population", "everything that lives there"). Names cannot be blank or repeated: a share is a record.
 */
export function sharesProblem(list: readonly Pick<Share, "name" | "percent">[], whole: string): string | null {
  for (const s of list) {
    if (!Number.isFinite(s.percent) || s.percent < 0 || s.percent > 100) return `${s.name}'s share must be between 0 and 100.`;
  }
  const total = sharesTotal(list);
  if (total > 100) return `The shares add up to ${total}%, which is more than ${whole}.`;
  return null;
}

/** What the shares leave over, for "The other 40% is anything else". */
export function sharesRest(total: number): number {
  return Math.round((100 - total) * 100) / 100;
}

/**
 * Rolls one share: each at its percent, the rest up to 100 as `null` (the unlisted remainder). An empty list is null.
 * The random source is an argument so a test can pin it.
 */
export function rollShare<T extends Pick<Share, "percent" | "readable">>(list: readonly T[], random: () => number = Math.random): T | null {
  const point = random() * 100;
  let edge = 0;
  for (const s of list) {
    edge += s.percent;
    // A record this reader cannot name cannot be handed to a generator: its share is the remainder for this roll.
    if (point < edge) return s.readable ? s : null;
  }
  return null;
}
