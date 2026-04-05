import { computed } from "vue";
import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { supabase, getCurrentUser } from "@/lib/supabase";
import { useCampaignStore } from "@/stores/campaign";
import type {
  SessionProposal,
  SessionProposalInsert,
  SessionProposalUpdate,
  SessionAvailability,
  SessionAvailabilityUpsert,
} from "@/types/scheduling.types";

const PROPOSALS_KEY = "session_proposals";
const AVAILABILITY_KEY = "session_availability";

// ── Helpers ───────────────────────────────────────────────────────────────────

async function fetchProposals(campaignId: string): Promise<SessionProposal[]> {
  const { data, error } = await supabase
    .from("session_proposals")
    .select("*")
    .eq("campaign_id", campaignId)
    .order("proposed_date", { ascending: true });
  if (error) throw error;
  return data as SessionProposal[];
}

async function fetchAvailability(proposalId: string): Promise<SessionAvailability[]> {
  const { data, error } = await supabase
    .from("session_availability")
    .select("*")
    .eq("session_proposal_id", proposalId);
  if (error) throw error;
  return data as SessionAvailability[];
}

async function fetchAllAvailabilityForCampaign(campaignId: string): Promise<SessionAvailability[]> {
  const { data, error } = await supabase
    .from("session_availability")
    .select("*")
    .eq("campaign_id", campaignId);
  if (error) throw error;
  return data as SessionAvailability[];
}

async function createProposal(proposal: SessionProposalInsert): Promise<SessionProposal> {
  const user = getCurrentUser();
  const { data, error } = await supabase
    .from("session_proposals")
    .insert({ ...proposal, user_id: user!.id })
    .select()
    .single();
  if (error) throw error;
  return data as SessionProposal;
}

async function updateProposal(id: string, update: SessionProposalUpdate): Promise<SessionProposal> {
  const { data, error } = await supabase
    .from("session_proposals")
    .update(update)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as SessionProposal;
}

async function deleteProposal(id: string): Promise<void> {
  const { error } = await supabase.from("session_proposals").delete().eq("id", id);
  if (error) throw error;
}

async function upsertAvailability(payload: SessionAvailabilityUpsert): Promise<SessionAvailability> {
  const user = getCurrentUser();
  const { data, error } = await supabase
    .from("session_availability")
    .upsert(
      { ...payload, user_id: user!.id },
      { onConflict: "session_proposal_id,user_id" }
    )
    .select()
    .single();
  if (error) throw error;
  return data as SessionAvailability;
}

// ── Queries ───────────────────────────────────────────────────────────────────

export function useSessionProposals() {
  const campaign = useCampaignStore();
  const campaignId = computed(() => campaign.activeCampaignId);
  return useQuery({
    queryKey: computed(() => [PROPOSALS_KEY, campaignId.value]),
    queryFn: () => fetchProposals(campaignId.value!),
    enabled: () => !!campaignId.value,
  });
}

export function useAllSessionAvailability() {
  const campaign = useCampaignStore();
  const campaignId = computed(() => campaign.activeCampaignId);
  return useQuery({
    queryKey: computed(() => [AVAILABILITY_KEY, "campaign", campaignId.value]),
    queryFn: () => fetchAllAvailabilityForCampaign(campaignId.value!),
    enabled: () => !!campaignId.value,
  });
}

export function useSessionAvailability(proposalId: string) {
  return useQuery({
    queryKey: [AVAILABILITY_KEY, proposalId],
    queryFn: () => fetchAvailability(proposalId),
    enabled: !!proposalId,
  });
}

// ── Mutations ─────────────────────────────────────────────────────────────────

export function useCreateProposal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (proposal: SessionProposalInsert) => createProposal(proposal),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [PROPOSALS_KEY] });
    },
  });
}

export function useUpdateProposal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, update }: { id: string; update: SessionProposalUpdate }) =>
      updateProposal(id, update),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [PROPOSALS_KEY] });
    },
  });
}

export function useDeleteProposal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteProposal(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [PROPOSALS_KEY] });
    },
  });
}

export function useUpsertAvailability() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: SessionAvailabilityUpsert) => upsertAvailability(payload),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: [AVAILABILITY_KEY] });
      queryClient.invalidateQueries({ queryKey: [AVAILABILITY_KEY, variables.session_proposal_id] });
    },
  });
}
