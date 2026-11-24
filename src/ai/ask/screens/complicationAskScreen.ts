/**
 * Ask Grimoire (#1253): a complication for a fight being played, opened with the DM's wording as the steer.
 *
 * The fight's Play screen (`/encounters/:id/run`) opens its complication dialog with the steer filled in; the DM
 * presses "Generate" there, which prices it. Reinforcements, the dialog's other mode, open the same way when the request named them.
 */
import type { AskProposal } from "@edge-shared/agent/askContract";
import type { AskScreenAdapter } from "@/lib/ask/askAdapter";
import { useAskPrefillStore } from "@/stores/ui/askPrefill";

export function useComplicationAskScreen(): AskScreenAdapter {
  const prefill = useAskPrefillStore();
  return {
    id: "complication",
    route(proposal: AskProposal): string {
      const target = proposal.target;
      if (!target || target.type !== "encounter") return "/encounters";
      const mode = proposal.inputs.mode;
      prefill.offer("complication", proposal.concept.trim(), typeof mode === "string" ? { mode } : {});
      return `/encounters/${target.id}/run`;
    },
  };
}

export default useComplicationAskScreen;
