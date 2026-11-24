/**
 * "Generate a trap with AI and save it", the step its generator panel used to own inline, extracted so Ask Grimoire
 * (#1253) runs the very same save: the same fields, the same campaign scope, the Gallery log of the picture.
 *
 * Deliberately narrow, like `useGenerateMonster`: the page keeps its credit gate, the party-portrait choice and its
 * navigation. A failed save throws, so the caller decides how to say so.
 */
import { useCampaignStore } from "@/stores/campaign";
import { useCreateTrap } from "@/composables/dungeon-features/useTraps";
import { useImageGenerationLog } from "@/composables/ai/useImageGenerationLog";
import { useTrapGeneration, type TrapGenerationOptions } from "@/ai/useTrapGeneration";
import { isAnyAiGenerating } from "@/ai/aiGeneratorRegistry";
import { toTiptapJson } from "@/ai/useNpcGeneration";
import type { TrapAiGenerated } from "@/ai/types";
import type { Trap } from "@/types/trap.types";

export interface GenerateTrapOutcome {
  /** The created row's id, or `null` when generation failed. */
  id: string | null;
  name: string | null;
  /** A user-facing reason for a `null` id. */
  error: string | null;
  /** `none` when not asked for, `failed` when asked for and not painted: the row is saved either way. */
  picture: "none" | "saved" | "failed";
  /** The saved picture's URL when `picture` is "saved", so a caller can show it (Ask's result card). */
  pictureUrl: string | null;
}

export function useGenerateTrap() {
  const campaign = useCampaignStore();
  const { mutateAsync: createTrap } = useCreateTrap();
  const { logImageGeneration } = useImageGenerationLog();
  const { generate, error: genError } = useTrapGeneration();

  /** Saves a generated trap and logs its picture to the Gallery. Throws when the save fails. */
  async function saveGeneratedTrap(result: TrapAiGenerated, concept: string): Promise<Trap> {
    const trap = await createTrap({
      // Scoped to the campaign it was generated for; widened from the trap's own Scope control if the DM wants it
      // everywhere.
      campaign_id:        campaign.activeCampaignId,
      name:               result.name,
      trap_type:          result.trap_type,
      // AI generation doesn't suggest a map glyph (#804): the DM picks one in the editor afterward; null renders as
      // the generic hazard marker.
      hazard_glyph:       null,
      trigger_type:       result.trigger_type ?? null,
      description:        toTiptapJson(result.description),
      effect_description: result.effect_description ?? null,
      detection_dc:       result.detection_dc,
      disarm_dc:          result.disarm_dc,
      attack_bonus:       result.attack_bonus,
      save_type:          result.save_type,
      save_dc:            result.save_dc,
      damage_entries:     result.damage_entries,
      reset_type:         result.reset_type,
      cr:                 result.cr,
      trap_hp:            result.trap_hp,
      trap_ac:            result.trap_ac,
      damage_immunities:  [],
      notes:              toTiptapJson(result.notes),
      tags:               result.tags,
      image_url:          result.image_url,
      image_focal_point:  null,
      ai_provenance:      result.ai_provenance ?? null,
    });

    if (result.image_url) {
      void logImageGeneration({
        kind: "trap", imageUrl: result.image_url, prompt: concept,
        targetId: trap.id, targetColumn: "image_url",
      });
    }
    return trap;
  }

  async function generateAndCreateTrap(concept: string, options: TrapGenerationOptions = {}): Promise<GenerateTrapOutcome> {
    // Checked up front: `generate` returns null on this without touching its error, which would read stale.
    if (isAnyAiGenerating.value) {
      return { id: null, name: null, error: "Another AI generation is already in progress.", picture: "none", pictureUrl: null };
    }
    const result = await generate(concept, options);
    if (!result) {
      return { id: null, name: null, error: genError.value ?? "Trap generation failed.", picture: "none", pictureUrl: null };
    }
    const trap = await saveGeneratedTrap(result, concept);
    const asked = options.generateImage !== false;
    return { id: trap.id, name: result.name, error: null, picture: !asked ? "none" : result.image_url ? "saved" : "failed", pictureUrl: result.image_url ?? null };
  }

  return { saveGeneratedTrap, generateAndCreateTrap };
}
