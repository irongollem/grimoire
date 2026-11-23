/**
 * Ask Grimoire (#1253): the Quest Designer, opened with the DM's description in its first message.
 *
 * A `screen` generator has no quote and no run: the design is a conversation with its own turns and price, and the
 * DM presses "Propose a tree" there. The description is left for the starter (`QuestFlowStarter`), which opens on its
 * Design it mode and puts the text in the box.
 */
import type { AskProposal } from "@edge-shared/agent/askContract";
import type { AskScreenAdapter } from "@/lib/ask/askAdapter";
import { useAskPrefillStore } from "@/stores/ui/askPrefill";

export function useQuestDesignerAskScreen(): AskScreenAdapter {
  const prefill = useAskPrefillStore();
  return {
    id: "quest_designer",
    route(proposal: AskProposal): string {
      prefill.offer("quest_designer", proposal.concept.trim());
      return "/quests/new";
    },
  };
}

export default useQuestDesignerAskScreen;
