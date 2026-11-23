/**
 * "Generate a roll table with AI and save it", the step `RollTableGeneratorPanel` used to own inline, extracted so Ask
 * Grimoire (#1253) runs the very same save: the same entry mapping and campaign scope.
 *
 * Deliberately narrow, like `useGenerateMonster`: the page keeps its credit gate, the entity chips and its navigation.
 * A failed save throws, so the caller decides how to say so.
 */
import { useCampaignStore } from "@/stores/campaign";
import { useCreateRollTable } from "@/composables/dungeon-features/useRollTables";
import { useRollTableGeneration, type RollTableGenerationOptions } from "@/ai/useRollTableGeneration";
import { isAnyAiGenerating } from "@/ai/aiGeneratorRegistry";
import type { RollTableAiResult } from "@/ai/types";
import type { RollTable, RollTableDie } from "@/types/rollTable.types";

/** The dice the generator offers: the panel's picker and what Ask may ask for (`1d<n>`), one list so they agree. */
export const ROLL_TABLE_GENERATOR_DICE: readonly RollTableDie[] = ["1d6", "1d8", "1d10", "1d12", "1d20"];

export interface GenerateRollTableOutcome {
  /** The created row's id, or `null` when generation failed. */
  id: string | null;
  name: string | null;
  /** A user-facing reason for a `null` id. */
  error: string | null;
}

export function useGenerateRollTable() {
  const campaign = useCampaignStore();
  const { mutateAsync: createRollTable } = useCreateRollTable();
  const { generate, error: genError } = useRollTableGeneration();

  /** Saves a generated table rolled on `die`. Throws when the save fails. */
  async function saveGeneratedRollTable(result: RollTableAiResult, die: RollTableDie): Promise<RollTable> {
    return createRollTable({
      campaign_id: campaign.activeCampaignId,
      name: result.name,
      description: result.description || null,
      dice: die,
      entries: result.entries.map((e) => ({
        id: crypto.randomUUID(),
        min: e.min,
        max: e.max,
        label: e.label,
        encounter_id: null,
        notes: e.notes ?? null,
      })),
      tags: result.tags,
      notes: null,
      ai_provenance: result.ai_provenance ?? null,
    });
  }

  async function generateAndCreateRollTable(concept: string, options: RollTableGenerationOptions): Promise<GenerateRollTableOutcome> {
    // Checked up front: `generate` returns null on this without touching its error, which would read stale.
    if (isAnyAiGenerating.value) {
      return { id: null, name: null, error: "Another AI generation is already in progress." };
    }
    const result = await generate(concept, options);
    if (!result) {
      return { id: null, name: null, error: genError.value ?? "Roll table generation failed." };
    }
    const table = await saveGeneratedRollTable(result, options.die);
    return { id: table.id, name: result.name, error: null };
  }

  return { saveGeneratedRollTable, generateAndCreateRollTable };
}
