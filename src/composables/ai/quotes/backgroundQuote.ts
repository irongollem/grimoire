/**
 * What one background generation costs (#1253): the text call, which the server charges as `background_generation`
 * (generate-entity-text's GENERATORS table). Nothing else is billed: the generator makes no picture.
 *
 * The generator's panel and Ask Grimoire both read the price from here, so they cannot disagree.
 */
import { useQuoteKit, type GeneratorQuote } from "@/composables/ai/quotes/quoteKit";

export function useBackgroundQuote(): () => GeneratorQuote {
  const { textLine, quoteOf, textIsByok } = useQuoteKit();
  return () => quoteOf([textLine("Background text", "Written by AI", "background_generation")], textIsByok.value);
}
