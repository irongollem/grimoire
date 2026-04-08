import { computed, watch, onUnmounted } from "vue";
import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { supabase, getCurrentUser } from "@/lib/supabase";
import { useCampaignStore } from "@/stores/campaign";
import type { PartyMember, PartyMemberInsert, PartyMemberUpdate } from "@/types/party.types";

const QUERY_KEY = "party";

async function fetchParty(campaignId: string): Promise<PartyMember[]> {
  const { data, error } = await supabase
    .from("party_members")
    .select("*")
    .eq("campaign_id", campaignId)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return data as PartyMember[];
}

async function createPartyMember(member: PartyMemberInsert): Promise<PartyMember> {
  const user = getCurrentUser();
  const { data, error } = await supabase
    .from("party_members")
    .insert({ ...member, user_id: user!.id })
    .select()
    .single();
  if (error) throw error;
  return data as PartyMember;
}

async function updatePartyMember(id: string, update: PartyMemberUpdate): Promise<PartyMember> {
  const { data, error } = await supabase
    .from("party_members")
    .update(update)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as PartyMember;
}

async function deletePartyMember(id: string): Promise<void> {
  const { error } = await supabase.from("party_members").delete().eq("id", id);
  if (error) throw error;
}

export function useParty() {
  const campaign = useCampaignStore();
  const campaignId = computed(() => campaign.activeCampaignId);
  return useQuery({
    queryKey: computed(() => [QUERY_KEY, campaignId.value]),
    queryFn: () => fetchParty(campaignId.value!),
    enabled: () => !!campaignId.value,
  });
}

export function useCreatePartyMember() {
  const queryClient = useQueryClient();
  const campaign = useCampaignStore();
  return useMutation({
    mutationFn: (member: Omit<PartyMemberInsert, "campaign_id">) =>
      createPartyMember({ ...member, campaign_id: campaign.activeCampaignId! }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY] }),
  });
}

export function useUpdatePartyMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, update }: { id: string; update: PartyMemberUpdate }) =>
      updatePartyMember(id, update),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY] }),
  });
}

// Keeps the party query fresh across browsers — e.g. DM damage updates the player's sheet.
export function usePartyLive() {
  const campaign = useCampaignStore();
  const queryClient = useQueryClient();
  let channel: ReturnType<typeof supabase.channel> | null = null;

  watch(
    () => campaign.activeCampaignId,
    (campaignId) => {
      if (channel) { supabase.removeChannel(channel); channel = null; }
      if (!campaignId) return;
      channel = supabase
        .channel(`party_members_live:${campaignId}`)
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "party_members",
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

export function useDeletePartyMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deletePartyMember,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY] }),
  });
}
