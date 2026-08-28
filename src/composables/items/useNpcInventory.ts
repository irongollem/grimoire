import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { supabase, getCurrentUser } from "@/lib/supabase";
import { useCampaignStore } from "@/stores/campaign";
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

async function addItem(item: NpcInventoryInsert): Promise<NpcInventoryItem> {
  const user = getCurrentUser();
  const { data, error } = await supabase
    .from("npc_inventory")
    .insert({ ...item, user_id: user!.id })
    .select()
    .single();
  if (error) {
    // Unique (npc_id, item_id) violation — the NPC already holds this item;
    // merge into the existing stack instead of surfacing an error.
    if (error.code === "23505" && item.item_id) {
      const { data: existing, error: fetchError } = await supabase
        .from("npc_inventory")
        .select("id, quantity")
        .eq("npc_id", item.npc_id)
        .eq("item_id", item.item_id)
        .single();
      if (fetchError) throw fetchError;
      const { data: merged, error: updateError } = await supabase
        .from("npc_inventory")
        .update({ quantity: existing.quantity + (item.quantity ?? 1) })
        .eq("id", existing.id)
        .select()
        .single();
      if (updateError) throw updateError;
      return merged as NpcInventoryItem;
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
