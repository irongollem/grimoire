/**
 * Ask Grimoire (#1282): "Turn this into my canon", the model's offer at the end of an interview. A `screen` generator
 * has no quote and no run: the told story waits for the document import's paste step, where the DM ticks the rights
 * box and presses Start, and sees the price as always.
 *
 * The text is the interview's own transcript, kept by the panel in `useAskUiStore().interviewStory`, not the proposal's
 * `concept`: the model's concept would be its summary of what was said, and the import must read the DM's own words,
 * exactly as the pane's button hands them over. Without an interview (it ended, the page reloaded) the concept is
 * what is left to offer.
 */
import type { AskProposal } from "@edge-shared/agent/askContract";
import type { AskScreenAdapter } from "@/lib/ask/askAdapter";
import { offerToldStory } from "@/lib/ask/askInterviewStory";
import { useAskUiStore } from "@/stores/ui/ask";

export function useImportStoryAskScreen(): AskScreenAdapter {
  const ui = useAskUiStore();
  return {
    id: "import_story",
    route(proposal: AskProposal): string {
      return offerToldStory(ui.interviewStory ?? proposal.concept.trim());
    },
  };
}

export default useImportStoryAskScreen;
