import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { supabase, getCurrentUser } from "@/lib/supabase";
import { useCampaignStore } from "@/stores/campaign";
import { inventoryItemRef } from "@/lib/inventory/itemRef";
import type { NpcInventoryItem, NpcInventoryInsert } from "@/types/npc-inventory.types";

const QUERY_KEY = "npc-inventory";

async function fetchNpcInventory(npcId: string): Promise<NpcInventoryItem[]> {
  const { data, error } = await supabase
    .from("npc_inventory")
    .select("*")
    .eq("npc_id", npcId)
    .order("name", { ascending: true });
  if (error) throw error;
  return data as NpcInventoryItem[];
}

/** Merge `qty` into an already-found stack rather than inserting a duplicate. */
async function mergeIntoExisting(existingId: string, existingQty: number, qty: number): Promise<NpcInventoryItem> {
  const { data: merged, error } = await supabase
    .from("npc_inventory")
    .update({ quantity: existingQty + qty })
    .eq("id", existingId)
    .select()
    .single();
  if (error) throw error;
  return merged as NpcInventoryItem;
}

async function addItem(item: NpcInventoryInsert): Promise<NpcInventoryItem> {
  const user = getCurrentUser();
  const ref = inventoryItemRef(item);

  // Proactive existing-row check for either reference kind. A DB-level
  // unique index only covers `(npc_id, item_id) where item_id is not null`
  // (migration 20260612000002) — there is no equivalent for library_item_id,
  // so a library-referenced stack can't rely on a 23505 to catch a duplicate
  // the way the vault-item path below still can.
  if (ref) {
    const column = item.item_id ? "item_id" : "library_item_id";
    const { data: existing, error: fetchError } = await supabase
      .from("npc_inventory")
      .select("id, quantity")
      .eq("npc_id", item.npc_id)
      .eq(column, ref)
      .maybeSingle();
    if (fetchError) throw fetchError;
    if (existing) return mergeIntoExisting(existing.id, existing.quantity, item.quantity ?? 1);
  }

  const { data, error } = await supabase
    .from("npc_inventory")
    .insert({ ...item, user_id: user!.id })
    .select()
    .single();
  if (error) {
    // Lost a race against a concurrent insert of the same vault item between
    // the check above and this insert — merge now instead of surfacing it.
    if (error.code === "23505" && item.item_id) {
      const { data: existing, error: fetchError } = await supabase
        .from("npc_inventory")
        .select("id, quantity")
        .eq("npc_id", item.npc_id)
        .eq("item_id", item.item_id)
        .single();
      if (fetchError) throw fetchError;
      return mergeIntoExisting(existing.id, existing.quantity, item.quantity ?? 1);
    }
    throw error;
  }
  return data as NpcInventoryItem;
}

async function removeItem(id: string): Promise<void> {
  const { error } = await supabase.from("npc_inventory").delete().eq("id", id);
  if (error) throw error;
}

export function useNpcInventory(npcId: string) {
  return useQuery({
    queryKey: [QUERY_KEY, npcId],
    queryFn: () => fetchNpcInventory(npcId),
    enabled: !!npcId,
  });
}

export function useAddNpcInventoryItem() {
  const queryClient = useQueryClient();
  const campaign = useCampaignStore();
  return useMutation({
    mutationFn: (item: Omit<NpcInventoryInsert, "campaign_id">) =>
      addItem({ ...item, campaign_id: campaign.activeCampaignId! }),
    onSuccess: (_data, vars) =>
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY, vars.npc_id] }),
  });
}

export function useRemoveNpcInventoryItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, npcId }: { id: string; npcId: string }) => {
      void npcId; // used only for cache invalidation
      return removeItem(id);
    },
    onSuccess: (_data, { npcId }) =>
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY, npcId] }),
  });
}
