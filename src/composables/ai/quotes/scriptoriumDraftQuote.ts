/**
 * What drafting a Scriptorium document costs (#1253): one text part, the `scriptorium_draft` row that
 * `draft-scriptorium-document` charges (its `REASON`). The dialog and Ask Grimoire both read the price here.
 */
import { useQuoteKit, type GeneratorQuote } from "@/composables/ai/quotes/quoteKit";

export function useScriptoriumDraftQuote(): () => GeneratorQuote {
  const { textLine, quoteOf, textIsByok } = useQuoteKit();
  return () => quoteOf([textLine("Draft", "Written by AI", "scriptorium_draft")], textIsByok.value);
}
