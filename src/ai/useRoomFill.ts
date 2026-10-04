import { generateEntityText } from "./entityTextGeneration";
import { useTableRuleset } from "@/composables/rules/useRuleset";
import { createAiGenerationState, startAiQuotes, stopAiQuotes } from "./aiGenerationState";
import { registerAiGenerator, isAnyAiGenerating } from "./aiGeneratorRegistry";
import { captureImageGenerationContext } from "./useImageGeneration";
import { normalizeRoomFill, roomFillToTiptap } from "@/lib/locations/roomFill";
import { placeRoute } from "@/lib/locations/placeRoute";
import type { AiProvenance } from "./provenance";
import type { Location } from "@/types/location.types";

// Module-level so a roll survives the row it was started from unmounting.
const _state = createAiGenerationState();

registerAiGenerator({
  ..._state,
  label: "Room",
  entityRoute: (id) => placeRoute(id),
  // A fill lives inside the room list, not a sidebar panel: nothing to open.
  openPanel: () => {},
});

export interface RoomFillResult {
  /** Tiptap JSON, ready for the room's description editor. */
  description: string;
  ai_provenance: AiProvenance | null;
}

export function useRoomFill() {
  const { ruleset } = useTableRuleset();

  async function fill(options: { room: Location; constraints: string[]; steer: string }): Promise<RoomFillResult | null> {
    if (isAnyAiGenerating.value) return null;
    _state.isGenerating.value = true;
    _state.error.value = null;
    startAiQuotes();
    try {
      const { campaignId, settingPrompt } = captureImageGenerationContext();
      const raw = await generateEntityText<{ ai_provenance?: AiProvenance }>({
        generator: "room",
        campaignId,
        settingPrompt,
        ruleset: ruleset.value,
        prompt: options.steer.trim() || "Fill this room.",
        constraints: options.constraints,
      });
      return {
        description: roomFillToTiptap(normalizeRoomFill(raw)),
        ai_provenance: raw.ai_provenance ?? null,
      };
    } catch (e) {
      _state.error.value = e instanceof Error ? e.message : "Generation failed";
      return null;
    } finally {
      _state.isGenerating.value = false;
      stopAiQuotes();
    }
  }

  return { ..._state, fill };
}
