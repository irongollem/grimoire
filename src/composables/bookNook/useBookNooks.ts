import { computed, isRef, ref, type Ref } from "vue";
import { useQuery, useMutation, useQueryClient, type QueryClient } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { nookFiles, removeNookImages } from "@/lib/bookNook/upload";
import { reportHandledError } from "@/lib/observability/sentry";
import { useCampaignStore } from "@/stores/campaign";
import type { BookNook, BookNookInsert, BookNookUpdate } from "@/types/bookNook.types";

/** Query-key root; the campaign channel refreshes it on a `book_nooks` ring (campaignLiveSync/registry.ts). */
export const BOOK_NOOKS_KEY = "book-nooks";

/** Thrown when a save finds the nook already saved by another tab since it was read. The studio shows it. */
export class StaleNookError extends Error {
  constructor(public readonly nookId: string) {
    super("This nook was saved somewhere else since you opened it. Reload it to carry on.");
    this.name = "StaleNookError";
  }
}

// Nooks are campaign-bound and DM-only, so every read names what it means: RLS is a ceiling, not a filter.

export async function fetchBookNooks(campaignId: string): Promise<BookNook[]> {
  const { data, error } = await supabase
    .from("book_nooks")
    .select("*")
    .eq("campaign_id", campaignId)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return data as BookNook[];
}

export async function fetchBookNook(id: string): Promise<BookNook> {
  const { data, error } = await supabase.from("book_nooks").select("*").eq("id", id).single();
  if (error) throw error;
  return data as BookNook;
}

// user_id is stamped by the column default (auth.uid()), never by the client.
export async function createBookNook(campaignId: string, nook: BookNookInsert): Promise<BookNook> {
  const { data, error } = await supabase
    .from("book_nooks")
    .insert({ ...nook, campaign_id: campaignId })
    .select()
    .single();
  if (error) throw error;
  return data as BookNook;
}

/**
 * Saves against the revision the caller read. The write matches `rev = current`, so a tab holding an older copy
 * matches no row and throws instead of overwriting the newer save.
 */
export async function saveBookNook(id: string, currentRev: number, update: BookNookUpdate): Promise<BookNook> {
  const { data, error } = await supabase
    .from("book_nooks")
    .update({ ...update, rev: currentRev + 1 })
    .eq("id", id)
    .eq("rev", currentRev)
    .select();
  if (error) throw error;
  const rows = data as BookNook[];
  if (rows.length > 0) return rows[0];
  // No row matched: either another tab saved first (the row is readable at a different rev) or the caller lost
  // the right to write it (RLS hides the row, or it is gone). Only the first is a stale copy.
  const { data: current, error: readError } = await supabase.from("book_nooks").select("rev").eq("id", id).maybeSingle();
  if (readError) throw readError;
  if (current && (current as { rev: number }).rev !== currentRev) throw new StaleNookError(id);
  throw new Error("You can no longer edit this nook.");
}

/** Deletes the nook and returns the row that went, so its files can follow. RLS decides who may delete. */
export async function deleteBookNook(id: string): Promise<Pick<BookNook, "id" | "campaign_id" | "scene" | "still_url">> {
  const { data, error } = await supabase.from("book_nooks").delete().eq("id", id).select("id, campaign_id, scene, still_url");
  if (error) throw error;
  const rows = data as Pick<BookNook, "id" | "campaign_id" | "scene" | "still_url">[];
  // RLS lets only the author or the campaign's owner delete; anyone else matches no row and gets no error.
  if (rows.length === 0) throw new Error("Only the nook's author or the campaign's owner can delete it.");
  return rows[0];
}

/** The active campaign's nooks, newest first. */
export function useBookNooks() {
  const campaign = useCampaignStore();
  const campaignId = computed(() => campaign.activeCampaignId);
  return useQuery({
    queryKey: computed(() => [BOOK_NOOKS_KEY, campaignId.value] as const),
    queryFn: ({ queryKey: [, cid] }) => {
      if (!cid) throw new Error("useBookNooks fetched without a campaign; enabled guarantees one");
      return fetchBookNooks(cid);
    },
    enabled: () => !!campaignId.value,
  });
}

export function useBookNook(id: string | null | Ref<string | null | undefined>) {
  const idRef = isRef(id) ? id : ref(id);
  return useQuery({
    queryKey: computed(() => [BOOK_NOOKS_KEY, "one", idRef.value] as const),
    queryFn: ({ queryKey: [, , nid] }) => {
      if (!nid) throw new Error("useBookNook fetched without an id; enabled guarantees one");
      return fetchBookNook(nid);
    },
    enabled: () => !!idRef.value,
  });
}

function invalidateAll(queryClient: QueryClient) {
  return queryClient.invalidateQueries({ queryKey: [BOOK_NOOKS_KEY] });
}

export function useCreateBookNook() {
  const queryClient = useQueryClient();
  const campaign = useCampaignStore();
  return useMutation({
    mutationFn: (nook: BookNookInsert) => {
      const campaignId = campaign.activeCampaignId;
      if (!campaignId) throw new Error("a nook was created without an active campaign");
      return createBookNook(campaignId, nook);
    },
    onSettled: () => invalidateAll(queryClient),
  });
}

export function useSaveBookNook() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, rev, update }: { id: string; rev: number; update: BookNookUpdate }) =>
      saveBookNook(id, rev, update),
    onSettled: () => invalidateAll(queryClient),
  });
}

export function useDeleteBookNook() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const gone = await deleteBookNook(id);
      // The row is gone, so a failed file removal is logged and never turned into a failed delete.
      try {
        const files = nookFiles(gone.scene, gone.still_url, id);
        // A place that showed this nook keeps its still as its own picture (`image_url` outlives `book_nook_id`);
        // a file any place still uses stays. If the check cannot be made, nothing is removed.
        const { data, error } = files.length
          ? await supabase.from("locations").select("image_url").eq("campaign_id", gone.campaign_id).in("image_url", files)
          : { data: [], error: null };
        if (error) throw error;
        const used = new Set((data as { image_url: string | null }[]).map((r) => r.image_url));
        await removeNookImages(files.filter((u) => !used.has(u)));
      } catch (e) {
        reportHandledError(e, "bookNook.removeFiles", { nookId: id });
      }
    },
    onSettled: () => invalidateAll(queryClient),
  });
}
