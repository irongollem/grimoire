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

/** A place put in a habitat, as `campaign_habitat_places` holds it. */
export interface HabitatCoverage {
  habitatId: string;
  locationId: string;
}

/** The habitat a place lies in, and the covered place it lies in it through (the place itself when it is covered directly). */
export interface PlaceHabitatMatch {
  habitatId: string;
  throughPlaceId: string;
}

/**
 * The habitat a place lies in: its own when it is covered, otherwise that of the nearest place it lies inside that is
 * (a room of a covered town is in the town's habitat). The same rule `tablesForPlaces` uses for encounter tables.
 * `seen` guards a parent cycle, which the Atlas does not make but a bad import could.
 */
export function habitatForPlace(placeId: string, parentOf: (id: string) => string | null, covered: readonly HabitatCoverage[]): PlaceHabitatMatch | null {
  const byPlace = new Map(covered.map((c) => [c.locationId, c.habitatId]));
  const seen = new Set<string>();
  for (let at: string | null = placeId; at !== null && !seen.has(at); at = parentOf(at)) {
    seen.add(at);
    const habitatId = byPlace.get(at);
    if (habitatId !== undefined) return { habitatId, throughPlaceId: at };
  }
  return null;
}

/** The habitat an encounter is made in: its name and the creatures that live there at a share. */
export interface EncounterHabitat {
  name: string;
  life: HabitatLife[];
}

/**
 * What a made-up encounter is told about the country it is in, rolled once: a creature that lives there (at its
 * share), or, when the roll lands on "anything else", that it is not one of those listed. A constraint, never an
 * override: the DM's own concept still stands. Nothing is said for a habitat with no creature at a share.
 */
export function lifeConstraints(habitatName: string, life: readonly HabitatLife[], random: () => number = Math.random): string[] {
  const shared = life.filter((l) => l.percent > 0);
  if (shared.length === 0) return [];
  const rolled = rollLife(shared, random);
  if (rolled) return [`Build this encounter around ${rolled.name}: it is what lives in ${habitatName}. Other creatures may join it.`];
  const listed = shared.filter((l) => l.readable).map((l) => l.name);
  if (listed.length === 0) return [];
  return [`The creatures are not ${listed.join(", ")}: something this country rarely sees.`];
}
