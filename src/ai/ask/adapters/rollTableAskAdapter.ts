/**
 * Ask Grimoire (#1253): the Roll Table Generator, as a quote and a run.
 *
 * The price is `useRollTableQuote`'s (the one `RollTableGeneratorPanel` shows), the gates are the page's (AI off and the
 * balance: roll tables have no quota and no game-system fence) and the run is `useGenerateRollTable`. The die is read
 * from the schema's number of faces and kept only when it is one the page offers (`1d<n>`); anything else is not
 * understood and the page's own default, a d8, applies.
 */
import type { AskProposal } from "@edge-shared/agent/askContract";
import type { AskAdapter, AskQuote, AskQuoteLine, AskRunResult } from "@/lib/ask/askAdapter";
import { conceptBlock, failedRun, spent } from "@/ai/ask/adapters/askAdapterKit";
import { askInteger, readAskInputs } from "@/ai/ask/askInputs";
import { useAskGate } from "@/ai/ask/useAskGate";
import { AI_PROMPT_LIMIT_SHORT } from "@/ai/utils";
import { useRollTableQuote } from "@/composables/ai/quotes/rollTableQuote";
import { ROLL_TABLE_GENERATOR_DICE, useGenerateRollTable } from "@/composables/dungeon-features/useGenerateRollTable";
import type { RollTableDie } from "@/types/rollTable.types";

/** The page's default die. */
const DEFAULT_DIE: RollTableDie = "1d8";

export function useRollTableAskAdapter(): AskAdapter {
  const quoteRollTable = useRollTableQuote();
  const { blockFor } = useAskGate(null, "roll table");
  const { generateAndCreateRollTable } = useGenerateRollTable();

  function understand(proposal: AskProposal) {
    const inputs = readAskInputs("roll_table", proposal.inputs);
    const faces = askInteger(inputs, "die");
    const die = ROLL_TABLE_GENERATOR_DICE.find((d) => d === `1d${faces}`);
    return { die: die === undefined ? DEFAULT_DIE : die, concept: proposal.concept.trim() };
  }

  function quote(proposal: AskProposal): AskQuote {
    const read = understand(proposal);
    const priced = quoteRollTable();

    const lines: AskQuoteLine[] = [{ label: "Die", value: read.die, credits: null }, ...priced.lines];

    let block = blockFor({ total: priced.total, byok: priced.byok });
    block = block ?? conceptBlock(read.concept, "table", { empty: "Say what this table is for first.", limit: AI_PROMPT_LIMIT_SHORT });
    return { lines, total: priced.total, byok: priced.byok, block };
  }

  async function run(proposal: AskProposal): Promise<AskRunResult> {
    // The state may have moved since the DM read the quote: the same gates, again, before anything is spent.
    const current = quote(proposal);
    if (current.block) return failedRun("Roll table", current.block.message);
    const read = understand(proposal);

    let outcome;
    try {
      outcome = await generateAndCreateRollTable(read.concept, { die: read.die });
    } catch (e) {
      return failedRun("Roll table", e instanceof Error ? e.message : "The roll table could not be saved.");
    }
    if (!outcome.id || outcome.name === null) return failedRun("Roll table", outcome.error ?? "Roll table generation failed.");

    return {
      record: { type: "other", id: outcome.id, name: outcome.name },
      route: `/roll-tables/${outcome.id}`,
      parts: [{ label: "Roll table", ok: true, credits: spent(current.lines.find((l) => l.label === "Roll table")) }],
    };
  }

  return { id: "roll_table", quote, run };
}

export default useRollTableAskAdapter;
