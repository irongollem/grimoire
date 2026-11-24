/**
 * "Generate a dungeon feature with AI and save it", the step its generator panel used to own inline,
 * extracted so Ask Grimoire (#1253) runs the very same save: the same fields, the same campaign scope, the Gallery
 * log of the picture.
 *
 * Deliberately narrow, like `useGenerateMonster`: the page keeps its credit gate, its toast for a failed save, the
 * retained result and its navigation. A failed save throws, so the caller decides how to say so.
 */
import { useCampaignStore } from "@/stores/campaign";
import { useCreateDungeonFeature } from "@/composables/dungeon-features/useDungeonFeatures";
import { useImageGenerationLog } from "@/composables/ai/useImageGenerationLog";
import {
  useDungeonFeatureGeneration,
  type DungeonFeatureAiGenerated,
  type DungeonFeatureGenerationOptions,
} from "@/ai/useDungeonFeatureGeneration";
import { isAnyAiGenerating } from "@/ai/aiGeneratorRegistry";
import { toTiptapJson } from "@/ai/useNpcGeneration";
import type { DungeonFeature } from "@/types/dungeonFeature.types";

export interface GenerateDungeonFeatureOutcome {
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

function prose(text: string | null): string | null {
  return text ? toTiptapJson(text) : null;
}

export function useGenerateDungeonFeature() {
  const campaign = useCampaignStore();
  const { mutateAsync: createFeature } = useCreateDungeonFeature();
  const { logImageGeneration } = useImageGenerationLog();
  const { generate, error: genError } = useDungeonFeatureGeneration();

  /** Saves a generated feature and logs its picture to the Gallery. Throws when the save fails. */
  async function saveGeneratedFeature(result: DungeonFeatureAiGenerated, concept: string): Promise<DungeonFeature> {
    const feature = await createFeature({
      // Scoped to the campaign it was generated for; widened from the editor's Scope control if the DM wants it
      // everywhere.
      campaign_id:          campaign.activeCampaignId,
      name:                 result.name,
      feature_type:         result.feature_type,
      description:          prose(result.description),
      perception_dc:        result.perception_dc,
      investigation_dc:     result.investigation_dc,
      arcana_dc:            result.arcana_dc,
      trigger_type:         result.trigger_type,
      trigger_description:  result.trigger_description,
      feature_glyph:        result.feature_glyph,
      object_material:      result.object_material,
      object_size:          result.object_size,
      object_ac:            result.object_ac,
      object_hp:            result.object_hp,
      damage_threshold:     result.damage_threshold,
      break_dc:             result.break_dc,
      lock_dc:              result.lock_dc,
      contents_description: prose(result.contents_description),
      image_url:            result.image_url,
      image_focal_point:    null,
      tags:                 result.tags,
      notes:                prose(result.notes),
      ai_provenance:        result.ai_provenance ?? null,
    });

    if (result.image_url) {
      void logImageGeneration({
        kind: "dungeon_feature", imageUrl: result.image_url, prompt: concept,
        targetId: feature.id, targetColumn: "image_url",
      });
    }
    return feature;
  }

  async function generateAndCreateFeature(
    concept: string,
    options: DungeonFeatureGenerationOptions = {},
  ): Promise<GenerateDungeonFeatureOutcome> {
    // Checked up front: `generate` returns null on this without touching its error, which would read stale.
    if (isAnyAiGenerating.value) {
      return { id: null, name: null, error: "Another AI generation is already in progress.", picture: "none", pictureUrl: null };
    }
    const result = await generate(concept, options);
    if (!result) {
      return { id: null, name: null, error: genError.value ?? "Feature generation failed.", picture: "none", pictureUrl: null };
    }
    const feature = await saveGeneratedFeature(result, concept);
    const asked = options.generateImage !== false;
    return { id: feature.id, name: result.name, error: null, picture: !asked ? "none" : result.image_url ? "saved" : "failed", pictureUrl: result.image_url ?? null };
  }

  return { saveGeneratedFeature, generateAndCreateFeature };
}
