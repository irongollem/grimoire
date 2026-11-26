/**
 * What the Field guide chapter (#1283) works out from the species the campaign holds: the list grouped under its clades,
 * the mark at the right of a row, how an add row's one line splits into a label and a mention, and how often each
 * habitat a species lives in meets it. Plain functions over the field guide's own types, so the screens only draw.
 */
import type { Habitat } from "./habitats";
import { speciesShare, workedOutShares } from "./ecology";
import type { Clade, HabitatLifeRow, HabitatSpecies, Kingdom, Species, SpeciesForm } from "./ecologyTypes";

/** The kingdom filter's options: every kingdom, then each one. "Animals" and "Plants" read as the design draws them. */
export const KINGDOM_FILTER_OPTIONS: ReadonlyArray<{ value: Kingdom | null; label: string }> = [
  { value: null, label: "All" },
  { value: "animal", label: "Animals" },
  { value: "plant", label: "Plants" },
  { value: "fungus", label: "Fungi" },
  { value: "other", label: "Other" },
];

export interface SpeciesGroup {
  /** Null for the species in no clade, which come last. */
  clade: Clade | null;
  /** How many clades lie above this one: the heading's indent. */
  depth: number;
  /** "Rubiursus · genus", or "In no clade". */
  heading: string;
  species: Species[];
}

const bySortThenName = (a: Species, b: Species) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name);

/** A clade's depth: the clades above it. Stops on a missing parent and on a cycle. */
function depthOf(clade: Clade, byId: ReadonlyMap<string, Clade>): number {
  const seen = new Set<string>([clade.id]);
  let depth = 0;
  for (let at = clade.parentId; at !== null && !seen.has(at); ) {
    seen.add(at);
    const parent = byId.get(at);
    if (parent === undefined) break;
    depth++;
    at = parent.parentId;
  }
  return depth;
}

/**
 * The clades in tree order (a clade, then what lies inside it, siblings by the DM's order), so a nested clade's heading
 * follows its parent's. A clade whose parent is missing is taken as a root, and a cycle is cut where it closes.
 */
function treeOrder(clades: readonly Clade[]): Clade[] {
  const ids = new Set(clades.map((c) => c.id));
  const children = new Map<string | null, Clade[]>();
  for (const c of clades) {
    const key = c.parentId !== null && ids.has(c.parentId) ? c.parentId : null;
    children.set(key, [...(children.get(key) ?? []), c]);
  }
  const ordered: Clade[] = [];
  const seen = new Set<string>();
  const walk = (parent: string | null) => {
    for (const c of [...(children.get(parent) ?? [])].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      ordered.push(c);
      walk(c.id);
    }
  };
  walk(null);
  // A cycle has no root: what the walk did not reach is still listed, after the rest.
  for (const c of clades) if (!seen.has(c.id)) ordered.push(c);
  return ordered;
}

/**
 * The species of one kingdom (all of them when `kingdom` is null) under their clades, as the Field guide lists them:
 * only clades that hold a species directly get a heading, in tree order and indented by depth, and the species in no
 * clade come last under "In no clade". A species whose clade is gone counts as in no clade.
 */
export function groupSpecies(species: readonly Species[], clades: readonly Clade[], kingdom: Kingdom | null): SpeciesGroup[] {
  const shown = species.filter((s) => kingdom === null || s.kingdom === kingdom);
  const byId = new Map(clades.map((c) => [c.id, c]));
  const groups: SpeciesGroup[] = [];
  for (const clade of treeOrder(clades)) {
    const members = shown.filter((s) => s.cladeId === clade.id).sort(bySortThenName);
    if (members.length === 0) continue;
    groups.push({ clade, depth: depthOf(clade, byId), heading: clade.rank === null ? clade.name : `${clade.name} · ${clade.rank}`, species: members });
  }
  const loose = shown.filter((s) => s.cladeId === null || !byId.has(s.cladeId)).sort(bySortThenName);
  if (loose.length > 0) groups.push({ clade: null, depth: 0, heading: "In no clade", species: loose });
  return groups;
}

/** The mark at a row's right: "No stat block", "3 forms", "2 forms, 1 domesticated". */
export function speciesMark(forms: readonly SpeciesForm[]): string {
  if (forms.length === 0) return "No stat block";
  const count = forms.length === 1 ? "1 form" : `${forms.length} forms`;
  const kept = forms.filter((f) => f.domesticated).length;
  return kept === 0 ? count : `${count}, ${kept} domesticated`;
}

/** The label a form gets when the DM picks only a stat block. */
export const DEFAULT_FORM_LABEL = "Adult";

export interface StageInput {
  label: string;
  /** The stat block's id when one was picked, else null. */
  itemId: string | null;
}

/**
 * Splits the add-form line: the words before the picked mention are the stage's label ("Young @Rime_Cub" is Young, the
 * cub's stat block), "Adult" when only a stat block was picked. With nothing picked the whole line is the label, for a
 * stage that has no stat block yet. Null when the line holds no words and no pick.
 */
/** The longest stage label `campaign_species_forms_label_length` takes. */
export const FORM_LABEL_MAX = 40;

export function splitStageInput(text: string, pickedToken: string | null, pickedId: string | null): StageInput | null {
  const at = pickedToken === null ? -1 : text.indexOf(pickedToken);
  // A label past the column's limit is cut to it rather than refused by the database with a vague error.
  if (pickedId !== null && at >= 0) {
    const label = text.slice(0, at).trim().slice(0, FORM_LABEL_MAX).trim();
    return { label: label === "" ? DEFAULT_FORM_LABEL : label, itemId: pickedId };
  }
  const label = text.trim().slice(0, FORM_LABEL_MAX).trim();
  return label === "" ? null : { label, itemId: null };
}

export interface HabitatRoll {
  habitat: Habitat;
  /** What the species comes to on that habitat's roll, as a percent. */
  percent: number | null;
}

/**
 * Each habitat the species lives in, with the share of that habitat's roll the species comes to (the worked-out shares,
 * so a species whose forms the DM has not given a percent still shows what it is met at). A species listed in a habitat
 * with no form on its roll comes to 0.
 */
export function habitatRolls(
  speciesId: string,
  habitats: readonly Habitat[],
  habitatSpecies: readonly HabitatSpecies[],
  life: readonly HabitatLifeRow[],
  speciesById: ReadonlyMap<string, Species>,
): HabitatRoll[] {
  const rolls: HabitatRoll[] = [];
  for (const habitat of habitats) {
    if (!habitatSpecies.some((h) => h.habitatId === habitat.id && h.speciesId === speciesId)) continue;
    const here = habitatSpecies.filter((h) => h.habitatId === habitat.id);
    const rows = life.filter((l) => l.habitatId === habitat.id);
    const worked = workedOutShares({
      species: here.map((h) => ({ speciesId: h.speciesId, abundance: h.abundance, livesAs: speciesById.get(h.speciesId)?.livesAs ?? null })),
      life: rows.map((l) => ({ formId: l.formId, speciesId: l.speciesId, percent: l.percent })),
      otherPercent: habitat.otherPercent,
    });
    const ownForms = rows.filter((l) => l.speciesId === speciesId).map((l) => l.formId);
    // A species with no form on this roll (a plant, a pet's kin) is never met here: null, not a share of 0.
    rolls.push({ habitat, percent: ownForms.length === 0 ? null : speciesShare(worked.forms, ownForms) });
  }
  return rolls;
}
