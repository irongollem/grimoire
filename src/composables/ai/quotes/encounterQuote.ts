/**
 * What one run of the encounter generator costs (#1253), read by its panel and by Ask Grimoire so the two cannot disagree.
 *
 * The server charges `encounter_generation` for the text and nothing else: there is no picture step.
 */
import { useQuoteKit, type GeneratorQuote } from "@/composables/ai/quotes/quoteKit";

export function useEncounterQuote(): () => GeneratorQuote {
  const { textLine, quoteOf, textIsByok } = useQuoteKit();
  return () => quoteOf([textLine("Encounter", "Written by AI", "encounter_generation")], textIsByok.value);
}
