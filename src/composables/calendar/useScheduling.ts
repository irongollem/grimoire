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
  SessionAbsence,
  SessionCadence,
  SessionCadenceInput,
} from "@/types/scheduling.types";

// Each key is also the campaign doorbell's signal for its table
// (`SYNC_TABLES` in lib/campaignLiveSync/registry.ts).
const PROPOSALS_KEY = "session_proposals";
const AVAILABILITY_KEY = "session_availability";
const CADENCE_KEY = "session_cadences";
const ABSENCES_KEY = "session_absences";

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
    queryKey: computed(() => [PROPOSALS_KEY, campaignId.value] as const),
    queryFn: ({ queryKey: [, cid] }) => {
      if (cid === null) throw new Error("useSessionProposals fetched without a campaign");
      return fetchProposals(cid);
    },
    enabled: () => !!campaignId.value,
  });
}

export function useAllSessionAvailability() {
  const campaign = useCampaignStore();
  const campaignId = computed(() => campaign.activeCampaignId);
  return useQuery({
    queryKey: computed(() => [AVAILABILITY_KEY, "campaign", campaignId.value] as const),
    queryFn: ({ queryKey: [, , cid] }) => {
      if (cid === null) throw new Error("useAllSessionAvailability fetched without a campaign");
      return fetchAllAvailabilityForCampaign(cid);
    },
    enabled: () => !!campaignId.value,
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

// ── Cadence (#1213) ───────────────────────────────────────────────────────────

/** The campaign's regular rhythm, or null when it has none. One row per campaign. */
export function useSessionCadence() {
  const campaign = useCampaignStore();
  const campaignId = computed(() => campaign.activeCampaignId);
  return useQuery({
    queryKey: computed(() => [CADENCE_KEY, campaignId.value] as const),
    queryFn: async ({ queryKey: [, cid] }): Promise<SessionCadence | null> => {
      if (cid === null) throw new Error("useSessionCadence fetched without a campaign");
      const { data, error } = await supabase.from("session_cadences").select("*").eq("campaign_id", cid).maybeSingle();
      if (error) throw error;
      return data as SessionCadence | null;
    },
    enabled: () => !!campaignId.value,
  });
}

/**
 * Sets the rhythm. An existing row is updated in place and keeps its author:
 * `guard_content_author` refuses a change of `user_id`, so a co-DM editing the
 * owner's cadence must not try to stamp themselves on it.
 */
export function useSaveCadence() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      campaignId,
      existingId,
      input,
    }: {
      campaignId: string;
      existingId: string | null;
      input: SessionCadenceInput;
    }): Promise<SessionCadence> => {
      const query = existingId
        ? supabase.from("session_cadences").update(input).eq("id", existingId)
        : supabase.from("session_cadences").insert({ ...input, campaign_id: campaignId, user_id: getCurrentUser()!.id });
      const { data, error } = await query.select().single();
      if (error) throw error;
      return data as SessionCadence;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [CADENCE_KEY] }),
  });
}

export function useDeleteCadence() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("session_cadences").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [CADENCE_KEY] }),
  });
}

/**
 * Every "I can't make it" on a regular evening in the campaign; the whole table
 * reads them. Read only once the
 * campaign has a cadence: with no regular evening there is nothing to be absent
 * from, and the dashboard and the Hearth would otherwise pay a request on every
 * load for a list that is always empty (the performance budget caught it). The
 * cadence query is the same cached one the cards already read, so this adds no
 * request of its own.
 */
export function useSessionAbsences() {
  const campaign = useCampaignStore();
  const campaignId = computed(() => campaign.activeCampaignId);
  const { data: cadence } = useSessionCadence();
  return useQuery({
    queryKey: computed(() => [ABSENCES_KEY, campaignId.value] as const),
    queryFn: async ({ queryKey: [, cid] }): Promise<SessionAbsence[]> => {
      if (cid === null) throw new Error("useSessionAbsences fetched without a campaign");
      const { data, error } = await supabase.from("session_absences").select("*").eq("campaign_id", cid);
      if (error) throw error;
      return data as SessionAbsence[];
    },
    enabled: () => !!campaignId.value && !!cadence.value,
  });
}

/** The caller says they cannot make a regular evening, or takes it back. Only ever their own row. */
export function useSetAbsence() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ campaignId, date, absent }: { campaignId: string; date: string; absent: boolean }) => {
      const userId = getCurrentUser()!.id;
      const { error } = absent
        ? await supabase
            .from("session_absences")
            .upsert(
              { campaign_id: campaignId, user_id: userId, absent_on: date },
              { onConflict: "campaign_id,user_id,absent_on", ignoreDuplicates: true },
            )
        : await supabase
            .from("session_absences")
            .delete()
            .eq("campaign_id", campaignId)
            .eq("user_id", userId)
            .eq("absent_on", date);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [ABSENCES_KEY] }),
  });
}
