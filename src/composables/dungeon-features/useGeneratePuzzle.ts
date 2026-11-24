/**
 * "Generate a puzzle with AI and save it", the step its generator panel used to own inline, extracted so Ask
 * Grimoire (#1253) runs the very same save: private to the active campaign, the same field mapping.
 *
 * Deliberately narrow, like `useGenerateMonster`: the page keeps its quota and credit gate, the quota paywall and its
 * navigation. A failed save throws (a quota error included), so the caller decides how to say so.
 */
import { useCampaignStore } from "@/stores/campaign";
import { useCreatePuzzle } from "@/composables/dungeon-features/usePuzzles";
import { usePuzzleGeneration, type PuzzleGenerationOptions } from "@/ai/usePuzzleGeneration";
import { isAnyAiGenerating } from "@/ai/aiGeneratorRegistry";
import { toTiptapJson } from "@/ai/useNpcGeneration";
import type { PuzzleAiGenerated } from "@/ai/types";
import { PUZZLE_TYPES, PUZZLE_DIFFICULTIES, type PuzzleRoom } from "@/types/puzzle.types";

export interface GeneratePuzzleOutcome {
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

export function useGeneratePuzzle() {
  const campaign = useCampaignStore();
  const { mutateAsync: createPuzzle } = useCreatePuzzle();
  const { generate, error: genError } = usePuzzleGeneration();

  /** Saves a generated puzzle. Throws when the save fails, a quota error among them. */
  async function saveGeneratedPuzzle(result: PuzzleAiGenerated): Promise<PuzzleRoom> {
    return createPuzzle({
      name:                result.name,
      puzzle_type:         (result.puzzle_type as typeof PUZZLE_TYPES[number]) ?? "Logic",
      difficulty:          (result.difficulty as typeof PUZZLE_DIFFICULTIES[number]) ?? "Medium",
      description:         toTiptapJson(result.description),
      hints:               result.hints,
      solution:            toTiptapJson(result.solution),
      skill_checks:        result.skill_checks,
      success_outcome:     toTiptapJson(result.success_outcome),
      failure_consequence: toTiptapJson(result.failure_consequence),
      notes:               toTiptapJson(result.notes),
      tags:                result.tags,
      image_url:           result.image_url,
      image_focal_point:   null,
      // Scoped to the campaign it was generated for, like every other new puzzle (#597): the Scope control widens it
      // if the DM wants it in all of them.
      campaign_id:         campaign.activeCampaignId,
      location_id:         null,
      dungeon_feature_id:  null,
      library_dungeon_feature_id: null,
      is_shared:           false,
      shared_hints:        [],
      player_visible_to:   [],
      read_aloud:          null,
      ai_provenance:       result.ai_provenance ?? null,
    });
  }

  async function generateAndCreatePuzzle(concept: string, options: PuzzleGenerationOptions = {}): Promise<GeneratePuzzleOutcome> {
    // Checked up front: `generate` returns null on this without touching its error, which would read stale.
    if (isAnyAiGenerating.value) {
      return { id: null, name: null, error: "Another AI generation is already in progress.", picture: "none", pictureUrl: null };
    }
    const result = await generate(concept, options);
    if (!result) {
      return { id: null, name: null, error: genError.value ?? "Puzzle generation failed.", picture: "none", pictureUrl: null };
    }
    const puzzle = await saveGeneratedPuzzle(result);
    const asked = options.generateImage !== false;
    return { id: puzzle.id, name: result.name, error: null, picture: !asked ? "none" : result.image_url ? "saved" : "failed", pictureUrl: result.image_url ?? null };
  }

  return { saveGeneratedPuzzle, generateAndCreatePuzzle };
}
