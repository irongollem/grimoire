import { computed, type Ref } from "vue";
import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { useCampaignStore } from "@/stores/campaign";
import type {
  CharacterClass,
  CharacterClassInsert,
  CharacterClassUpdate,
  MulticlassPrereq,
} from "@/types/multiclass.types";

const QUERY_KEY = "character_classes";
const PREREQS_KEY = "multiclass_prerequisites";

async function fetchClassesForMember(partyMemberId: string): Promise<CharacterClass[]> {
  const { data, error } = await supabase
    .from("character_classes")
    .select("*")
    .eq("party_member_id", partyMemberId)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data ?? []) as CharacterClass[];
}

async function fetchAllClassesForCampaign(campaignId: string): Promise<CharacterClass[]> {
  // Join through party_members to scope by campaign. RLS already restricts to
  // the caller's own members — campaign filter is belt-and-braces.
  const { data, error } = await supabase
    .from("character_classes")
    .select("*, party_members!inner(campaign_id)")
    .eq("party_members.campaign_id", campaignId)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data ?? []) as CharacterClass[];
}

async function fetchPrereqs(): Promise<MulticlassPrereq[]> {
  const { data, error } = await supabase.from("multiclass_prerequisites").select("*");
  if (error) throw error;
  return (data ?? []) as MulticlassPrereq[];
}

/**
 * Reactive list of class entries for one party member. Pre-multiclass data
 * (a character with no `character_classes` rows) returns an empty array —
 * consumers should fall back to `party_members.class`/`level` in that case.
 */
export function useCharacterClasses(partyMemberId: Ref<string | null | undefined>) {
  return useQuery({
    queryKey: computed(() => [QUERY_KEY, partyMemberId.value]),
    queryFn: () => fetchClassesForMember(partyMemberId.value!),
    enabled: () => !!partyMemberId.value,
  });
}

/**
 * All class entries for the active campaign's party members. Used by views
 * that render a roster (dashboard, party tracker) so each card can show the
 * "Fighter 5 / Wizard 3" label without per-row fetches.
 */
export function useAllCampaignCharacterClasses() {
  const campaign = useCampaignStore();
  const campaignId = computed(() => campaign.activeCampaignId);
  return useQuery({
    queryKey: computed(() => [QUERY_KEY, "by-campaign", campaignId.value]),
    queryFn: () => fetchAllClassesForCampaign(campaignId.value!),
    enabled: () => !!campaignId.value,
  });
}

/** Static PHB prereq table. Cached indefinitely — migrations change it. */
export function useMulticlassPrereqs() {
  return useQuery({
    queryKey: [PREREQS_KEY],
    queryFn: fetchPrereqs,
    staleTime: Infinity,
  });
}

export function useAddCharacterClass() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (row: CharacterClassInsert) => {
      const { data, error } = await supabase
        .from("character_classes")
        .insert(row)
        .select()
        .single();
      if (error) throw error;
      return data as CharacterClass;
    },
    onSuccess: (row) => {
      void queryClient.invalidateQueries({ queryKey: [QUERY_KEY, row.party_member_id] });
      void queryClient.invalidateQueries({ queryKey: [QUERY_KEY, "by-campaign"] });
    },
  });
}

export function useUpdateCharacterClass() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, update }: { id: string; update: CharacterClassUpdate }) => {
      const { data, error } = await supabase
        .from("character_classes")
        .update(update)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as CharacterClass;
    },
    onSuccess: (row) => {
      void queryClient.invalidateQueries({ queryKey: [QUERY_KEY, row.party_member_id] });
      void queryClient.invalidateQueries({ queryKey: [QUERY_KEY, "by-campaign"] });
    },
  });
}

export function useDeleteCharacterClass() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("character_classes").delete().eq("id", id);
      if (error) throw error;
      return id;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
    },
  });
}
