/**
 * "Generate an item with AI and insert it": the generate-then-create step `ItemGeneratorPanel` used to hold inline,
 * extracted so Ask Grimoire (#1253) runs the exact same pipeline as the page.
 *
 * Deliberately narrow, like `useGenerateMonster`: the panel keeps its navigation, its credit gate and its generation
 * state (`isGenerating`, `completedEntityId`); this is only generate, then create. A save that fails throws, so the
 * caller can say the generation was paid for and nothing was kept.
 */
import { useCampaignStore } from "@/stores/campaign";
import { useCreateItem } from "@/composables/items/useItems";
import { useItemGeneration, type ItemGenerationOptions } from "@/ai/useItemGeneration";
import { isAnyAiGenerating } from "@/ai/aiGeneratorRegistry";
import { generatedItemPayload } from "@/lib/items/generatedItemPayload";

export interface GenerateItemOutcome {
  /** The created row's id, or `null` when generation failed. */
  id: string | null;
  /** A user-facing reason for a `null` id, or `null` on success. */
  error: string | null;
  name: string | null;
  /** `none` when no picture was asked for, `failed` when asked for and not painted (the item is saved either way). */
  picture: "none" | "saved" | "failed";
}

export function useGenerateItem() {
  const campaign = useCampaignStore();
  const { mutateAsync: createItem } = useCreateItem();
  const { generate, error: genError } = useItemGeneration();

  async function generateAndCreateItem(concept: string, options: ItemGenerationOptions = {}): Promise<GenerateItemOutcome> {
    // Checked up front: `generate` bails silently on the same flag without touching its error, so reading `genError`
    // afterwards could report an unrelated earlier failure.
    if (isAnyAiGenerating.value) {
      return { id: null, error: "Another AI generation is already in progress.", name: null, picture: "none" };
    }
    const campaignId = campaign.activeCampaignId;
    const result = await generate(concept, options);
    if (!result) return { id: null, error: genError.value ?? "Item generation failed.", name: null, picture: "none" };

    const created = await createItem(generatedItemPayload(result, campaignId));
    const asked = options.generateImage !== false;
    return { id: created.id, error: null, name: result.name, picture: !asked ? "none" : result.image_url ? "saved" : "failed" };
  }

  return { generateAndCreateItem };
}
