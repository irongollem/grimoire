import { computed, type Ref } from "vue";
import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { supabase, getCurrentUser } from "@/lib/supabase";
import { useCampaignStore } from "@/stores/campaign";
import type { LootTable, LootTableInsert, LootTableUpdate } from "@/types/lootTable.types";

const QUERY_KEY = "loot_tables";

async function fetchLootTables(campaignId: string | null): Promise<LootTable[]> {
  let q = supabase.from("loot_tables").select("*").order("name", { ascending: true });
  if (campaignId) q = q.or(`campaign_id.eq.${campaignId},campaign_id.is.null`);
  else q = q.is("campaign_id", null);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as LootTable[];
}

async function fetchLootTable(id: string): Promise<LootTable> {
  const { data, error } = await supabase.from("loot_tables").select("*").eq("id", id).single();
  if (error) throw error;
  return data as LootTable;
}

async function createLootTable(table: LootTableInsert): Promise<LootTable> {
  const user = getCurrentUser();
  const { data, error } = await supabase
    .from("loot_tables")
    .insert({ ...table, user_id: user!.id })
    .select()
    .single();
  if (error) throw error;
  return data as LootTable;
}

async function updateLootTable(id: string, update: LootTableUpdate): Promise<LootTable> {
  const { data, error } = await supabase
    .from("loot_tables")
    .update(update)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as LootTable;
}

async function deleteLootTable(id: string): Promise<void> {
  const { error } = await supabase.from("loot_tables").delete().eq("id", id);
  if (error) throw error;
}

// ── Composables ─────────────────────────────────────────────────────────────

export function useLootTables() {
  const campaign = useCampaignStore();
  const campaignId = computed(() => campaign.activeCampaignId);
  return useQuery({
    queryKey: computed(() => [QUERY_KEY, campaignId.value]),
    queryFn: () => fetchLootTables(campaignId.value),
    staleTime: 30_000,
  });
}

export function useLootTable(id: Ref<string>) {
  return useQuery({
    queryKey: computed(() => [QUERY_KEY, id.value]),
    queryFn: () => fetchLootTable(id.value),
    enabled: () => !!id.value,
  });
}

export function useCreateLootTable() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createLootTable,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY] }),
  });
}

export function useUpdateLootTable() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, update }: { id: string; update: LootTableUpdate }) => updateLootTable(id, update),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY, id] });
    },
  });
}

export function useDeleteLootTable() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteLootTable,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY] }),
  });
}
