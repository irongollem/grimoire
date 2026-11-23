/**
 * What suggesting connections costs (#1253): one text part, the `npc_relationship_suggestion` row that
 * `suggest-connections` charges (its `LEDGER_REASON`). The Connections block and Ask Grimoire both read it here.
 */
import { useQuoteKit, type GeneratorQuote } from "@/composables/ai/quotes/quoteKit";

export function useConnectionSuggestionsQuote(): () => GeneratorQuote {
  const { textLine, quoteOf, textIsByok } = useQuoteKit();
  return () => quoteOf([textLine("Connections", "Written by AI", "npc_relationship_suggestion")], textIsByok.value);
}
