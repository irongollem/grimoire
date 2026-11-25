import { supabase } from "@/lib/supabase";
import { UNREADABLE_PEOPLE, type People } from "@/lib/canon/peoples";
import type { Habitat } from "@/lib/canon/habitats";
import type { CanonArc } from "@/composables/canon/useCanonArcs";

/**
 * The campaign's arcs, peoples and habitats, read below the Vue layer: their composables query through these, and the
 * Scriptorium draws the canon as a book from them (`campaignBookSource.ts`), which `lib/` code may not do through a
 * composable.
 */

/** The campaign's arcs in the DM's order, scoped in the query: RLS bounds who may read, it does not choose the campaign. */
export async function fetchCanonArcs(campaignId: string): Promise<CanonArc[]> {
  const { data, error } = await supabase
    .from("canon_arcs")
    .select("*")
    .eq("campaign_id", campaignId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data as CanonArc[];
}

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
    readable: r.name !== null,
    percent: Number(r.percent),
    body: r.body,
  }));
}

interface HabitatRow {
  id: string;
  name: string;
  description: string | null;
  sort_order: number;
}

/** The campaign's habitats in the DM's order. Scoped to the campaign in the query: RLS only bounds who may read. */
export async function fetchHabitats(campaignId: string): Promise<Habitat[]> {
  const { data, error } = await supabase
    .from("campaign_habitats")
    .select("id, name, description, sort_order")
    .eq("campaign_id", campaignId)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data as HabitatRow[]).map((r) => ({ id: r.id, name: r.name, description: r.description, sortOrder: r.sort_order }));
}
