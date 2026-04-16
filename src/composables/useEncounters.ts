import { computed, ref, toValue, type MaybeRefOrGetter } from "vue";
import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { supabase, getCurrentUser } from "@/lib/supabase";
import { useCampaignStore } from "@/stores/campaign";
import type { Encounter, EncounterInsert, EncounterUpdate } from "@/types/encounter.types";
import type { Ref } from "vue";
import { isRef } from "vue";

const QUERY_KEY = "encounters";

async function fetchEncounters(campaignId: string): Promise<Encounter[]> {
  const { data, error } = await supabase
    .from("encounters")
    .select("*")
    .eq("campaign_id", campaignId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as Encounter[];
}

async function fetchEncounter(id: string): Promise<Encounter | null> {
  const { data, error } = await supabase.from("encounters").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data as Encounter | null;
}

async function createEncounter(encounter: EncounterInsert): Promise<Encounter> {
  const user = getCurrentUser();
  const { data, error } = await supabase
    .from("encounters")
    .insert({ ...encounter, user_id: user!.id })
    .select()
    .single();
  if (error) throw error;
  return data as Encounter;
}

async function updateEncounter(id: string, update: EncounterUpdate): Promise<Encounter> {
  const { data, error } = await supabase
    .from("encounters")
    .update(update)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as Encounter;
}

async function deleteEncounter(id: string): Promise<void> {
  // Remove this encounter from any quest it was linked to
  await supabase.from("quest_refs").delete().eq("ref_type", "encounter").eq("ref_id", id);
  const { error } = await supabase.from("encounters").delete().eq("id", id);
  if (error) throw error;
}

export function useEncounters() {
  const campaign = useCampaignStore();
  const campaignId = computed(() => campaign.activeCampaignId);
  return useQuery({
    queryKey: computed(() => [QUERY_KEY, campaignId.value]),
    queryFn: () => fetchEncounters(campaignId.value!),
    enabled: () => !!campaignId.value,
  });
}

export function useEncountersByLocation(locationId: string | Ref<string>) {
  const idRef = isRef(locationId) ? locationId : ref(locationId);
  return useQuery({
    queryKey: computed(() => [QUERY_KEY, "by-location", idRef.value]),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("encounters")
        .select("id, name, is_finished")
        .eq("location_id", idRef.value)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as { id: string; name: string; is_finished: boolean }[];
    },
    enabled: () => !!idRef.value,
  });
}

export function useEncounter(id: string | Ref<string>) {
  const resolvedId = isRef(id) ? id : { value: id };
  return useQuery({
    queryKey: [QUERY_KEY, resolvedId],
    queryFn: () => fetchEncounter(isRef(id) ? id.value : id),
    enabled: () => !!(isRef(id) ? id.value : id),
  });
}

export function useCreateEncounter() {
  const queryClient = useQueryClient();
  const campaign = useCampaignStore();
  return useMutation({
    mutationFn: (encounter: Omit<EncounterInsert, "campaign_id">) =>
      createEncounter({ ...encounter, campaign_id: campaign.activeCampaignId! }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY] }),
  });
}

export function useUpdateEncounter() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, update }: { id: string; update: EncounterUpdate }) =>
      updateEncounter(id, update),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY, id] });
    },
  });
}

export function useDeleteEncounter() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteEncounter,
    onSuccess: (_data, id) => {
      queryClient.removeQueries({ queryKey: [QUERY_KEY, id] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: ["quests"] });
    },
  });
}

/** Returns encounters that reference a given monster in their combatants list. */
export function useEncountersByMonster(monsterId: MaybeRefOrGetter<string>) {
  const { data: encounters } = useEncounters();
  return computed(() => {
    const id = toValue(monsterId);
    if (!id) return [] as Encounter[];
    return (encounters.value ?? []).filter((e) =>
      e.combatants.some((c) => c.monster_id === id),
    );
  });
}

/** Returns encounters that reference a given NPC in their combatants list. */
export function useEncountersByNpc(npcId: MaybeRefOrGetter<string>) {
  const { data: encounters } = useEncounters();
  return computed(() => {
    const id = toValue(npcId);
    if (!id) return [] as Encounter[];
    return (encounters.value ?? []).filter((e) =>
      e.combatants.some((c) => c.npc_id === id),
    );
  });
}
