/**
 * What one Item Generator run costs (#1253), shared by the generator's card in the Familiar and the Ask Grimoire item adapter so the
 * page and the quote cannot disagree.
 *
 * Verified against the server: `generate-entity-text` charges `item_generation` for the text, and the picture goes
 * through the durable image job (`generate-chronicle-image`, purpose `item`), which bills `entity_image` at the
 * purpose's size, 1024x1536 (`PURPOSES` in useImageGeneration).
 */
import { useQuoteKit, type GeneratorQuote } from "@/composables/ai/quotes/quoteKit";

export interface ItemQuoteOptions {
  image: boolean;
}

export function useItemQuote(): (options: ItemQuoteOptions) => GeneratorQuote {
  const { textLine, artLine, quoteOf } = useQuoteKit();
  return ({ image }) => {
    const lines = [textLine("Item", "Written by AI", "item_generation")];
    if (image) lines.push(artLine("Picture", "Painted by AI", 1, "entity_image", "1024x1536"));
    return quoteOf(lines);
  };
}
