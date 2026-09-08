import { computed } from "vue";
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { supabase, getCurrentUser } from "@/lib/supabase";
import { useCampaignStore } from "@/stores/campaign";
import type { PartyMilestone, PartyMilestoneInsert } from "@/types/quest.types";

const QUERY_KEY = "party_milestones";

async function fetchPartyMilestones(campaignId: string): Promise<PartyMilestone[]> {
  const { data, error } = await supabase
    .from("party_milestones")
    .select("*")
    .eq("campaign_id", campaignId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as PartyMilestone[];
}

/** The renown/promises/thresholds the party has earned (#853) — the party
 *  screen's own milestones panel. DM writes, every member reads
 *  (`party_milestones_member_select`). */
export function usePartyMilestones() {
  const campaign = useCampaignStore();
  const campaignId = computed(() => campaign.activeCampaignId);
  return useQuery({
    queryKey: computed(() => [QUERY_KEY, campaignId.value]),
    queryFn: () => fetchPartyMilestones(campaignId.value!),
    enabled: () => !!campaignId.value,
  });
}

export async function createPartyMilestone(milestone: PartyMilestoneInsert): Promise<PartyMilestone> {
  const user = getCurrentUser();
  const { data, error } = await supabase
    .from("party_milestones")
    .insert({ ...milestone, created_by: milestone.created_by ?? user?.id ?? null })
    .select()
    .single();
  if (error) throw error;
  return data as PartyMilestone;
}

export function useCreatePartyMilestone() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createPartyMilestone,
    onSuccess: (_milestone, input) => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY, input.campaign_id] });
    },
  });
}

export async function deletePartyMilestone(id: string): Promise<void> {
  const { error } = await supabase.from("party_milestones").delete().eq("id", id);
  if (error) throw error;
}

export function useDeletePartyMilestone() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; campaignId: string }) => deletePartyMilestone(input.id),
    onSuccess: (_result, input) => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY, input.campaignId] });
    },
  });
}
