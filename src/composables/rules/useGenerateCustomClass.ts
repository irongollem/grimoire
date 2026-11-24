/**
 * "Generate a class with AI, look at it, and save it": the steps the class panel used to own inline, now the
 * Familiar's class card (#1270). The generation is one step (`generateClassDraft`, charged) and the save another
 * (`createClassFromDraft`, free), so the DM sees what will be created before anything is written. A class is several
 * rows: its abilities first, then the class that points at them (`createWithFeatures`), and a failed write removes the
 * abilities already made. A failed save throws.
 */
import { useCreateCustomClass } from "@/composables/rules/useCustomClasses";
import { useCreateFeature, useDeleteFeature } from "@/composables/rules/useFeatures";
import { useCustomClassGeneration, type CustomClassGenerationOptions } from "@/ai/useCustomClassGeneration";
import { isAnyAiGenerating } from "@/ai/aiGeneratorRegistry";
import { classWithFeatureIds, type ClassDraft } from "@/lib/codex/classAi";
import { createWithFeatures } from "@/lib/codex/featureBatch";

export interface ClassDraftOutcome {
  draft: ClassDraft | null;
  error: string | null;
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

  /** Generates a class and saves nothing. */
  async function generateClassDraft(concept: string, options: CustomClassGenerationOptions): Promise<ClassDraftOutcome> {
    if (isAnyAiGenerating.value) return { draft: null, error: "Another AI generation is already in progress." };
    generation.concept.value = concept;
    generation.clearCompleted();
    const draft = await generation.generate(concept, options);
    if (!draft) return { draft: null, error: generation.error.value ?? "Class generation failed." };
    return { draft, error: null };
  }

  return { generation, createClassFromDraft, generateClassDraft };
}
