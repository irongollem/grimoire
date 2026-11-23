/**
 * "Generate a background with AI and save it": the step Ask Grimoire (#1253) runs. `BackgroundGeneratorPanel.vue`
 * keeps its own generate-then-save split (it holds a paid result whose save failed), through the same `generate`
 * and `createBackground`; this is both in one call. Navigation, the paywall and toasts stay with the page, and a
 * failed save throws.
 */
import { useCreateBackground } from "@/composables/rules/useBackgrounds";
import { useBackgroundGeneration, type BackgroundGenerationOptions } from "@/ai/useBackgroundGeneration";
import { isAnyAiGenerating } from "@/ai/aiGeneratorRegistry";

export interface GenerateBackgroundOutcome {
  id: string | null;
  name: string | null;
  /** A user-facing reason for a `null` id. */
  error: string | null;
}

export function useGenerateBackground() {
  const { mutateAsync: createBackground } = useCreateBackground();
  const generation = useBackgroundGeneration();

  async function generateAndCreateBackground(concept: string, options: BackgroundGenerationOptions): Promise<GenerateBackgroundOutcome> {
    if (isAnyAiGenerating.value) return { id: null, name: null, error: "Another AI generation is already in progress." };
    generation.concept.value = concept;
    generation.clearCompleted();
    const draft = await generation.generate(concept, options);
    if (!draft) return { id: null, name: null, error: generation.error.value ?? "Background generation failed." };
    const created = await createBackground(draft);
    return { id: created.id, name: draft.name, error: null };
  }

  return { generation, generateAndCreateBackground };
}
