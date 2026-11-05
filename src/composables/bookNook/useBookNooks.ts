import { computed, isRef, ref, type Ref } from "vue";
import { useQuery, useMutation, useQueryClient, type QueryClient } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
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
  if (rows.length === 0) throw new StaleNookError(id);
  return rows[0];
}

export async function deleteBookNook(id: string): Promise<void> {
  const { error } = await supabase.from("book_nooks").delete().eq("id", id);
  if (error) throw error;
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
    mutationFn: deleteBookNook,
    onSettled: () => invalidateAll(queryClient),
  });
}
