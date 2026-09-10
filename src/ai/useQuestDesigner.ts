import { computed, ref } from "vue";
import { supabase } from "@/lib/supabase";
import { edgeErrorMessage } from "@/lib/edgeError";
import { useCampaignStore } from "@/stores/campaign";
import type { AiProvenance } from "@/ai/provenance";
import {
  QUEST_DESIGN_PROSE_LIMIT,
  QUEST_DESIGN_TURN_BUDGET,
  sanitizeDesignQuestions,
  type QuestDesignAnswer,
  type QuestDesignQuestion,
  type QuestDesignTree,
  type QuestDesignTurnRequest,
  type QuestDesignTurnResponse,
} from "@/lib/quests/designer";

/**
 * The Quest Designer (#873) — a multi-turn conversational alternative to the
 * one-shot hook generator (`useQuestGeneration`). Server path only: the edge
 * function (`quest-designer-turn`) charges credits itself, exactly like
 * `generate-quest`, so there is no client-side `logUsage` here and no
 * BYOK/local-key branch — the designer's per-turn retrieval and system prompt
 * both need service-role access the browser doesn't have.
 *
 * Deliberately NOT registered via `registerAiGenerator()` and NOT a
 * module-level singleton, like `useNpcVoiceCoach`: a design sitting is a
 * single ephemeral conversation scoped to whichever panel opened it, not a
 * background job with an entity to route to.
 */
export function useQuestDesigner() {
  const campaign = useCampaignStore();

  const prose = ref("");
  const tree = ref<QuestDesignTree | null>(null);
  const previousTree = ref<QuestDesignTree | null>(null);
  const questions = ref<QuestDesignQuestion[]>([]);
  const answers = ref<QuestDesignAnswer[]>([]);
  const note = ref("");
  const turn = ref(0);
  const provenance = ref<AiProvenance | null>(null);
  const isGenerating = ref(false);
  const error = ref("");

  const turnsLeft = computed(() => QUEST_DESIGN_TURN_BUDGET - turn.value);

  /** Resolves true when the turn landed; false when it failed and `error` says why. */
  async function sendTurn(buildRequest: (campaignId: string) => QuestDesignTurnRequest): Promise<boolean> {
    isGenerating.value = true;
    error.value = "";
    try {
      const campaignId = campaign.activeCampaignId;
      if (!campaignId) {
        error.value = "No active campaign selected.";
        return false;
      }

      const { data, error: fnError } = await supabase.functions.invoke("quest-designer-turn", {
        body: buildRequest(campaignId),
      });

      if (fnError) {
        error.value = await edgeErrorMessage(fnError);
        return false;
      }
      const response = data as (QuestDesignTurnResponse & { error?: string }) | null;
      if (response?.error) {
        error.value = response.error;
        return false;
      }
      if (!response) {
        error.value = "The Quest Designer returned no result — please try again.";
        return false;
      }

      previousTree.value = tree.value;
      tree.value = response.tree;
      questions.value = sanitizeDesignQuestions(response.questions);
      note.value = response.note;
      turn.value = response.turn;
      provenance.value = response.ai_provenance;
      return true;
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Generation failed";
      return false;
    } finally {
      isGenerating.value = false;
    }
  }

  /** Turn 1: sends the DM's prose only — no tree, no answers yet. */
  async function propose(): Promise<void> {
    const trimmed = prose.value.trim();
    if (!trimmed) {
      error.value = "Describe the quest before asking the designer to propose one.";
      return;
    }
    if (trimmed.length > QUEST_DESIGN_PROSE_LIMIT) {
      error.value = `That's too long — keep it under ${QUEST_DESIGN_PROSE_LIMIT} characters.`;
      return;
    }
    await sendTurn((campaignId) => ({
      campaign_id: campaignId,
      prose: trimmed,
      turn: 1,
      tree: null,
      answers: [],
    }));
  }

  /** Turn n+1: appends `newAnswers` to the cumulative answer log and sends. */
  async function answer(newAnswers: QuestDesignAnswer[]): Promise<void> {
    if (turn.value >= QUEST_DESIGN_TURN_BUDGET) {
      error.value = "This design sitting has used all its turns.";
      return;
    }
    const currentTree = tree.value;
    if (currentTree === null) {
      error.value = "Propose a quest before answering questions about it.";
      return;
    }
    // Committed only once the turn lands: a failed exchange leaves the
    // questions open and the answers unrecorded, so the DM's retry sends
    // them once rather than twice.
    const cumulativeAnswers = [...answers.value, ...newAnswers];
    const turnBeforeThisOne = turn.value;
    const landed = await sendTurn((campaignId) => ({
      campaign_id: campaignId,
      prose: prose.value.trim(),
      turn: turnBeforeThisOne + 1,
      tree: currentTree,
      answers: cumulativeAnswers,
    }));
    if (landed) answers.value = cumulativeAnswers;
  }

  function reset(): void {
    prose.value = "";
    tree.value = null;
    previousTree.value = null;
    questions.value = [];
    answers.value = [];
    note.value = "";
    turn.value = 0;
    provenance.value = null;
    isGenerating.value = false;
    error.value = "";
  }

  return {
    prose,
    tree,
    previousTree,
    questions,
    answers,
    note,
    turn,
    turnsLeft,
    provenance,
    isGenerating,
    error,
    propose,
    answer,
    reset,
  };
}
