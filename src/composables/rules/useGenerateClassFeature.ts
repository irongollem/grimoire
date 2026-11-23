/**
 * "Generate an ability with AI and save it": the step Ask Grimoire (#1253) runs. `ClassFeatureGeneratorPanel.vue`
 * keeps its own generate-then-save split (it holds a paid result whose save failed), through the same `generate`
 * and `createFeature`; this is both in one call. A failed save throws.
 */
import { useCreateFeature } from "@/composables/rules/useFeatures";
import { useClassFeatureGeneration, type ClassFeatureGenerationOptions } from "@/ai/useClassFeatureGeneration";
import { isAnyAiGenerating } from "@/ai/aiGeneratorRegistry";

export interface GenerateClassFeatureOutcome {
  id: string | null;
  name: string | null;
  error: string | null;
}

export function useGenerateClassFeature() {
  const { mutateAsync: createFeature } = useCreateFeature();
  const generation = useClassFeatureGeneration();

  async function generateAndCreateClassFeature(concept: string, options: ClassFeatureGenerationOptions): Promise<GenerateClassFeatureOutcome> {
    if (isAnyAiGenerating.value) return { id: null, name: null, error: "Another AI generation is already in progress." };
    generation.concept.value = concept;
    generation.clearCompleted();
    const draft = await generation.generate(concept, options);
    if (!draft) return { id: null, name: null, error: generation.error.value ?? "Ability generation failed." };
    const created = await createFeature(draft);
    return { id: created.id, name: draft.name, error: null };
  }

  return { generation, generateAndCreateClassFeature };
}
