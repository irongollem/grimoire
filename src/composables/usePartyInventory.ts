import { computed, watch, onUnmounted } from "vue";
import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { supabase, getCurrentUser } from "@/lib/supabase";
import { useCampaignStore } from "@/stores/campaign";
import type { PartyInventoryItem, PartyInventoryInsert, PartyInventoryUpdate } from "@/types/inventory.types";

const QUERY_KEY = "party-inventory";

async function fetchInventory(campaignId: string): Promise<PartyInventoryItem[]> {
  const { data, error } = await supabase
    .from("party_inventory")
    .select("*")
    .eq("campaign_id", campaignId)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw error;
  return data as PartyInventoryItem[];
}

async function addItem(item: PartyInventoryInsert): Promise<PartyInventoryItem> {
  const user = getCurrentUser();
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
  const campaign = useCampaignStore();
  return useMutation({
    mutationFn: ({ id, update }: { id: string; update: PartyInventoryUpdate }) =>
      updateItem(id, update),
    onMutate: async ({ id, update }) => {
      const qk = [QUERY_KEY, campaign.activeCampaignId];
      await queryClient.cancelQueries({ queryKey: qk });
      const previous = queryClient.getQueryData<PartyInventoryItem[]>(qk);
      queryClient.setQueryData<PartyInventoryItem[]>(qk, (old) =>
        old ? old.map(item => item.id === id ? { ...item, ...update } : item) : old,
      );
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) queryClient.setQueryData([QUERY_KEY, campaign.activeCampaignId], ctx.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY] }),
  });
}

export function useRemoveInventoryItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: removeItem,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY] }),
  });
}

export function useInventoryLive() {
  const campaign = useCampaignStore();
  const queryClient = useQueryClient();
  const uid = Math.random().toString(36).slice(2, 8);
  let channel: ReturnType<typeof supabase.channel> | null = null;

  watch(
    () => campaign.activeCampaignId,
    (campaignId) => {
      if (channel) { supabase.removeChannel(channel); channel = null; }
      if (!campaignId) return;
      channel = supabase
        .channel(`party_inventory_live:${campaignId}:${uid}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "party_inventory",
          filter: `campaign_id=eq.${campaignId}` },
          () => { void queryClient.invalidateQueries({ queryKey: [QUERY_KEY] }); },
        )
        .subscribe();
    },
    { immediate: true },
  );

  onUnmounted(() => {
    if (channel) { supabase.removeChannel(channel); channel = null; }
  });
}

export function useReorderInventoryItems() {
  const queryClient = useQueryClient();
  const campaign = useCampaignStore();
  return useMutation({
    mutationFn: async (updates: Array<{ id: string; sort_order: number }>) => {
      await Promise.all(updates.map(({ id, sort_order }) => updateItem(id, { sort_order })));
    },
    onMutate: async (updates) => {
      const qk = [QUERY_KEY, campaign.activeCampaignId];
      await queryClient.cancelQueries({ queryKey: qk });
      const previous = queryClient.getQueryData<PartyInventoryItem[]>(qk);
      queryClient.setQueryData<PartyInventoryItem[]>(qk, (old) => {
        if (!old) return old;
        const orderMap = new Map(updates.map(u => [u.id, u.sort_order]));
        return old
          .map(item => orderMap.has(item.id) ? { ...item, sort_order: orderMap.get(item.id)! } : item)
          .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
      });
      return { previous };
    },
    onError: (_e, _u, ctx) => {
      if (ctx?.previous) queryClient.setQueryData([QUERY_KEY, campaign.activeCampaignId], ctx.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY] }),
  });
}
