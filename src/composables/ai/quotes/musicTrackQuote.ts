/**
 * What composing a soundboard track costs (#1253): the flat `music_track` row times Gemini's audio multiplier, which
 * is what `generate-music` charges (`fetchCreditCost` times `audio_multiplier`, rounded up as one whole-credit line).
 * `SoundForm`'s Generate tab and Ask Grimoire both read the price here. The audio is always Gemini's.
 */
import { useQuoteKit, type GeneratorQuote } from "@/composables/ai/quotes/quoteKit";
import { useAiCredits } from "@/composables/ai/useAiCredits";
import { useProviderConfig } from "@/composables/ai/useProviderConfig";
import { wholeCredits } from "@edge-shared/credit-math.ts";
import { MUSIC_GENERATION_TYPE } from "@/lib/audio/aiMusic";

export function useMusicTrackQuote(): () => GeneratorQuote {
  const { quoteOf } = useQuoteKit();
  const { costOf } = useAiCredits();
  const { audioMultiplierFor } = useProviderConfig();

  return () => {
    const credits = wholeCredits(costOf(MUSIC_GENERATION_TYPE) * audioMultiplierFor("gemini"));
    return quoteOf([{ label: "Track", value: "Composed by AI", credits }]);
  };
}
