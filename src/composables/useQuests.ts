import { computed, isRef, ref } from "vue";
import type { Ref } from "vue";
import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { supabase, getCurrentUser } from "@/lib/supabase";
import { useCampaignStore } from "@/stores/campaign";
import type {
  Quest,
  QuestInsert,
  QuestUpdate,
  QuestObjective,
  QuestObjectiveInsert,
  QuestObjectiveUpdate,
  QuestRef,
  QuestRefInsert,
  QuestStatus,
} from "@/types/quest.types";

const QUESTS_KEY     = "quests";
const OBJECTIVES_KEY = "quest_objectives";
const REFS_KEY       = "quest_refs";

// ── Quest fetchers ─────────────────────────────────────────────────────────────

async function fetchQuests(campaignId: string, status?: QuestStatus): Promise<Quest[]> {
  let query = supabase
    .from("quests")
    .select("*")
    .eq("campaign_id", campaignId)
    .order("updated_at", { ascending: false });

  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) throw error;
  return data as Quest[];
}

async function fetchSubQuests(parentId: string): Promise<Quest[]> {
  const { data, error } = await supabase
    .from("quests")
    .select("*")
    .eq("parent_quest_id", parentId)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return data as Quest[];
}

async function fetchQuest(id: string): Promise<Quest> {
  const { data, error } = await supabase.from("quests").select("*").eq("id", id).single();
  if (error) throw error;
  return data as Quest;
}

async function createQuest(quest: QuestInsert): Promise<Quest> {
  const user = getCurrentUser();
  const { data, error } = await supabase
    .from("quests")
    .insert({ ...quest, user_id: user!.id })
    .select()
    .single();
  if (error) throw error;
  return data as Quest;
}

async function updateQuest(id: string, update: QuestUpdate): Promise<Quest> {
  const { data, error } = await supabase
    .from("quests")
    .update(update)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as Quest;
}

async function deleteQuest(id: string): Promise<void> {
  const { error } = await supabase.from("quests").delete().eq("id", id);
  if (error) throw error;
}

// ── Objective fetchers ─────────────────────────────────────────────────────────

async function fetchObjectives(questId: string): Promise<QuestObjective[]> {
  const { data, error } = await supabase
    .from("quest_objectives")
    .select("*")
    .eq("quest_id", questId)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return data as QuestObjective[];
}

async function createObjective(obj: QuestObjectiveInsert): Promise<QuestObjective> {
  const { data, error } = await supabase.from("quest_objectives").insert(obj).select().single();
  if (error) throw error;
  return data as QuestObjective;
}

async function updateObjective(id: string, update: QuestObjectiveUpdate): Promise<QuestObjective> {
  const { data, error } = await supabase
    .from("quest_objectives")
    .update(update)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as QuestObjective;
}

async function deleteObjective(id: string): Promise<void> {
  const { error } = await supabase.from("quest_objectives").delete().eq("id", id);
  if (error) throw error;
}

// ── Ref fetchers ───────────────────────────────────────────────────────────────

async function fetchRefs(questId: string): Promise<QuestRef[]> {
  const { data, error } = await supabase
    .from("quest_refs")
    .select("*")
    .eq("quest_id", questId);
  if (error) throw error;
  return data as QuestRef[];
}

async function createRef(ref: QuestRefInsert): Promise<QuestRef> {
  const { data, error } = await supabase.from("quest_refs").insert(ref).select().single();
  if (error) throw error;
  return data as QuestRef;
}

async function updateRef(id: string, update: { is_player_visible: boolean }): Promise<QuestRef> {
  const { data, error } = await supabase.from("quest_refs").update(update).eq("id", id).select().single();
  if (error) throw error;
  return data as QuestRef;
}

async function deleteRef(id: string): Promise<void> {
  const { error } = await supabase.from("quest_refs").delete().eq("id", id);
  if (error) throw error;
}

// ── Public composables ─────────────────────────────────────────────────────────

export function useQuests(status?: QuestStatus) {
  const campaign = useCampaignStore();
  const campaignId = computed(() => campaign.activeCampaignId);
  return useQuery({
    queryKey: computed(() => [QUESTS_KEY, campaignId.value, status ?? "all"]),
    queryFn: () => fetchQuests(campaignId.value!, status),
    enabled: () => !!campaignId.value,
  });
}

export function usePlayerVisibleQuests() {
  const campaign = useCampaignStore();
  const campaignId = computed(() => campaign.activeCampaignId);
  return useQuery({
    queryKey: computed(() => [QUESTS_KEY, campaignId.value, "player-visible"]),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quests")
        .select("*")
        .eq("campaign_id", campaignId.value!)
        .eq("shared_with_players", true)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data as Quest[];
    },
    enabled: () => !!campaignId.value,
  });
}

export function useAllQuests() {
  const campaign = useCampaignStore();
  const campaignId = computed(() => campaign.activeCampaignId);
  return useQuery({
    queryKey: computed(() => [QUESTS_KEY, campaignId.value, "all"]),
    queryFn: () => fetchQuests(campaignId.value!),
    enabled: () => !!campaignId.value,
  });
}

export function useSubQuests(parentId: string | Ref<string>) {
  const idRef = isRef(parentId) ? parentId : ref(parentId);
  return useQuery({
    queryKey: computed(() => [QUESTS_KEY, "sub", idRef.value]),
    queryFn: () => fetchSubQuests(idRef.value),
    enabled: () => !!idRef.value,
  });
}

export function useQuest(id: string | Ref<string>) {
  const idRef = isRef(id) ? id : ref(id);
  return useQuery({
    queryKey: computed(() => [QUESTS_KEY, idRef.value]),
    queryFn: () => fetchQuest(idRef.value),
    enabled: () => !!idRef.value,
  });
}

export function useCreateQuest() {
  const queryClient = useQueryClient();
  const campaign = useCampaignStore();
  return useMutation({
    mutationFn: (quest: Omit<QuestInsert, "campaign_id">) =>
      createQuest({ ...quest, campaign_id: campaign.activeCampaignId! }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [QUESTS_KEY] }),
  });
}

export function useUpdateQuest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, update }: { id: string; update: QuestUpdate }) => updateQuest(id, update),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: [QUESTS_KEY] });
      queryClient.invalidateQueries({ queryKey: [QUESTS_KEY, id] });
    },
  });
}

export function useDeleteQuest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteQuest,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [QUESTS_KEY] }),
  });
}

// ── Objectives ─────────────────────────────────────────────────────────────────

export function useQuestObjectives(questId: string | Ref<string>) {
  const idRef = isRef(questId) ? questId : ref(questId);
  return useQuery({
    queryKey: computed(() => [OBJECTIVES_KEY, idRef.value]),
    queryFn: () => fetchObjectives(idRef.value),
    enabled: () => !!idRef.value,
  });
}

export function useCreateObjective() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createObjective,
    onSuccess: (_data, vars) =>
      queryClient.invalidateQueries({ queryKey: [OBJECTIVES_KEY, vars.quest_id] }),
  });
}

export function useUpdateObjective() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, update }: { id: string; update: QuestObjectiveUpdate; questId: string }) =>
      updateObjective(id, update),
    onSuccess: (_data, { questId }) =>
      queryClient.invalidateQueries({ queryKey: [OBJECTIVES_KEY, questId] }),
  });
}

export function useDeleteObjective() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string; questId: string }) => deleteObjective(id),
    onSuccess: (_data, { questId }) =>
      queryClient.invalidateQueries({ queryKey: [OBJECTIVES_KEY, questId] }),
  });
}

// ── Quest Refs ─────────────────────────────────────────────────────────────────

export function useQuestRefs(questId: string | Ref<string>) {
  const idRef = isRef(questId) ? questId : ref(questId);
  return useQuery({
    queryKey: computed(() => [REFS_KEY, idRef.value]),
    queryFn: () => fetchRefs(idRef.value),
    enabled: () => !!idRef.value,
  });
}

export function useCreateQuestRef() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createRef,
    onSuccess: (_data, vars) =>
      queryClient.invalidateQueries({ queryKey: [REFS_KEY, vars.quest_id] }),
  });
}

export function useUpdateQuestRef() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, update }: { id: string; questId: string; update: { is_player_visible: boolean } }) =>
      updateRef(id, update),
    onSuccess: (_data, { questId }) =>
      queryClient.invalidateQueries({ queryKey: [REFS_KEY, questId] }),
  });
}

export function useDeleteQuestRef() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string; questId: string }) => deleteRef(id),
    onSuccess: (_data, { questId }) =>
      queryClient.invalidateQueries({ queryKey: [REFS_KEY, questId] }),
  });
}

// ── Reverse lookup: quests that link to a given encounter ─────────────────────

const ENCOUNTER_QUESTS_KEY = "encounter_quests";

async function fetchQuestsForEncounter(encounterId: string): Promise<{ id: string; title: string }[]> {
  const { data, error } = await supabase
    .from("quest_refs")
    .select("quest:quests(id, title)")
    .eq("ref_type", "encounter")
    .eq("ref_id", encounterId);
  if (error) throw error;
  return (data ?? []).map((row: { quest: { id: string; title: string }[] | null }) => row.quest?.[0] ?? null).filter(Boolean) as { id: string; title: string }[];
}

export function useQuestsForEncounter(encounterId: string | Ref<string>) {
  const idRef = isRef(encounterId) ? encounterId : ref(encounterId);
  return useQuery({
    queryKey: computed(() => [ENCOUNTER_QUESTS_KEY, idRef.value]),
    queryFn: () => fetchQuestsForEncounter(idRef.value),
    enabled: () => !!idRef.value,
  });
}

// ── All encounter-quest links for a campaign (for list filter) ─────────────────

const ENCOUNTER_QUEST_LINKS_KEY = "encounter_quest_links";

async function fetchEncounterQuestLinks(): Promise<{ encounterId: string; questId: string }[]> {
  // RLS scopes this to the current user's quests; encounter list is already
  // campaign-scoped, so cross-campaign links simply won't match.
  const { data, error } = await supabase
    .from("quest_refs")
    .select("ref_id, quest_id")
    .eq("ref_type", "encounter");
  if (error) throw error;
  return (data ?? []).map(row => ({
    encounterId: (row as { ref_id: string; quest_id: string }).ref_id,
    questId: (row as { ref_id: string; quest_id: string }).quest_id,
  }));
}

export function useEncounterQuestLinks() {
  const campaign = useCampaignStore();
  const campaignId = computed(() => campaign.activeCampaignId);
  return useQuery({
    queryKey: computed(() => [ENCOUNTER_QUEST_LINKS_KEY, campaignId.value]),
    queryFn: fetchEncounterQuestLinks,
    enabled: () => !!campaignId.value,
  });
}

