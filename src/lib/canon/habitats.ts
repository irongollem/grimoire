/**
 * The ecology of the world (#1255 item 31): the kinds of country (`campaign_habitats`), the Atlas places each covers
 * (`campaign_habitat_places`) and what lives in each as shares of its life (`campaign_habitat_life`, read by name
 * through `campaign_habitat_life_named`). The share rules are `shares.ts`'s, the same as the peoples'.
 */
import { rollShare, type Share } from "./shares";

export interface Habitat {
  id: string;
  name: string;
  /** Tiptap JSON, or null while the DM has said nothing. */
  description: string | null;
  sortOrder: number;
}

/** One creature living in a habitat and its share. `recordId` is a text id for a book's creature, a uuid for the DM's own. */
export interface HabitatLife extends Share {
  id: string;
  habitatId: string;
  recordId: string;
  fromLibrary: boolean;
}

/** What stands where a name would, for a creature a co-DM listed from their own shelf. */
export const UNREADABLE_CREATURE = "A creature another DM listed";

/** What a made-up encounter's creature is in this country: each at its share, the rest as `null` ("anything else"). */
export const rollLife = rollShare<HabitatLife>;
