/**
 * The peoples of the world (#1255 item 30): who lives in it, as shares of the population, so a person the generator
 * invents is rolled at the world's odds instead of defaulting to a human. A people is never typed: it is a species or
 * a creature the campaign already has (`campaign_peoples`, read by name through `campaign_peoples_named`). The share
 * rules (total, problem, roll) are `shares.ts`'s, one set for the peoples and for what lives in each habitat; the
 * roll is named for the peoples here.
 */
import { rollShare, type Share } from "./shares";

/** One listed people, as `campaign_peoples_named` reads it. `recordId` is a text id for a book's record, a uuid for the DM's own. */
export interface People extends Share {
  id: string;
  kind: "species" | "creature";
  recordId: string;
  fromLibrary: boolean;
  /** The people's own name over its record ("the Vell", humans); null when it goes by the record's name. `name` is this, else `recordName`. */
  ownName: string | null;
  /** The species or creature behind it; a placeholder when this reader may not read the record. */
  recordName: string;
  /** What they are like: a rich-text document as text, null while nothing is written. */
  body: string | null;
}

/** What stands where a name would, for a people listed by a co-DM from their own shelf. */
export const UNREADABLE_PEOPLE = "A people another DM listed";

/** Who a made-up person is: each people at its share, the rest as `null` ("anyone else"). */
export const rollPeople = rollShare<People>;

