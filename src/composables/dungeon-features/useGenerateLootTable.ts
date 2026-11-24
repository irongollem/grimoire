/**
 * "Generate a loot table with AI, then save it", in two steps so the Familiar can show the entries between them
 * (#1270): the same resolve, validate and save the old panel's Create Table used.
 *
 * The model returns item *names*; they are resolved against the merged catalogue (the DM's own items plus the library
 * items their enabled sources show, the pool the server offered the model), an entry that does not resolve is dropped,
 * and what remains passes `validateEntries`, the manual editor's own validator, before anything is written.
 *
 * Deliberately narrow, like `useGenerateMonster`: the caller keeps its credit gate and its navigation. A failed save
 * throws; an invalid table is an `error` the caller shows.
 */
import { ref } from "vue";
import { until } from "@vueuse/core";
import { useCampaignStore } from "@/stores/campaign";
import { useCurrency } from "@/composables/currency/useCurrency";
import { useItemIndex } from "@/composables/items/useItemIndex";
import { useCreateLootTable } from "@/composables/dungeon-features/useLootTables";
import { useLootGeneration, type LootGenerationOptions } from "@/ai/useLootGeneration";
import { isAnyAiGenerating } from "@/ai/aiGeneratorRegistry";
import { resolveGeneratedLoot, type LootItemPoolRow, type ResolvedLootEntry } from "@/ai/resolveGeneratedLoot";
import type { LootTableAiResult } from "@/ai/types";
import { validateEntries, type LootCrTier, type LootEntry, type LootTable } from "@/types/lootTable.types";

/** A generated hoard with its names resolved against the catalogue, held for the DM's yes, or why nothing was made. */
export interface LootDraft {
  result: LootTableAiResult;
  resolved: ResolvedLootEntry[];
  /** Entries the model named that the catalogue does not have: they are not written. */
  unresolved: number;
}
export type LootDraftOutcome = { draft: LootDraft; error: null } | { draft: null; error: string };

/** The catalogue as the resolver reads it: id, name, rarity and type. The page resolves with the same rows. */
export function toLootPool(items: readonly LootItemPoolRow[]): LootItemPoolRow[] {
  return items.map((i) => ({ id: i.id, name: i.name, rarity: i.rarity, item_type: i.item_type }));
}

/** How long a run waits for the catalogue to load before it gives up rather than resolve against nothing. */
const CATALOGUE_WAIT_MS = 20_000;

export function useGenerateLootTable() {
  const campaign = useCampaignStore();
  const { currency } = useCurrency();
  const { mutateAsync: createLootTable } = useCreateLootTable();
  const { generate, error: genError } = useLootGeneration();

  // The vault catalogue is multiple MB: read only once a run needs it (the page reads it while its panel is open).
  const wanted = ref(false);
  const { data: catalogue } = useItemIndex(() => ({ enabled: wanted.value }));

  /**
   * Persists the resolved entries. An item entry stores the resolved id as-is: a vault uuid or a shared
   * `library_items` text id (`LootEntry.item_id` is jsonb, so either is safe). Nothing is cloned.
   *
   * Unresolved entries are not written: no stub items, no dangling ids (#337).
   */
  async function saveGeneratedLootTable(
    result: LootTableAiResult,
    resolvedEntries: ResolvedLootEntry[],
    crTier: LootCrTier,
  ): Promise<{ table: LootTable } | { error: string }> {
    const entries: LootEntry[] = [];
    for (const resolved of resolvedEntries) {
      if (resolved.kind === "unresolved") continue;
      if (resolved.kind === "item") {
        entries.push({
          id: crypto.randomUUID(),
          type: "item",
          item_id: resolved.item.id,
          drop_chance: resolved.dropChance,
          dice: resolved.dice,
          fixed_qty: resolved.fixedQty,
          notes: resolved.notes,
        });
      } else if (resolved.kind === "currency") {
        entries.push({
          id: crypto.randomUUID(),
          type: "currency",
          currency_label: resolved.label,
          drop_chance: resolved.dropChance,
          coins: resolved.coins,
          notes: resolved.notes,
        });
      } else {
        entries.push({
          id: crypto.randomUUID(),
          type: "random",
          rarity: resolved.rarity,
          item_type_filter: resolved.itemTypeFilter,
          drop_chance: resolved.dropChance,
          dice: resolved.dice,
          fixed_qty: resolved.fixedQty,
          notes: resolved.notes,
        });
      }
    }

    // The same validator the manual editor saves through: a generated table is held to exactly the DM's own
    // standard, and nothing the resolver repaired can slip past it. Reached only if the resolver has a gap, which is
    // the point of having it here.
    const invalid = validateEntries(entries);
    if (invalid) return { error: `${invalid} Try regenerating.` };

    const table = await createLootTable({
      campaign_id: campaign.activeCampaignId,
      name: result.name,
      description: result.description || null,
      cr_tier: crTier,
      entries,
      tags: result.tags,
      notes: null,
      monster_ids: [],
      ai_provenance: result.ai_provenance ?? null,
    });
    return { table };
  }

  /** Generates a hoard and resolves it, for the DM to look at before it is saved; saving is `saveGeneratedLootTable`. */
  async function generateLootDraft(concept: string, options: LootGenerationOptions): Promise<LootDraftOutcome> {
    // Checked up front: `generate` returns null on this without touching its error, which would read stale.
    if (isAnyAiGenerating.value) return { draft: null, error: "Another AI generation is already in progress." };
    wanted.value = true;
    const result = await generate(concept, options);
    if (!result) return { draft: null, error: genError.value ?? "Loot generation failed." };
    // Resolving against a catalogue that has not arrived would read every item as missing and save an empty table.
    await until(() => catalogue.value !== undefined).toBe(true, { timeout: CATALOGUE_WAIT_MS, throwOnTimeout: true });
    const items = catalogue.value;
    if (items === undefined) throw new Error("The item catalogue did not load.");
    const resolved = resolveGeneratedLoot(result.entries, toLootPool(items), currency.value);
    const unresolved = resolved.filter((e) => e.kind === "unresolved").length;
    // An empty table is not worth the DM opening.
    if (unresolved === resolved.length) {
      return { draft: null, error: "None of the items it named are in your Vault or enabled sources. Try again." };
    }
    return { draft: { result, resolved, unresolved }, error: null };
  }

  return { saveGeneratedLootTable, generateLootDraft };
}
