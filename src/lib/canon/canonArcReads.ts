import { supabase } from "@/lib/supabase";
import type { CanonArc } from "@/composables/canon/useCanonArcs";

/**
 * The campaign's arcs in the DM's order, scoped in the query: RLS bounds who may read, it does not choose the campaign.
 * On its own, not in `canonCampaignReads.ts`: the quest list reads the arcs, and the other canon reads (the field guide,
 * the habitats) are a chunk it must not load on navigation (the request budget, 27 Nov 2026).
 */
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
