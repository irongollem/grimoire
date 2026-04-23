import { computed, watch, onUnmounted } from "vue";
import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { supabase, getCurrentUser } from "@/lib/supabase";
import { useCampaignStore } from "@/stores/campaign";
import { useAuthStore } from "@/stores/auth";
import type { PartyMember, PartyMemberInsert, PartyMemberUpdate } from "@/types/party.types";
import { removeStorageImages } from "@/composables/useImageUpload";

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

async function deletePartyMember(member: PartyMember): Promise<void> {
  const { error } = await supabase.from("party_members").delete().eq("id", member.id);
  if (error) throw error;
  await removeStorageImages("asset-images", member.portrait_url);
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

/** Returns the party member linked to the current logged-in user, or undefined. */
export function useMe() {
  const auth = useAuthStore();
  const { data: party } = useParty();
  return computed<PartyMember | undefined>(
    () => party.value?.find((m) => m.id === auth.linkedPartyMemberId) ?? undefined,
  );
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
          (payload) => {
            const updated = payload.new as PartyMember;
            queryClient.setQueryData<PartyMember[]>([QUERY_KEY, campaignId], (old) => {
              if (!old) return old;
              return old.map((m) => (m.id === updated.id ? updated : m));
            });
          },
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

const MY_CHARS_KEY = "my-characters";

async function fetchMyCharacters(
  campaignId: string,
  userId: string,
  linkedMemberId: string | null,
): Promise<PartyMember[]> {
  // Include: chars owned by this user (new chars) AND the currently-linked char
  // (handles pre-ownership-migration chars whose owner_user_id is still null).
  const orParts = [`owner_user_id.eq.${userId}`];
  if (linkedMemberId) orParts.push(`id.eq.${linkedMemberId}`);

  const { data, error } = await supabase
    .from("party_members")
    .select("*")
    .eq("campaign_id", campaignId)
    .or(orParts.join(","))
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data as PartyMember[];
}

/** All characters owned by the current user in the active campaign (bench + active). */
export function useMyCharacters() {
  const campaign = useCampaignStore();
  const auth = useAuthStore();
  const campaignId  = computed(() => campaign.activeCampaignId);
  const userId      = computed(() => auth.user?.id);
  const linkedId    = computed(() => auth.linkedPartyMemberId);
  return useQuery({
    queryKey: computed(() => [MY_CHARS_KEY, campaignId.value, userId.value, linkedId.value]),
    queryFn: () => fetchMyCharacters(campaignId.value!, userId.value!, linkedId.value),
    enabled: () => !!campaignId.value && !!userId.value,
  });
}

/** Sets which character is active for the current user in this campaign. */
export function useSetActiveCharacter() {
  const auth = useAuthStore();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (partyMemberId: string) => {
      const membershipId = auth.membership?.id;
      if (!membershipId) throw new Error("No campaign membership");
      const { error } = await supabase
        .from("campaign_members")
        .update({ party_member_id: partyMemberId })
        .eq("id", membershipId);
      if (error) throw error;
    },
    onSuccess: async () => {
      await auth.refreshMembership();
      void queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
      void queryClient.invalidateQueries({ queryKey: [MY_CHARS_KEY] });
    },
  });
}

export function useSetShapeshifterAppearance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ memberId, speciesId }: { memberId: string; speciesId: string }) => {
      const { error } = await supabase.rpc("set_shapeshifter_appearance", {
        member_id: memberId,
        target_species: speciesId,
      });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY] }),
  });
}

export function useClearShapeshifterAppearance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (memberId: string) => {
      const { error } = await supabase.rpc("clear_shapeshifter_appearance", {
        member_id: memberId,
      });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY] }),
  });
}
