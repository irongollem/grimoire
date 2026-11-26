/**
 * The ecology of the world (#1255 item 31): the kinds of country (`campaign_habitats`), the Atlas places each covers
 * (`campaign_habitat_places`) and what lives in each as shares of its life (`campaign_habitat_life`, read by name
 * through `campaign_habitat_life_named`). The share rules are `shares.ts`'s, the same as the peoples'.
 */
import { sharesLine } from "@edge-shared/worldBlock.ts";
import { tablesForPlaces, type TableOnPlace } from "@/lib/travel/wayTables";
import { isAboutAt, linkSentence, linkWords, rollAdjust, TIME_OF_DAY_WORDS, workedOutShares, type RollWhen } from "./ecology";
import type { HabitatLifeRow, HabitatSpecies, Species, SpeciesForm, SpeciesLink } from "./ecologyTypes";
import { rollShare } from "./shares";

export interface Habitat {
  id: string;
  name: string;
  /** Tiptap JSON, or null while the DM has said nothing. */
  description: string | null;
  sortOrder: number;
  /** The DM's "anything else" share, or null for the default. */
  otherPercent: number | null;
}

/** A form on a habitat's roll; `readable` is false when this reader may not read its stat block's name. */
export type HabitatLife = HabitatLifeRow & { readable: boolean };

/** What stands where a name would, for a creature a co-DM listed from their own shelf. */
export const UNREADABLE_CREATURE = "A creature another DM listed";

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

/** One creature (one form of one species) on a habitat's roll at this hour and season. */
export interface EncounterEntry {
  formId: string;
  speciesId: string;
  speciesName: string;
  /** The stat block's name, or {@link UNREADABLE_CREATURE}. */
  name: string;
  percent: number;
  readable: boolean;
  /** "about at dusk" when the hour is this species' own, else null. */
  about: string | null;
  /** Sentences about the species' links here (at most 3). */
  linkLines: string[];
}

/** The habitat an encounter is made in: its name and the creatures that live there, as they stand at this hour. */
export interface EncounterHabitat {
  name: string;
  entries: EncounterEntry[];
  notes: string[];
}

export interface BuildEncounterHabitatInput {
  habitat: Habitat;
  habitatSpecies: readonly HabitatSpecies[];
  life: readonly HabitatLife[];
  species: readonly Species[];
  forms: readonly SpeciesForm[];
  links: readonly SpeciesLink[];
  statBlockNameByForm: ReadonlyMap<string, string | null>;
  when: RollWhen;
}

const MAX_LINK_LINES = 3;

/**
 * A habitat's roll as it stands now: the worked-out shares, changed by the hour and the season, for the forms that have
 * a stat block. A form with none takes its share but is never rolled; its share falls to "anything else".
 */
export function buildEncounterHabitat(input: BuildEncounterHabitatInput): EncounterHabitat {
  const speciesById = new Map(input.species.map((s) => [s.id, s]));
  const formsById = new Map(input.forms.map((f) => [f.id, f]));
  const worked = workedOutShares({
    species: input.habitatSpecies.map((h) => ({ speciesId: h.speciesId, abundance: h.abundance, livesAs: speciesById.get(h.speciesId)?.livesAs ?? null })),
    life: input.life.map((l) => ({ formId: l.formId, speciesId: l.speciesId, percent: l.percent })),
    otherPercent: input.habitat.otherPercent,
  });
  const rollShares = input.life.map((l) => ({ formId: l.formId, speciesId: l.speciesId, percent: worked.forms.get(l.formId)?.percent ?? 0 }));
  const adjusted = rollAdjust(rollShares, speciesById, input.when);
  const percentByForm = new Map(adjusted.shares.map((s) => [s.formId, s.percent]));
  const ctx = { speciesById, formsById, statBlockNameByForm: input.statBlockNameByForm };

  const entries: EncounterEntry[] = [];
  for (const l of [...input.life].sort((a, b) => a.sortOrder - b.sortOrder)) {
    if (l.recordId === null) continue;
    const species = speciesById.get(l.speciesId);
    const timeOfDay = input.when.timeOfDay;
    const about =
      species !== undefined && timeOfDay !== null && species.activity !== null && species.activity !== "any" && isAboutAt(species.activity, timeOfDay)
        ? `about ${TIME_OF_DAY_WORDS[timeOfDay]}`
        : null;
    const linkLines = input.links
      .filter((k) => (k.fromSpeciesId === l.speciesId || k.toSpeciesId === l.speciesId) && (k.habitatId === null || k.habitatId === input.habitat.id))
      .slice(0, MAX_LINK_LINES)
      .map((k) => linkSentence(linkWords(k, l.speciesId, ctx)));
    entries.push({
      formId: l.formId,
      speciesId: l.speciesId,
      speciesName: l.speciesName,
      name: l.name ?? UNREADABLE_CREATURE,
      percent: percentByForm.get(l.formId) ?? 0,
      readable: l.readable,
      about,
      linkLines,
    });
  }
  return { name: input.habitat.name, entries, notes: adjusted.notes };
}

/**
 * What a made-up encounter is told about the country it is in, rolled once: a creature that lives there (at its
 * share), or, when the roll lands on "anything else", that it is not one of those listed. A constraint, never an
 * override: the DM's own concept still stands. Nothing is said for a habitat with no creature at a share.
 */
export function lifeConstraints(h: EncounterHabitat, random: () => number = Math.random): string[] {
  const shared = h.entries.filter((e) => e.percent > 0);
  if (shared.length === 0) {
    // Everything that lives here is away this season or resting now: say so, so the generator does not pick one of them.
    const absent = [...new Set(h.entries.filter((e) => e.readable).map((e) => e.speciesName))];
    if (absent.length === 0) return [];
    return [`Nothing that lives in ${h.name} is about now (${absent.join(", ")} are not): something this country rarely sees.`];
  }
  const rolled = rollShare(shared, random);
  if (rolled) {
    const where = `it is what lives in ${h.name}${rolled.about === null ? "" : `, ${rolled.about}`}.`;
    const links = rolled.linkLines.join(" ");
    return [`Build this encounter around ${rolled.name}: ${where} ${links} Other creatures may join it.`.replace(/ {2,}/g, " ")];
  }
  const listed = shared.filter((e) => e.readable).map((e) => e.name);
  if (listed.length === 0) return [];
  return [`The creatures are not ${listed.join(", ")}: something this country rarely sees.`];
}

/** "Salt marsh: Marsh eel 40%, Giant frog 20%, anything else 40%": each species once, its forms summed. */
export function whereLine(h: EncounterHabitat): string {
  // By species id: two species may share a common name, and each keeps its own share.
  const bySpecies = new Map<string, { name: string; percent: number }>();
  for (const e of h.entries) {
    const seen = bySpecies.get(e.speciesId);
    bySpecies.set(e.speciesId, { name: e.speciesName, percent: (seen === undefined ? 0 : seen.percent) + e.percent });
  }
  const line = sharesLine([...bySpecies.values()], "anything else");
  return `${h.name}: ${line}`;
}

/** A roll table put on a place, with its name for the line that says "Uses <name> here". */
export interface PlacedTable extends TableOnPlace {
  name: string;
}

/**
 * What a place's encounters come from (#1258 item 15). One rule for the generator's Where line and the place page:
 * the place's own encounter table (or the nearest one of a place it lies inside, `tablesForPlaces`) wins, and the
 * habitat is the fallback only when neither the place nor any ancestor has a table. Never both: a table on the
 * place means the DM already said what happens there, so nothing is rolled from the habitat.
 */
export type PlaceEncounterSource =
  | { from: "table"; tables: { id: string; name: string; placeId: string }[] }
  | { from: "habitat"; match: PlaceHabitatMatch }
  | null;

export function encounterSourceForPlace(
  placeId: string,
  parentOf: (id: string) => string | null,
  tables: readonly PlacedTable[],
  covered: readonly HabitatCoverage[],
): PlaceEncounterSource {
  const own = tablesForPlaces([placeId], parentOf, tables);
  if (own.length > 0) return { from: "table", tables: own.map(({ table }) => ({ id: table.id, name: table.name, placeId: table.placeId })) };
  const match = habitatForPlace(placeId, parentOf, covered);
  return match === null ? null : { from: "habitat", match };
}
