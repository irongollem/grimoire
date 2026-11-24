/**
 * What writing a chronicle costs (#1270): the one text part, `chronicle_text`, which `generate-chronicle-text` charges.
 * Write Chronicle's card and its adapter read the price here; the key is not in `QuoteCostKey` because the quote kit
 * lists the generators it builds lines for, and this one builds its own line.
 */
import { useQuoteKit, type GeneratorQuote } from "@/composables/ai/quotes/quoteKit";
import { useAiCredits } from "@/composables/ai/useAiCredits";
import { useCampaignProviders } from "@/composables/ai/useCampaignProviders";

export function useChronicleQuote(): () => GeneratorQuote {
  const { quoteOf } = useQuoteKit();
  const { costOf } = useAiCredits();
  const { textCredits } = useCampaignProviders();
  return () => quoteOf([{ label: "Chronicle", value: "Written by AI", credits: textCredits(costOf("chronicle_text")) }]);
}
