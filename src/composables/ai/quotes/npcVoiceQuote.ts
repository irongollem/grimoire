/** What a set of voice lines costs (#1270): one text part, `npc_voice_generation`, which `generate-npc-voice` charges. */
import { useQuoteKit, type GeneratorQuote } from "@/composables/ai/quotes/quoteKit";
import { useAiCredits } from "@/composables/ai/useAiCredits";
import { useCampaignProviders } from "@/composables/ai/useCampaignProviders";

export function useNpcVoiceQuote(): () => GeneratorQuote {
  const { quoteOf } = useQuoteKit();
  const { costOf } = useAiCredits();
  const { textCredits } = useCampaignProviders();
  return () => quoteOf([{ label: "Lines", value: "Written by AI", credits: textCredits(costOf("npc_voice_generation")) }]);
}
