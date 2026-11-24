/**
 * Ask Grimoire (#1253, #1270): the Loot Table Generator, as a quote and a preview.
 *
 * The price is `useLootTableQuote`'s, the gates are the page's (AI off, a game system without stat blocks, the
 * balance: loot tables have no quota). The run is two steps (`preview`): `useGenerateLootTable` generates the hoard and
 * resolves the model's item names against the DM's catalogue, the card shows the entries as the panel showed them
 * (what could not be matched is named, never dropped silently, #337), and only the DM's Create writes what resolved.
 * The tier is kept only when it is one the page offers; the page's default (5-10) applies otherwise.
 * `skip_attunement` is the page's "Skip items that require attunement".
 */
import type { AskProposal } from "@edge-shared/agent/askContract";
import type { AskPreviewAdapter, AskPreviewOutcome, AskPreviewShown, AskQuote, AskQuoteLine, AskRunPart, AskRunResult } from "@/lib/ask/askAdapter";
import { conceptBlock, failedRun, saveFailure, spent } from "@/ai/ask/adapters/askAdapterKit";
import { askFlag, askString, readAskInputs } from "@/ai/ask/askInputs";
import { useAskGate } from "@/ai/ask/useAskGate";
import { AI_PROMPT_LIMIT_SHORT } from "@/ai/utils";
import type { ResolvedLootEntry } from "@/ai/resolveGeneratedLoot";
import { useLootTableQuote } from "@/composables/ai/quotes/lootTableQuote";
import { useCurrency } from "@/composables/currency/useCurrency";
import { useGenerateLootTable, type LootDraft } from "@/composables/dungeon-features/useGenerateLootTable";
import { ITEM_RARITY_LABELS, ITEM_TYPE_LABELS } from "@/types/item.types";
import { LOOT_CR_TIERS, LOOT_CR_TIER_LABELS, type LootCrTier } from "@/types/lootTable.types";

/** The page's default tier. */
const DEFAULT_TIER: LootCrTier = "5-10";

/** How many of a row: the dice the model gave, or the fixed quantity. */
function quantity(entry: { dice: string | null; fixedQty: number | null }): string {
  return `×${entry.dice ?? entry.fixedQty}`;
}

/** What the result card shows of a hoard: each entry with its chance, and what the catalogue could not match. */
function shownHoard(draft: LootDraft, tier: LootCrTier, coinText: (entry: Extract<ResolvedLootEntry, { kind: "currency" }>) => string): AskPreviewShown {
  const rows = draft.resolved.flatMap((entry) => {
    switch (entry.kind) {
      case "item":
        return [{ label: `${entry.dropChance}%  ${entry.item.name}`, detail: quantity(entry) }];
      case "currency":
        return [{ label: `${entry.dropChance}%  ${entry.label ?? "Coins"}`, detail: coinText(entry) }];
      case "random": {
        const kind = entry.itemTypeFilter ? ITEM_TYPE_LABELS[entry.itemTypeFilter].toLowerCase() : "item";
        return [{ label: `${entry.dropChance}%  Random ${ITEM_RARITY_LABELS[entry.rarity].toLowerCase()} ${kind}`, detail: quantity(entry) }];
      }
      case "unresolved":
        return [];
    }
  });
  const unresolved = draft.unresolved;
  return {
    title: draft.result.name,
    ...(tier !== "any" ? { badge: LOOT_CR_TIER_LABELS[tier] } : {}),
    sections: [
      ...(draft.result.description ? [{ hint: draft.result.description, rows: [] }] : []),
      { heading: "Entries", rows },
    ],
    ...(unresolved > 0
      ? {
          note: `${unresolved} ${unresolved === 1 ? "entry" : "entries"} couldn't be matched to a real item and ${unresolved === 1 ? "is" : "are"} left out. `
            + (draft.result.grounded === false
              ? "This ran without your Vault (the semantic index isn't available), so the model was guessing at names."
              : `Add ${unresolved === 1 ? "it" : "them"} to the Vault, or enable the source ${unresolved === 1 ? "it comes" : "they come"} from, and ask again.`),
        }
      : {}),
  };
}

export function useLootTableAskAdapter(): AskPreviewAdapter {
  const quoteLootTable = useLootTableQuote();
  const { blockFor } = useAskGate(null, "loot table");
  const { generateLootDraft, saveGeneratedLootTable } = useGenerateLootTable();
  const { formatCoins } = useCurrency();
  const coinText = (entry: Extract<ResolvedLootEntry, { kind: "currency" }>) => formatCoins(entry.coins) || "no coin";

  function understand(proposal: AskProposal) {
    const inputs = readAskInputs("loot_table", proposal.inputs);
    const said = askString(inputs, "cr_tier");
    const tier = LOOT_CR_TIERS.find((t) => t === said);
    return {
      crTier: tier === undefined ? DEFAULT_TIER : tier,
      skipAttunement: askFlag(inputs, "skip_attunement"),
      concept: proposal.concept.trim(),
    };
  }

  function quote(proposal: AskProposal): AskQuote {
    const read = understand(proposal);
    const priced = quoteLootTable();

    const lines: AskQuoteLine[] = [{ label: "Tier", value: LOOT_CR_TIER_LABELS[read.crTier], credits: null }];
    if (read.skipAttunement) lines.push({ label: "Attunement", value: "Skipped", credits: null });
    lines.push(...priced.lines);

    let block = blockFor({ total: priced.total, fiveE: true });
    block = block ?? conceptBlock(read.concept, "treasure", { empty: "Say what this treasure is first.", limit: AI_PROMPT_LIMIT_SHORT });
    return { lines, total: priced.total, block };
  }

  /** Generates and holds the hoard for the DM to look at: the gilt button charges here, and `create` writes it for nothing more. */
  async function preview(proposal: AskProposal): Promise<AskPreviewOutcome> {
    // The state may have moved since the DM read the quote: the same gates, again, before anything is spent.
    const current = quote(proposal);
    if (current.block) return { ok: false, result: failedRun("Loot table", current.block.message) };
    const read = understand(proposal);

    let outcome;
    try {
      outcome = await generateLootDraft(read.concept, { crTier: read.crTier, excludeAttunement: read.skipAttunement });
    } catch (e) {
      return { ok: false, result: failedRun("Loot table", e instanceof Error ? e.message : "The loot table could not be written.") };
    }
    if (outcome.draft === null) return { ok: false, result: failedRun("Loot table", outcome.error) };
    const draft = outcome.draft;

    const parts: AskRunPart[] = [{ label: "Loot table", ok: true, credits: spent(current.lines.find((l) => l.label === "Loot table")) }];

    async function create(): Promise<AskRunResult> {
      let saved;
      try {
        saved = await saveGeneratedLootTable(draft.result, draft.resolved, read.crTier);
      } catch (e) {
        return failedRun("Loot table", saveFailure(e, "loot tables", "The loot table could not be saved."));
      }
      if ("error" in saved) return failedRun("Loot table", saved.error);
      const made: AskRunPart[] = [...parts];
      if (draft.unresolved > 0) {
        made.push({
          label: "Items",
          ok: false,
          credits: 0,
          error: `${draft.unresolved} item${draft.unresolved === 1 ? " was" : "s were"} not in your Vault or enabled sources, so ${draft.unresolved === 1 ? "it was" : "they were"} left out.`,
        });
      }
      return { record: { type: "other", id: saved.table.id, name: draft.result.name }, route: `/loot-tables/${saved.table.id}`, parts: made };
    }

    return { ok: true, preview: { shown: shownHoard(draft, read.crTier, coinText), parts, create } };
  }

  return { id: "loot_table", quote, preview };
}

export default useLootTableAskAdapter;
