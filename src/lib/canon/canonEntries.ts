import { supabase } from "@/lib/supabase";
import type { CanonEntry } from "@/types/canon.types";

/** The campaign's whole canon, scoped in the query: RLS bounds who may read, it does not choose which campaign. */
export async function fetchCanonEntries(campaignId: string): Promise<CanonEntry[]> {
  const { data, error } = await supabase
    .from("canon_entries")
    .select("*")
    .eq("campaign_id", campaignId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data as CanonEntry[];
}
