import { computed } from "vue";
import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { useCampaignStore } from "@/stores/campaign";
import type { PartyInventoryItem, PartyInventoryInsert, PartyInventoryUpdate } from "@/types/inventory.types";

const QUERY_KEY = "party-inventory";

async function fetchInventory(campaignId: string): Promise<PartyInventoryItem[]> {
  const { data, error } = await supabase
    .from("party_inventory")
    .select("*")
    .eq("campaign_id", campaignId)
    .order("name", { ascending: true });
  if (error) throw error;
  return data as PartyInventoryItem[];
}

async function addItem(item: PartyInventoryInsert): Promise<PartyInventoryItem> {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("party_inventory")
    .insert({ ...item, user_id: user!.id })
    .select()
    .single();
  if (error) throw error;
  return data as PartyInventoryItem;
}

async function updateItem(id: string, update: PartyInventoryUpdate): Promise<PartyInventoryItem> {
  const { data, error } = await supabase
    .from("party_inventory")
    .update(update)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as PartyInventoryItem;
}

async function removeItem(id: string): Promise<void> {
  const { error } = await supabase.from("party_inventory").delete().eq("id", id);
  if (error) throw error;
}

export function usePartyInventory() {
  const campaign = useCampaignStore();
  const campaignId = computed(() => campaign.activeCampaignId);
  return useQuery({
    queryKey: computed(() => [QUERY_KEY, campaignId.value]),
    queryFn: () => fetchInventory(campaignId.value!),
    enabled: () => !!campaignId.value,
  });
}

export function useAddInventoryItem() {
  const queryClient = useQueryClient();
  const campaign = useCampaignStore();
  return useMutation({
    mutationFn: (item: Omit<PartyInventoryInsert, "campaign_id">) =>
      addItem({ ...item, campaign_id: campaign.activeCampaignId! }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY] }),
  });
}

export function useUpdateInventoryItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, update }: { id: string; update: PartyInventoryUpdate }) =>
      updateItem(id, update),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY] }),
  });
}

export function useRemoveInventoryItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: removeItem,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY] }),
  });
}
