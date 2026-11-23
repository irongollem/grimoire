/**
 * The peoples of the world (#1255 item 30): who lives in it, as shares of the population, so a person the generator
 * invents is rolled at the world's odds instead of defaulting to a human. A people is never typed: it is a species or
 * a creature the campaign already has (`campaign_peoples`, read by name through `campaign_peoples_named`). The table
 * refuses a share outside 0 to 100 and a total past 100 at commit; {@link peoplesProblem} says the same first.
 *
 * It imports nothing: the words the world block says for a list (`peoplesLine`) are the server's, in
 * `@edge-shared/worldBlock.ts`, and nothing in the browser needs them, so a chunk that only wants a roll does not
 * carry the world block.
 */
/** One listed people, as `campaign_peoples_named` reads it. `recordId` is a text id for a book's record, a uuid for the DM's own. */
export interface People {
  id: string;
  kind: "species" | "creature";
  recordId: string;
  fromLibrary: boolean;
  /** Its record's name; {@link UNREADABLE_PEOPLE} when this reader may not read the record. */
  name: string;
  /** False for a species on another DM's own shelf: its share counts, but its name is not this reader's to see. */
  readable: boolean;
  percent: number;
}

/** What stands where a name would, for a people listed by a co-DM from their own shelf. */
export const UNREADABLE_PEOPLE = "A people another DM listed";

export function peoplesTotal(list: readonly Pick<People, "percent">[]): number {
  return Math.round(list.reduce((sum, p) => sum + p.percent, 0) * 100) / 100;
}

/** A plain sentence for what the table would refuse, or null when the list can be saved. Names cannot be blank or repeated: a people is a record. */
export function peoplesProblem(list: readonly Pick<People, "name" | "percent">[]): string | null {
  for (const p of list) {
    if (!Number.isFinite(p.percent) || p.percent < 0 || p.percent > 100) return `${p.name}'s share must be between 0 and 100.`;
  }
  const total = peoplesTotal(list);
  if (total > 100) return `The shares add up to ${total}%, which is more than the whole population.`;
  return null;
}

/**
 * Rolls who a made-up person is: each people at its share, the rest up to 100 as `null` ("anyone else", a people the
 * DM did not list). An empty list is null. The random source is an argument so a test can pin it.
 */
export function rollPeople(list: readonly People[], random: () => number = Math.random): People | null {
  const point = random() * 100;
  let edge = 0;
  for (const p of list) {
    edge += p.percent;
    // A people this reader cannot name cannot be handed to a generator: its share is "anyone else" for this roll.
    if (point < edge) return p.readable ? p : null;
  }
  return null;
}
