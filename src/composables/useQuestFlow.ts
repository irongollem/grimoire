import { computed, isRef, ref, type Ref } from "vue";
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { summarizeQuestBeatAttachment } from "@/lib/quests/attachments";
import { useCampaignStore } from "@/stores/campaign";
import type {
  PlayerQuestBeat,
  QuestBeat,
  QuestBeatEdge,
  QuestBeatEdgeInsert,
  QuestBeatInsert,
  QuestBeatTransition,
  QuestBeatUpdate,
  QuestBeatAttachment,
  QuestBeatAttachmentInsert,
  QuestBeatAttachmentSummary,
  QuestRuntimeState,
} from "@/types/quest.types";

const BEATS_KEY = "quest_beats";
const EDGES_KEY = "quest_beat_edges";
const RUNTIME_KEY = "quest_runtime_state";
const TRANSITIONS_KEY = "quest_beat_transitions";
const ATTACHMENTS_KEY = "quest_beat_attachments";

function asRef(value: string | Ref<string>): Ref<string> {
  return isRef(value) ? value : ref(value);
}

async function fetchBeats(questId: string): Promise<QuestBeat[]> {
  const { data, error } = await supabase
    .from("quest_beats")
    .select("*")
    .eq("quest_id", questId)
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
    ["objective", "quest_objectives", "id, description, is_done", "description"],
    ["quest_ref", "quest_refs", "id, ref_type", "ref_type"],
    ["location_set", "locations", "id, name", "name"],
    ["npc", "npcs", "id, name", "name"],
    ["faction", "factions", "id, name", "name"],
    ["sound", "sounds", "id, name", "name"],
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
      const detail = type === "objective" ? (row.is_done ? "Completed" : "Pending") : null;
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
    },
  });
}

/** Existing encounter screens stay authoritative; this only answers where an
 * encounter is placed in the authored story flow. */
export function useEncounterBeatUsages(encounterId: string | Ref<string>) {
  const id = asRef(encounterId);
  return useQuery({
    queryKey: computed(() => [ATTACHMENTS_KEY, "encounter-usage", id.value]),
    queryFn: async (): Promise<Array<{ beat_id: string; quest_id: string; beat_title: string }>> => {
      const { data, error } = await supabase
        .from("quest_beat_attachments")
        .select("beat_id, quest_id, beat:quest_beats!inner(title)")
        .eq("attachment_type", "encounter")
        .eq("ref_id", id.value);
      if (error) throw error;
      return (data ?? []).map((raw) => {
        const row = raw as unknown as { beat_id: string; quest_id: string; beat: Array<{ title: string }> };
        return { beat_id: row.beat_id, quest_id: row.quest_id, beat_title: row.beat[0]?.title ?? "Untitled beat" };
      });
    },
    enabled: () => !!id.value,
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
    },
  });
}

export function useUpdateQuestBeat() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; questId: string; update: QuestBeatUpdate }) => {
      const { data, error } = await supabase
        .from("quest_beats")
        .update(input.update)
        .eq("id", input.id)
        .select()
        .single();
      if (error) throw error;
      return data as QuestBeat;
    },
    onSuccess: (_beat, input) => {
      queryClient.invalidateQueries({ queryKey: [BEATS_KEY, input.questId] });
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

export function usePlayerQuestBeats(questId?: string | Ref<string>) {
  const campaign = useCampaignStore();
  const campaignId = computed(() => campaign.activeCampaignId);
  const id = questId === undefined ? ref("") : asRef(questId);
  return useQuery({
    queryKey: computed(() => [BEATS_KEY, "player", campaignId.value, id.value || "all"]),
    queryFn: async (): Promise<PlayerQuestBeat[]> => {
      const { data, error } = await supabase.rpc("get_player_visible_quest_beats", {
        p_campaign_id: campaignId.value!,
        p_quest_id: id.value || null,
      });
      if (error) throw error;
      return (data ?? []) as PlayerQuestBeat[];
    },
    enabled: () => !!campaignId.value,
  });
}
