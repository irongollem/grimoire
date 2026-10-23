import { computed, toValue, type MaybeRefOrGetter } from "vue";
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { chunkArray } from "@/lib/utils";
import { OPEN_BOOK_ENTRIES_KEY, OPEN_BOOK_KEY } from "@/lib/campaignLiveSync/registry";
import type { OpenBookEntry, OpenBookEntityType } from "@/types/openBook.types";

/** Upserts go in groups this size; a delete's `in (...)` list rides the URL, so it is kept shorter. */
export const ENTRY_UPSERT_CHUNK = 500;
export const ENTRY_DELETE_CHUNK = 100;

export function openBookEntriesKey(campaignId: string | null) {
  return [OPEN_BOOK_ENTRIES_KEY, campaignId] as const;
}

/** Entries the DM put in or took out by hand; anything absent follows the book's default. */
export function useOpenBookEntries(campaignId: MaybeRefOrGetter<string | null | undefined>) {
  const id = computed(() => toValue(campaignId) ?? null);
  return useQuery({
    queryKey: computed(() => openBookEntriesKey(id.value)),
    queryFn: async (): Promise<OpenBookEntry[]> => {
      if (id.value === null) throw new Error("useOpenBookEntries fetched without a campaign");
      const { data, error } = await supabase
        .from("open_book_entries")
        .select("*")
        .eq("campaign_id", id.value);
      if (error) throw error;
      return data as OpenBookEntry[];
    },
    enabled: computed(() => id.value !== null),
  });
}

interface EntrySelection {
  campaignId: string;
  entityType: OpenBookEntityType;
  ids: readonly string[];
}

/** Puts entries in (`included: true`) or takes them out (`false`) by hand. */
export function useSetOpenBookEntries() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ campaignId, entityType, ids, included }: EntrySelection & { included: boolean }) => {
      for (const group of chunkArray([...new Set(ids)], ENTRY_UPSERT_CHUNK)) {
        const { error } = await supabase.from("open_book_entries").upsert(
          group.map((entity_id) => ({
            campaign_id: campaignId,
            entity_type: entityType,
            entity_id,
            included,
          })),
          { onConflict: "campaign_id,entity_type,entity_id" },
        );
        if (error) throw error;
      }
    },
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: [OPEN_BOOK_ENTRIES_KEY] }),
        queryClient.invalidateQueries({ queryKey: [OPEN_BOOK_KEY, "preview"] }),
      ]),
  });
}

/** Returns entries to the book's default by deleting the DM's choice for them. */
export function useClearOpenBookEntries() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ campaignId, entityType, ids }: EntrySelection) => {
      for (const group of chunkArray([...new Set(ids)], ENTRY_DELETE_CHUNK)) {
        const { error } = await supabase
          .from("open_book_entries")
          .delete()
          .eq("campaign_id", campaignId)
          .eq("entity_type", entityType)
          .in("entity_id", group);
        if (error) throw error;
      }
    },
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: [OPEN_BOOK_ENTRIES_KEY] }),
        queryClient.invalidateQueries({ queryKey: [OPEN_BOOK_KEY, "preview"] }),
      ]),
  });
}
