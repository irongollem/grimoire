/**
 * Ask Grimoire (#1253): the Loot Table Generator, as a quote and a run.
 *
 * The price is `useLootTableQuote`'s (the one `LootTableGeneratorPanel` shows), the gates are the page's (AI off, a game
 * system without stat blocks, the balance: loot tables have no quota) and the run is `useGenerateLootTable`, which
 * resolves the model's item names against the DM's catalogue and writes only what resolves. The tier is kept only when
 * it is one the page offers; the page's default (5-10) applies otherwise. Attunement is not asked through Ask.
 *
 * Entries the catalogue does not have are not written, so a table that kept fewer entries than the model named says
 * so in its own part rather than reading as a clean run.
 */
import type { AskProposal } from "@edge-shared/agent/askContract";
import type { AskAdapter, AskQuote, AskQuoteLine, AskRunResult } from "@/lib/ask/askAdapter";
import { conceptBlock, failedRun, spent } from "@/ai/ask/adapters/askAdapterKit";
import { askString, readAskInputs } from "@/ai/ask/askInputs";
import { useAskGate } from "@/ai/ask/useAskGate";
import { AI_PROMPT_LIMIT_SHORT } from "@/ai/utils";
import { useLootTableQuote } from "@/composables/ai/quotes/lootTableQuote";
import { useGenerateLootTable } from "@/composables/dungeon-features/useGenerateLootTable";
import { LOOT_CR_TIERS, LOOT_CR_TIER_LABELS, type LootCrTier } from "@/types/lootTable.types";

/** The page's default tier. */
const DEFAULT_TIER: LootCrTier = "5-10";

export function useLootTableAskAdapter(): AskAdapter {
  const quoteLootTable = useLootTableQuote();
  const { blockFor } = useAskGate(null, "loot table");
  const { generateAndCreateLootTable } = useGenerateLootTable();

  function understand(proposal: AskProposal) {
    const inputs = readAskInputs("loot_table", proposal.inputs);
    const said = askString(inputs, "cr_tier");
    const tier = LOOT_CR_TIERS.find((t) => t === said);
    return { crTier: tier === undefined ? DEFAULT_TIER : tier, concept: proposal.concept.trim() };
  }

  function quote(proposal: AskProposal): AskQuote {
    const read = understand(proposal);
    const priced = quoteLootTable();

    const lines: AskQuoteLine[] = [{ label: "Tier", value: LOOT_CR_TIER_LABELS[read.crTier], credits: null }, ...priced.lines];

    let block = blockFor({ total: priced.total, byok: priced.byok, fiveE: true });
    block = block ?? conceptBlock(read.concept, "treasure", { empty: "Say what this treasure is first.", limit: AI_PROMPT_LIMIT_SHORT });
    return { lines, total: priced.total, byok: priced.byok, block };
  }

  async function run(proposal: AskProposal): Promise<AskRunResult> {
    // The state may have moved since the DM read the quote: the same gates, again, before anything is spent.
    const current = quote(proposal);
    if (current.block) return failedRun("Loot table", current.block.message);
    const read = understand(proposal);

    let outcome;
    try {
      outcome = await generateAndCreateLootTable(read.concept, { crTier: read.crTier, excludeAttunement: false });
    } catch (e) {
      return failedRun("Loot table", e instanceof Error ? e.message : "The loot table could not be saved.");
    }
    if (!outcome.id || outcome.name === null) return failedRun("Loot table", outcome.error ?? "Loot generation failed.");

    const parts: AskRunResult["parts"] = [
      { label: "Loot table", ok: true, credits: spent(current.lines.find((l) => l.label === "Loot table")) },
    ];
    if (outcome.unresolved > 0) {
      parts.push({
        label: "Items",
        ok: false,
        credits: 0,
        error: `${outcome.unresolved} item${outcome.unresolved === 1 ? " was" : "s were"} not in your Vault or enabled sources, so ${outcome.unresolved === 1 ? "it was" : "they were"} left out.`,
      });
    }
    return { record: { type: "other", id: outcome.id, name: outcome.name }, route: `/loot-tables/${outcome.id}`, parts };
  }

  return { id: "loot_table", quote, run };
}

export default useLootTableAskAdapter;
