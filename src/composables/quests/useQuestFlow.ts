import { computed, isRef, ref, type Ref } from "vue";
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { summarizeQuestBeatAttachment } from "@/lib/quests/attachments";
import { deriveQuestBoardSummaries, type QuestBoardSummary } from "@/lib/quests/board";
import { toQuestRuntimeRpcArgs, type QuestRuntimeCommandInput } from "@/lib/quests/runtime";
import { useCampaignStore } from "@/stores/campaign";
import { useUiStore } from "@/stores/ui";
import type {
  PlayerQuestBeat,
  PlayerQuestBeatVisit,
  QuestBeat,
  QuestBeatEdge,
  QuestBeatEdgeGate,
  QuestBeatEdgeInsert,
  QuestBeatInsert,
  QuestBeatTransition,
  QuestBeatUpdate,
  QuestBeatAttachment,
  QuestBeatAttachmentInsert,
  QuestBeatAttachmentSummary,
  LootPlacement,
  LootPlacementInsert,
  QuestConsequenceObjectiveStatus,
  CampaignLiveQuest,
  QuestRuntimeContext,
  QuestRuntimeJumpTarget,
  QuestConsequence,
  QuestConsequenceInsert,
  QuestRuntimeState,
  QuestThread,
} from "@/types/quest.types";

/** Exported so `useQuestThreads` can invalidate the board summary too — a
 *  thread opening or closing changes what the board's `threads[]` shows. */
export const BEATS_KEY = "quest_beats";
const EDGES_KEY = "quest_beat_edges";
const EDGE_GATES_KEY = "quest_beat_edge_gates";
const RUNTIME_KEY = "quest_runtime_state";
const RUNTIME_CONTEXT_KEY = "quest_runtime_context";
const TRANSITIONS_KEY = "quest_beat_transitions";

/** Every cache a runtime move invalidates. Exported because ending a *session*
 *  moves the cursors too — `end_campaign_session` pauses every open chain
 *  server-side, so the client has to be told its runtime views are stale. */
export const QUEST_RUNTIME_QUERY_KEYS = [RUNTIME_KEY, RUNTIME_CONTEXT_KEY, TRANSITIONS_KEY] as const;
const ATTACHMENTS_KEY = "quest_beat_attachments";
const LOOT_KEY = "loot_placements";
const CONSEQUENCES_KEY = "quest_consequences";

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

async function fetchEdgeGates(questId: string): Promise<QuestBeatEdgeGate[]> {
  const { data, error } = await supabase
    .from("quest_beat_edge_gates")
    .select("*")
    .eq("quest_id", questId);
  if (error) throw error;
  return (data ?? []) as QuestBeatEdgeGate[];
}

/** Raw gate rows for a quest's routes. `deriveQuestRouteGates` joins these
 *  against `useQuestObjectives`' rows to say whether each is open. */
export function useQuestBeatEdgeGates(questId: string | Ref<string>) {
  const id = asRef(questId);
  return useQuery({
    queryKey: computed(() => [EDGE_GATES_KEY, id.value]),
    queryFn: () => fetchEdgeGates(id.value),
    enabled: () => !!id.value,
  });
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
      targets.set(`${type}:${id}`, { label: String(row[labelKey] ?? "Untitled"), detail: null });
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

export interface LootPlacementFilter {
  questId?: string | Ref<string>;
  /** A room's loot (#830). Mutually meaningful with `questId` cleared — a
   *  location-homed row has no quest — but the RPC accepts either, both, or
   *  neither filter and narrows whichever is passed. */
  locationId?: string | Ref<string>;
}

/** Quest-scoped, location-scoped, and campaign-scoped callers share one
 * aggregate RPC. That RPC joins dispatch messages once, so cards never fetch
 * claim state one by one. Both filters are optional and independent: pass
 * `questId` for a beat's story flow, `locationId` for a room's loot panel
 * (#830), or neither for the whole campaign (`useQuestBoardSummaries`, which
 * calls the RPC directly rather than through this composable). */
export function useLootPlacements(filter: LootPlacementFilter = {}) {
  const campaign = useCampaignStore();
  const questIdRef = filter.questId === undefined ? ref("") : asRef(filter.questId);
  const locationIdRef = filter.locationId === undefined ? ref("") : asRef(filter.locationId);
  return useQuery({
    queryKey: computed(() => [LOOT_KEY, campaign.activeCampaignId, questIdRef.value || "all", locationIdRef.value || "all"]),
    queryFn: async (): Promise<LootPlacement[]> => {
      const { data, error } = await supabase.rpc("get_loot_placements", {
        p_campaign_id: campaign.activeCampaignId!,
        p_quest_id: questIdRef.value || null,
        p_location_id: locationIdRef.value || null,
      });
      if (error) throw error;
      return (data ?? []) as LootPlacement[];
    },
    enabled: () => !!campaign.activeCampaignId,
  });
}

export function useCreateLootPlacement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (entry: LootPlacementInsert) => {
      const { data, error } = await supabase.from("loot_placements").insert(entry).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, input) => {
      void queryClient.invalidateQueries({ queryKey: [LOOT_KEY, input.campaign_id] });
      void queryClient.invalidateQueries({ queryKey: [BEATS_KEY, "board", input.campaign_id] });
    },
  });
}

export function useDeleteLootPlacement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; campaignId: string }) => {
      const { data, error } = await supabase.from("loot_placements").delete().eq("id", input.id).is("dispatched_at", null).select("id").maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Only held loot can be removed; dispatched chat keeps its provenance.");
    },
    onSuccess: (_data, input) => {
      void queryClient.invalidateQueries({ queryKey: [LOOT_KEY, input.campaignId] });
      void queryClient.invalidateQueries({ queryKey: [BEATS_KEY, "board", input.campaignId] });
    },
  });
}

/** `dispatch_loot` authorises per entry on that row's own `campaign_id`
 * (#830), so it takes a batch of entry ids rather than a beat id — "drop
 * all" on a beat means "every held entry currently shown for that beat,"
 * gathered client-side by the caller. */
export function useDispatchLoot() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { entryIds: string[]; campaignId: string }) => {
      const { data, error } = await supabase.rpc("dispatch_loot", {
        p_entry_ids: input.entryIds,
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
      const [beatsResult, edgesResult, attachmentsResult, runtimeResult, transitionsResult, lootResult, threadsResult, consequencesResult] = await Promise.all([
        supabase.from("quest_beats").select("*").eq("campaign_id", campaignId).neq("kind", "archived").order("created_at"),
        supabase.from("quest_beat_edges").select("*").eq("campaign_id", campaignId).order("created_at"),
        supabase.from("quest_beat_attachments").select("*").eq("campaign_id", campaignId).order("sort_order").order("created_at"),
        supabase.from("quest_runtime_state").select("*").eq("campaign_id", campaignId),
        supabase.from("quest_beat_transitions").select("*").eq("campaign_id", campaignId).order("created_at"),
        supabase.rpc("get_loot_placements", { p_campaign_id: campaignId, p_quest_id: null, p_location_id: null }),
        supabase.from("quest_threads").select("*").eq("campaign_id", campaignId),
        // Story I (#850): the log's "Unlocked by …" / "Held payoff" captions
        // and the featured card's "payoff prepared" chip read `target_quest_id`
        // and per-beat rules straight off this table (`deriveQuestBoardSummaries`).
        // `quest_consequences` carries no `campaign_id` of its own — it scopes
        // through the quest it belongs to, same join `fetchCampaignRefs` uses.
        // Two foreign keys point at quests (the rule's own quest and an
        // unlock target), so the embed must name which one it follows.
        supabase.from("quest_consequences").select("*, quests!quest_consequences_quest_id_fkey!inner(campaign_id)").eq("quests.campaign_id", campaignId),
      ]);
      const error = [beatsResult, edgesResult, attachmentsResult, runtimeResult, transitionsResult, lootResult, threadsResult, consequencesResult]
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
        runtime: (runtimeResult.data ?? []) as QuestRuntimeState[],
        transitions: (transitionsResult.data ?? []) as QuestBeatTransition[],
        loot: (lootResult.data ?? []) as LootPlacement[],
        threads: (threadsResult.data ?? []) as QuestThread[],
        consequences: (consequencesResult.data ?? []) as unknown as QuestConsequence[],
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
}

export async function createQuestBeatWithRoute(input: CreateQuestBeatWithRouteInput): Promise<QuestBeat> {
  const { data, error } = await supabase.rpc("create_quest_beat_with_route", {
    p_quest_id: input.questId,
    p_title: input.title,
    p_kind: input.kind,
    p_canvas_x: input.canvasX,
    p_canvas_y: input.canvasY,
    p_source_beat_id: input.sourceBeatId ?? null,
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
      queryClient.invalidateQueries({ queryKey: [EDGE_GATES_KEY, input.questId] });
      void invalidatePlayerQuestBeatProjections(queryClient);
    },
  });
}

/** One thread's disposition when the beat it stands on is archived: move to
 *  `beatId`, or end that thread's runtime when `beatId` is null. Replaces the
 *  old single `replacementBeatId`/`endRuntime` pair (#853) — several threads
 *  can now stand on the same beat, and each needs its own answer. */
export interface ArchiveQuestBeatReplacement {
  threadId: string;
  beatId: string | null;
}

/** Soft deletion keeps transition FKs/history intact while removing the beat
 * from authored flow. Only beat-owned placements and routes are detached; their
 * authoritative encounters/entities remain untouched. */
export interface ArchiveQuestBeatInput {
  id: string;
  /** Empty when no thread currently stands on this beat. */
  replacements: ArchiveQuestBeatReplacement[];
}

export async function archiveQuestBeat(input: ArchiveQuestBeatInput) {
  const { error } = await supabase.rpc("archive_quest_beat", {
    p_beat_id: input.id,
    p_replacements: input.replacements.map((replacement) => ({
      thread_id: replacement.threadId,
      beat_id: replacement.beatId,
    })),
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
      queryClient.invalidateQueries({ queryKey: [EDGE_GATES_KEY, input.questId] });
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
      // The gate FK cascades with the edge; the cache should follow.
      queryClient.invalidateQueries({ queryKey: [EDGE_GATES_KEY, input.questId] });
    },
  });
}

export function useUpdateQuestBeatEdge() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; questId: string; update: Partial<Pick<QuestBeatEdge, "source_beat_id" | "target_beat_id" | "route_kind" | "thread_label">> }) => {
      const { data, error } = await supabase.from("quest_beat_edges").update(input.update).eq("id", input.id).select().single();
      if (error) throw error;
      return data as QuestBeatEdge;
    },
    onSettled: (_data, _error, input) => queryClient.invalidateQueries({ queryKey: [EDGES_KEY, input.questId] }),
  });
}

/**
 * Sets or replaces a route's gate. `edge_id` is the gate table's primary key,
 * so this is a plain upsert rather than an insert-then-update dance — editing
 * an already-gated route just overwrites the one row.
 */
export function useSetQuestBeatEdgeGate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { edgeId: string; questId: string; campaignId: string; objectiveId: string; status: QuestConsequenceObjectiveStatus }) => {
      const { data, error } = await supabase
        .from("quest_beat_edge_gates")
        .upsert({ edge_id: input.edgeId, quest_id: input.questId, campaign_id: input.campaignId, objective_id: input.objectiveId, status: input.status })
        .select()
        .single();
      if (error) throw error;
      return data as QuestBeatEdgeGate;
    },
    onSuccess: (_data, input) => {
      queryClient.invalidateQueries({ queryKey: [EDGE_GATES_KEY, input.questId] });
    },
  });
}

/**
 * Removes a route's gate so the route goes back to always open. This is a
 * distinct mutation from setting one — "no gate" is a real state to reach,
 * not the fallback you get from clearing a field back to empty.
 */
export function useClearQuestBeatEdgeGate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { edgeId: string; questId: string }) => {
      const { error } = await supabase.from("quest_beat_edge_gates").delete().eq("edge_id", input.edgeId);
      if (error) throw error;
    },
    onSuccess: (_result, input) => {
      queryClient.invalidateQueries({ queryKey: [EDGE_GATES_KEY, input.questId] });
    },
  });
}

/** A thread's own cursor (#853) — keyed `(campaign, quest, thread)`, matching
 *  the row's own primary key. Disabled while `threadId` is empty: there is no
 *  thread-less cursor left to fall back to. */
export function useQuestRuntimeState(questId: string | Ref<string>, threadId: string | Ref<string>) {
  const campaign = useCampaignStore();
  const campaignId = computed(() => campaign.activeCampaignId);
  const id = asRef(questId);
  const thread = asRef(threadId);
  return useQuery({
    queryKey: computed(() => [RUNTIME_KEY, campaignId.value, id.value, thread.value]),
    queryFn: async (): Promise<QuestRuntimeState | null> => {
      const { data, error } = await supabase
        .from("quest_runtime_state")
        .select("*")
        .eq("campaign_id", campaignId.value!)
        .eq("quest_id", id.value)
        .eq("thread_id", thread.value)
        .maybeSingle();
      if (error) throw error;
      return data as QuestRuntimeState | null;
    },
    enabled: () => !!campaignId.value && !!id.value && !!thread.value,
    refetchInterval: 5_000,
  });
}

/** A thread's own runtime context (#853) — the current beat, its outgoing
 *  routes, and every other thread this quest holds (`context.threads`), all
 *  scoped to the one thread this hook was asked for. Disabled while
 *  `threadId` is empty. */
export function useQuestRuntimeContext(questId: string | Ref<string>, threadId: string | Ref<string>) {
  const campaign = useCampaignStore();
  const campaignId = computed(() => campaign.activeCampaignId);
  const id = asRef(questId);
  const thread = asRef(threadId);
  return useQuery({
    queryKey: computed(() => [RUNTIME_CONTEXT_KEY, campaignId.value, id.value, thread.value]),
    queryFn: async (): Promise<QuestRuntimeContext> => {
      const { data, error } = await supabase.rpc("get_quest_runtime_context", {
        p_campaign_id: campaignId.value!,
        p_quest_id: id.value,
        p_thread_id: thread.value,
      });
      if (error) throw error;
      return data as QuestRuntimeContext;
    },
    enabled: () => !!campaignId.value && !!id.value && !!thread.value,
    refetchInterval: 5_000,
  });
}

/** Every chain the party currently has open. This is the query the single
 * campaign cursor made unaskable: "live" is a set, not a row. */
export function useCampaignLiveQuests() {
  const campaign = useCampaignStore();
  const campaignId = computed(() => campaign.activeCampaignId);
  return useQuery({
    queryKey: computed(() => [RUNTIME_KEY, "live", campaignId.value]),
    queryFn: async (): Promise<CampaignLiveQuest[]> => {
      const { data, error } = await supabase.rpc("get_campaign_live_quests", { p_campaign_id: campaignId.value! });
      if (error) throw error;
      return (data ?? []) as CampaignLiveQuest[];
    },
    enabled: () => !!campaignId.value,
    refetchInterval: 5_000,
  });
}

/** Jump moves *this* chain's cursor, so the picker offers only this chain's
 * beats. Another quest is reached by navigating to its own Run surface. */
export function useQuestRuntimeJumpTargets(questId: string | Ref<string>, search: string | Ref<string>) {
  const campaign = useCampaignStore();
  const campaignId = computed(() => campaign.activeCampaignId);
  const id = asRef(questId);
  const query = asRef(search);
  return useQuery({
    queryKey: computed(() => [RUNTIME_CONTEXT_KEY, "jump-targets", campaignId.value, id.value, query.value]),
    queryFn: async (): Promise<QuestRuntimeJumpTarget[]> => {
      const { data, error } = await supabase.rpc("search_quest_runtime_jump_targets", {
        p_campaign_id: campaignId.value!,
        p_quest_id: id.value,
        p_search: query.value,
        p_limit: 30,
      });
      if (error) throw error;
      return (data ?? []) as QuestRuntimeJumpTarget[];
    },
    enabled: () => !!campaignId.value && !!id.value,
  });
}

// `useEndCampaignQuestSession` lived here and never had a caller. Ending the
// table is a session boundary, not a quest one, and `end_campaign_session`
// (#758) calls `end_campaign_quest_session` inside its own transaction — so a
// client-side wrapper would either sit dead or double-log every pause. The
// cache invalidation it did lives on in QUEST_RUNTIME_QUERY_KEYS above, which
// `useCampaignSession.end()` uses.

export function useQuestRuntimeCommand() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: QuestRuntimeCommandInput): Promise<QuestRuntimeContext> => {
      const { data, error } = await supabase.rpc("transition_quest_runtime", toQuestRuntimeRpcArgs(input));
      if (error) throw error;
      return data as QuestRuntimeContext;
    },
    onSuccess: (context, input) => {
      queryClient.setQueryData([RUNTIME_CONTEXT_KEY, input.campaignId, input.questId, input.threadId], context);
      queryClient.setQueryData([RUNTIME_KEY, input.campaignId, input.questId, input.threadId], context.state);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: [RUNTIME_KEY] });
      queryClient.invalidateQueries({ queryKey: [RUNTIME_CONTEXT_KEY] });
      queryClient.invalidateQueries({ queryKey: [TRANSITIONS_KEY] });
      // The board summarises the cursor, so a played move changes it. It was
      // missing here while `useAssertQuestRuntime` below invalidated it and
      // called it "the same caches a played move invalidates" — a parity its
      // sibling did not actually have. With a 60s `staleTime` and no refetch
      // on focus, advancing a beat and returning to the quest board inside
      // that minute showed the previous beat as current, contradicting the
      // cockpit the DM had just used.
      queryClient.invalidateQueries({ queryKey: [BEATS_KEY, "board"] });
    },
  });
}

export interface QuestAssertRuntimeInput {
  campaignId: string;
  questId: string;
  threadId: string;
  /** In story order — the order beats are applied and chained from. */
  beatIds: string[];
  placeCursor: boolean;
  reason?: string;
}

export interface QuestAssertRuntimeResult {
  asserted: number;
  /** Titles of the beats just asserted, in the order applied. */
  beats: string[];
  cursor_placed: boolean;
  current_beat_id: string | null;
}

/**
 * Records beats as already played, without playing through them (#796): the
 * prep-time counterpart to {@link useQuestRuntimeCommand}. It appends one
 * `assert` transition per beat, fires each beat's arrival consequences exactly
 * as playing through would, and optionally places the cursor at the last one —
 * but it never sets `status = 'running'`. Fixing the record must not light the
 * session rail; only the verb machine (`transition_quest_runtime`) starts a
 * session. See `supabase/migrations/20260906093154_prep_can_assert_the_cursor.sql`.
 */
export function useAssertQuestRuntime() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: QuestAssertRuntimeInput): Promise<QuestAssertRuntimeResult> => {
      const { data, error } = await supabase.rpc("assert_quest_runtime", {
        p_campaign_id: input.campaignId,
        p_quest_id: input.questId,
        p_thread_id: input.threadId,
        p_beat_ids: input.beatIds,
        p_place_cursor: input.placeCursor,
        p_reason: input.reason?.trim() || null,
      });
      if (error) throw error;
      return data as QuestAssertRuntimeResult;
    },
    onSuccess: () => {
      // The cursor and the log — the same caches a played move invalidates.
      queryClient.invalidateQueries({ queryKey: [RUNTIME_KEY] });
      queryClient.invalidateQueries({ queryKey: [RUNTIME_CONTEXT_KEY] });
      queryClient.invalidateQueries({ queryKey: [TRANSITIONS_KEY] });
      queryClient.invalidateQueries({ queryKey: [BEATS_KEY, "board"] });
      // Consequences can move objectives, log events, and touch the calendar —
      // same set `useAssertQuestObjectiveStatus` invalidates for the same reason.
      queryClient.invalidateQueries({ queryKey: ["quest_objectives"] });
      queryClient.invalidateQueries({ queryKey: ["quest_consequence_events"] });
      queryClient.invalidateQueries({ queryKey: ["calendar-events"] });
    },
  });
}

export interface QuestRuntimeImprovInput {
  campaignId: string;
  questId: string;
  threadId: string;
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
        p_quest_id: input.questId,
        p_thread_id: input.threadId,
        p_expected_version: input.expectedVersion,
        p_title: input.title,
        p_kind: input.kind,
        p_dm_lead: input.dmLead || null,
        p_reveal_text: input.revealText || null,
        p_reason: input.reason,
        p_push_return: input.pushReturn,
        p_keep_edge: input.keepEdge,
      });
      if (error) throw error;
      return data as { context: QuestRuntimeContext; beat: QuestBeat };
    },
    onSuccess: ({ context }, input) => {
      queryClient.setQueryData([RUNTIME_CONTEXT_KEY, input.campaignId, input.questId, input.threadId], context);
      // Four parts, matching `useQuestRuntimeState`'s key and the line above.
      // It once wrote a two-part key, which no query reads, so the optimistic
      // update landed nowhere and the cursor moved only once the refetch came
      // back — threads add a fourth part for the same reason they added a third.
      queryClient.setQueryData([RUNTIME_KEY, input.campaignId, input.questId, input.threadId], context.state);
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
 * One rule table for the whole quest: arrival at a beat, taking a branch, an
 * objective becoming a status, or the ledger settling, each doing one of the
 * four ledger verbs or one of the two world actions (#794). Replaces
 * `useQuestObjectiveEffects` (beat/edge → ledger verb only) and the deleted
 * `useQuestTriggers`/`useCreateQuestTrigger`/`useDeleteQuestTrigger`
 * (ledger/settled → world action only) — two ends of the same sentence.
 *
 * Beat/edge conditions are applied inside `transition_quest_runtime`;
 * objective/settled conditions inside `assert_quest_objective_status` as well
 * — both call `private.apply_quest_consequences` server-side, in the same
 * transaction as the write that made the condition true, so stepping back can
 * undo what a rule did.
 */
export function useQuestConsequences(questId: string | Ref<string>) {
  const id = asRef(questId);
  return useQuery({
    queryKey: computed(() => [CONSEQUENCES_KEY, id.value]),
    queryFn: async (): Promise<QuestConsequence[]> => {
      const { data, error } = await supabase
        .from("quest_consequences")
        .select("*")
        .eq("quest_id", id.value)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as QuestConsequence[];
    },
    enabled: () => !!id.value,
  });
}

export function useCreateQuestConsequence() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: QuestConsequenceInsert): Promise<QuestConsequence> => {
      const { data, error } = await supabase.from("quest_consequences").insert(input).select().single();
      if (error) throw error;
      return data as QuestConsequence;
    },
    onSuccess: (_row, input) => {
      queryClient.invalidateQueries({ queryKey: [CONSEQUENCES_KEY, input.quest_id] });
    },
  });
}

export function useDeleteQuestConsequence() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; questId: string }) => {
      const { error } = await supabase.from("quest_consequences").delete().eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: (_result, input) => {
      queryClient.invalidateQueries({ queryKey: [CONSEQUENCES_KEY, input.questId] });
    },
  });
}
