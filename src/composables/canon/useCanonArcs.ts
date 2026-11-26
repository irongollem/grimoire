import { computed } from "vue";
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { getCurrentUser, supabase } from "@/lib/supabase";
import { useCampaignStore } from "@/stores/campaign";
import { toast } from "@/lib/toast";
import { CANON_KEY } from "@/lib/campaignLiveSync/registry";
import { moveWithin } from "@/lib/canon/canonOrder";
import { fetchCanonArcs } from "@/lib/canon/canonArcReads";

/** One arc of the campaign's story (`canon_arcs`): a name and one line of what it is about. DM-only. */
export interface CanonArc {
  id: string;
  user_id: string;
  campaign_id: string;
  name: string;
  summary: string | null;
  sort_order: number;
  /** Planned, running or ended (#1258); an ending is written only once it has ended. */
  status: "planned" | "running" | "ended";
  /** The dramatic question the arc asks, what is at stake, and how it ended. */
  question: string | null;
  stakes: string | null;
  ending: string | null;
  /** The premise theme line the arc carries. */
  theme_id: string | null;
  /** When the DM said "Leave it" to the arc as a loose end (#1279); Tonight and the read-through skip it. */
  loose_end_left_at: string | null;
  created_at: string;
  updated_at: string;
}

export type CanonArcStatus = CanonArc["status"];

export type CanonArcPatch = Partial<Pick<CanonArc, "name" | "summary" | "sort_order" | "status" | "question" | "stakes" | "ending" | "theme_id">>;


/** What a new arc may be written with; an arc proposed by the AI arrives planned, with its question, stakes and theme. */
export type NewCanonArc = { name: string; summary?: string | null; sort_order?: number } & Partial<Pick<CanonArc, "status" | "question" | "stakes" | "theme_id">>;

export async function createCanonArc(campaignId: string, input: NewCanonArc): Promise<CanonArc> {
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
export function useCanonArcs(enabled: () => boolean = () => true) {
  const campaign = useCampaignStore();
  const campaignId = computed(() => campaign.activeCampaignId);
  return useQuery({
    queryKey: computed(() => [CANON_KEY, "arcs", campaignId.value] as const),
    queryFn: ({ queryKey: [, , cid] }) => {
      if (cid === null) throw new Error("useCanonArcs fetched without a campaign");
      return fetchCanonArcs(cid);
    },
    enabled: computed(() => !!campaignId.value && enabled()),
  });
}

/** Add, rename, re-summarise, reorder and delete, all invalidating the canon so entries and arcs agree. */
export function useCanonArcActions() {
  const qc = useQueryClient();
  const campaign = useCampaignStore();
  const settle = () => qc.invalidateQueries({ queryKey: [CANON_KEY] });
  const onError = (e: unknown) => toast.error(toast.fromError(e));

  const add = useMutation({
    mutationFn: (input: NewCanonArc & { sort_order: number }) => {
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
