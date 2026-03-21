import { computed } from "vue";
import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { supabase, getCurrentUser } from "@/lib/supabase";
import { useCampaignStore } from "@/stores/campaign";
import type { Companion, CompanionInsert, CompanionUpdate } from "@/types/companion.types";

const COMPANIONS_KEY = "companions";

async function fetchCompanions(campaignId: string): Promise<Companion[]> {
  const { data, error } = await supabase
    .from("companions")
    .select("*")
    .eq("campaign_id", campaignId)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return data as Companion[];
}

async function createCompanion(companion: CompanionInsert): Promise<Companion> {
  const user = getCurrentUser();
  const { data, error } = await supabase
    .from("companions")
    .insert({ ...companion, user_id: user!.id })
    .select()
    .single();
  if (error) throw error;
  return data as Companion;
}

async function updateCompanion(id: string, update: CompanionUpdate): Promise<Companion> {
  const { data, error } = await supabase
    .from("companions")
    .update(update)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as Companion;
}

async function deleteCompanion(id: string): Promise<void> {
  const { error } = await supabase.from("companions").delete().eq("id", id);
  if (error) throw error;
}

export function useCompanions() {
  const campaign = useCampaignStore();
  const campaignId = computed(() => campaign.activeCampaignId);
  return useQuery({
    queryKey: computed(() => [COMPANIONS_KEY, campaignId.value]),
    queryFn: () => fetchCompanions(campaignId.value!),
    enabled: () => !!campaignId.value,
  });
}

export function useCreateCompanion() {
  const queryClient = useQueryClient();
  const campaign = useCampaignStore();
  return useMutation({
    mutationFn: (companion: Omit<CompanionInsert, "campaign_id">) =>
      createCompanion({ ...companion, campaign_id: campaign.activeCampaignId! }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [COMPANIONS_KEY] }),
  });
}

export function useUpdateCompanion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, update }: { id: string; update: CompanionUpdate }) =>
      updateCompanion(id, update),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [COMPANIONS_KEY] }),
  });
}

export function useDeleteCompanion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteCompanion,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [COMPANIONS_KEY] }),
  });
}
