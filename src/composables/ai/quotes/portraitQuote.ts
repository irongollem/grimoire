/**
 * What painting a portrait for an existing record costs (#1253): one picture on the durable image job, billed
 * `entity_image` at the portrait size (generate-chronicle-image, `PURPOSE_CONFIG`), which is what
 * `useMissingPortrait(kind).cost` shows on the Mint and Card Forge's "Paint portrait" button. Every kind (NPC, party
 * member, monster, item, spell) paints at the same price, so there is one quote.
 */
import { useQuoteKit, type GeneratorQuote } from "@/composables/ai/quotes/quoteKit";

export interface PortraitQuoteOptions {
  /** The record already has a picture: the new one replaces it, and the quote says so. */
  replaces: boolean;
}

export function usePortraitQuote(): (options: PortraitQuoteOptions) => GeneratorQuote {
  const { artLine, quoteOf } = useQuoteKit();
  return ({ replaces }) =>
    quoteOf([artLine("Portrait", replaces ? "Replaces the current portrait" : "Painted by AI", 1)]);
}
