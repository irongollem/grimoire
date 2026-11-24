/**
 * What a canon helper costs (#1253): one text part, on the row `suggest-canon` charges for the mode it runs (its
 * `MODES[mode].ledger`). The Canon page's helpers and Ask Grimoire both read the price here, so a mode added on the
 * server is added once on the client too.
 */
import { useQuoteKit, type GeneratorQuote, type QuoteCostKey } from "@/composables/ai/quotes/quoteKit";
import type { CanonSuggestionMode } from "@/ai/useCanonSuggestions";

const LEDGER: Record<CanonSuggestionMode, QuoteCostKey> = {
  premise: "canon_premise_suggestion",
  truths: "canon_truth_suggestion",
  clues: "canon_clue_suggestion",
  questions: "canon_question_suggestion",
  forces: "canon_force_suggestion",
  lore: "canon_lore_suggestion",
  secrets: "canon_secret_suggestion",
  read: "canon_read_through",
};

export function useCanonSuggestionsQuote(): (mode: CanonSuggestionMode) => GeneratorQuote {
  const { textLine, quoteOf } = useQuoteKit();
  return (mode) => quoteOf([textLine("Suggestions", "Written by AI", LEDGER[mode])]);
}
