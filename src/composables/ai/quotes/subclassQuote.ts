/**
 * What one subclass generation costs (#1253): the text call, which the server charges as `custom_subclass_generation`
 * (generate-entity-text's GENERATORS table). Nothing else is billed: the generator makes no picture.
 *
 * The generator's panel and Ask Grimoire both read the price from here, so they cannot disagree.
 */
import { useQuoteKit, type GeneratorQuote } from "@/composables/ai/quotes/quoteKit";

export function useSubclassQuote(): () => GeneratorQuote {
  const { textLine, quoteOf } = useQuoteKit();
  return () => quoteOf([textLine("Archetype text", "Written by AI", "custom_subclass_generation")]);
}
