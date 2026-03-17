import { computed, isRef, ref } from "vue";
import type { Ref } from "vue";
import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
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
  QuestPlayerNote,
  QuestPlayerNoteUpsert,
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
  const { data: { user } } = await supabase.auth.getUser();
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
        .eq("is_player_visible", true)
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

export function useDeleteQuestRef() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string; questId: string }) => deleteRef(id),
    onSuccess: (_data, { questId }) =>
      queryClient.invalidateQueries({ queryKey: [REFS_KEY, questId] }),
  });
}

// ── Quest Player Notes ─────────────────────────────────────────────────────────

const PLAYER_NOTES_KEY = "quest_player_notes";

async function fetchMyQuestNote(questId: string): Promise<QuestPlayerNote | null> {
  const { data, error } = await supabase
    .from("quest_player_notes")
    .select("*")
    .eq("quest_id", questId)
    .maybeSingle();
  if (error) throw error;
  return data as QuestPlayerNote | null;
}

async function fetchSharedQuestNotes(questId: string): Promise<QuestPlayerNote[]> {
  const { data, error } = await supabase
    .from("quest_player_notes")
    .select("*")
    .eq("quest_id", questId)
    .eq("is_private", false)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return data as QuestPlayerNote[];
}

async function upsertQuestPlayerNote(note: QuestPlayerNoteUpsert): Promise<QuestPlayerNote> {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("quest_player_notes")
    .upsert({ ...note, user_id: user!.id }, { onConflict: "quest_id,user_id" })
    .select()
    .single();
  if (error) throw error;
  return data as QuestPlayerNote;
}

async function deleteQuestPlayerNote(id: string): Promise<void> {
  const { error } = await supabase.from("quest_player_notes").delete().eq("id", id);
  if (error) throw error;
}

/** Fetch the current user's own note for a quest (null if they haven't written one). */
export function useMyQuestNote(questId: string | Ref<string>) {
  const idRef = isRef(questId) ? questId : ref(questId);
  return useQuery({
    queryKey: computed(() => [PLAYER_NOTES_KEY, "mine", idRef.value]),
    queryFn: () => fetchMyQuestNote(idRef.value),
    enabled: () => !!idRef.value,
  });
}

/** Fetch all shared (non-private) notes for a quest from all campaign members. */
export function useSharedQuestNotes(questId: string | Ref<string>) {
  const idRef = isRef(questId) ? questId : ref(questId);
  return useQuery({
    queryKey: computed(() => [PLAYER_NOTES_KEY, "shared", idRef.value]),
    queryFn: () => fetchSharedQuestNotes(idRef.value),
    enabled: () => !!idRef.value,
  });
}

export function useUpsertQuestPlayerNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: upsertQuestPlayerNote,
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: [PLAYER_NOTES_KEY, "mine", vars.quest_id] });
      queryClient.invalidateQueries({ queryKey: [PLAYER_NOTES_KEY, "shared", vars.quest_id] });
    },
  });
}

export function useDeleteQuestPlayerNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, questId: _questId }: { id: string; questId: string }) => deleteQuestPlayerNote(id),
    onSuccess: (_data, { questId }) => {
      queryClient.invalidateQueries({ queryKey: [PLAYER_NOTES_KEY, "mine", questId] });
      queryClient.invalidateQueries({ queryKey: [PLAYER_NOTES_KEY, "shared", questId] });
    },
  });
}
