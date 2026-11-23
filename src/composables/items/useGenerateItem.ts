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
import { useApplyGeneratorLinks } from "@/composables/worldLinks/useApplyGeneratorLinks";
import { linksContextLine, type GeneratorLink } from "@/lib/worldLinks/generatorLinks";

export interface GenerateItemOptions extends ItemGenerationOptions {
  /** Ties to existing records ("carried by Brenna"), written after the item is saved; a failure is a `linkErrors` entry. */
  links?: readonly GeneratorLink[];
}

export interface GenerateItemOutcome {
  /** The created row's id, or `null` when generation failed. */
  id: string | null;
  /** A user-facing reason for a `null` id, or `null` on success. */
  error: string | null;
  name: string | null;
  /** `none` when no picture was asked for, `failed` when asked for and not painted (the item is saved either way). */
  picture: "none" | "saved" | "failed";
  /** The saved picture's URL when `picture` is "saved", so a caller can show it (Ask's result card). */
  pictureUrl: string | null;
  /** One sentence per tie that could not be written; the item is saved either way. */
  linkErrors: string[];
}

export function useGenerateItem() {
  const campaign = useCampaignStore();
  const { mutateAsync: createItem } = useCreateItem();
  const { generate, error: genError } = useItemGeneration();
  const { applyGeneratorLinks } = useApplyGeneratorLinks();

  async function generateAndCreateItem(concept: string, options: GenerateItemOptions = {}): Promise<GenerateItemOutcome> {
    // Checked up front: `generate` bails silently on the same flag without touching its error, so reading `genError`
    // afterwards could report an unrelated earlier failure.
    if (isAnyAiGenerating.value) {
      return { id: null, error: "Another AI generation is already in progress.", name: null, picture: "none", pictureUrl: null, linkErrors: [] };
    }
    const campaignId = campaign.activeCampaignId;
    const { links = [], ...generation } = options;
    // The ties go to the model in the prompt, so the item it writes agrees with them.
    const ties = linksContextLine(links);
    const result = await generate(ties ? `${concept}\n\n${ties}` : concept, generation);
    if (!result) return { id: null, error: genError.value ?? "Item generation failed.", name: null, picture: "none", pictureUrl: null, linkErrors: [] };

    const created = await createItem(generatedItemPayload(result, campaignId));
    const linkErrors = campaignId
      ? await applyGeneratorLinks({ kind: "item", id: created.id }, links, campaignId)
      : links.map((link) => `${link.name}: no campaign is open`);
    const asked = options.generateImage !== false;
    return { id: created.id, error: null, name: result.name, picture: !asked ? "none" : result.image_url ? "saved" : "failed", pictureUrl: result.image_url ?? null, linkErrors };
  }

  return { generateAndCreateItem };
}
