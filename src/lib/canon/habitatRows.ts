/**
 * A habitat's species as the screens read them (#1283): each species once, with how common it is here, the forms on
 * its roll and, for every share, both the number the DM typed and the one worked out. The arithmetic is
 * `workedOutShares`'s; this only arranges its answer, so the Habitats list, the place page and the editor read one
 * thing. It imports no component and no query.
 */
import { sharesLine } from "@edge-shared/worldBlock.ts";
import { LIVES_AS_LABEL, KINGDOM_LABEL, speciesShare, thumbnailFormId, workedOutShares, type WorkedOut } from "./ecology";
import type { Abundance, HabitatSpecies, Species, SpeciesForm } from "./ecologyTypes";
import type { Habitat, HabitatLife } from "./habitats";
import { sharesProblem } from "./shares";

/** One form on the roll. `typed` is the DM's number (null when worked out), `worked` is what the code makes of it. */
export interface RowForm {
  lifeId: string;
  formId: string;
  label: string;
  recordId: string | null;
  name: string | null;
  readable: boolean;
  typed: number | null;
  worked: number;
}

export interface SpeciesRow {
  habitatSpeciesId: string;
  speciesId: string;
  name: string;
  /** The words under the name. */
  meta: string;
  abundance: Abundance | null;
  forms: RowForm[];
  /** The species' share on the roll (its forms summed); null for a species with no form on it. */
  total: number | null;
  /** The stat block whose picture stands for the species: the form met most often here, else the first. */
  pictureOf: string | null;
}

export interface HabitatRowsInput {
  habitat: Habitat;
  habitatSpecies: readonly HabitatSpecies[];
  life: readonly HabitatLife[];
  species: readonly Species[];
  forms: readonly SpeciesForm[];
}

function work(input: HabitatRowsInput, speciesById: ReadonlyMap<string, Species>): WorkedOut {
  const here = input.habitatSpecies.filter((h) => h.habitatId === input.habitat.id);
  return workedOutShares({
    species: here.map((h) => ({ speciesId: h.speciesId, abundance: h.abundance, livesAs: speciesById.get(h.speciesId)?.livesAs ?? null })),
    life: input.life.filter((l) => l.habitatId === input.habitat.id).map((l) => ({ formId: l.formId, speciesId: l.speciesId, percent: l.percent })),
    otherPercent: input.habitat.otherPercent,
  });
}

function metaOf(species: Species, onRoll: boolean): string {
  if (!onRoll) return `${KINGDOM_LABEL[species.kingdom]} · never met on a roll`;
  if (species.scientificName !== null && species.scientificName !== "") return species.scientificName;
  if (species.livesAs !== null) return `Lives ${LIVES_AS_LABEL[species.livesAs].toLowerCase()}`;
  return KINGDOM_LABEL[species.kingdom];
}

/** The species living in the habitat in the DM's order, and what "anything else" is. */
export function buildHabitatRows(input: HabitatRowsInput): { species: SpeciesRow[]; other: { typed: number | null; worked: number } } {
  const speciesById = new Map(input.species.map((s) => [s.id, s]));
  const worked = work(input, speciesById);
  const here = input.habitatSpecies.filter((h) => h.habitatId === input.habitat.id).sort((a, b) => a.sortOrder - b.sortOrder);
  const rows: SpeciesRow[] = [];
  for (const hs of here) {
    const species = speciesById.get(hs.speciesId);
    if (species === undefined) continue;
    const onRoll = input.life.filter((l) => l.habitatId === input.habitat.id && l.speciesId === hs.speciesId).sort((a, b) => a.sortOrder - b.sortOrder);
    const percentByForm = new Map(onRoll.map((l) => [l.formId, worked.forms.get(l.formId)?.percent ?? 0]));
    const speciesForms = input.forms.filter((f) => f.speciesId === hs.speciesId);
    const standIn = speciesForms.find((f) => f.id === thumbnailFormId(speciesForms, percentByForm));
    rows.push({
      habitatSpeciesId: hs.id,
      speciesId: hs.speciesId,
      name: species.name,
      meta: metaOf(species, onRoll.length > 0),
      abundance: hs.abundance,
      forms: onRoll.map((l) => ({
        lifeId: l.id,
        formId: l.formId,
        label: l.formLabel,
        recordId: l.recordId,
        name: l.name,
        readable: l.readable,
        typed: l.percent,
        worked: worked.forms.get(l.formId)?.percent ?? 0,
      })),
      total: onRoll.length === 0 ? null : speciesShare(worked.forms, onRoll.map((l) => l.formId)),
      pictureOf: standIn === undefined ? null : (standIn.monsterId ?? standIn.libraryMonsterId),
    });
  }
  return { species: rows, other: { typed: input.habitat.otherPercent, worked: worked.other.percent } };
}

/** "Marsh eel 40%, Giant frog 20%, anything else 40%": the worked-out shares by species, for a list row and a place page. */
export function habitatSummary(input: HabitatRowsInput): string {
  const { species } = buildHabitatRows(input);
  return sharesLine(species.flatMap((s) => (s.total === null ? [] : [{ name: s.name, percent: s.total }])), "anything else");
}

/** What a share the DM is about to type would break (the table would refuse a total past 100), or null. */
export function proposedSharesProblem(
  life: readonly Pick<HabitatLife, "id" | "name" | "speciesName" | "percent">[],
  otherPercent: number | null,
  change: { lifeId: string; percent: number | null } | { other: number | null },
): string | null {
  const list = life.flatMap((l) => {
    const percent = "lifeId" in change && change.lifeId === l.id ? change.percent : l.percent;
    return percent === null ? [] : [{ name: l.name ?? l.speciesName, percent }];
  });
  const other = "other" in change ? change.other : otherPercent;
  if (other !== null) list.push({ name: "Anything else", percent: other });
  return sharesProblem(list, "everything that lives there");
}
