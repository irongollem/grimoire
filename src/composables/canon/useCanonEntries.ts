import type { AiProvenance } from "@/ai/provenance";
import { computed, toValue, type MaybeRefOrGetter } from "vue";
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { getCurrentUser, supabase } from "@/lib/supabase";
import { useCampaignStore } from "@/stores/campaign";
import { toast } from "@/lib/toast";
import { fetchCanonEntries } from "@/lib/canon/canonEntries";
import { queueCanonEmbedding } from "@/lib/canon/queueCanonEmbedding";
import { restoreCanonEntry, restoreErrorMessage } from "@/composables/canon/useCanonTrash";
import { CANON_KEY } from "@/lib/campaignLiveSync/registry";
import type { CanonEntry, KnowledgeMark, LoreKind, PremiseKind } from "@/types/canon.types";

export { CANON_KEY };

/**
 * What a new entry needs. A premise row must name its kind and a truth its knowledge mark: the table refuses either
 * without it (check constraints, 23514), so the type refuses it first.
 */
export type NewCanonEntry =
  | {
      part: "premise";
      premise_kind: PremiseKind;
      title?: string;
      body?: string | null;
      player_visible_to?: string[];
      sort_order?: number;
      /** Pictures of the look (look entry only, at most four). */
      reference_images?: string[];
      /** Set when the entry came from an accepted AI suggestion. */
      ai_provenance?: AiProvenance | null;
    }
  | {
      part: "truth";
      knowledge: KnowledgeMark;
      title: string;
      body?: string | null;
      sort_order?: number;
      ai_provenance?: AiProvenance | null;
      /** The table fact this truth was made from; the database lets one fact make one truth. */
      from_fact_id?: string | null;
      /** The habitat this truth belongs to, a note on the living world (the Life part). */
      habitat_id?: string | null;
    }
  | { part: "force"; title: string; wants?: string | null; clock_size?: number | null; sort_order?: number; ai_provenance?: AiProvenance | null }
  | { part: "secret"; title: string; sort_order?: number; ai_provenance?: AiProvenance | null }
  | { part: "question"; title: string; sort_order?: number; ai_provenance?: AiProvenance | null }
  | { part: "lore"; title: string; lore_kind?: LoreKind | null; sort_order?: number; ai_provenance?: AiProvenance | null };

/**
 * A change to an entry. `ai_provenance` is written only when an accepted suggestion replaces the text; an edit by the
 * DM never sends it, and the database marks an AI-written entry edited when its words change
 * (`private.canon_entries_mark_edited`).
 */
export type CanonEntryPatch = Partial<Pick<CanonEntry, "title" | "body" | "knowledge" | "player_visible_to" | "sort_order" | "ai_provenance" | "revealed_at" | "revealed_session_id" | "wants" | "if_succeeds" | "clock_size" | "image_url" | "reference_images" | "lore_kind" | "world_year" | "world_month" | "world_day" | "closed_as" | "closed_at" | "closed_note" | "became_entry_id" | "arc_id">>;

export async function createCanonEntry(campaignId: string, input: NewCanonEntry): Promise<CanonEntry> {
  const user = getCurrentUser();
  if (!user) throw new Error("Not authenticated");
  const { data, error } = await supabase
    .from("canon_entries")
    .insert({ ...input, campaign_id: campaignId, user_id: user.id })
    .select()
    .single();
  if (error) throw error;
  const created = data as CanonEntry;
  // The by-meaning lookup reads the entry's words; a new entry has no vector until it is queued (#1226).
  queueCanonEmbedding(created.id);
  return created;
}

/** The columns an entry's embed text is built from; the rest of a patch never changes its vector. */
const EMBEDDED_COLUMNS = ["title", "body", "wants"] as const;

export async function updateCanonEntry(id: string, patch: CanonEntryPatch): Promise<void> {
  // RLS answers a write it refuses with no error and no row; asking for the row back is how that is told from a save.
  const { data, error } = await supabase.from("canon_entries").update(patch).eq("id", id).select("id");
  if (error) throw error;
  if (data.length === 0) throw new Error("That entry is gone, or you may not change it.");
  if (EMBEDDED_COLUMNS.some((column) => column in patch)) queueCanonEmbedding(id);
}

/**
 * Take back an entry this tab made a moment ago and could not finish (a truth whose force could not be closed): gone for
 * good, never to the Deleted list, because the DM never saw it. A failure throws.
 */
export async function discardCanonEntry(id: string): Promise<void> {
  const { error } = await supabase.from("canon_entries").delete().eq("id", id);
  if (error) throw error;
}

/**
 * Delete an entry the way the page does: it goes to the Deleted list for thirty days with everything hanging off it
 * (`trash_canon_entry`, #1255 item 17). Answers the trash row's id, which Restore takes.
 */
export async function trashCanonEntry(id: string): Promise<string> {
  const { data, error } = await supabase.rpc("trash_canon_entry", { p_entry_id: id });
  if (error) throw error;
  if (typeof data !== "string") throw new Error("trash_canon_entry answered without a trash row");
  return data;
}

/** Every canon entry of the active campaign, in the DM's order. Refreshed by the doorbell (`canon_entries`). */
export function useCanonEntries({ enabled = true }: { enabled?: MaybeRefOrGetter<boolean> } = {}) {
  const campaign = useCampaignStore();
  const campaignId = computed(() => campaign.activeCampaignId);
  return useQuery({
    queryKey: computed(() => [CANON_KEY, campaignId.value] as const),
    queryFn: ({ queryKey: [, cid] }) => {
      if (cid === null) throw new Error("useCanonEntries fetched without a campaign");
      return fetchCanonEntries(cid);
    },
    enabled: computed(() => !!campaignId.value && toValue(enabled)),
  });
}

export function useCreateCanonEntry() {
  const qc = useQueryClient();
  const campaign = useCampaignStore();
  return useMutation({
    mutationFn: (input: NewCanonEntry) => {
      const cid = campaign.activeCampaignId;
      if (cid === null) throw new Error("useCreateCanonEntry called without a campaign");
      return createCanonEntry(cid, input);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [CANON_KEY] }),
    onError: (e) => toast.error(toast.fromError(e)),
  });
}

/** Create a canon entry in the campaign captured before an asynchronous workflow. */
export function useCreateCanonEntryInCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ campaignId, input }: { campaignId: string; input: NewCanonEntry }) => createCanonEntry(campaignId, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: [CANON_KEY] }),
    onError: (e) => toast.error(toast.fromError(e)),
  });
}

export function useUpdateCanonEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: CanonEntryPatch }) => updateCanonEntry(id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: [CANON_KEY] }),
    onError: (e) => toast.error(toast.fromError(e)),
  });
}

export function useTrashCanonEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => trashCanonEntry(id),
    onSuccess: (trashId) => {
      void qc.invalidateQueries({ queryKey: [CANON_KEY] });
      toast.info("Moved to Deleted for thirty days.", undefined, {
        action: {
          label: "Undo",
          run: () => {
            restoreCanonEntry(trashId)
              .then(() => qc.invalidateQueries({ queryKey: [CANON_KEY] }))
              .catch((e: unknown) => toast.error(restoreErrorMessage(e)));
          },
        },
      });
    },
    onError: (e) => toast.error(toast.fromError(e)),
  });
}
