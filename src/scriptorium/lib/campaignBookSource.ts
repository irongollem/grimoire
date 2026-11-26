/*
 * Where a book drawn from the campaign reads from (#1226 story 8). Two readers, one
 * `BookSource` shape (canonBook.ts):
 *
 *  - the DM's book reads the DM's own tables, each scoped to the campaign in the query
 *    (RLS bounds who may read, it does not choose the campaign) and throwing on error;
 *  - a players' book reads the Open Book's whole-party snapshot, `preview_open_book`:
 *    the one rule for what every player at the table may read. It is not restated
 *    here, so a players' book can never hold more than the Open Book would print.
 *    The snapshot has no monsters, items or spells, so a players' book has no
 *    bestiary or treasures.
 */
import { supabase } from "@/lib/supabase";
import { fetchCanonEntries } from "@/lib/canon/canonEntries";
import {
  fetchCanonArcs,
  fetchClades,
  fetchHabitats,
  fetchHabitatSpecies,
  fetchPeoples,
  fetchSpecies,
  fetchSpeciesForms,
  fetchSpeciesLinks,
  fetchStatBlockNames,
  fetchHabitatLife,
} from "@/lib/canon/canonCampaignReads";
import { getCalendarAdapter } from "@/settings";
import { tiptapToPlainText } from "@/lib/tiptap/tiptapText";
import type { CurrencyConfig } from "@/lib/currency/currency";
import type { SettingCalendarDef } from "@/settings/types";
import { LOCATION_TYPE_LABELS, type LocationType } from "@/types/location.types";
import type { OpenBookSnapshot } from "@/types/openBook.types";
import type { BookSource, SourceEntry, SourcePlace, SourceWorldRules } from "@/scriptorium/lib/canonBook";

function isLocationType(value: string | null): value is LocationType {
  return value !== null && value in LOCATION_TYPE_LABELS;
}

async function rows<T>(read: PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T[]> {
  const { data, error } = await read;
  if (error) throw error;
  return data as T[];
}

function entry(row: { id: string; title: string }): SourceEntry {
  return { id: row.id, title: row.title };
}

/** The campaign's calendar and coins, when it has chosen them: the facts "How the world works" holds. */
async function fetchWorldRules(campaignId: string): Promise<SourceWorldRules> {
  const { data, error } = await supabase.from("campaigns").select("calendar_id, custom_calendar, currency").eq("id", campaignId).single();
  if (error) throw error;
  const row = data as { calendar_id: string | null; custom_calendar: SettingCalendarDef | null; currency: CurrencyConfig | null };
  // A campaign that never chose a calendar is read as the blank one, which says nothing worth printing.
  const calendar = row.calendar_id === null ? null : getCalendarAdapter(row.calendar_id, row.custom_calendar);
  return {
    calendar: calendar ? { name: calendar.name, epoch: calendar.epochName, months: calendar.months.map((m) => m.name) } : null,
    coins: (row.currency?.denominations ?? []).map((d) => d.name),
  };
}

/** The DM's book draws on everything the campaign holds. */
export async function fetchDmBookSource(campaignId: string): Promise<BookSource> {
  const named = (table: "factions" | "pantheons" | "monsters" | "items" | "spells") =>
    rows<{ id: string; name: string }>(supabase.from(table).select("id, name").eq("campaign_id", campaignId).order("name", { ascending: true }));
  const [canon, arcs, peoples, habitats, clades, species, forms, links, habitatSpecies, habitatLife, world, places, folk, factions, pantheons, deities, quests, monsters, items, spells] = await Promise.all([
    fetchCanonEntries(campaignId),
    fetchCanonArcs(campaignId),
    fetchPeoples(campaignId),
    fetchHabitats(campaignId),
    fetchClades(campaignId),
    fetchSpecies(campaignId),
    fetchSpeciesForms(campaignId),
    fetchSpeciesLinks(campaignId),
    fetchHabitatSpecies(campaignId),
    fetchHabitatLife(campaignId),
    fetchWorldRules(campaignId),
    rows<SourcePlace>(supabase.from("locations").select("id, parent_id, name, location_type, sort_order").eq("campaign_id", campaignId)),
    rows<BookSource["folk"][number]>(supabase.from("npcs").select("id, name, location_id").eq("campaign_id", campaignId)),
    named("factions"),
    named("pantheons"),
    rows<BookSource["deities"][number]>(supabase.from("deities").select("id, name, pantheon_id").eq("campaign_id", campaignId).order("name", { ascending: true })),
    rows<{ id: string; title: string }>(supabase.from("quests").select("id, title").eq("campaign_id", campaignId).order("title", { ascending: true })),
    named("monsters"),
    named("items"),
    named("spells"),
  ]);
  // A form's stat block name, for a link that narrows to a form; one this reader cannot read is absent and so null.
  const blockNames = await fetchStatBlockNames(
    forms.flatMap((f) => (f.monsterId === null ? [] : [f.monsterId])),
    forms.flatMap((f) => (f.libraryMonsterId === null ? [] : [f.libraryMonsterId])),
  );
  const part = (p: string) => canon.filter((e) => e.part === p);
  return {
    premise: part("premise").map(entry),
    truths: part("truth").filter((e) => e.knowledge === "all").map(entry),
    lore: part("lore").map((e) => ({ id: e.id, title: e.title, world_year: e.world_year, world_month: e.world_month, world_day: e.world_day })),
    forces: part("force").map(entry),
    secrets: part("secret").map(entry),
    questions: part("question").map(entry),
    arcs: arcs.map((a) => ({ id: a.id, name: a.name, summary: a.summary, question: a.question, stakes: a.stakes, ending: a.ending })),
    peoples: peoples.map((x) => ({ id: x.id, name: x.name, percent: x.percent, text: tiptapToPlainText(x.body) })),
    habitats: habitats.map((x) => ({ id: x.id, name: x.name, text: tiptapToPlainText(x.description), otherPercent: x.otherPercent })),
    clades,
    species: species.map(({ description, ...rest }) => ({ ...rest, text: tiptapToPlainText(description) })),
    forms,
    links,
    habitatSpecies,
    habitatLife: habitatLife.map((l) => ({ habitatId: l.habitatId, speciesId: l.speciesId, formId: l.formId, percent: l.percent })),
    statBlockNameByForm: new Map(forms.map((f) => [f.id, blockNames.get(f.monsterId ?? f.libraryMonsterId ?? "") ?? null])),
    backstories: part("backstory").map(entry),
    world,
    places,
    folk,
    factions,
    pantheons,
    deities,
    quests: quests.map(entry),
    monsters,
    items,
    spells,
  };
}

/** What a players' book holds of a snapshot: the whole party's places, folk, powers, lore and truths. */
export function sourceFromSnapshot(snapshot: OpenBookSnapshot): BookSource {
  return {
    premise: [],
    truths: snapshot.truths.map(entry),
    lore: snapshot.lore.map((l) => ({
      id: l.id,
      title: l.title,
      world_year: l.world_date?.year ?? null,
      world_month: l.world_date?.month ?? null,
      world_day: l.world_date?.day ?? null,
    })),
    forces: [],
    secrets: [],
    questions: [],
    // The Open Book does not say any of these: a players' book holds none of them.
    arcs: [],
    peoples: [],
    habitats: [],
    // An older Open Book snapshot has no field guide (and a players' book never holds one): a real absence, so none.
    clades: [],
    species: [],
    forms: [],
    links: [],
    habitatSpecies: [],
    habitatLife: [],
    statBlockNameByForm: new Map(),
    backstories: [],
    world: { calendar: null, coins: [] },
    places: snapshot.places.map((p) => ({
      id: p.id,
      parent_id: p.parent_id,
      name: p.name,
      location_type: isLocationType(p.location_type) ? p.location_type : "other",
      sort_order: null,
    })),
    folk: snapshot.folk.map((n) => ({ id: n.id, name: n.name, location_id: n.location_id })),
    factions: snapshot.factions.map((f) => ({ id: f.id, name: f.name })),
    pantheons: snapshot.pantheons.map((p) => ({ id: p.id, name: p.name })),
    deities: snapshot.deities.map((d) => ({ id: d.id, name: d.name, pantheon_id: d.pantheon_id })),
    quests: [],
    monsters: [],
    items: [],
    spells: [],
  };
}

/** The owner's read of what the whole party may read, or null when the campaign has no Open Book to say. */
export async function fetchWholePartySnapshot(campaignId: string): Promise<OpenBookSnapshot | null> {
  const { data, error } = await supabase.rpc("preview_open_book", { p_campaign_id: campaignId });
  if (error) throw error;
  return data as OpenBookSnapshot | null;
}

export async function fetchPlayersBookSource(campaignId: string): Promise<BookSource> {
  const snapshot = await fetchWholePartySnapshot(campaignId);
  if (snapshot === null) {
    throw new Error("A players' book follows the Open Book's rule for what the whole party may read. Set the campaign's Open Book up first.");
  }
  return sourceFromSnapshot(snapshot);
}
