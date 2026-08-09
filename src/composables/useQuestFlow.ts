import { computed, isRef, ref, type Ref } from "vue";
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { useCampaignStore } from "@/stores/campaign";
import type {
  PlayerQuestBeat,
  QuestBeat,
  QuestBeatEdge,
  QuestBeatEdgeInsert,
  QuestBeatInsert,
  QuestBeatTransition,
  QuestBeatUpdate,
  QuestRuntimeState,
} from "@/types/quest.types";

const BEATS_KEY = "quest_beats";
const EDGES_KEY = "quest_beat_edges";
const RUNTIME_KEY = "quest_runtime_state";
const TRANSITIONS_KEY = "quest_beat_transitions";

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
