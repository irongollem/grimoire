/**
 * "Generate a species with AI and save it": the step `SpeciesGeneratorPanel.vue` and Ask Grimoire (#1253) share.
 * Narrow on purpose, like `useGenerateMonster`: navigation, the paywall and toasts stay with the page, and a failed
 * save throws. The page splits generate from save to keep a paid result whose save failed; Ask runs both at once.
 */
import { useCreateSpecies } from "@/composables/rules/useSpecies";
import { useSpeciesGeneration, type SpeciesGenerationOptions } from "@/ai/useSpeciesGeneration";
import { isAnyAiGenerating } from "@/ai/aiGeneratorRegistry";

export interface GenerateSpeciesOutcome {
  id: string | null;
  name: string | null;
  /** A user-facing reason for a `null` id. */
  error: string | null;
  /** `failed` when a picture was asked for and not painted: the species is saved either way. */
  picture: "none" | "saved" | "failed";
}

export function useGenerateSpecies() {
  const { mutateAsync: createSpecies } = useCreateSpecies();
  const generation = useSpeciesGeneration();

  async function generateAndCreateSpecies(concept: string, options: SpeciesGenerationOptions): Promise<GenerateSpeciesOutcome> {
    if (isAnyAiGenerating.value) {
      return { id: null, name: null, error: "Another AI generation is already in progress.", picture: "none" };
    }
    generation.concept.value = concept;
    generation.clearCompleted();
    const draft = await generation.generate(concept, options);
    if (!draft) return { id: null, name: null, error: generation.error.value ?? "Species generation failed.", picture: "none" };
    const created = await createSpecies(draft);
    const asked = options.generateImage !== false;
    return { id: created.id, name: draft.name, error: null, picture: !asked ? "none" : draft.image_url ? "saved" : "failed" };
  }

  return { generation, generateAndCreateSpecies };
}
