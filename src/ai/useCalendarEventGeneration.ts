import { generateEntityText } from "./entityTextGeneration";
import { useTableRuleset } from "@/composables/rules/useRuleset";
import { createAiGenerationState, startAiQuotes, stopAiQuotes } from "./aiGenerationState";
import { registerAiGenerator, isAnyAiGenerating } from "./aiGeneratorRegistry";
import { captureImageGenerationContext } from "./useImageGeneration";
import type { AiProvenance } from "./provenance";
import {
  CALENDAR_AI_EVENT_TYPES,
  normalizeCalendarEventResult,
  type CalendarEventDraftResult,
} from "@/lib/calendar/eventGeneration";

const _state = createAiGenerationState();

registerAiGenerator({
  ..._state,
  label: "Calendar event",
  entityRoute: () => "/calendar",
  // Deliberately a no-op: drafting happens inline in the event form, so the DM
  // is already standing in the only place there is to send them.
  openPanel: () => {},
});

interface CalendarEventAiResult {
  title?: unknown;
  event_type?: unknown;
  description?: unknown;
  ai_provenance?: AiProvenance;
}

export interface CalendarEventDraft extends CalendarEventDraftResult {
  ai_provenance: AiProvenance | null;
}

/**
 * Drafts a festival, holiday or historical event for the event form (#910).
 * Text only. The result is validated and handed back; the form decides what to
 * fill, and the DM reviews and saves it.
 */
export function useCalendarEventGeneration() {
  const { ruleset } = useTableRuleset();

  async function generate(
    steer: string,
    constraints: string[],
    selectedType: string,
  ): Promise<CalendarEventDraft | null> {
    if (isAnyAiGenerating.value) return null;
    _state.isGenerating.value = true;
    _state.error.value = null;
    startAiQuotes();

    try {
      const context = captureImageGenerationContext();
      const raw = await generateEntityText<CalendarEventAiResult>({
        generator: "calendar_event",
        campaignId: context.campaignId,
        settingPrompt: context.settingPrompt,
        ruleset: ruleset.value,
        // The edge function rejects an empty prompt, so an unsteered draft asks plainly.
        prompt: steer.trim() || "Create an event that fits this date and this world.",
        constraints,
      });
      const result = normalizeCalendarEventResult(raw, CALENDAR_AI_EVENT_TYPES, selectedType);
      return { ...result, ai_provenance: raw.ai_provenance ?? null };
    } catch (e) {
      _state.error.value = e instanceof Error ? e.message : "Generation failed";
      return null;
    } finally {
      _state.isGenerating.value = false;
      stopAiQuotes();
    }
  }

  return { ..._state, generate };
}
