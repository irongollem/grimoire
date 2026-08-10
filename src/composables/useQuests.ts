import { computed, isRef, ref } from "vue";
import type { Ref } from "vue";
import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { supabase, getCurrentUser } from "@/lib/supabase";
import { useCampaignStore } from "@/stores/campaign";
import { useUiStore } from "@/stores/ui";
import { sendCampaignAnnouncement } from "@/composables/useCampaignBroadcast";
import { useToast } from "@/composables/useToast";
import { EVENT_TYPE_COLORS } from "@/types/calendar.types";
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
  QuestTrigger,
  QuestTriggerInsert,
  QuestTriggerScheduled,
  TriggerType,
  CalendarEventTriggerPayload,
  BroadcastTriggerPayload,
} from "@/types/quest.types";

const QUESTS_KEY     = "quests";
const OBJECTIVES_KEY = "quest_objectives";
const REFS_KEY       = "quest_refs";
const TRIGGERS_KEY   = "quest_triggers";
const SCHEDULED_KEY  = "quest_trigger_scheduled";
const QUEST_FILTER_ENTITIES_KEY = "quest_filter_entities";

export interface QuestFilterEntityOption {
  id: string;
  name: string;
}

// All Harptos months have 30 days; intercalary days are ignored for offset math
function addHarptoDays(year: number, month: number, day: number, offsetDays: number) {
  let d = day + offsetDays;
  let m = month;
  let y = year;
  while (d > 30) { d -= 30; m++; if (m > 12) { m = 1; y++; } }
  return { year: y, month: m, day: Math.max(1, d) };
}

function harptosAbsDays(year: number, month: number, day: number) {
  return year * 12 * 30 + (month - 1) * 30 + day;
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

// ── Quest Triggers ─────────────────────────────────────────────────────────────

async function fetchTriggers(questId: string): Promise<QuestTrigger[]> {
  const { data, error } = await supabase
    .from("quest_triggers")
    .select("*")
    .eq("quest_id", questId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data as QuestTrigger[];
}

async function createTrigger(trigger: QuestTriggerInsert): Promise<QuestTrigger> {
  const user = getCurrentUser();
  const { data, error } = await supabase
    .from("quest_triggers")
    .insert({ ...trigger, user_id: user!.id })
    .select()
    .single();
  if (error) throw error;
  return data as QuestTrigger;
}

async function deleteTrigger(id: string): Promise<void> {
  const { error } = await supabase.from("quest_triggers").delete().eq("id", id);
  if (error) throw error;
}

export function useQuestTriggers(questId: string | Ref<string>) {
  const idRef = isRef(questId) ? questId : ref(questId);
  return useQuery({
    queryKey: computed(() => [TRIGGERS_KEY, idRef.value]),
    queryFn: () => fetchTriggers(idRef.value),
    enabled: () => !!idRef.value,
  });
}

export function useCreateQuestTrigger() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createTrigger,
    onSuccess: (_data, vars) =>
      queryClient.invalidateQueries({ queryKey: [TRIGGERS_KEY, vars.quest_id] }),
  });
}

export function useDeleteQuestTrigger() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string; questId: string }) => deleteTrigger(id),
    onSuccess: (_data, { questId }) =>
      queryClient.invalidateQueries({ queryKey: [TRIGGERS_KEY, questId] }),
  });
}

// ── Trigger scheduling (called on quest/objective completion) ──────────────────

/** Schedule all triggers for this quest/objective. Called when quest is completed or
 *  an objective is checked off. Creates quest_trigger_scheduled entries with computed
 *  fire dates; the DM advancing "today" will cause them to fire.  */
export async function scheduleQuestTriggers(
  questId: string,
  triggerType: TriggerType,
  objectiveId: string | null,
  today: { year: number; month: number; day: number },
  campaignId: string,
): Promise<void> {
  const user = getCurrentUser();
  if (!user) return;

  const { data: triggers, error } = await supabase
    .from("quest_triggers")
    .select("*")
    .eq("quest_id", questId)
    .eq("trigger_type", triggerType);
  if (error || !triggers?.length) return;

  const matching = triggerType === "objective_done"
    ? triggers.filter((t) => t.objective_id === objectiveId)
    : triggers;
  if (!matching.length) return;

  const rows = matching.map((t) => {
    const fireDate = addHarptoDays(today.year, today.month, today.day, (t as QuestTrigger).offset_days);
    return {
      user_id: user.id,
      campaign_id: campaignId,
      trigger_id: t.id,
      quest_id: questId,
      fire_year: fireDate.year,
      fire_month: fireDate.month,
      fire_day: fireDate.day,
      fired_at: null,
    };
  });

  await supabase.from("quest_trigger_scheduled").insert(rows);
}

// ── Trigger firing (called when DM advances "today") ───────────────────────────

/** A quest_trigger_scheduled row whose joined trigger actually resolved — the
 *  only ones that can fire (a dangling scheduled row whose trigger was since
 *  deleted has `trigger: null` and is left pending, same as before batching). */
type FiringTrigger = QuestTriggerScheduled & { trigger: QuestTrigger };

/** calendar_events insert row for a fired `create_calendar_event` trigger. */
interface FiredCalendarEventRow {
  user_id: string;
  campaign_id: string;
  title: string;
  description: string | null;
  event_type: string;
  harptos_year: number;
  harptos_month: number;
  harptos_day: number;
  festival_day: null;
  is_multi_day: boolean;
  end_year: null;
  end_month: null;
  end_day: null;
  color: string;
  linked_quest_id: string;
  linked_encounter_id: null;
  linked_location_id: null;
  travel_party_member_ids: string[];
  player_visible: boolean;
}

/**
 * Pure row-builder for fireDueTriggers: turns the due-and-resolved rows into
 * the calendar_events batch-insert payload and the plain broadcast messages
 * to send, in trigger order. Exported for testing — see fireDueTriggers for
 * the actual (batched) writes.
 */
export function buildFiredTriggerWrites(
  firing: FiringTrigger[],
  campaignId: string,
  userId: string,
): { calendarRows: FiredCalendarEventRow[]; broadcasts: string[] } {
  const calendarRows: FiredCalendarEventRow[] = [];
  const broadcasts: string[] = [];
  for (const s of firing) {
    const trigger = s.trigger;
    if (trigger.action_type === "create_calendar_event") {
      const payload = trigger.action_payload as CalendarEventTriggerPayload;
      const color = EVENT_TYPE_COLORS[payload.event_type as keyof typeof EVENT_TYPE_COLORS] ?? EVENT_TYPE_COLORS.quest;
      calendarRows.push({
        user_id: userId,
        campaign_id: campaignId,
        title: payload.title,
        description: payload.description ?? null,
        event_type: payload.event_type ?? "quest",
        harptos_year: s.fire_year,
        harptos_month: s.fire_month,
        harptos_day: s.fire_day,
        festival_day: null,
        is_multi_day: false,
        end_year: null,
        end_month: null,
        end_day: null,
        color,
        linked_quest_id: s.quest_id,
        linked_encounter_id: null,
        linked_location_id: null,
        travel_party_member_ids: [],
        player_visible: false,
      });
    } else if (trigger.action_type === "send_broadcast") {
      const payload = trigger.action_payload as BroadcastTriggerPayload;
      broadcasts.push(payload.message);
    }
  }
  return { calendarRows, broadcasts };
}

/** Fire all pending scheduled triggers that are due on or before `today`.
 *  Returns the number of triggers that fired. */
export async function fireDueTriggers(
  campaignId: string,
  today: { year: number; month: number; day: number },
): Promise<number> {
  const user = getCurrentUser();
  if (!user) return 0;

  const { data: pending, error } = await supabase
    .from("quest_trigger_scheduled")
    .select("*, trigger:quest_triggers(*)")
    .eq("campaign_id", campaignId)
    .is("fired_at", null);
  if (error || !pending?.length) return 0;

  const todayAbs = harptosAbsDays(today.year, today.month, today.day);
  const due = pending.filter((s: QuestTriggerScheduled & { trigger: QuestTrigger | null }) =>
    harptosAbsDays(s.fire_year, s.fire_month, s.fire_day) <= todayAbs,
  ) as (QuestTriggerScheduled & { trigger: QuestTrigger | null })[];

  if (!due.length) return 0;

  // Only rows whose trigger actually resolved are ones that fire — see
  // FiringTrigger above. due.length (not firing.length) is still what's
  // returned below, matching the pre-batching count exactly.
  const firing = due.filter((s): s is FiringTrigger => s.trigger !== null);

  if (firing.length > 0) {
    const { calendarRows, broadcasts } = buildFiredTriggerWrites(firing, campaignId, user.id);

    if (calendarRows.length > 0) {
      const { error: insertErr } = await supabase.from("calendar_events").insert(calendarRows);
      if (insertErr) throw insertErr;
    }

    for (const message of broadcasts) {
      await sendCampaignAnnouncement(campaignId, message);
    }

    const { error: markErr } = await supabase
      .from("quest_trigger_scheduled")
      .update({ fired_at: new Date().toISOString() })
      .in("id", firing.map((s) => s.id));
    if (markErr) throw markErr;
  }

  return due.length;
}

// ── Pending scheduled trigger count (badge for calendar) ─────────────────────

export function usePendingTriggerCount() {
  const campaign = useCampaignStore();
  const campaignId = computed(() => campaign.activeCampaignId);
  return useQuery({
    queryKey: computed(() => [SCHEDULED_KEY, campaignId.value, "pending"]),
    queryFn: async () => {
      const { count, error } = await supabase
        .from("quest_trigger_scheduled")
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", campaignId.value!)
        .is("fired_at", null);
      if (error) throw error;
      return count ?? 0;
    },
    enabled: () => !!campaignId.value,
  });
}
