/**
 * Ask Grimoire (#1253): the Trap Generator, as a quote and a run.
 *
 * The price is `useTrapQuote`'s (the one `TrapGeneratorPanel` shows), the gates are the page's (AI off, a game system without stat blocks, the balance: traps have no quota) and the run
 * is `useGenerateTrap`, the generate-and-save step the page calls. The kind is kept only when it is one the page's picker offers. The page's "Add party to scene" reference is not offered through Ask: it needs the likeness notice and a picture the DM picks.
 *
 * A failed picture never costs the trap: the row is saved first and the picture is its own part. There is no
 * one-picture retry for a trap yet (`useMissingPortrait` has no kind for it), so a failed picture says to add one
 * from the trap's own page.
 */
import type { AskProposal } from "@edge-shared/agent/askContract";
import type { AskAdapter, AskQuote, AskQuoteLine, AskRunResult } from "@/lib/ask/askAdapter";
import { conceptBlock, failedRun, picturePart, spent } from "@/ai/ask/adapters/askAdapterKit";
import { askFlag, askString, readAskInputs } from "@/ai/ask/askInputs";
import { useAskGate } from "@/ai/ask/useAskGate";
import { useTrapQuote } from "@/composables/ai/quotes/trapQuote";
import { useGenerateTrap } from "@/composables/dungeon-features/useGenerateTrap";
import { isQuotaExceeded } from "@/lib/quotaError";
import { TRAP_TYPES } from "@/types/trap.types";

/** The page's picker offers a fixed list: a value is kept only when it is on it, spelled the way the page spells it. */
function knownTrapType(said: string | null): string | null {
  if (said === null) return null;
  const found = TRAP_TYPES.find((t) => t.toLowerCase() === said.toLowerCase());
  return found === undefined ? null : found;
}

export function useTrapAskAdapter(): AskAdapter {
  const quoteTrap = useTrapQuote();
  const { blockFor } = useAskGate(null, "trap");
  const { generateAndCreateTrap } = useGenerateTrap();

  function understand(proposal: AskProposal) {
    const inputs = readAskInputs("trap", proposal.inputs);
    const type = knownTrapType(askString(inputs, "trap_type"));
    return {
      trapType: type,
      image: askFlag(inputs, "image"),
      concept: proposal.concept.trim(),
    };
  }

  function quote(proposal: AskProposal): AskQuote {
    const read = understand(proposal);
    const priced = quoteTrap({ image: read.image });

    const lines: AskQuoteLine[] = [];
    if (read.trapType) lines.push({ label: "Kind", value: read.trapType, credits: null });
    lines.push(...priced.lines);
    if (!read.image) lines.push({ label: "Picture", value: "None", credits: null });

    let block = blockFor({ total: priced.total, byok: priced.byok, fiveE: true });
    block = block ?? conceptBlock(read.concept, "trap");
    return { lines, total: priced.total, byok: priced.byok, block };
  }

  async function run(proposal: AskProposal): Promise<AskRunResult> {
    // The state may have moved since the DM read the quote: the same gates, again, before anything is spent.
    const current = quote(proposal);
    if (current.block) return failedRun("Trap text", current.block.message);
    const read = understand(proposal);

    let outcome;
    try {
      outcome = await generateAndCreateTrap(read.concept, {
        trap_type: read.trapType ?? undefined,
        // Never the party portrait: that reference needs the likeness notice and a picture the DM picks.
        groupPortraitUrl: null,
        // Explicit either way: left out, the generator paints a picture.
        generateImage: read.image,
      });
    } catch (e) {
      const message = isQuotaExceeded(e)
        ? "You have reached your limit of traps on this plan."
        : e instanceof Error ? e.message : "The trap could not be saved.";
      return failedRun("Trap text", message);
    }
    if (!outcome.id || outcome.name === null) return failedRun("Trap text", outcome.error ?? "Trap generation failed.");

    const parts: AskRunResult["parts"] = [
      { label: "Trap text", ok: true, credits: spent(current.lines.find((l) => l.label === "Trap text")) },
    ];
    if (read.image) {
      const credits = spent(current.lines.find((l) => l.label === "Picture"));
      parts.push(picturePart({ saved: outcome.picture === "saved", credits, noun: "trap" }));
    }
    return { record: { type: "other", id: outcome.id, name: outcome.name }, route: `/traps/${outcome.id}`, parts };
  }

  return { id: "trap", quote, run };
}

export default useTrapAskAdapter;
