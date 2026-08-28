import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { computed } from "vue";
import type { Ref } from "vue";
import { supabase, getCurrentUser } from "@/lib/supabase";
import type { ItemEntry, ItemEntryInsert, ItemEntryUpdate } from "@/types/item.types";

const QUERY_KEY = "item-entries";

async function fetchItemEntries(itemId: string, campaignId: string): Promise<ItemEntry[]> {
  const { data, error } = await supabase
    .from("item_entries")
    .select("*")
    .eq("item_id", itemId)
    .eq("campaign_id", campaignId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data as ItemEntry[];
}

/**
 * Writing appended to a document item (items.content is the DM-authored base
 * text). Scoped by both item and campaign: `item_id` alone is not enough
 * because a general item (campaign_id null on `items`) can in theory be
 * reused across campaigns, so the same item could carry entries written at
 * different tables. RLS already limits rows to campaigns the caller belongs
 * to; the `.eq("campaign_id", ...)` on top of that keeps one campaign's
 * ledger from bleeding into another's view of the same shared item.
 */
export function useItemEntries(itemId: Ref<string | undefined>, campaignId: Ref<string | undefined>) {
  return useQuery({
    queryKey: computed(() => [QUERY_KEY, itemId.value, campaignId.value]),
    queryFn: () => fetchItemEntries(itemId.value!, campaignId.value!),
    enabled: () => !!itemId.value && !!campaignId.value,
  });
}

async function addItemEntry(insert: ItemEntryInsert): Promise<ItemEntry> {
  const user = getCurrentUser();
  const { data, error } = await supabase
    .from("item_entries")
    .insert({ ...insert, user_id: user!.id })
    .select("*")
    .single();
  if (error) throw error;
  return data as ItemEntry;
}

async function updateItemEntry(id: string, update: ItemEntryUpdate): Promise<ItemEntry> {
  const { data, error } = await supabase
    .from("item_entries")
    .update(update)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return data as ItemEntry;
}

async function removeItemEntry(id: string): Promise<void> {
  const { error } = await supabase.from("item_entries").delete().eq("id", id);
  if (error) throw error;
}

/**
 * `party_member_id` is a required field on {@link ItemEntryInsert} rather than
 * resolved inside this mutation — the caller already knows which hand is
 * writing and this composable has no view into "the active campaign". A
 * player passes their own `auth.linkedPartyMemberId` (src/stores/auth.ts,
 * the same computed `useMyNpcPcNote` reads); the DM passes null. RLS
 * (`item_entries_insert`) re-derives and checks this server-side via
 * `private.my_party_member_id`, so a spoofed value is still denied — this is
 * a convenience default, not the authorization boundary.
 */
export function useAddItemEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: addItemEntry,
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY, vars.item_id, vars.campaign_id] });
    },
  });
}

export function useUpdateItemEntry(itemId: Ref<string | undefined>, campaignId: Ref<string | undefined>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, update }: { id: string; update: ItemEntryUpdate }) =>
      updateItemEntry(id, update),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY, itemId.value, campaignId.value] });
    },
  });
}

export function useDeleteItemEntry(itemId: Ref<string | undefined>, campaignId: Ref<string | undefined>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: removeItemEntry,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY, itemId.value, campaignId.value] });
    },
  });
}
