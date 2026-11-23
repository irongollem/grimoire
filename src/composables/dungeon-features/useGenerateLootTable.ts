/**
 * "Generate a loot table with AI and save it", the step `LootTableGeneratorPanel` used to own inline, extracted so Ask
 * Grimoire (#1253) runs the very same resolve, validate and save.
 *
 * The model returns item *names*; they are resolved against the merged catalogue (the DM's own items plus the library
 * items their enabled sources show, the pool the server offered the model), an entry that does not resolve is dropped,
 * and what remains passes `validateEntries`, the manual editor's own validator, before anything is written.
 *
 * Deliberately narrow, like `useGenerateMonster`: the page keeps its credit gate, the list of unresolved entries and its
 * navigation. A failed save throws; an invalid table is an `error` the page shows.
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

export interface GenerateLootTableOutcome {
  /** The created row's id, or `null` when nothing was saved. */
  id: string | null;
  name: string | null;
  /** A user-facing reason for a `null` id. */
  error: string | null;
  /** Entries the model named that the catalogue does not have: they are not written. */
  unresolved: number;
}

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

  async function generateAndCreateLootTable(concept: string, options: LootGenerationOptions): Promise<GenerateLootTableOutcome> {
    // Checked up front: `generate` returns null on this without touching its error, which would read stale.
    if (isAnyAiGenerating.value) {
      return { id: null, name: null, error: "Another AI generation is already in progress.", unresolved: 0 };
    }
    wanted.value = true;
    const result = await generate(concept, options);
    if (!result) {
      return { id: null, name: null, error: genError.value ?? "Loot generation failed.", unresolved: 0 };
    }
    // Resolving against a catalogue that has not arrived would read every item as missing and save an empty table.
    await until(() => catalogue.value !== undefined).toBe(true, { timeout: CATALOGUE_WAIT_MS, throwOnTimeout: true });
    const items = catalogue.value;
    if (items === undefined) throw new Error("The item catalogue did not load.");
    const pool = toLootPool(items);
    const resolved = resolveGeneratedLoot(result.entries, pool, currency.value);
    const unresolved = resolved.filter((e) => e.kind === "unresolved").length;
    // The page disables Create when nothing resolved; an empty table is not worth the DM opening.
    if (unresolved === resolved.length) {
      return { id: null, name: null, error: "None of the items it named are in your Vault or enabled sources. Try again.", unresolved };
    }
    const saved = await saveGeneratedLootTable(result, resolved, options.crTier);
    if ("error" in saved) return { id: null, name: null, error: saved.error, unresolved };
    return { id: saved.table.id, name: result.name, error: null, unresolved };
  }

  return { saveGeneratedLootTable, generateAndCreateLootTable };
}
