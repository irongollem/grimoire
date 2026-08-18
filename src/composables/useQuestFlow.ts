import { computed, isRef, ref, type Ref } from "vue";
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { summarizeQuestBeatAttachment } from "@/lib/quests/attachments";
import { QUEST_OBJECTIVE_STATUS_LABELS } from "@/lib/quests/objectives";
import type { QuestObjectiveStatus } from "@/types/quest.types";
import { deriveQuestBoardSummaries, type QuestBoardSummary } from "@/lib/quests/board";
import { toQuestRuntimeRpcArgs, type QuestRuntimeCommandInput } from "@/lib/quests/runtime";
import { useCampaignStore } from "@/stores/campaign";
import { useUiStore } from "@/stores/ui";
import type {
  PlayerQuestBeat,
  PlayerQuestBeatVisit,
  QuestBeat,
  QuestBeatEdge,
  QuestBeatEdgeInsert,
  QuestBeatInsert,
  QuestBeatTransition,
  QuestBeatUpdate,
  QuestBeatAttachment,
  QuestBeatAttachmentInsert,
  QuestBeatAttachmentSummary,
  QuestBeatLoot,
  QuestBeatLootInsert,
  QuestRuntimeContext,
  QuestRuntimeJumpTarget,
  QuestObjectiveEffect,
  QuestObjectiveEffectInsert,
  QuestRuntimeState,
} from "@/types/quest.types";

const BEATS_KEY = "quest_beats";
const EDGES_KEY = "quest_beat_edges";
const RUNTIME_KEY = "quest_runtime_state";
const RUNTIME_CONTEXT_KEY = "quest_runtime_context";
const TRANSITIONS_KEY = "quest_beat_transitions";
const ATTACHMENTS_KEY = "quest_beat_attachments";
const LOOT_KEY = "quest_beat_loot";
const OBJECTIVE_EFFECTS_KEY = "quest_objective_effects";

/** Player projections are audience-keyed. An authored beat change can alter
 * every audience's safe DTO, so invalidating only the authored quest key leaves
 * previously previewed players showing different snapshots for up to a minute. */
export function invalidatePlayerQuestBeatProjections(queryClient: ReturnType<typeof useQueryClient>) {
  return queryClient.invalidateQueries({ queryKey: [BEATS_KEY, "player"] });
}

function asRef(value: string | Ref<string>): Ref<string> {
  return isRef(value) ? value : ref(value);
}

export function prepareQuestBeatOptimisticUpdate(
  rows: QuestBeat[] | undefined,
  id: string,
  update: QuestBeatUpdate,
) {
  return {
    previous: rows,
    optimistic: rows?.map((beat) => beat.id === id ? { ...beat, ...update } : beat),
  };
}

async function fetchBeats(questId: string): Promise<QuestBeat[]> {
  const { data, error } = await supabase
    .from("quest_beats")
    .select("*")
    .eq("quest_id", questId)
    .neq("kind", "archived")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as QuestBeat[];
}

async function fetchEdges(questId: string): Promise<QuestBeatEdge[]> {
  const { data, error } = await supabase
    .from("quest_beat_edges")
    .select("*")
    .eq("quest_id", questId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as QuestBeatEdge[];
}

export function useQuestBeats(questId: string | Ref<string>) {
  const id = asRef(questId);
  return useQuery({
    queryKey: computed(() => [BEATS_KEY, id.value]),
    queryFn: () => fetchBeats(id.value),
    enabled: () => !!id.value,
  });
}

export function useQuestBeat(beatId: string | Ref<string>) {
  const id = asRef(beatId);
  return useQuery({
    queryKey: computed(() => [BEATS_KEY, "detail", id.value]),
    queryFn: async (): Promise<QuestBeat> => {
      const { data, error } = await supabase.from("quest_beats").select("*").eq("id", id.value).single();
      if (error) throw error;
      return data as QuestBeat;
    },
    enabled: () => !!id.value,
  });
}

export function useQuestBeatEdges(questId: string | Ref<string>) {
  const id = asRef(questId);
  return useQuery({
    queryKey: computed(() => [EDGES_KEY, id.value]),
    queryFn: () => fetchEdges(id.value),
    enabled: () => !!id.value,
  });
}

async function fetchAttachments(questId: string): Promise<QuestBeatAttachment[]> {
  const { data, error } = await supabase
    .from("quest_beat_attachments")
    .select("*")
    .eq("quest_id", questId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as QuestBeatAttachment[];
}

type AttachmentTarget = { label: string; detail?: string | null };

async function fetchAttachmentTargets(
  attachments: QuestBeatAttachment[],
): Promise<Map<string, AttachmentTarget>> {
  const targets = new Map<string, AttachmentTarget>();
  const definitions = [
    ["encounter", "encounters", "id, name", "name"],
    ["objective", "quest_objectives", "id, description, status", "description"],
    ["quest_ref", "quest_refs", "id, ref_type", "ref_type"],
    ["location_set", "locations", "id, name", "name"],
    ["npc", "npcs", "id, name", "name"],
    ["faction", "factions", "id, name", "name"],
    ["item", "items", "id, name", "name"],
    ["monster", "monsters", "id, name", "name"],
    ["sound", "sounds", "id, name", "name"],
    ["audio_scene", "soundboard_playlists", "id, name", "name"],
    ["playlist", "soundboard_playlists", "id, name", "name"],
    ["note", "notes", "id, title", "title"],
    ["handout", "scriptorium_documents", "id, title", "title"],
  ] as const;

  await Promise.all(definitions.map(async ([type, table, select, labelKey]) => {
    const ids = attachments.filter((a) => a.attachment_type === type).map((a) => a.ref_id);
    if (ids.length === 0) return;
    const { data, error } = await supabase.from(table).select(select).in("id", ids);
    if (error) throw error;
    for (const raw of data ?? []) {
      const row = raw as unknown as Record<string, unknown>;
      const id = String(row.id);
      const detail = type === "objective" ? QUEST_OBJECTIVE_STATUS_LABELS[row.status as QuestObjectiveStatus] ?? "Open" : null;
      targets.set(`${type}:${id}`, { label: String(row[labelKey] ?? "Untitled"), detail });
    }
  }));
  return targets;
}

export function useQuestBeatAttachments(questId: string | Ref<string>) {
  const id = asRef(questId);
  return useQuery({
    queryKey: computed(() => [ATTACHMENTS_KEY, id.value]),
    queryFn: () => fetchAttachments(id.value),
    enabled: () => !!id.value,
  });
}

/** Quest-scoped and campaign-scoped callers share one aggregate RPC. That RPC
 * joins dispatch messages once, so cards never fetch claim state one by one. */
export function useQuestBeatLoot(questId?: string | Ref<string>) {
  const campaign = useCampaignStore();
  const id = questId === undefined ? ref("") : asRef(questId);
  return useQuery({
    queryKey: computed(() => [LOOT_KEY, campaign.activeCampaignId, id.value || "all"]),
    queryFn: async (): Promise<QuestBeatLoot[]> => {
      const { data, error } = await supabase.rpc("get_quest_beat_loot", {
        p_campaign_id: campaign.activeCampaignId!,
        p_quest_id: id.value || null,
      });
      if (error) throw error;
      return (data ?? []) as QuestBeatLoot[];
    },
    enabled: () => !!campaign.activeCampaignId,
  });
}

export function useCreateQuestBeatLoot() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (entry: QuestBeatLootInsert) => {
      const { data, error } = await supabase.from("quest_beat_loot").insert(entry).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, input) => {
      void queryClient.invalidateQueries({ queryKey: [LOOT_KEY, input.campaign_id] });
      void queryClient.invalidateQueries({ queryKey: [BEATS_KEY, "board", input.campaign_id] });
    },
  });
}

export function useDeleteQuestBeatLoot() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; campaignId: string }) => {
      const { data, error } = await supabase.from("quest_beat_loot").delete().eq("id", input.id).is("dispatched_at", null).select("id").maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Only held loot can be removed; dispatched chat keeps its provenance.");
    },
    onSuccess: (_data, input) => {
      void queryClient.invalidateQueries({ queryKey: [LOOT_KEY, input.campaignId] });
      void queryClient.invalidateQueries({ queryKey: [BEATS_KEY, "board", input.campaignId] });
    },
  });
}

export function useDispatchQuestBeatLoot() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { beatId: string; entryId?: string | null; campaignId: string }) => {
      const { data, error } = await supabase.rpc("dispatch_quest_beat_loot", {
        p_beat_id: input.beatId,
        p_entry_id: input.entryId ?? null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, input) => {
      void queryClient.invalidateQueries({ queryKey: [LOOT_KEY, input.campaignId] });
      void queryClient.invalidateQueries({ queryKey: [BEATS_KEY, "board", input.campaignId] });
    },
  });
}

/** Resolves every attachment in a bounded set of type-batched queries. Query
 * count grows with supported adapter types, never with beat/card count. */
export function useQuestBeatAttachmentSummaries(questId: string | Ref<string>) {
  const id = asRef(questId);
  return useQuery({
    queryKey: computed(() => [ATTACHMENTS_KEY, id.value, "summaries"]),
    queryFn: async (): Promise<QuestBeatAttachmentSummary[]> => {
      const attachments = await fetchAttachments(id.value);
      const targets = await fetchAttachmentTargets(attachments);
      return attachments.map((attachment) => summarizeQuestBeatAttachment(
        attachment,
        targets.get(`${attachment.attachment_type}:${attachment.ref_id}`) ?? null,
      ));
    },
    enabled: () => !!id.value,
  });
}

/** Campaign-wide board data uses a fixed set of batched queries. Adding cards,
 * beats, or loot entries never increases its query count. */
export function useQuestBoardSummaries() {
  const campaign = useCampaignStore();
  return useQuery({
    queryKey: computed(() => [BEATS_KEY, "board", campaign.activeCampaignId]),
    queryFn: async (): Promise<Record<string, QuestBoardSummary>> => {
      const campaignId = campaign.activeCampaignId!;
      const [beatsResult, edgesResult, attachmentsResult, runtimeResult, transitionsResult, lootResult] = await Promise.all([
        supabase.from("quest_beats").select("*").eq("campaign_id", campaignId).neq("kind", "archived").order("created_at"),
        supabase.from("quest_beat_edges").select("*").eq("campaign_id", campaignId).order("created_at"),
        supabase.from("quest_beat_attachments").select("*").eq("campaign_id", campaignId).order("sort_order").order("created_at"),
        supabase.from("quest_runtime_state").select("*").eq("campaign_id", campaignId).maybeSingle(),
        supabase.from("quest_beat_transitions").select("*").eq("campaign_id", campaignId).order("created_at"),
        supabase.rpc("get_quest_beat_loot", { p_campaign_id: campaignId, p_quest_id: null }),
      ]);
      const error = [beatsResult, edgesResult, attachmentsResult, runtimeResult, transitionsResult, lootResult]
        .find((result) => result.error)?.error;
      if (error) throw error;

      const attachmentRows = (attachmentsResult.data ?? []) as QuestBeatAttachment[];
      const targets = await fetchAttachmentTargets(attachmentRows);
      const attachments = attachmentRows.map((attachment) => summarizeQuestBeatAttachment(
        attachment,
        targets.get(`${attachment.attachment_type}:${attachment.ref_id}`) ?? null,
      ));
      return deriveQuestBoardSummaries({
        beats: (beatsResult.data ?? []) as QuestBeat[],
        edges: (edgesResult.data ?? []) as QuestBeatEdge[],
        attachments,
        runtime: runtimeResult.data as QuestRuntimeState | null,
        transitions: (transitionsResult.data ?? []) as QuestBeatTransition[],
        loot: (lootResult.data ?? []) as QuestBeatLoot[],
      });
    },
    enabled: () => !!campaign.activeCampaignId,
  });
}

export function useCreateQuestBeatAttachment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (attachment: QuestBeatAttachmentInsert): Promise<QuestBeatAttachment> => {
      const { data, error } = await supabase
        .from("quest_beat_attachments")
        .insert(attachment)
        .select()
        .single();
      if (error) throw error;
      return data as QuestBeatAttachment;
    },
    onSuccess: (_attachment, input) => {
      queryClient.invalidateQueries({ queryKey: [ATTACHMENTS_KEY, input.quest_id] });
      void invalidatePlayerQuestBeatProjections(queryClient);
    },
  });
}

export function useDeleteQuestBeatAttachment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; questId: string }) => {
      const { error } = await supabase.from("quest_beat_attachments").delete().eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: (_result, input) => {
      queryClient.invalidateQueries({ queryKey: [ATTACHMENTS_KEY, input.questId] });
      void invalidatePlayerQuestBeatProjections(queryClient);
    },
  });
}

export async function setQuestBeatAttachmentRequired(id: string, isRequired: boolean): Promise<QuestBeatAttachment> {
  const { data, error } = await supabase
    .from("quest_beat_attachments")
    .update({ is_required: isRequired })
    .eq("id", id)
    .select()
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("This beat placement is no longer available. Reload before changing it.");
  return data as QuestBeatAttachment;
}

export function useSetQuestBeatAttachmentRequired() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; questId: string; isRequired: boolean }) => setQuestBeatAttachmentRequired(input.id, input.isRequired),
    onSettled: (_attachment, _error, input) => {
      queryClient.invalidateQueries({ queryKey: [ATTACHMENTS_KEY, input.questId] });
    },
  });
}

export function useCreateQuestBeat() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (beat: QuestBeatInsert): Promise<QuestBeat> => {
      const { data, error } = await supabase.from("quest_beats").insert(beat).select().single();
      if (error) throw error;
      return data as QuestBeat;
    },
    onSuccess: (_beat, input) => {
      queryClient.invalidateQueries({ queryKey: [BEATS_KEY, input.quest_id] });
      void invalidatePlayerQuestBeatProjections(queryClient);
    },
  });
}

export interface CreateQuestBeatWithRouteInput {
  questId: string;
  title: string;
  kind: string;
  canvasX: number;
  canvasY: number;
  sourceBeatId?: string;
  edgeLabel?: string;
}

export async function createQuestBeatWithRoute(input: CreateQuestBeatWithRouteInput): Promise<QuestBeat> {
  const { data, error } = await supabase.rpc("create_quest_beat_with_route", {
    p_quest_id: input.questId,
    p_title: input.title,
    p_kind: input.kind,
    p_canvas_x: input.canvasX,
    p_canvas_y: input.canvasY,
    p_source_beat_id: input.sourceBeatId ?? null,
    p_edge_label: input.edgeLabel ?? "",
  });
  if (error) throw error;
  return data as QuestBeat;
}

export function useCreateQuestBeatWithRoute() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createQuestBeatWithRoute,
    onSettled: (_beat, _error, input) => {
      queryClient.invalidateQueries({ queryKey: [BEATS_KEY, input.questId] });
      queryClient.invalidateQueries({ queryKey: [EDGES_KEY, input.questId] });
    },
  });
}

export function useUpdateQuestBeat() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; questId: string; update: QuestBeatUpdate; expectedUpdatedAt?: string }) => {
      let query = supabase
        .from("quest_beats")
        .update(input.update)
        .eq("id", input.id);
      if (input.expectedUpdatedAt) query = query.eq("updated_at", input.expectedUpdatedAt);
      const { data, error } = await query.select().maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("This beat changed in another window. Reload it before saving your edits.");
      return data as QuestBeat;
    },
    onMutate: async (input) => {
      const key = [BEATS_KEY, input.questId];
      await queryClient.cancelQueries({ queryKey: key });
      const snapshot = prepareQuestBeatOptimisticUpdate(
        queryClient.getQueryData<QuestBeat[]>(key),
        input.id,
        input.update,
      );
      const previous = snapshot.previous;
      queryClient.setQueryData<QuestBeat[]>(key, snapshot.optimistic);
      return { key, previous };
    },
    onError: (_error, _input, context) => {
      if (context?.previous !== undefined) queryClient.setQueryData(context.key, context.previous);
    },
    onSettled: (_beat, _error, input) => {
      queryClient.invalidateQueries({ queryKey: [BEATS_KEY, input.questId] });
      queryClient.invalidateQueries({ queryKey: [BEATS_KEY, "detail", input.id] });
      void invalidatePlayerQuestBeatProjections(queryClient);
    },
  });
}

export function useDeleteQuestBeat() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; questId: string }) => {
      const { error } = await supabase.from("quest_beats").delete().eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: (_result, input) => {
      queryClient.invalidateQueries({ queryKey: [BEATS_KEY, input.questId] });
      queryClient.invalidateQueries({ queryKey: [EDGES_KEY, input.questId] });
      void invalidatePlayerQuestBeatProjections(queryClient);
    },
  });
}

/** Soft deletion keeps transition FKs/history intact while removing the beat
 * from authored flow. Only beat-owned placements and routes are detached; their
 * authoritative encounters/entities remain untouched. */
export interface ArchiveQuestBeatInput {
  id: string;
  expectedRuntimeVersion?: number;
  replacementBeatId?: string;
  endRuntime?: boolean;
}

export async function archiveQuestBeat(input: ArchiveQuestBeatInput) {
  const { error } = await supabase.rpc("archive_quest_beat", {
    p_beat_id: input.id,
    p_expected_runtime_version: input.expectedRuntimeVersion ?? null,
    p_replacement_beat_id: input.replacementBeatId ?? null,
    p_end_runtime: input.endRuntime ?? false,
  });
  if (error) throw error;
}

export function useArchiveQuestBeat() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ArchiveQuestBeatInput & { questId: string }) => archiveQuestBeat(input),
    onSettled: (_data, _error, input) => {
      queryClient.invalidateQueries({ queryKey: [BEATS_KEY, input.questId] });
      queryClient.invalidateQueries({ queryKey: [EDGES_KEY, input.questId] });
      queryClient.invalidateQueries({ queryKey: [ATTACHMENTS_KEY, input.questId] });
      queryClient.invalidateQueries({ queryKey: [RUNTIME_KEY] });
      queryClient.invalidateQueries({ queryKey: [RUNTIME_CONTEXT_KEY] });
      queryClient.invalidateQueries({ queryKey: [TRANSITIONS_KEY] });
    },
  });
}

export function useCreateQuestBeatEdge() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (edge: QuestBeatEdgeInsert): Promise<QuestBeatEdge> => {
      const { data, error } = await supabase.from("quest_beat_edges").insert(edge).select().single();
      if (error) throw error;
      return data as QuestBeatEdge;
    },
    onSuccess: (_edge, input) => {
      queryClient.invalidateQueries({ queryKey: [EDGES_KEY, input.quest_id] });
    },
  });
}

export function useDeleteQuestBeatEdge() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; questId: string }) => {
      const { error } = await supabase.from("quest_beat_edges").delete().eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: (_result, input) => {
      queryClient.invalidateQueries({ queryKey: [EDGES_KEY, input.questId] });
    },
  });
}

export function useUpdateQuestBeatEdge() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; questId: string; update: Partial<Pick<QuestBeatEdge, "source_beat_id" | "target_beat_id" | "label">> }) => {
      const { data, error } = await supabase.from("quest_beat_edges").update(input.update).eq("id", input.id).select().single();
      if (error) throw error;
      return data as QuestBeatEdge;
    },
    onSettled: (_data, _error, input) => queryClient.invalidateQueries({ queryKey: [EDGES_KEY, input.questId] }),
  });
}

export function useQuestRuntimeState() {
  const campaign = useCampaignStore();
  const campaignId = computed(() => campaign.activeCampaignId);
  return useQuery({
    queryKey: computed(() => [RUNTIME_KEY, campaignId.value]),
    queryFn: async (): Promise<QuestRuntimeState | null> => {
      const { data, error } = await supabase
        .from("quest_runtime_state")
        .select("*")
        .eq("campaign_id", campaignId.value!)
        .maybeSingle();
      if (error) throw error;
      return data as QuestRuntimeState | null;
    },
    enabled: () => !!campaignId.value,
    refetchInterval: 5_000,
  });
}

export function useQuestRuntimeContext() {
  const campaign = useCampaignStore();
  const campaignId = computed(() => campaign.activeCampaignId);
  return useQuery({
    queryKey: computed(() => [RUNTIME_CONTEXT_KEY, campaignId.value]),
    queryFn: async (): Promise<QuestRuntimeContext> => {
      const { data, error } = await supabase.rpc("get_quest_runtime_context", { p_campaign_id: campaignId.value! });
      if (error) throw error;
      return data as QuestRuntimeContext;
    },
    enabled: () => !!campaignId.value,
    refetchInterval: 5_000,
  });
}

export function useQuestRuntimeJumpTargets(search: string | Ref<string>) {
  const campaign = useCampaignStore();
  const campaignId = computed(() => campaign.activeCampaignId);
  const query = asRef(search);
  return useQuery({
    queryKey: computed(() => [RUNTIME_CONTEXT_KEY, "jump-targets", campaignId.value, query.value]),
    queryFn: async (): Promise<QuestRuntimeJumpTarget[]> => {
      const { data, error } = await supabase.rpc("search_quest_runtime_jump_targets", {
        p_campaign_id: campaignId.value!,
        p_search: query.value,
        p_limit: 30,
      });
      if (error) throw error;
      return (data ?? []) as QuestRuntimeJumpTarget[];
    },
    enabled: () => !!campaignId.value,
  });
}

export function useQuestRuntimeCommand() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: QuestRuntimeCommandInput): Promise<QuestRuntimeContext> => {
      const { data, error } = await supabase.rpc("transition_quest_runtime", toQuestRuntimeRpcArgs(input));
      if (error) throw error;
      return data as QuestRuntimeContext;
    },
    onSuccess: (context, input) => {
      queryClient.setQueryData([RUNTIME_CONTEXT_KEY, input.campaignId], context);
      queryClient.setQueryData([RUNTIME_KEY, input.campaignId], context.state);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: [RUNTIME_KEY] });
      queryClient.invalidateQueries({ queryKey: [RUNTIME_CONTEXT_KEY] });
      queryClient.invalidateQueries({ queryKey: [TRANSITIONS_KEY] });
    },
  });
}

export interface QuestRuntimeImprovInput {
  campaignId: string;
  expectedVersion: number;
  title: string;
  kind: string;
  dmLead: string;
  revealText: string;
  reason: string;
  pushReturn: boolean;
  keepEdge: boolean;
}

export function useQuestRuntimeImprovise() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: QuestRuntimeImprovInput): Promise<{ context: QuestRuntimeContext; beat: QuestBeat }> => {
      const { data, error } = await supabase.rpc("improvise_quest_runtime", {
        p_campaign_id: input.campaignId,
        p_expected_version: input.expectedVersion,
        p_title: input.title,
        p_kind: input.kind,
        p_dm_lead: input.dmLead || null,
        p_reveal_text: input.revealText || null,
        p_reason: input.reason,
        p_push_return: input.pushReturn,
        p_keep_edge: input.keepEdge,
        p_edge_label: "Improvised",
      });
      if (error) throw error;
      return data as { context: QuestRuntimeContext; beat: QuestBeat };
    },
    onSuccess: ({ context }, input) => {
      queryClient.setQueryData([RUNTIME_CONTEXT_KEY, input.campaignId], context);
      queryClient.setQueryData([RUNTIME_KEY, input.campaignId], context.state);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: [RUNTIME_KEY] });
      queryClient.invalidateQueries({ queryKey: [RUNTIME_CONTEXT_KEY] });
      queryClient.invalidateQueries({ queryKey: [TRANSITIONS_KEY] });
      queryClient.invalidateQueries({ queryKey: [BEATS_KEY] });
      queryClient.invalidateQueries({ queryKey: [EDGES_KEY] });
    },
  });
}

export function useQuestBeatTransitions(limit = 100) {
  const campaign = useCampaignStore();
  const campaignId = computed(() => campaign.activeCampaignId);
  return useQuery({
    queryKey: computed(() => [TRANSITIONS_KEY, campaignId.value, limit]),
    queryFn: async (): Promise<QuestBeatTransition[]> => {
      const { data, error } = await supabase
        .from("quest_beat_transitions")
        .select("*")
        .eq("campaign_id", campaignId.value!)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as QuestBeatTransition[];
    },
    enabled: () => !!campaignId.value,
  });
}

/** Full authored-quest history for Build/Run context. This is one quest-scoped
 * query and does not truncate old visits as the campaign-wide activity feed does. */
export function useQuestBeatTransitionsForQuest(questId: string | Ref<string>) {
  const id = asRef(questId);
  return useQuery({
    queryKey: computed(() => [TRANSITIONS_KEY, "quest", id.value]),
    queryFn: async (): Promise<QuestBeatTransition[]> => {
      const { data, error } = await supabase
        .from("quest_beat_transitions")
        .select("*")
        .or(`from_quest_id.eq.${id.value},to_quest_id.eq.${id.value}`)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as QuestBeatTransition[];
    },
    enabled: () => !!id.value,
  });
}

export function usePlayerQuestBeats(questId?: string | Ref<string>, previewPartyMemberId?: Ref<string | null>) {
  const campaign = useCampaignStore();
  const ui = useUiStore();
  const campaignId = computed(() => campaign.activeCampaignId);
  const id = questId === undefined ? ref("") : asRef(questId);
  const previewId = computed(() => previewPartyMemberId?.value ?? (ui.dmPreviewMode ? ui.dmPreviewPartyMemberId : null));
  return useQuery({
    queryKey: computed(() => [BEATS_KEY, "player", campaignId.value, id.value || "all", previewId.value]),
    queryFn: async (): Promise<PlayerQuestBeat[]> => {
      const { data, error } = await supabase.rpc("get_player_visible_quest_beats", {
        p_campaign_id: campaignId.value!,
        p_quest_id: id.value || null,
        p_preview_party_member_id: previewId.value,
      });
      if (error) throw error;
      return (data ?? []) as PlayerQuestBeat[];
    },
    enabled: () => !!campaignId.value,
  });
}

export function usePlayerQuestBeatHistory(questId?: string | Ref<string>, previewPartyMemberId?: Ref<string | null>) {
  const campaign = useCampaignStore();
  const ui = useUiStore();
  const campaignId = computed(() => campaign.activeCampaignId);
  const id = questId === undefined ? ref("") : asRef(questId);
  const previewId = computed(() => previewPartyMemberId?.value ?? (ui.dmPreviewMode ? ui.dmPreviewPartyMemberId : null));
  return useQuery({
    queryKey: computed(() => [TRANSITIONS_KEY, "player", campaignId.value, id.value || "all", previewId.value]),
    queryFn: async (): Promise<PlayerQuestBeatVisit[]> => {
      const { data, error } = await supabase.rpc("get_player_visible_quest_beats", {
        p_campaign_id: campaignId.value!,
        p_quest_id: id.value || null,
        p_preview_party_member_id: previewId.value,
      });
      if (error) throw error;
      return ((data ?? []) as PlayerQuestBeat[])
        .flatMap((beat) => beat.visits.map((visit) => ({
          ...visit,
          beat_id: beat.id,
          quest_id: beat.quest_id,
          visibility: beat.visibility,
          player_text: beat.player_text,
        })))
        .sort((a, b) => a.visited_at.localeCompare(b.visited_at) || a.visit_id.localeCompare(b.visit_id));
    },
    enabled: () => !!campaignId.value,
  });
}


/**
 * The rules that let the flow decide an objective: arriving at a beat, or taking
 * one branch out of it, can reveal, complete or fail it.
 *
 * Applied inside `transition_quest_runtime` rather than here, so the objective
 * moves in the same transaction as the party — and so stepping back can undo it,
 * which needs the state each rule overwrote.
 */
export function useQuestObjectiveEffects(questId: string | Ref<string>) {
  const id = asRef(questId);
  return useQuery({
    queryKey: computed(() => [OBJECTIVE_EFFECTS_KEY, id.value]),
    queryFn: async (): Promise<QuestObjectiveEffect[]> => {
      const { data, error } = await supabase
        .from("quest_objective_effects")
        .select("*")
        .eq("quest_id", id.value)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as QuestObjectiveEffect[];
    },
    enabled: () => !!id.value,
  });
}

export function useCreateQuestObjectiveEffect() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: QuestObjectiveEffectInsert): Promise<QuestObjectiveEffect> => {
      const { data, error } = await supabase.from("quest_objective_effects").insert(input).select().single();
      if (error) throw error;
      return data as QuestObjectiveEffect;
    },
    onSuccess: (_effect, input) => {
      queryClient.invalidateQueries({ queryKey: [OBJECTIVE_EFFECTS_KEY, input.quest_id] });
    },
  });
}

export function useDeleteQuestObjectiveEffect() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; questId: string }) => {
      const { error } = await supabase.from("quest_objective_effects").delete().eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: (_result, input) => {
      queryClient.invalidateQueries({ queryKey: [OBJECTIVE_EFFECTS_KEY, input.questId] });
    },
  });
}
