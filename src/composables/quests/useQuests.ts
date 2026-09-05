import { computed, isRef, ref } from "vue";
import type { Ref } from "vue";
import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { supabase, getCurrentUser } from "@/lib/supabase";
import { useCampaignStore } from "@/stores/campaign";
import { useUiStore } from "@/stores/ui";
import { useToast } from "@/composables/useToast";
import type {
  Quest,
  QuestInsert,
  QuestUpdate,
  QuestObjective,
  QuestObjectiveInsert,
  QuestObjectiveStatus,
  QuestObjectiveUpdate,
  QuestRef,
  QuestRefInsert,
  QuestStatus,
} from "@/types/quest.types";

const QUESTS_KEY     = "quests";
const OBJECTIVES_KEY = "quest_objectives";
const REFS_KEY       = "quest_refs";
const CONSEQUENCE_EVENTS_KEY = "quest_consequence_events";
const QUEST_FILTER_ENTITIES_KEY = "quest_filter_entities";

export interface QuestFilterEntityOption {
  id: string;
  name: string;
}

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

async function fetchCampaignRefs(campaignId: string): Promise<QuestRef[]> {
  // Join through quests so one request returns exactly the active campaign's
  // facets. Fetching useQuestRefs once per card would turn the board into N+1
  // queries and make filter cost grow with campaign history.
  const { data, error } = await supabase
    .from("quest_refs")
    .select("id, quest_id, ref_type, ref_id, is_player_visible, quests!inner(campaign_id)")
    .eq("quests.campaign_id", campaignId);
  if (error) throw error;
  return (data ?? []) as unknown as QuestRef[];
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

/**
 * Player-visible quests in the active campaign. Routes through the
 * get_player_visible_quests SECURITY DEFINER projection (migration
 * 20260711000012) — NOT a base-table `select *` — so DM `notes` (Tiptap JSON)
 * never reaches the client. Players have no direct base-table read path (RLS is
 * owner-only); the projection gates rows on the player's player_visible_to.
 */
export function usePlayerVisibleQuests() {
  const campaign = useCampaignStore();
  const ui = useUiStore();
  const campaignId = computed(() => campaign.activeCampaignId);
  const previewId = computed(() => ui.dmPreviewMode ? ui.dmPreviewPartyMemberId : null);
  return useQuery({
    queryKey: computed(() => [QUESTS_KEY, campaignId.value, "player-visible", previewId.value]),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_player_visible_quests", {
        p_campaign_id: campaignId.value!,
        p_quest_id: null,
        p_preview_party_member_id: previewId.value,
      });
      if (error) throw error;
      return ((data ?? []) as Quest[]).sort(
        (a, b) => (b.updated_at ?? "").localeCompare(a.updated_at ?? ""),
      );
    },
    enabled: () => !!campaignId.value,
  });
}

/**
 * A single player-visible quest by id, via the same projection. Used by the
 * player detail view instead of useQuest (which does a base-table `select *`
 * and would leak DM `notes` to any player who opened devtools).
 */
export function usePlayerVisibleQuest(id: string | Ref<string>) {
  const idRef = isRef(id) ? id : ref(id);
  const ui = useUiStore();
  const previewId = computed(() => ui.dmPreviewMode ? ui.dmPreviewPartyMemberId : null);
  return useQuery({
    queryKey: computed(() => [QUESTS_KEY, "player-one", idRef.value, previewId.value]),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_player_visible_quests", {
        p_campaign_id: null,
        p_quest_id: idRef.value,
        p_preview_party_member_id: previewId.value,
      });
      if (error) throw error;
      return ((data ?? []) as Quest[])[0] ?? null;
    },
    enabled: () => !!idRef.value,
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
  const toast = useToast();
  return useMutation({
    mutationFn: deleteQuest,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [QUESTS_KEY] }),
    onError: (e) => toast.error(toast.fromError(e)),
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

/**
 * `update` must never carry `status` — PostgREST rejects it with 42501 since
 * migration `20260905215424` revoked the column-level grant. `status` has
 * exactly one writer now: {@link useAssertQuestObjectiveStatus}, because a
 * status change no longer just marks a checkbox, it is a condition the
 * consequence engine watches for (`quest_consequences.on_objective_status`),
 * and a raw PATCH is a change nothing is watching.
 */
export function useUpdateObjective() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, update }: { id: string; update: QuestObjectiveUpdate; questId: string }) =>
      updateObjective(id, update),
    onSuccess: (_data, { questId }) =>
      queryClient.invalidateQueries({ queryKey: [OBJECTIVES_KEY, questId] }),
  });
}

/**
 * The DM saying "this happened" — the only way to move `quest_objectives.status`
 * since #794. Runs `private.apply_quest_consequences` server-side, so a status
 * change can raise/reveal/complete/fail other objectives, fire a delayed world
 * action, or settle the quest, in the same transaction. Also invalidates the
 * consequence-events log and the calendar, since either can gain a row as a
 * side effect of this one call.
 */
export function useAssertQuestObjectiveStatus() {
  const queryClient = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: async (input: { objectiveId: string; questId: string; status: QuestObjectiveStatus; reason?: string }) => {
      const { data, error } = await supabase.rpc("assert_quest_objective_status", {
        p_objective_id: input.objectiveId,
        p_status: input.status,
        p_reason: input.reason ?? null,
      });
      if (error) throw error;
      return data as { changed: boolean; status: QuestObjectiveStatus; transition_id?: string };
    },
    onSuccess: (_result, { questId }) => {
      queryClient.invalidateQueries({ queryKey: [OBJECTIVES_KEY, questId] });
      queryClient.invalidateQueries({ queryKey: [CONSEQUENCE_EVENTS_KEY] });
      queryClient.invalidateQueries({ queryKey: ["calendar-events"] });
    },
    onError: (e) => toast.error(toast.fromError(e)),
  });
}

export function useDeleteObjective() {
  const queryClient = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: ({ id }: { id: string; questId: string }) => deleteObjective(id),
    onSuccess: (_data, { questId }) =>
      queryClient.invalidateQueries({ queryKey: [OBJECTIVES_KEY, questId] }),
    onError: (e) => toast.error(toast.fromError(e)),
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

/** One campaign-scoped query for board filters and summary facets. */
export function useCampaignQuestRefs(enabled?: () => boolean) {
  const campaign = useCampaignStore();
  const campaignId = computed(() => campaign.activeCampaignId);
  return useQuery({
    queryKey: computed(() => [REFS_KEY, "campaign", campaignId.value]),
    queryFn: () => fetchCampaignRefs(campaignId.value!),
    enabled: () => !!campaignId.value && (enabled?.() ?? true),
  });
}

/** Minimal id/name rows for the quest entity facet — deliberately not useNpcs(),
 * which would download every NPC's prose and stat block just to label a filter. */
export function useQuestFilterEntities(enabled?: () => boolean) {
  const campaign = useCampaignStore();
  const campaignId = computed(() => campaign.activeCampaignId);
  return useQuery({
    queryKey: computed(() => [QUEST_FILTER_ENTITIES_KEY, campaignId.value]),
    queryFn: async (): Promise<QuestFilterEntityOption[]> => {
      const campaignOrGlobal = `campaign_id.eq.${campaignId.value!},campaign_id.is.null`;
      const [npcs, locations, factions] = await Promise.all([
        supabase.from("npcs").select("id, name").or(campaignOrGlobal).order("name"),
        supabase.from("locations").select("id, name").or(campaignOrGlobal).order("name"),
        supabase.from("factions").select("id, name").or(campaignOrGlobal).order("name"),
      ]);
      if (npcs.error) throw npcs.error;
      if (locations.error) throw locations.error;
      if (factions.error) throw factions.error;
      return [
        ...(npcs.data ?? []).map((row) => ({ id: `npc:${row.id}`, name: `NPC · ${row.name}` })),
        ...(locations.data ?? []).map((row) => ({ id: `location:${row.id}`, name: `Location · ${row.name}` })),
        ...(factions.data ?? []).map((row) => ({ id: `faction:${row.id}`, name: `Faction · ${row.name}` })),
      ];
    },
    enabled: () => !!campaignId.value && (enabled?.() ?? true),
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
  const toast = useToast();
  return useMutation({
    mutationFn: ({ id }: { id: string; questId: string }) => deleteRef(id),
    onSuccess: (_data, { questId }) =>
      queryClient.invalidateQueries({ queryKey: [REFS_KEY, questId] }),
    onError: (e) => toast.error(toast.fromError(e)),
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

