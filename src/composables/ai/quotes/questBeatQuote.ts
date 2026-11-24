/**
 * What filling a quest beat costs (#1253): one text part, `quest_beat_generation`, the reason `generate-entity-text`
 * charges for its `quest_beat` generator. The drawer's fill bar and Ask Grimoire both read the price here.
 */
import { useQuoteKit, type GeneratorQuote } from "@/composables/ai/quotes/quoteKit";

export function useQuestBeatQuote(): () => GeneratorQuote {
  const { textLine, quoteOf } = useQuoteKit();
  return () => quoteOf([textLine("Beat text", "Written by AI", "quest_beat_generation")]);
}
