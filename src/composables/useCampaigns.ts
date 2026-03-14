import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import type { Campaign, CampaignInsert, CampaignUpdate } from "@/types/campaign.types";

// All campaign-scoped tables whose orphaned rows (campaign_id IS NULL) can be claimed
const CAMPAIGN_SCOPED_TABLES = [
  "notes",
  "calendar_events",
  "party_members",
  "encounters",
  "npcs",
] as const;

const QUERY_KEY = "campaigns";

async function fetchCampaigns(): Promise<Campaign[]> {
  const { data, error } = await supabase
    .from("campaigns")
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return data as Campaign[];
}

async function createCampaign(campaign: CampaignInsert): Promise<Campaign> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("campaigns")
    .insert({ ...campaign, user_id: user!.id })
    .select()
    .single();
  if (error) throw error;
  return data as Campaign;
}

async function updateCampaign(id: string, update: CampaignUpdate): Promise<Campaign> {
  const { data, error } = await supabase
    .from("campaigns")
    .update(update)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as Campaign;
}

async function deleteCampaign(id: string): Promise<void> {
  const { error } = await supabase.from("campaigns").delete().eq("id", id);
  if (error) throw error;
}

/** Assigns all orphaned rows (campaign_id IS NULL) owned by the current user to the given campaign. */
async function claimOrphanedData(campaignId: string): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const userId = user!.id;

  await Promise.all(
    CAMPAIGN_SCOPED_TABLES.map((table) =>
      supabase
        .from(table)
        .update({ campaign_id: campaignId })
        .eq("user_id", userId)
        .is("campaign_id", null),
    ),
  );
}

export function useCampaigns() {
  return useQuery({ queryKey: [QUERY_KEY], queryFn: fetchCampaigns });
}

export function useCreateCampaign() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createCampaign,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY] }),
  });
}

export function useUpdateCampaign() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, update }: { id: string; update: CampaignUpdate }) =>
      updateCampaign(id, update),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY] }),
  });
}

export function useDeleteCampaign() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteCampaign,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY] }),
  });
}

export function useClaimOrphanedData() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: claimOrphanedData,
    onSuccess: () => {
      // Invalidate all campaign-scoped queries so they reload with the claimed data
      queryClient.invalidateQueries({ queryKey: ["notes"] });
      queryClient.invalidateQueries({ queryKey: ["calendar-events"] });
      queryClient.invalidateQueries({ queryKey: ["party"] });
      queryClient.invalidateQueries({ queryKey: ["encounters"] });
      queryClient.invalidateQueries({ queryKey: ["npcs"] });
    },
  });
}
