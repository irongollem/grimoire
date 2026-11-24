/**
 * What painting a scene costs (#1270): one picture on the campaign's image provider, `chronicle_image`, which grows with
 * the shape's output area (landscape is one and a half times square). A note's Square and Landscape and a book's six
 * shapes are all painted at one of three oblongs, so the price is asked by the oblong: `size`.
 */
import { useQuoteKit, type GeneratorQuote } from "@/composables/ai/quotes/quoteKit";
import { useAiCredits } from "@/composables/ai/useAiCredits";
import { useCampaignProviders } from "@/composables/ai/useCampaignProviders";

export function useSceneIllustrationQuote(): (size: string) => GeneratorQuote {
  const { quoteOf } = useQuoteKit();
  const { costOf } = useAiCredits();
  const { imageCredits } = useCampaignProviders();
  return (size) => quoteOf([{ label: "Picture", value: "Painted by AI", credits: imageCredits(costOf("chronicle_image", { size })) }]);
}
