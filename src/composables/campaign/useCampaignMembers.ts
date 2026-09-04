import { computed } from "vue";
import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { supabase, getCurrentUser } from "@/lib/supabase";
import { useCampaignStore } from "@/stores/campaign";
import { useToast } from "@/composables/useToast";
import type {
  CampaignMember,
  CampaignMemberUpdate,
  CampaignInvite,
  CampaignInviteInsert,
} from "@/types/campaign.types";

const MEMBERS_KEY = "campaign-members";
const INVITES_KEY = "campaign-invites";

// ── Members ───────────────────────────────────────────────────────────────────

async function fetchMembers(campaignId: string): Promise<CampaignMember[]> {
  const { data, error } = await supabase
    .from("campaign_members")
    .select("*")
    .eq("campaign_id", campaignId)
    .order("joined_at", { ascending: true });
  if (error) throw error;
  return data as CampaignMember[];
}

async function updateMember(id: string, update: CampaignMemberUpdate): Promise<CampaignMember> {
  const { data, error } = await supabase
    .from("campaign_members")
    .update(update)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as CampaignMember;
}

async function removeMember(id: string): Promise<void> {
  const { error } = await supabase.from("campaign_members").delete().eq("id", id);
  if (error) throw error;
}

export type MyMembership = Pick<CampaignMember, "campaign_id" | "role">;

export const MY_MEMBERSHIPS_KEY = ["my-memberships"] as const;

/** Which role this account holds in each of its campaigns. `useModeSwitch`
 *  reads it to decide whether the campaign the target lens remembers is one
 *  that lens actually holds; the campaign lists themselves scope server-side
 *  (`fetchCampaignsAs`) rather than filtering against this. */
export async function fetchMyMemberships(): Promise<MyMembership[]> {
  const user = getCurrentUser();
  if (!user) return [];
  const { data, error } = await supabase
    .from("campaign_members")
    .select("campaign_id,role")
    .eq("user_id", user.id);
  if (error) throw error;
  return (data ?? []) as MyMembership[];
}

/** `enabled` lets permanently-mounted callers defer the fetch until their panel
 *  is open — see `useNpcs` for the rationale. */
export function useCampaignMembers(enabled?: () => boolean) {
  const campaign = useCampaignStore();
  const campaignId = computed(() => campaign.activeCampaignId);
  return useQuery({
    queryKey: computed(() => [MEMBERS_KEY, campaignId.value]),
    queryFn: () => fetchMembers(campaignId.value!),
    enabled: () => !!campaignId.value && (enabled?.() ?? true),
  });
}

export function useUpdateCampaignMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, update }: { id: string; update: CampaignMemberUpdate }) =>
      updateMember(id, update),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [MEMBERS_KEY] }),
  });
}

export function useRemoveCampaignMember() {
  const queryClient = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: removeMember,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: [MEMBERS_KEY] }),
        queryClient.invalidateQueries({ queryKey: ["party"] }),
        queryClient.invalidateQueries({ queryKey: ["character-pool"] }),
        queryClient.invalidateQueries({ queryKey: ["my-characters"] }),
      ]);
    },
    onError: (e) => toast.error(toast.fromError(e)),
  });
}

// ── Invites ───────────────────────────────────────────────────────────────────

async function fetchInvites(campaignId: string): Promise<CampaignInvite[]> {
  const { data, error } = await supabase
    .from("campaign_invites")
    .select("*")
    .eq("campaign_id", campaignId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as CampaignInvite[];
}

async function createInvite(invite: CampaignInviteInsert): Promise<CampaignInvite> {
  const user = getCurrentUser();
  const { data, error } = await supabase
    .from("campaign_invites")
    .insert({ ...invite, created_by: user!.id })
    .select()
    .single();
  if (error) throw error;
  return data as CampaignInvite;
}

async function revokeInvite(id: string): Promise<void> {
  const { error } = await supabase.from("campaign_invites").delete().eq("id", id);
  if (error) throw error;
}

export function useCampaignInvites() {
  const campaign = useCampaignStore();
  const campaignId = computed(() => campaign.activeCampaignId);
  return useQuery({
    queryKey: computed(() => [INVITES_KEY, campaignId.value]),
    queryFn: () => fetchInvites(campaignId.value!),
    enabled: () => !!campaignId.value,
  });
}

export function useCreateCampaignInvite() {
  const queryClient = useQueryClient();
  const campaign = useCampaignStore();
  return useMutation({
    mutationFn: (invite: Omit<CampaignInviteInsert, "campaign_id">) =>
      createInvite({ ...invite, campaign_id: campaign.activeCampaignId! }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [INVITES_KEY] }),
  });
}

export function useRevokeInvite() {
  const queryClient = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: revokeInvite,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [INVITES_KEY] }),
    onError: (e) => toast.error(toast.fromError(e)),
  });
}

// ── Member lookup helper ──────────────────────────────────────────────────────

export function useMemberByUserId() {
  const { data: members } = useCampaignMembers();
  const memberByUserId = computed(() =>
    Object.fromEntries((members.value ?? []).map((m) => [m.user_id, m])),
  );
  function displayNameFor(userId: string, fallback = "Party member"): string {
    return memberByUserId.value[userId]?.display_name ?? fallback;
  }
  return { memberByUserId, displayNameFor };
}

// ── Join via invite (called from JoinCampaign view) ───────────────────────────

export async function joinCampaignViaInvite(token: string, partyMemberId?: string): Promise<string> {
  // Omitting the defaulted argument keeps character-less joins compatible
  // while the database and frontend roll out in either order.
  const args = partyMemberId
    ? { p_token: token, p_party_member_id: partyMemberId }
    : { p_token: token };
  let { data, error } = await supabase.rpc("join_campaign_via_invite", args);
  if (error?.code === "PGRST202" && partyMemberId) {
    // Old database during a rolling deploy: joining is still more useful than
    // rejecting the invite. The character remains safely in the resting pool.
    ({ data, error } = await supabase.rpc("join_campaign_via_invite", { p_token: token }));
  }
  if (error) throw error;
  return data as string; // campaign_id
}
