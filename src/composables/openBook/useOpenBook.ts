import { computed, toValue, type MaybeRefOrGetter } from "vue";
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { OPEN_BOOK_KEY } from "@/lib/campaignLiveSync/registry";
import type { OpenBook } from "@/types/openBook.types";

/** The owner's settings for a book. Slug and title are always sent: an upsert's insert half needs both. */
export type OpenBookSettings = Pick<OpenBook, "slug" | "title"> &
  Partial<
    Pick<
      OpenBook,
      | "subtitle"
      | "cover_art"
      | "cover_image_url"
      | "leather"
      | "chapters"
      | "include_shared"
      | "allow_pdf"
      | "indexable"
    >
  >;

export function openBookKey(campaignId: string | null) {
  return [OPEN_BOOK_KEY, campaignId] as const;
}

/** The campaign's book row, or null while it has never been set up. Owner-only through RLS. */
export function useOpenBook(campaignId: MaybeRefOrGetter<string | null | undefined>) {
  const id = computed(() => toValue(campaignId) ?? null);
  return useQuery({
    queryKey: computed(() => openBookKey(id.value)),
    queryFn: async (): Promise<OpenBook | null> => {
      if (id.value === null) throw new Error("useOpenBook fetched without a campaign");
      const { data, error } = await supabase
        .from("open_books")
        .select("*")
        .eq("campaign_id", id.value)
        .maybeSingle();
      if (error) throw error;
      return data as OpenBook | null;
    },
    enabled: computed(() => id.value !== null),
  });
}

/** Creates the book on first save, edits it after. */
export function useSaveOpenBook() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ campaignId, settings }: { campaignId: string; settings: OpenBookSettings }) => {
      const { data, error } = await supabase
        .from("open_books")
        .upsert({ ...settings, campaign_id: campaignId }, { onConflict: "campaign_id" })
        .select()
        .single();
      if (error) throw error;
      return data as OpenBook;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [OPEN_BOOK_KEY] }),
  });
}

/** Closes the book (false) or reopens it (true). Reopening needs a live release; the database refuses without one. */
export function useSetOpenBookOpen() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ campaignId, isOpen }: { campaignId: string; isOpen: boolean }) => {
      const { data, error } = await supabase
        .from("open_books")
        .update({ is_open: isOpen })
        .eq("campaign_id", campaignId)
        .select()
        .single();
      if (error) throw error;
      return data as OpenBook;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [OPEN_BOOK_KEY] }),
  });
}

/** Makes an earlier release the one visitors read. */
export function usePutBackRelease() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ campaignId, releaseId }: { campaignId: string; releaseId: string }) => {
      const { data, error } = await supabase
        .from("open_books")
        .update({ live_release_id: releaseId })
        .eq("campaign_id", campaignId)
        .select()
        .single();
      if (error) throw error;
      return data as OpenBook;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [OPEN_BOOK_KEY] }),
  });
}
