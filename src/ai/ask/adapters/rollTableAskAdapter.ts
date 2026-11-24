/**
 * Ask Grimoire (#1253, #1270): the Roll Table Generator, as a quote and a preview.
 *
 * The price is `useRollTableQuote`'s, the gates are the page's (AI off and the balance: roll tables have no quota and
 * no game-system fence). The run is two steps (`preview`): `useGenerateRollTable` generates the table and the card
 * shows its rows, as the panel showed them before Create Table, and only the DM's Create saves it. The die is the
 * card's chips; a die the page does not offer is not understood and the page's own default, a d8, applies.
 *
 * The panel also listed the people, places and factions the table mentions as chips that opened them. Nothing was
 * saved from those (a table entry has no such link), so the preview does not carry them.
 */
import type { AskProposal } from "@edge-shared/agent/askContract";
import type { AskPreviewAdapter, AskPreviewOutcome, AskPreviewShown, AskQuote, AskQuoteLine, AskRunPart, AskRunResult } from "@/lib/ask/askAdapter";
import { conceptBlock, failedRun, saveFailure, spent } from "@/ai/ask/adapters/askAdapterKit";
import { askString, readAskInputs } from "@/ai/ask/askInputs";
import { useAskGate } from "@/ai/ask/useAskGate";
import { AI_PROMPT_LIMIT_SHORT } from "@/ai/utils";
import type { RollTableAiResult } from "@/ai/types";
import { useRollTableQuote } from "@/composables/ai/quotes/rollTableQuote";
import { ROLL_TABLE_GENERATOR_DICE, useGenerateRollTable } from "@/composables/dungeon-features/useGenerateRollTable";
import type { RollTableDie } from "@/types/rollTable.types";

/** The page's default die. */
const DEFAULT_DIE: RollTableDie = "1d8";

/** What the result card shows of a table: its name and die, when to roll, and every row with the numbers it covers. */
function shownTable(result: RollTableAiResult, die: RollTableDie): AskPreviewShown {
  return {
    title: result.name,
    badge: die,
    sections: [
      ...(result.description ? [{ hint: result.description, rows: [] }] : []),
      {
        heading: "Entries",
        rows: result.entries.map((e) => ({
          label: e.min === e.max ? String(e.min) : `${e.min}–${e.max}`,
          detail: e.notes ? `${e.label} (${e.notes})` : e.label,
        })),
      },
    ],
  };
}

export function useRollTableAskAdapter(): AskPreviewAdapter {
  const quoteRollTable = useRollTableQuote();
  const { blockFor } = useAskGate(null, "roll table");
  const { generateRollTableDraft, saveGeneratedRollTable } = useGenerateRollTable();

  function understand(proposal: AskProposal) {
    const inputs = readAskInputs("roll_table", proposal.inputs);
    const said = askString(inputs, "die");
    const die = ROLL_TABLE_GENERATOR_DICE.find((d) => d === said);
    return { die: die === undefined ? DEFAULT_DIE : die, concept: proposal.concept.trim() };
  }

  function quote(proposal: AskProposal): AskQuote {
    const read = understand(proposal);
    const priced = quoteRollTable();

    const lines: AskQuoteLine[] = [{ label: "Die", value: read.die, credits: null }, ...priced.lines];

    let block = blockFor({ total: priced.total });
    block = block ?? conceptBlock(read.concept, "table", { empty: "Say what this table is for first.", limit: AI_PROMPT_LIMIT_SHORT });
    return { lines, total: priced.total, block };
  }

  /** Generates and holds the table for the DM to look at: the gilt button charges here, and `create` saves it for nothing more. */
  async function preview(proposal: AskProposal): Promise<AskPreviewOutcome> {
    // The state may have moved since the DM read the quote: the same gates, again, before anything is spent.
    const current = quote(proposal);
    if (current.block) return { ok: false, result: failedRun("Roll table", current.block.message) };
    const read = understand(proposal);

    let outcome;
    try {
      outcome = await generateRollTableDraft(read.concept, { die: read.die });
    } catch (e) {
      return { ok: false, result: failedRun("Roll table", e instanceof Error ? e.message : "Roll table generation failed.") };
    }
    if (outcome.draft === null) return { ok: false, result: failedRun("Roll table", outcome.error) };
    const draft = outcome.draft;

    const parts: AskRunPart[] = [{ label: "Roll table", ok: true, credits: spent(current.lines.find((l) => l.label === "Roll table")) }];

    async function create(): Promise<AskRunResult> {
      let saved;
      try {
        saved = await saveGeneratedRollTable(draft, read.die);
      } catch (e) {
        return failedRun("Roll table", saveFailure(e, "roll tables", "The roll table could not be saved."));
      }
      return { record: { type: "other", id: saved.id, name: draft.name }, route: `/roll-tables/${saved.id}`, parts };
    }

    return { ok: true, preview: { shown: shownTable(draft, read.die), parts, create } };
  }

  return { id: "roll_table", quote, preview };
}

export default useRollTableAskAdapter;
