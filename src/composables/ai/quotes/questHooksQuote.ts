/**
 * What suggesting quest hooks costs (#1253): one text part. `generate-quest` charges `quest_generation` for the five
 * hooks (its `fetchCreditCost`), and building one on the DM's pick is a separate, free step, so only the hooks are
 * priced. The Quest Generator panel and Ask Grimoire both read the price here.
 */
import { useQuoteKit, type GeneratorQuote } from "@/composables/ai/quotes/quoteKit";

export function useQuestHooksQuote(): () => GeneratorQuote {
  const { textLine, quoteOf, textIsByok } = useQuoteKit();
  return () => quoteOf([textLine("Quest hooks", "Written by AI", "quest_generation")], textIsByok.value);
}
