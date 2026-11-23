import { computed } from "vue";
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { getCurrentUser, supabase } from "@/lib/supabase";
import { useCampaignStore } from "@/stores/campaign";
import { toast } from "@/lib/toast";
import { CANON_KEY } from "@/lib/campaignLiveSync/registry";
import { moveWithin } from "@/lib/canon/canonOrder";

/** One arc of the campaign's story (`canon_arcs`): a name and one line of what it is about. DM-only. */
export interface CanonArc {
  id: string;
  user_id: string;
  campaign_id: string;
  name: string;
  summary: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export type CanonArcPatch = Partial<Pick<CanonArc, "name" | "summary" | "sort_order">>;

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

export async function createCanonArc(campaignId: string, input: { name: string; summary?: string | null; sort_order?: number }): Promise<CanonArc> {
  const user = getCurrentUser();
  if (!user) throw new Error("Not authenticated");
  const { data, error } = await supabase
    .from("canon_arcs")
    .insert({ ...input, campaign_id: campaignId, user_id: user.id })
    .select()
    .single();
  if (error) throw error;
  return data as CanonArc;
}

export async function updateCanonArc(id: string, patch: CanonArcPatch): Promise<void> {
  // RLS answers a write it refuses with no error and no row; asking for the row back is how that is told from a save.
  const { data, error } = await supabase.from("canon_arcs").update(patch).eq("id", id).select("id");
  if (error) throw error;
  if (data.length === 0) throw new Error("That arc is gone, or you may not change it.");
}

/** Deleting an arc leaves its entries, in no arc (`on delete set null`). Asking first is the caller's. */
export async function deleteCanonArc(id: string): Promise<void> {
  const { error } = await supabase.from("canon_arcs").delete().eq("id", id);
  if (error) throw error;
}

/** The active campaign's arcs. Refreshed by the doorbell (`canon_arcs`). */
export function useCanonArcs() {
  const campaign = useCampaignStore();
  const campaignId = computed(() => campaign.activeCampaignId);
  return useQuery({
    queryKey: computed(() => [CANON_KEY, "arcs", campaignId.value] as const),
    queryFn: ({ queryKey: [, , cid] }) => {
      if (cid === null) throw new Error("useCanonArcs fetched without a campaign");
      return fetchCanonArcs(cid);
    },
    enabled: computed(() => !!campaignId.value),
  });
}

/** Add, rename, re-summarise, reorder and delete, all invalidating the canon so entries and arcs agree. */
export function useCanonArcActions() {
  const qc = useQueryClient();
  const campaign = useCampaignStore();
  const settle = () => qc.invalidateQueries({ queryKey: [CANON_KEY] });
  const onError = (e: unknown) => toast.error(toast.fromError(e));

  const add = useMutation({
    mutationFn: (input: { name: string; summary?: string | null; sort_order: number }) => {
      const cid = campaign.activeCampaignId;
      if (cid === null) throw new Error("useCanonArcActions added without a campaign");
      return createCanonArc(cid, input);
    },
    onSuccess: settle,
    onError,
  });
  const update = useMutation({ mutationFn: ({ id, patch }: { id: string; patch: CanonArcPatch }) => updateCanonArc(id, patch), onSuccess: settle, onError });
  const remove = useMutation({ mutationFn: (id: string) => deleteCanonArc(id), onSuccess: settle, onError });
  const move = useMutation({
    mutationFn: ({ arcs, id, direction }: { arcs: readonly CanonArc[]; id: string; direction: -1 | 1 }) =>
      Promise.all(moveWithin(arcs, id, direction).map((w) => updateCanonArc(w.id, { sort_order: w.sort_order }))),
    onSuccess: settle,
    onError,
  });
  return { add, update, remove, move };
}
