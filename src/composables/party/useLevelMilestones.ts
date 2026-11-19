import { computed } from "vue";
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { LEVEL_MILESTONES_KEY, OBJECTIVES_KEY } from "@/lib/campaignLiveSync/registry";
import { useCampaignStore } from "@/stores/campaign";
import { useAuthStore } from "@/stores/auth";

/**
 * Level milestones (#1021 row 27, `20261119184525`): "level N when any K of these are done", each item a whole quest
 * or one objective, counted in whatever order the players do them. The database reaches a milestone when its count
 * is met and raises the campaign's party level; this reads and edits them. The DM's alone: a milestone names quests a
 * player may not have found yet, so the read is enabled only for the DM.
 */

export interface LevelMilestoneItem {
  id: string;
  /** The quest it waits on, whole; null when it waits on one objective. */
  questId: string | null;
  objectiveId: string | null;
  /** The quest's title, or the objective's own words. */
  label: string;
  /** For an objective, the title of its quest. */
  questTitle: string | null;
  /** The quest the item belongs to: the quest itself, or the objective's quest. Null for a deleted one. */
  inQuestId: string | null;
  done: boolean;
}

export interface LevelMilestone {
  id: string;
  level: number;
  needs: number;
  note: string | null;
  reachedAt: string | null;
  items: LevelMilestoneItem[];
}

interface StepRow {
  id: string;
  quest_id: string | null;
  objective_id: string | null;
  quest: { title: string; status: string } | null;
  objective: { description: string; status: string; quest_id: string; quest: { title: string } | null } | null;
}

interface MilestoneRow {
  id: string;
  level: number;
  needs: number;
  note: string | null;
  reached_at: string | null;
  steps: StepRow[];
}

// Each embed names its constraint: a later foreign key between the same tables would otherwise make it ambiguous
// (PGRST201), as `quests.entry_beat_id` once did.
const SELECT = `id, level, needs, note, reached_at,
  steps:level_milestone_steps!level_milestone_steps_milestone_id_fkey(
    id, quest_id, objective_id,
    quest:quests!level_milestone_steps_quest_id_fkey(title, status),
    objective:quest_objectives!level_milestone_steps_objective_id_fkey(
      description, status, quest_id, quest:quests!quest_objectives_quest_id_fkey(title)
    )
  )`;

/** A step as the panel shows it. A quest is done when completed, an objective when complete, as the database counts. */
export function toItem(step: StepRow): LevelMilestoneItem {
  if (step.objective_id !== null) {
    return {
      id: step.id,
      questId: null,
      objectiveId: step.objective_id,
      label: step.objective?.description ?? "A deleted objective",
      questTitle: step.objective?.quest?.title ?? null,
      inQuestId: step.objective?.quest_id ?? null,
      done: step.objective?.status === "complete",
    };
  }
  return {
    id: step.id,
    questId: step.quest_id,
    objectiveId: null,
    label: step.quest?.title ?? "A deleted quest",
    questTitle: null,
    inQuestId: step.quest_id,
    done: step.quest?.status === "completed",
  };
}

async function fetchLevelMilestones(campaignId: string): Promise<LevelMilestone[]> {
  const { data, error } = await supabase
    .from("level_milestones")
    .select(SELECT)
    .eq("campaign_id", campaignId)
    .order("level", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as unknown as MilestoneRow[]).map((row) => ({
    id: row.id,
    level: row.level,
    needs: row.needs,
    note: row.note,
    reachedAt: row.reached_at,
    items: row.steps.map(toItem),
  }));
}

export function useLevelMilestones() {
  const campaign = useCampaignStore();
  const auth = useAuthStore();
  const campaignId = computed(() => campaign.activeCampaignId);
  return useQuery({
    queryKey: computed(() => [LEVEL_MILESTONES_KEY, campaignId.value] as const),
    queryFn: ({ queryKey: [, cid] }) => {
      if (!cid) throw new Error("useLevelMilestones fetched without a campaign; enabled guarantees it is set");
      return fetchLevelMilestones(cid);
    },
    enabled: () => !!campaignId.value && auth.isDM,
  });
}

export interface LevelMilestoneSave {
  campaignId: string;
  /** Null to make a new one. */
  id: string | null;
  level: number;
  needs: number;
  note: string;
  questIds: string[];
  objectiveIds: string[];
}

export function useSaveLevelMilestone() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: LevelMilestoneSave): Promise<string> => {
      const { data, error } = await supabase.rpc("save_level_milestone", {
        p_campaign_id: input.campaignId,
        p_milestone_id: input.id,
        p_level: input.level,
        p_needs: input.needs,
        p_note: input.note,
        p_quest_ids: input.questIds,
        p_objective_ids: input.objectiveIds,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: (_id, input) => {
      void queryClient.invalidateQueries({ queryKey: [LEVEL_MILESTONES_KEY, input.campaignId] });
    },
  });
}

export function useDeleteLevelMilestone() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; campaignId: string }) => {
      const { error } = await supabase.from("level_milestones").delete().eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: (_r, input) => {
      void queryClient.invalidateQueries({ queryKey: [LEVEL_MILESTONES_KEY, input.campaignId] });
    },
  });
}

export interface CampaignObjectiveOption {
  id: string;
  description: string;
  questTitle: string;
}

/** Every objective of the campaign's quests, for the editor's picker. */
export function useCampaignObjectives(enabled: () => boolean) {
  const campaign = useCampaignStore();
  const campaignId = computed(() => campaign.activeCampaignId);
  return useQuery({
    queryKey: computed(() => [OBJECTIVES_KEY, "campaign", campaignId.value] as const),
    queryFn: async ({ queryKey: [, , cid] }): Promise<CampaignObjectiveOption[]> => {
      if (!cid) throw new Error("useCampaignObjectives fetched without a campaign; enabled guarantees it is set");
      const { data, error } = await supabase
        .from("quest_objectives")
        .select("id, description, quest:quests!quest_objectives_quest_id_fkey!inner(title, campaign_id)")
        .eq("quest.campaign_id", cid)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return ((data ?? []) as unknown as { id: string; description: string; quest: { title: string } }[]).map((o) => ({
        id: o.id,
        description: o.description,
        questTitle: o.quest.title,
      }));
    },
    enabled: () => !!campaignId.value && enabled(),
  });
}
