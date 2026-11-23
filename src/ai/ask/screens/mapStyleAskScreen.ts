/**
 * Ask Grimoire (#1253): the Cartographer's map styler, opened with the DM's wording in its style prompt.
 *
 * The map is the target place's, edited full screen at `/locations/:id/map`; the styler's picker opens there with the
 * "extra direction" box filled in (`useMapExport` takes the hand-over). The render is the DM's own press on
 * "Generate", which prices it in the picker. Without a place to style, the Cartographer's list is where maps are chosen.
 */
import type { AskProposal } from "@edge-shared/agent/askContract";
import type { AskScreenAdapter } from "@/lib/ask/askAdapter";
import { useAskPrefillStore } from "@/stores/ui/askPrefill";

export function useMapStyleAskScreen(): AskScreenAdapter {
  const prefill = useAskPrefillStore();
  return {
    id: "map_style",
    route(proposal: AskProposal): string {
      const target = proposal.target;
      if (!target || target.type !== "location") return "/cartographer";
      prefill.offer("map_style", proposal.concept.trim());
      return `/locations/${target.id}/map`;
    },
  };
}

export default useMapStyleAskScreen;
