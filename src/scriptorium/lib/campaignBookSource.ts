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
import { LOCATION_TYPE_LABELS, type LocationType } from "@/types/location.types";
import type { OpenBookSnapshot } from "@/types/openBook.types";
import type { BookSource, SourceEntry, SourcePlace } from "@/scriptorium/lib/canonBook";

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

/** The DM's book draws on everything the campaign holds. */
export async function fetchDmBookSource(campaignId: string): Promise<BookSource> {
  const named = (table: "factions" | "pantheons" | "monsters" | "items" | "spells") =>
    rows<{ id: string; name: string }>(supabase.from(table).select("id, name").eq("campaign_id", campaignId).order("name", { ascending: true }));
  const [canon, places, folk, factions, pantheons, deities, quests, monsters, items, spells] = await Promise.all([
    fetchCanonEntries(campaignId),
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
  const part = (p: string) => canon.filter((e) => e.part === p);
  return {
    premise: part("premise").map(entry),
    truths: part("truth").filter((e) => e.knowledge === "all").map(entry),
    lore: part("lore").map((e) => ({ id: e.id, title: e.title, world_year: e.world_year, world_month: e.world_month, world_day: e.world_day })),
    forces: part("force").map(entry),
    secrets: part("secret").map(entry),
    questions: part("question").map(entry),
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
