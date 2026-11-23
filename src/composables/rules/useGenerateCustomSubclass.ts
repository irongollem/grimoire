/**
 * "Generate a subclass with AI and save it": the create step `CustomSubclassGeneratorPanel.vue` used to own inline,
 * extracted so Ask Grimoire (#1253) runs the same pipeline. A subclass is several rows: its abilities first, then
 * the archetype that points at them (`createWithFeatures`), and a failed write removes the abilities already made.
 *
 * The page generates, shows "this will create", and calls `createSubclassFromDraft` on Create; Ask has its own
 * quote instead of that step and calls `generateAndCreateSubclass`. A failed save throws.
 */
import { computed } from "vue";
import { useCampaignCustomClasses, useCampaignSystemClasses } from "@/composables/rules/useCustomClasses";
import { useCreateCustomSubclass } from "@/composables/rules/useCustomSubclasses";
import { useCreateFeature, useDeleteFeature } from "@/composables/rules/useFeatures";
import { useCustomSubclassGeneration, type CustomSubclassGenerationOptions } from "@/ai/useCustomSubclassGeneration";
import { isAnyAiGenerating } from "@/ai/aiGeneratorRegistry";
import { subclassWithFeatureIds, type SubclassDraft } from "@/lib/codex/subclassAi";
import { createWithFeatures } from "@/lib/codex/featureBatch";

/**
 * The classes a subclass can belong to, with the level each grants its subclass: the campaign-gated lists the class
 * pickers use, so a class the DM switched off is not offered. A homebrew class of the same name wins. Fetched only
 * once `enabled` says so: the panel and Ask are mounted on every DM page.
 */
export function useSubclassParents(enabled: () => boolean) {
  const { data: systemClasses, all: allSystem } = useCampaignSystemClasses(enabled);
  const { data: customClasses, all: allCustom } = useCampaignCustomClasses(enabled);

  const levelByClass = computed(() => {
    const levels = new Map<string, number>();
    for (const c of systemClasses.value ?? []) levels.set(c.class_name, c.subclass_level);
    for (const c of customClasses.value ?? []) levels.set(c.class_name, c.subclass_level);
    return levels;
  });
  const options = computed(() => [...levelByClass.value.keys()].sort().map((name) => ({ id: name, name })));
  /** Neither list has arrived yet: a class that is not there is not yet known to be missing. */
  const loading = computed(() => allSystem.value === undefined || allCustom.value === undefined);

  return { levelByClass, options, loading };
}

export interface GenerateSubclassOutcome {
  id: string | null;
  name: string | null;
  error: string | null;
}

export function useGenerateCustomSubclass() {
  const { mutateAsync: createSubclass } = useCreateCustomSubclass();
  const { mutateAsync: createFeature } = useCreateFeature();
  const { mutateAsync: deleteFeature } = useDeleteFeature();
  const generation = useCustomSubclassGeneration();

  /** Abilities first, then the archetype that points at them. Throws; nothing is left orphaned. */
  function createSubclassFromDraft(draft: SubclassDraft) {
    return createWithFeatures(draft.features, {
      createFeature,
      deleteFeature,
      createParent: (ids) => createSubclass(subclassWithFeatureIds(draft, ids)),
    });
  }

  async function generateAndCreateSubclass(concept: string, options: CustomSubclassGenerationOptions): Promise<GenerateSubclassOutcome> {
    if (isAnyAiGenerating.value) return { id: null, name: null, error: "Another AI generation is already in progress." };
    generation.concept.value = concept;
    generation.clearCompleted();
    const draft = await generation.generate(concept, options);
    if (!draft) return { id: null, name: null, error: generation.error.value ?? "Archetype generation failed." };
    const created = await createSubclassFromDraft(draft);
    return { id: created.id, name: draft.base.subclass_name, error: null };
  }

  return { generation, createSubclassFromDraft, generateAndCreateSubclass };
}
