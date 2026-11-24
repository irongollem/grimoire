import { computed } from "vue";
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { toast } from "@/lib/toast";
import { CANON_KEY } from "@/lib/campaignLiveSync/registry";
import { queueCanonEmbedding } from "@/lib/canon/queueCanonEmbedding";
import { useCampaignStore } from "@/stores/campaign";

/** What the Deleted list shows of a trashed entry; the snapshot itself is only ever read by the restore. */
export interface CanonTrashRow {
  id: string;
  entry_id: string;
  part: string;
  title: string;
  deleted_at: string;
}

/** The campaign's trashed entries, newest first, scoped in the query (RLS bounds who may read, not which campaign). */
export async function fetchCanonTrash(campaignId: string): Promise<CanonTrashRow[]> {
  const { data, error } = await supabase
    .from("canon_trash")
    .select("id, entry_id, part, title, deleted_at")
    .eq("campaign_id", campaignId)
    .order("deleted_at", { ascending: false });
  if (error) throw error;
  return data as CanonTrashRow[];
}

/**
 * Bring a trashed entry back, with what hung off it, and queue its words for the by-meaning lookup again (a delete
 * dropped the vector). Answers the restored entry's id.
 */
export async function restoreCanonEntry(trashId: string): Promise<string> {
  const { data, error } = await supabase.rpc("restore_canon_entry", { p_trash_id: trashId });
  if (error) throw error;
  if (typeof data !== "string") throw new Error("restore_canon_entry answered without an entry");
  queueCanonEmbedding(data);
  return data;
}

/** The Deleted list. Under the canon key, so the doorbell (`canon_trash`) refreshes it; never polled. */
export function useCanonTrash() {
  const campaign = useCampaignStore();
  const campaignId = computed(() => campaign.activeCampaignId);
  return useQuery({
    queryKey: computed(() => [CANON_KEY, "trash", campaignId.value] as const),
    queryFn: ({ queryKey: [, , cid] }) => {
      if (cid === null) throw new Error("useCanonTrash fetched without a campaign");
      return fetchCanonTrash(cid);
    },
    enabled: computed(() => !!campaignId.value),
  });
}

/** Restore a trashed entry. A backstory whose character opened a new one meanwhile answers 23505 in words to show. */
export function useRestoreCanonEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: restoreCanonEntry,
    onSuccess: () => qc.invalidateQueries({ queryKey: [CANON_KEY] }),
    onError: (e) => toast.error(restoreErrorMessage(e)),
  });
}

/**
 * A restore the database refused in words: the 23505 "This character has a backstory again..." is written for the DM
 * (`fromError` only passes P0 codes through), so it is shown as it is.
 */
export function restoreErrorMessage(e: unknown): string {
  if (typeof e === "object" && e !== null && "code" in e && e.code === "23505" && "message" in e && typeof e.message === "string") return e.message;
  return toast.fromError(e);
}

/** Delete a trashed entry for good. The component asks first. */
export function useDeleteForGood() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (trashId: string) => {
      const { error } = await supabase.from("canon_trash").delete().eq("id", trashId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [CANON_KEY] }),
    onError: (e) => toast.error(toast.fromError(e)),
  });
}
