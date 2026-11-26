import { supabase } from "@/lib/supabase";
import { UNREADABLE_PEOPLE, type People } from "@/lib/canon/peoples";
import { UNREADABLE_CREATURE } from "@/lib/canon/shares";
import type { Habitat, HabitatLife } from "@/lib/canon/habitats";
import type { Abundance, Activity, Clade, HabitatSpecies, Kingdom, LinkKind, LivesAs, Species, SpeciesForm, SpeciesLink, SpeciesSeason, SpeciesYield } from "@/lib/canon/ecologyTypes";
import type { SeasonKind } from "@/types/calendar.types";

/**
 * The campaign's arcs, peoples and habitats, read below the Vue layer: their composables query through these, and the
 * Scriptorium draws the canon as a book from them (`campaignBookSource.ts`), which `lib/` code may not do through a
 * composable.
 */


interface NamedRow {
  id: string;
  percent: number;
  kind: People["kind"];
  record_id: string;
  from_library: boolean;
  /** Null when the record is not this reader's to read (a co-DM's own species): the row still counts. */
  name: string | null;
  own_name: string | null;
  record_name: string | null;
  body: string | null;
}

/** The campaign's peoples in the DM's order. Scoped to the campaign in the query: RLS only bounds who may read. */
export async function fetchPeoples(campaignId: string): Promise<People[]> {
  const { data, error } = await supabase
    .from("campaign_peoples_named")
    .select("id, percent, kind, record_id, from_library, name, own_name, record_name, body")
    .eq("campaign_id", campaignId)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data as NamedRow[]).map((r) => ({
    id: r.id,
    kind: r.kind,
    recordId: r.record_id,
    fromLibrary: r.from_library,
    name: r.name === null ? UNREADABLE_PEOPLE : r.name,
    ownName: r.own_name,
    recordName: r.record_name === null ? UNREADABLE_PEOPLE : r.record_name,
    // Readable is the record, not the name: a people's own name ("the Vell") fills `name` over a record this reader may not read.
    readable: r.record_name !== null,
    percent: Number(r.percent),
    body: r.body,
  }));
}

interface HabitatRow {
  id: string;
  name: string;
  description: string | null;
  other_percent: number | string | null;
  sort_order: number;
}

/** A habitat as read: with the DM's share for "anything else", or null to leave it to the generator. */

/** The campaign's habitats in the DM's order. Scoped to the campaign in the query: RLS only bounds who may read. */
export async function fetchHabitats(campaignId: string): Promise<Habitat[]> {
  const { data, error } = await supabase
    .from("campaign_habitats")
    .select("id, name, description, other_percent, sort_order")
    .eq("campaign_id", campaignId)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data as HabitatRow[]).map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    otherPercent: r.other_percent === null ? null : Number(r.other_percent),
    sortOrder: r.sort_order,
  }));
}

interface HabitatSpeciesRow {
  id: string;
  habitat_id: string;
  species_id: string;
  abundance: Abundance | null;
  sort_order: number;
}

/** The species living in each habitat of the campaign and how common each is there. */
export async function fetchHabitatSpecies(campaignId: string): Promise<HabitatSpecies[]> {
  const { data, error } = await supabase
    .from("campaign_habitat_species")
    .select("id, habitat_id, species_id, abundance, sort_order")
    .eq("campaign_id", campaignId)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data as HabitatSpeciesRow[]).map((r) => ({ id: r.id, habitatId: r.habitat_id, speciesId: r.species_id, abundance: r.abundance, sortOrder: r.sort_order }));
}

interface CladeRow {
  id: string;
  name: string;
  rank: string | null;
  parent_id: string | null;
  description: string | null;
  sort_order: number;
}

/** The field guide's clades, by order then name. */
export async function fetchClades(campaignId: string): Promise<Clade[]> {
  const { data, error } = await supabase
    .from("campaign_clades")
    .select("id, name, rank, parent_id, description, sort_order")
    .eq("campaign_id", campaignId)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw error;
  return (data as CladeRow[]).map((r) => ({ id: r.id, name: r.name, rank: r.rank, parentId: r.parent_id, description: r.description, sortOrder: r.sort_order }));
}

interface SpeciesRow {
  id: string;
  name: string;
  scientific_name: string | null;
  clade_id: string | null;
  kingdom: Kingdom;
  lives_as: LivesAs | null;
  activity: Activity | null;
  seasons: Partial<Record<SeasonKind, SpeciesSeason>>;
  description: string | null;
  sort_order: number;
}

/** The field guide's species, by order then name. */
export async function fetchSpecies(campaignId: string): Promise<Species[]> {
  const { data, error } = await supabase
    .from("campaign_species")
    .select("id, name, scientific_name, clade_id, kingdom, lives_as, activity, seasons, description, sort_order")
    .eq("campaign_id", campaignId)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw error;
  return (data as SpeciesRow[]).map((r) => ({
    id: r.id,
    name: r.name,
    scientificName: r.scientific_name,
    cladeId: r.clade_id,
    kingdom: r.kingdom,
    livesAs: r.lives_as,
    activity: r.activity,
    seasons: r.seasons,
    description: r.description,
    sortOrder: r.sort_order,
  }));
}

interface FormRow {
  id: string;
  species_id: string;
  label: string;
  stage_order: number;
  domesticated: boolean;
  monster_id: string | null;
  library_monster_id: string | null;
}

function toForm(r: FormRow): SpeciesForm {
  return { id: r.id, speciesId: r.species_id, label: r.label, stageOrder: r.stage_order, domesticated: r.domesticated, monsterId: r.monster_id, libraryMonsterId: r.library_monster_id };
}

const FORM_COLUMNS = "id, species_id, label, stage_order, domesticated, monster_id, library_monster_id";

/** Every form of the campaign's species, by species then stage. */
export async function fetchSpeciesForms(campaignId: string): Promise<SpeciesForm[]> {
  const { data, error } = await supabase
    .from("campaign_species_forms")
    .select(FORM_COLUMNS)
    .eq("campaign_id", campaignId)
    .order("species_id", { ascending: true })
    .order("stage_order", { ascending: true })
    .order("label", { ascending: true });
  if (error) throw error;
  return (data as FormRow[]).map(toForm);
}

/** One species' forms, scoped by campaign as well as species. */
export async function fetchFormsOfSpecies(campaignId: string, speciesId: string): Promise<SpeciesForm[]> {
  const { data, error } = await supabase
    .from("campaign_species_forms")
    .select(FORM_COLUMNS)
    .eq("campaign_id", campaignId)
    .eq("species_id", speciesId)
    .order("stage_order", { ascending: true });
  if (error) throw error;
  return (data as FormRow[]).map(toForm);
}

interface LinkRow {
  id: string;
  from_species_id: string;
  kind: LinkKind;
  to_species_id: string | null;
  from_form_id: string | null;
  to_form_id: string | null;
  habitat_id: string | null;
  note: string | null;
}

export async function fetchSpeciesLinks(campaignId: string): Promise<SpeciesLink[]> {
  const { data, error } = await supabase
    .from("campaign_species_links")
    .select("id, from_species_id, kind, to_species_id, from_form_id, to_form_id, habitat_id, note")
    .eq("campaign_id", campaignId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data as LinkRow[]).map((r) => ({
    id: r.id,
    fromSpeciesId: r.from_species_id,
    kind: r.kind,
    toSpeciesId: r.to_species_id,
    fromFormId: r.from_form_id,
    toFormId: r.to_form_id,
    habitatId: r.habitat_id,
    note: r.note,
  }));
}

interface YieldRow {
  id: string;
  species_id: string;
  item_id: string | null;
  library_item_id: string | null;
  note: string | null;
  sort_order: number;
}

export async function fetchSpeciesYields(campaignId: string): Promise<SpeciesYield[]> {
  const { data, error } = await supabase
    .from("campaign_species_yields")
    .select("id, species_id, item_id, library_item_id, note, sort_order")
    .eq("campaign_id", campaignId)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data as YieldRow[]).map((r) => ({ id: r.id, speciesId: r.species_id, itemId: r.item_id, libraryItemId: r.library_item_id, note: r.note, sortOrder: r.sort_order }));
}

/** The names of the stat blocks a set of forms point at; an id this reader cannot read is absent from the map (the caller reads that as null). */
export async function fetchStatBlockNames(monsterIds: readonly string[], libraryMonsterIds: readonly string[]): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  if (monsterIds.length > 0) {
    const { data, error } = await supabase.from("monsters").select("id, name").in("id", [...monsterIds]);
    if (error) throw error;
    for (const r of data as { id: string; name: string }[]) names.set(r.id, r.name);
  }
  if (libraryMonsterIds.length > 0) {
    const { data, error } = await supabase.from("library_monsters").select("id, name").in("id", [...libraryMonsterIds]);
    if (error) throw error;
    for (const r of data as { id: string; name: string }[]) names.set(r.id, r.name);
  }
  return names;
}

interface LifeRow {
  id: string;
  habitat_id: string;
  species_id: string;
  form_id: string;
  percent: number | string | null;
  sort_order: number;
  record_id: string | null;
  from_library: boolean | null;
  /** Null when the stat block is not this reader's to read (a co-DM's own), or the form has none: the row still counts toward the total. */
  name: string | null;
  species_name: string;
  form_label: string;
}

/** A habitat's roll, one row per form, read by name through the invoker view (#1283). */
export async function fetchHabitatLife(campaignId: string): Promise<HabitatLife[]> {
  const { data, error } = await supabase
    .from("campaign_habitat_life_named")
    .select("id, habitat_id, species_id, form_id, percent, sort_order, record_id, from_library, name, species_name, form_label")
    .eq("campaign_id", campaignId)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data as LifeRow[]).map((r) => ({
    id: r.id,
    habitatId: r.habitat_id,
    speciesId: r.species_id,
    formId: r.form_id,
    percent: r.percent === null ? null : Number(r.percent),
    sortOrder: r.sort_order,
    recordId: r.record_id,
    fromLibrary: r.from_library === true,
    // A form with a stat block this reader cannot read keeps a placeholder; a form with no stat block stays unnamed.
    name: r.name === null && r.record_id !== null ? UNREADABLE_CREATURE : r.name,
    readable: r.name !== null,
    speciesName: r.species_name,
    formLabel: r.form_label,
  }));
}
