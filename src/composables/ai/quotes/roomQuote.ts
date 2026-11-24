/**
 * What filling a site's room costs (#1253): one text part, `room_generation`, the reason `generate-entity-text`
 * charges for its `room` generator. The room list's "Roll it with AI" and Ask Grimoire both read the price here.
 */
import { useQuoteKit, type GeneratorQuote } from "@/composables/ai/quotes/quoteKit";

export function useRoomQuote(): () => GeneratorQuote {
  const { textLine, quoteOf } = useQuoteKit();
  return () => quoteOf([textLine("Room text", "Written by AI", "room_generation")]);
}
