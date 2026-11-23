/**
 * "Generate a spell with AI and insert it": the generate-then-create step `SpellGeneratorPanel` used to hold inline,
 * extracted so Ask Grimoire (#1253) runs the exact same pipeline as the page.
 *
 * The panel keeps its navigation, credit gate and generation state. A save that fails throws.
 */
import { useCampaignStore } from "@/stores/campaign";
import { useCreateSpell } from "@/composables/spells/useSpells";
import { useSpellGeneration, type SpellGenerationOptions } from "@/ai/useSpellGeneration";
import { isAnyAiGenerating } from "@/ai/aiGeneratorRegistry";
import { spellInsertFromAi } from "@/ai/spellAiAdapter";

export interface GenerateSpellOutcome {
  /** The created row's id, or `null` when generation failed. */
  id: string | null;
  /** A user-facing reason for a `null` id, or `null` on success. */
  error: string | null;
  name: string | null;
  /** `none` when no picture was asked for, `failed` when asked for and not painted (the spell is saved either way). */
  picture: "none" | "saved" | "failed";
  /** The saved picture's URL when `picture` is "saved", so a caller can show it (Ask's result card). */
  pictureUrl: string | null;
}

export function useGenerateSpell() {
  const campaign = useCampaignStore();
  const { mutateAsync: createSpell } = useCreateSpell();
  const { generate, error: genError } = useSpellGeneration();

  async function generateAndCreateSpell(concept: string, options: SpellGenerationOptions = {}): Promise<GenerateSpellOutcome> {
    if (isAnyAiGenerating.value) {
      return { id: null, error: "Another AI generation is already in progress.", name: null, picture: "none", pictureUrl: null };
    }
    const result = await generate(concept, options);
    if (!result) return { id: null, error: genError.value ?? "Spell generation failed.", name: null, picture: "none", pictureUrl: null };

    const insert = spellInsertFromAi(result);
    const created = await createSpell({
      ...insert,
      // spellInsertFromAi is a pure AI-to-shape adapter with no campaign awareness; stamp the same default
      // SpellDetail.vue's manual create path uses (#596) so an AI-generated spell lands in the DM's current campaign
      // rather than "every campaign" by accident. No active campaign is genuinely global.
      campaign_id: campaign.activeCampaignId ?? null,
    });
    const asked = options.generateImage !== false;
    return { id: created.id, error: null, name: insert.name, picture: !asked ? "none" : result.image_url ? "saved" : "failed", pictureUrl: result.image_url ?? null };
  }

  return { generateAndCreateSpell };
}
