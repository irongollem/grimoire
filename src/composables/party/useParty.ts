import { computed } from "vue";
import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { supabase, getCurrentUser } from "@/lib/supabase";
import { useCampaignStore } from "@/stores/campaign";
import { useAuthStore } from "@/stores/auth";
import type { PartyMember, PartyMemberInsert, PartyMemberUpdate, SpellSlotEntry } from "@/types/party.types";
import { deleteUnreferencedByPublicUrl } from "@/lib/storage";
import { useToast } from "@/composables/useToast";

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
  const { data, error } = await supabase
    .from("party_members")
    .delete()
    .eq("id", member.id)
    .select("id");
  if (error) throw error;
  if (!data?.length) {
    throw new Error("This character could not be removed. Detach claimed characters instead, and restore anyone in the Hall of the Fallen first.");
  }
  await deleteUnreferencedByPublicUrl({ urls: [member.portrait_url] });
}

/** The roster read; shared by `useParty` and the navigation prefetch. */
export function partyListQuery(campaignId: string | null) {
  return {
    queryKey: [QUERY_KEY, campaignId] as const,
    queryFn: () => {
      if (!campaignId) throw new Error("useParty fetched without a campaign — enabled guarantees it's set");
      return fetchParty(campaignId);
    },
  };
}

/** `enabled` lets permanently-mounted callers defer the fetch until their panel
 *  is open — see {@link useNpcs} for the rationale. */
export function useParty(enabled?: () => boolean) {
  const campaign = useCampaignStore();
  const campaignId = computed(() => campaign.activeCampaignId);
  const options = computed(() => partyListQuery(campaignId.value));
  return useQuery({
    queryKey: computed(() => options.value.queryKey),
    queryFn: () => options.value.queryFn(),
    enabled: () => !!campaignId.value && (enabled?.() ?? true),
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
  return useMutation({
    // Callers choose whether this is a campaign character or a resting-pool
    // character. Deriving it from persisted active state can attach a new
    // player character to a campaign they no longer belong to.
    mutationFn: (member: PartyMemberInsert) => createPartyMember(member),
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

/** Atomic cast mutation: slot, Metamagic, and concentration commit together. */
export function useCastCharacterSpell() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      partyMemberId,
      slotLevel,
      pool,
      slotTemplate,
      concentrationState = null,
      metamagicName = null,
      metamagicNames,
      metamagicChoices = {},
      characterSpellId = null,
      parentCastId = null,
    }: {
      partyMemberId: string;
      slotLevel: number;
      pool: "spellcasting" | "pact" | "temporary" | "feature";
      slotTemplate: SpellSlotEntry[];
      concentrationState?: PartyMember["concentration"];
      metamagicName?: string | null;
      metamagicNames?: string[];
      metamagicChoices?: Record<string, unknown>;
      characterSpellId?: string | null;
      parentCastId?: string | null;
    }) => {
      const { data, error } = await supabase.rpc("cast_character_spell_v4", {
        p_party_member_id: partyMemberId,
        p_slot_level: slotLevel,
        p_slot_pool: pool,
        p_slot_template: slotTemplate,
        p_concentration_state: concentrationState,
        p_metamagic_names: metamagicNames ?? (metamagicName ? [metamagicName] : []),
        p_character_spell_id: characterSpellId,
        p_metamagic_choices: metamagicChoices,
        p_parent_cast_id: parentCastId,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY] }),
  });
}

function useSorcererRpc(name: "activate_innate_sorcery" | "end_innate_sorcery" | "restore_sorcery_points") {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (partyMemberId: string) => {
      const { data, error } = await supabase.rpc(name, { p_party_member_id: partyMemberId });
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY] }),
  });
}

export function useActivateInnateSorcery() { return useSorcererRpc("activate_innate_sorcery"); }
export function useEndInnateSorcery() { return useSorcererRpc("end_innate_sorcery"); }
export function useRestoreSorceryPoints() { return useSorcererRpc("restore_sorcery_points"); }

/** Atomic slot, class-resource, innate-use, and Sorcerer rest recovery. */
export function useTakeSpellcastingRest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ partyMemberId, rest }: { partyMemberId: string; rest: "short" | "long" }) => {
      const { data, error } = await supabase.rpc("take_spellcasting_rest", {
        p_party_member_id: partyMemberId,
        p_rest: rest,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, { partyMemberId }) => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: ["characterSpells", partyMemberId] });
      queryClient.invalidateQueries({ queryKey: ["characterSpellsDetails", partyMemberId] });
    },
  });
}


/** Atomic Flexible Casting conversion between Sorcery Points and spell slots. */
export function useConvertSorceryPoints() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      partyMemberId,
      direction,
      slotLevel,
      pool = "spellcasting",
    }: {
      partyMemberId: string;
      direction: "points_to_slot" | "slot_to_points";
      slotLevel: number;
      pool?: "spellcasting" | "pact" | "temporary" | "feature";
    }) => {
      const { data, error } = await supabase.rpc("convert_sorcery_points", {
        p_party_member_id: partyMemberId,
        p_direction: direction,
        p_slot_level: slotLevel,
        p_slot_pool: pool,
      });
      if (error) throw error;
      return data as {
        spell_slots: SpellSlotEntry[];
        class_resources: PartyMember["class_resources"];
      };
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY] }),
  });
}

export function useDeletePartyMember() {
  const queryClient = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: deletePartyMember,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY] }),
    onError: (e) => toast.error(toast.fromError(e)),
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
    queryKey: computed(() => [MY_CHARS_KEY, campaignId.value, userId.value, linkedId.value] as const),
    queryFn: ({ queryKey: [, cid, uid, linked] }) => {
      if (!cid || !uid) throw new Error("useMyCharacters fetched without a campaign and user — enabled guarantees both are set");
      return fetchMyCharacters(cid, uid, linked);
    },
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
      // Name the campaign: without one the reload takes the player's OLDEST
      // membership, which for someone at two tables is the wrong table, and the
      // page stops showing which character is active.
      await auth.refreshMembership(auth.membership?.campaign_id);
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

const OFFERED_KEY = "offered-characters";

async function fetchOfferedCharacters(campaignId: string): Promise<PartyMember[]> {
  const { data, error } = await supabase
    .from("party_members")
    .select("*")
    .eq("campaign_id", campaignId)
    .eq("is_dm_managed", true)
    .is("owner_user_id", null)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data as PartyMember[];
}

/** Characters created by the DM and offered to any player in the campaign. */
export function useOfferedCharacters() {
  const campaign = useCampaignStore();
  const campaignId = computed(() => campaign.activeCampaignId);
  return useQuery({
    queryKey: computed(() => [OFFERED_KEY, campaignId.value] as const),
    queryFn: ({ queryKey: [, cid] }) => {
      if (!cid) throw new Error("useOfferedCharacters fetched without a campaign — enabled guarantees it's set");
      return fetchOfferedCharacters(cid);
    },
    enabled: () => !!campaignId.value,
  });
}

/** Assumes a DM-offered character: deep-copies it into the caller's ownership and sets it active. */
export function useAssumeCharacter() {
  const queryClient = useQueryClient();
  const auth = useAuthStore();
  return useMutation({
    mutationFn: async (originalId: string): Promise<string> => {
      const { data, error } = await supabase.rpc("assume_character", {
        p_original_id: originalId,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: async () => {
      await auth.refreshMembership(auth.membership?.campaign_id);
      void queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
      void queryClient.invalidateQueries({ queryKey: [OFFERED_KEY] });
      void queryClient.invalidateQueries({ queryKey: [MY_CHARS_KEY] });
    },
  });
}
