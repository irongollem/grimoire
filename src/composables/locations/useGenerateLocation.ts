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
import type { LocationType } from "@/types/location.types";

export interface GenerateLocationOptions {
  locationType?: LocationType;
  /** A place of this campaign the new one sits inside. */
  parent?: { id: string; name: string } | null;
  /** An NPC of this campaign who keeps the place (`locations.npc_owner_id`). The page offers no picker; Ask can name one. */
  keeperNpcId?: string | null;
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
  map: "none" | "saved" | "failed";
}

export function useGenerateLocation() {
  const { mutateAsync: createLocation } = useCreateLocation();
  const { logImageGeneration } = useImageGenerationLog();
  const { generate, error: genError } = useLocationGeneration();

  async function generateAndCreateLocation(concept: string, options: GenerateLocationOptions = {}): Promise<GenerateLocationOutcome> {
    if (isAnyAiGenerating.value) {
      return { id: null, error: "Another AI generation is already in progress.", name: null, picture: "none", map: "none" };
    }
    const result = await generate(concept, {
      location_type: options.locationType,
      parent_name: options.parent?.name || undefined,
      generateImage: options.generateImage,
      generateMap: options.generateMap,
    });
    if (!result) return { id: null, error: genError.value ?? "Location generation failed.", name: null, picture: "none", map: "none" };

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

    const sceneAsked = options.generateImage !== false;
    return {
      id: location.id,
      error: null,
      name: result.name,
      picture: !sceneAsked ? "none" : result.image_url ? "saved" : "failed",
      map: !options.generateMap ? "none" : result.map_url ? "saved" : "failed",
    };
  }

  return { generateAndCreateLocation };
}
