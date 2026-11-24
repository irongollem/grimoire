/**
 * "Generate a roll table with AI, then save it", in two steps so the Familiar can show the rows between them (#1270):
 * the same entry mapping and campaign scope the old panel's Create Table used.
 *
 * Deliberately narrow, like `useGenerateMonster`: the caller keeps its credit gate and its navigation. A failed save
 * throws, so the caller decides how to say so.
 */
import { useCampaignStore } from "@/stores/campaign";
import { useCreateRollTable } from "@/composables/dungeon-features/useRollTables";
import { useRollTableGeneration, type RollTableGenerationOptions } from "@/ai/useRollTableGeneration";
import { isAnyAiGenerating } from "@/ai/aiGeneratorRegistry";
import type { RollTableAiResult } from "@/ai/types";
import type { RollTable, RollTableDie } from "@/types/rollTable.types";

/** The dice the generator offers: the panel's picker and what Ask may ask for (`1d<n>`), one list so they agree. */
export const ROLL_TABLE_GENERATOR_DICE: readonly RollTableDie[] = ["1d6", "1d8", "1d10", "1d12", "1d20"];

/** A generated table held for the DM's yes (the Familiar's preview), or why nothing was made. */
export type RollTableDraftOutcome = { draft: RollTableAiResult; error: null } | { draft: null; error: string };

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

  /** Generates a table for the DM to look at before it is saved; saving is `saveGeneratedRollTable`. */
  async function generateRollTableDraft(concept: string, options: RollTableGenerationOptions): Promise<RollTableDraftOutcome> {
    // Checked up front: `generate` returns null on this without touching its error, which would read stale.
    if (isAnyAiGenerating.value) return { draft: null, error: "Another AI generation is already in progress." };
    const result = await generate(concept, options);
    if (!result) return { draft: null, error: genError.value ?? "Roll table generation failed." };
    return { draft: result, error: null };
  }

  return { saveGeneratedRollTable, generateRollTableDraft };
}
