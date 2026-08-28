import { computed } from "vue";
import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/auth";
import type { PartyMember } from "@/types/party.types";

// #730: the player's durable character pool — every character they own,
// attached to a campaign or resting between tables. Distinct from useParty()
// (one campaign's roster) and from Champions (one campaign's own characters):
// this is user-scoped and campaign-agnostic.

// NOT "my-characters" — useParty.ts already owns that key root for the
// campaign-scoped champions list; sharing it would tangle two query shapes.
const POOL_KEY = "character-pool";

async function fetchMyCharacters(userId: string): Promise<PartyMember[]> {
  // Two shapes count as "mine", mirroring attach_party_member_to_campaign's
  // own predicate (`owner_user_id = uid or (owner_user_id is null and
  // user_id = uid)`):
  //
  //   1. owned outright — the normal case;
  //   2. created by me, unclaimed, and in no campaign — the orphan shape from
  //      #738, plus any character predating the ownership column.
  //
  // Case 2 is deliberately narrowed to detached rows. Without `campaign_id is
  // null` a DM's unclaimed roster would leak into their personal pool; with
  // it, the only rows that surface are ones no other view can show at all.
  // The server would already let these be attached — a strict
  // `.eq("owner_user_id", …)` here was the sole reason the UI never offered
  // them, so a character could be created, levelled, and then vanish.
  const { data, error } = await supabase
    .from("party_members")
    .select("*")
    .or(
      `owner_user_id.eq.${userId},` +
      `and(owner_user_id.is.null,user_id.eq.${userId},campaign_id.is.null)`,
    )
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data as PartyMember[];
}

export function useCharacterPool() {
  const auth = useAuthStore();
  const userId = computed(() => auth.user?.id ?? null);
  return useQuery({
    queryKey: [POOL_KEY, userId] as const,
    queryFn: () => fetchMyCharacters(userId.value as string),
    enabled: computed(() => !!userId.value),
  });
}

// The three gated transitions (migration 20260814221409). All of them are
// SECURITY DEFINER RPCs — a client-side write of party_members.campaign_id
// is rejected by the transition guard trigger, so there is no fallback path
// to "just update the row".

function invalidateCharacterCaches(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: [POOL_KEY] });
  void queryClient.invalidateQueries({ queryKey: ["party"] });
  void queryClient.invalidateQueries({ queryKey: ["my-characters"] });
  void queryClient.invalidateQueries({ queryKey: ["campaign-members"] });
  void queryClient.invalidateQueries({ queryKey: ["my-memberships"] });
}

export function useAttachCharacter() {
  const queryClient = useQueryClient();
  const auth = useAuthStore();
  return useMutation({
    mutationFn: async (input: {
      partyMemberId: string;
      campaignId: string;
      setActive?: boolean;
    }) => {
      const { error } = await supabase.rpc("attach_party_member_to_campaign", {
        p_party_member_id: input.partyMemberId,
        p_campaign_id: input.campaignId,
        p_set_active: input.setActive ?? true,
      });
      if (error) throw error;
    },
    onSuccess: (_data, input) => {
      invalidateCharacterCaches(queryClient);
      // The membership row may now link the attached character.
      void auth.refreshMembership(input.campaignId);
    },
  });
}

export function useDetachCharacter() {
  const queryClient = useQueryClient();
  const auth = useAuthStore();
  return useMutation({
    mutationFn: async (partyMemberId: string) => {
      const { error } = await supabase.rpc("detach_party_member_from_campaign", {
        p_party_member_id: partyMemberId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateCharacterCaches(queryClient);
      // If the detached character was the caller's active one, the RPC
      // unlinked it — reload so linkedPartyMemberId stops pointing at it.
      void auth.refreshMembership(auth.membership?.campaign_id);
    },
  });
}

export function useCloneCharacter() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (partyMemberId: string) => {
      const { data, error } = await supabase.rpc("clone_party_member", {
        p_party_member_id: partyMemberId,
      });
      if (error) throw error;
      return data as string; // new character id
    },
    onSuccess: () => invalidateCharacterCaches(queryClient),
  });
}

// Deleting is owner-only by RLS (claimed characters are detach-only for
// everyone else); the pool UI additionally offers it only for unattached rows.
export function useDeletePoolCharacter() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (partyMemberId: string) => {
      const { error } = await supabase
        .from("party_members")
        .delete()
        .eq("id", partyMemberId);
      if (error) throw error;
    },
    onSuccess: () => invalidateCharacterCaches(queryClient),
  });
}
