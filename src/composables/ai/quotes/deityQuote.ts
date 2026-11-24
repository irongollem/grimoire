/**
 * What one deity generation costs (#1253): the text call, which the server charges as `deity_generation`
 * (generate-entity-text's GENERATORS table), and the picture when asked for, which goes through the durable image
 * job and bills `entity_image` at the 1024x1536 the `deity` purpose renders (`PURPOSES` in useImageGeneration).
 *
 * The generator's panel and Ask Grimoire both read the price from here, so they cannot disagree.
 */
import { useQuoteKit, type GeneratorQuote } from "@/composables/ai/quotes/quoteKit";

export interface DeityQuoteOptions {
  image: boolean;
}

export function useDeityQuote(): (options: DeityQuoteOptions) => GeneratorQuote {
  const { textLine, artLine, quoteOf } = useQuoteKit();
  return ({ image }) => {
    const lines = [textLine("Deity text", "Written by AI", "deity_generation")];
    if (image) lines.push(artLine("Picture", "Painted by AI", 1));
    return quoteOf(lines);
  };
}
