/**
 * What one run of the loot table generator costs (#1253), read by its panel and by Ask Grimoire so the two cannot disagree.
 *
 * The server charges `loot_generation` for the text and nothing else: there is no picture step.
 */
import { useQuoteKit, type GeneratorQuote } from "@/composables/ai/quotes/quoteKit";

export function useLootTableQuote(): () => GeneratorQuote {
  const { textLine, quoteOf, textIsByok } = useQuoteKit();
  return () => quoteOf([textLine("Loot table", "Written by AI", "loot_generation")], textIsByok.value);
}
