/**
 * Ask Grimoire (#1253): suggested canon, as a quote and a run that ends in the Canon page's own review.
 *
 * Which helper runs is decided from the DM's description, not asked of the model (the contract has no mode): the lore
 * helper when the description says "lore", the truths helper otherwise. Premise, clues, questions and forces each need
 * something the page already holds (a pitch, a secret) or are small steers on their own part, and stay on the page.
 *
 * The suggestions are `useCanonSuggestions`' module state, keyed by mode (and `lore:new` for a lore draft, the key
 * the Lore part's own helper reads), so the Canon page shows them the moment it mounts: "Review suggestions" only has
 * to take the DM to the part, with `?section=`. Nothing is written until the DM accepts one there.
 */
import type { AskProposal } from "@edge-shared/agent/askContract";
import type { AskAdapter, AskQuote, AskQuoteLine, AskRunResult } from "@/lib/ask/askAdapter";
import { conceptBlock, failedRun } from "@/ai/ask/adapters/askAdapterKit";
import { useAskGate } from "@/ai/ask/useAskGate";
import { countWord } from "@/ai/ask/adapters/suggestionCount";
import { isAnyAiGenerating } from "@/ai/aiGeneratorRegistry";
import { useCanonSuggestions } from "@/ai/useCanonSuggestions";
import { useCampaignStore } from "@/stores/campaign";
import { useCanonSuggestionsQuote } from "@/composables/ai/quotes/canonSuggestionsQuote";

/** A lore draft's title is the first line of what the DM said, cut to a title's length. */
const LORE_TITLE_LIMIT = 80;

/** Truths by default; lore when the DM asked for lore. */
export function canonModeFor(concept: string): "truths" | "lore" {
  return /\blore\b/i.test(concept) ? "lore" : "truths";
}

export function loreTitleFrom(concept: string): string {
  const firstLine = concept.trim().split("\n")[0]?.trim() ?? "";
  return firstLine.slice(0, LORE_TITLE_LIMIT).trim();
}

export function useCanonSuggestionsAskAdapter(): AskAdapter {
  const campaign = useCampaignStore();
  const quoteFor = useCanonSuggestionsQuote();
  const { blockFor } = useAskGate(null, "canon suggestion");
  const truths = useCanonSuggestions("truths");
  // The key the Lore part's own helper reads for a new entry (`CanonSuggestions` mode lore, no entry).
  const lore = useCanonSuggestions("lore", "new");

  function quote(proposal: AskProposal): AskQuote {
    const concept = proposal.concept.trim();
    const mode = canonModeFor(concept);
    const priced = quoteFor(mode);

    const lines: AskQuoteLine[] = [
      { label: "Part of the canon", value: mode === "lore" ? "Lore" : "Truths", credits: null },
      { label: "Campaign", value: campaign.activeCampaign?.name ?? "This campaign", credits: null },
      ...priced.lines,
    ];

    let block = blockFor({ total: priced.total, byok: priced.byok });
    block = block ?? conceptBlock(concept, "canon", { empty: "Say what the canon should be about first." });
    return { lines, total: priced.total, byok: priced.byok, block };
  }

  async function run(proposal: AskProposal): Promise<AskRunResult> {
    // The state may have moved since the DM read the quote: the same gates, again, before anything is spent.
    const current = quote(proposal);
    if (current.block) return failedRun("Canon suggestions", current.block.message);
    if (isAnyAiGenerating.value) return failedRun("Canon suggestions", "Another generation is already in progress.");
    const concept = proposal.concept.trim();
    const mode = canonModeFor(concept);

    try {
      if (mode === "lore") {
        const ok = await lore.suggest(concept, { title: loreTitleFrom(concept) });
        if (!ok) return failedRun("Canon suggestions", lore.error.value ?? "The suggestions could not be written.");
      } else {
        const ok = await truths.suggest(concept);
        if (!ok) return failedRun("Canon suggestions", truths.error.value ?? "The suggestions could not be written.");
      }
    } catch (e) {
      return failedRun("Canon suggestions", e instanceof Error ? e.message : "The suggestions could not be written.");
    }

    const made = mode === "lore" ? lore.suggestions.value.length : truths.suggestions.value.length;
    // A run whose every suggestion was set aside is not charged (the server holds and releases the credits).
    if (made === 0) return failedRun("Canon suggestions", "Every suggestion was set aside, so nothing was charged. Try a different steer.");
    const noun = mode === "lore" ? "lore" : "truth";
    const label = `${countWord(made)} ${noun} ${made === 1 ? "suggestion is" : "suggestions are"} ready.`;
    return {
      record: null,
      route: `/canon?section=${mode}`,
      parts: [{ label, ok: true, credits: current.total === null ? 0 : current.total }],
    };
  }

  return { id: "canon_suggestions", quote, run };
}

export default useCanonSuggestionsAskAdapter;
