/**
 * What one run of the roll table generator costs (#1253), read by its panel and by Ask Grimoire so the two cannot disagree.
 *
 * The server charges `roll_table_generation` for the text and nothing else: there is no picture step.
 */
import { useQuoteKit, type GeneratorQuote } from "@/composables/ai/quotes/quoteKit";

export function useRollTableQuote(): () => GeneratorQuote {
  const { textLine, quoteOf, textIsByok } = useQuoteKit();
  return () => quoteOf([textLine("Roll table", "Written by AI", "roll_table_generation")], textIsByok.value);
}
