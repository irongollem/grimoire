/**
 * "Generate a place with AI and insert it": the generate-then-create step `LocationGeneratorPanel` used to hold
 * inline, extracted so Ask Grimoire (#1253) runs the exact same pipeline as the page.
 *
 * The panel keeps its navigation, paywall, toast and generation state. A save that fails throws (the page toasts it;
 * Ask turns it into a failed part). The scene and map pictures are logged to the Gallery after the save, as the page
 * always did, and that log never fails the run.
 */
import { useCreateLocation } from "@/composables/locations/useLocations";
import { useImageGenerationLog } from "@/composables/ai/useImageGenerationLog";
import { useLocationGeneration } from "@/ai/useLocationGeneration";
import { isAnyAiGenerating } from "@/ai/aiGeneratorRegistry";
import { toTiptapJson } from "@/ai/useNpcGeneration";
import { useCampaignStore } from "@/stores/campaign";
import { useApplyGeneratorLinks } from "@/composables/worldLinks/useApplyGeneratorLinks";
import { linksContextLine, type GeneratorLink } from "@/lib/worldLinks/generatorLinks";
import type { LocationType } from "@/types/location.types";

export interface GenerateLocationOptions {
  locationType?: LocationType;
  /** A place of this campaign the new one sits inside. */
  parent?: { id: string; name: string } | null;
  /** An NPC of this campaign who keeps the place (`locations.npc_owner_id`). The page picks one, and so can Ask. */
  keeperNpcId?: string | null;
  /** Ties to existing records ("held by the Red Hand"), written after the place is saved; a failure is a `linkErrors` entry. */
  links?: readonly GeneratorLink[];
  generateImage?: boolean;
  generateMap?: boolean;
}

export interface GenerateLocationOutcome {
  /** The created row's id, or `null` when generation failed. */
  id: string | null;
  /** A user-facing reason for a `null` id, or `null` on success. */
  error: string | null;
  name: string | null;
  /** `none` when no scene was asked for, `failed` when asked for and not painted (the place is saved either way). */
  picture: "none" | "saved" | "failed";
  /** The saved picture's URL when `picture` is "saved", so a caller can show it (Ask's result card). */
  pictureUrl: string | null;
  map: "none" | "saved" | "failed";
  /** One sentence per tie that could not be written; the place is saved either way. */
  linkErrors: string[];
}

export function useGenerateLocation() {
  const { mutateAsync: createLocation } = useCreateLocation();
  const { logImageGeneration } = useImageGenerationLog();
  const { generate, error: genError } = useLocationGeneration();
  const { applyGeneratorLinks } = useApplyGeneratorLinks();
  const campaign = useCampaignStore();

  async function generateAndCreateLocation(concept: string, options: GenerateLocationOptions = {}): Promise<GenerateLocationOutcome> {
    if (isAnyAiGenerating.value) {
      return { id: null, error: "Another AI generation is already in progress.", name: null, picture: "none", pictureUrl: null, map: "none", linkErrors: [] };
    }
    // The campaign the run started in: a run that outlives the DM's navigation still ties into it.
    const campaignId = campaign.activeCampaignId;
    const links = options.links ?? [];
    // The ties go to the model in the prompt, so the place it writes agrees with them.
    const ties = linksContextLine(links);
    const result = await generate(ties ? `${concept}\n\n${ties}` : concept, {
      location_type: options.locationType,
      parent_name: options.parent?.name || undefined,
      generateImage: options.generateImage,
      generateMap: options.generateMap,
    });
    if (!result) return { id: null, error: genError.value ?? "Location generation failed.", name: null, picture: "none", pictureUrl: null, map: "none", linkErrors: [] };

    const location = await createLocation({
      name:                  result.name,
      location_type:         options.locationType ?? "other",
      description:           toTiptapJson(result.description),
      player_summary:        result.player_summary || null,
      tags:                  result.tags,
      notes:                 result.notes ? toTiptapJson(result.notes) : null,
      era_start:             null,
      era_end:               null,
      parent_id:             options.parent?.id ?? null,
      image_url:             result.image_url,
      map_url:               result.map_url,
      map_pins:              [],
      is_map_shared:         false,
      player_visible_to:     [],
      is_description_shared: false,
      is_npcs_shared:        false,
      is_inventory_shared:   false,
      npc_owner_id:          options.keeperNpcId ?? null,
      related_location_ids:  [],
      source_map_id:         null,
      is_battle_map:         false,
      grid_calibration:      null,
      ai_provenance:         result.ai_provenance ?? null,
    });

    // Log generated scene + map to the Gallery, linked back to the new location.
    if (result.image_url) {
      void logImageGeneration({ kind: "location", imageUrl: result.image_url, prompt: concept, targetId: location.id, targetColumn: "image_url" });
    }
    if (result.map_url) {
      void logImageGeneration({ kind: "map", imageUrl: result.map_url, prompt: concept, targetId: location.id, targetColumn: "map_url" });
    }

    const linkErrors = campaignId
      ? await applyGeneratorLinks({ kind: "location", id: location.id }, links, campaignId)
      : links.map((link) => `${link.name}: no campaign is open`);

    const sceneAsked = options.generateImage !== false;
    return {
      id: location.id,
      error: null,
      name: result.name,
      picture: !sceneAsked ? "none" : result.image_url ? "saved" : "failed",
      pictureUrl: result.image_url ?? null,
      map: !options.generateMap ? "none" : result.map_url ? "saved" : "failed",
      linkErrors,
    };
  }

  return { generateAndCreateLocation };
}
