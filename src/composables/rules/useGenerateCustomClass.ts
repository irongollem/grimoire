/**
 * "Generate a class with AI and save it": the create step `CustomClassGeneratorPanel.vue` used to own inline,
 * extracted so Ask Grimoire (#1253) runs the same pipeline. A class is several rows: its abilities first, then the
 * class that points at them (`createWithFeatures`), and a failed write removes the abilities already made.
 *
 * The page generates, shows "this will create", and calls `createClassFromDraft` on Create; Ask has its own quote
 * instead of that step and calls `generateAndCreateClass`. A failed save throws.
 */
import { useCreateCustomClass } from "@/composables/rules/useCustomClasses";
import { useCreateFeature, useDeleteFeature } from "@/composables/rules/useFeatures";
import { useCustomClassGeneration, type CustomClassGenerationOptions } from "@/ai/useCustomClassGeneration";
import { isAnyAiGenerating } from "@/ai/aiGeneratorRegistry";
import { classWithFeatureIds, type ClassDraft } from "@/lib/codex/classAi";
import { createWithFeatures } from "@/lib/codex/featureBatch";

export interface GenerateClassOutcome {
  id: string | null;
  name: string | null;
  error: string | null;
  /** Things the draft left out that do not stop the class being made (the official ASI feature missing). */
  warnings: string[];
}

export function useGenerateCustomClass() {
  const { mutateAsync: createClass } = useCreateCustomClass();
  const { mutateAsync: createFeature } = useCreateFeature();
  const { mutateAsync: deleteFeature } = useDeleteFeature();
  const generation = useCustomClassGeneration();

  /** Abilities first, then the class that points at them. Throws; nothing is left orphaned. */
  function createClassFromDraft(draft: ClassDraft) {
    return createWithFeatures(draft.features, {
      createFeature,
      deleteFeature,
      createParent: (ids) => createClass(classWithFeatureIds(draft, ids)),
    });
  }

  async function generateAndCreateClass(concept: string, options: CustomClassGenerationOptions): Promise<GenerateClassOutcome> {
    if (isAnyAiGenerating.value) {
      return { id: null, name: null, error: "Another AI generation is already in progress.", warnings: [] };
    }
    generation.concept.value = concept;
    generation.clearCompleted();
    const draft = await generation.generate(concept, options);
    if (!draft) return { id: null, name: null, error: generation.error.value ?? "Class generation failed.", warnings: [] };
    const created = await createClassFromDraft(draft);
    return { id: created.id, name: draft.base.class_name, error: null, warnings: draft.warnings };
  }

  return { generation, createClassFromDraft, generateAndCreateClass };
}
