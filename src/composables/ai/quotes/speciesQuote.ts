/**
 * What one species generation costs (#1253): the text call, which the server charges as `species_generation`
 * (generate-entity-text's GENERATORS table), and the picture when asked for, which goes through the durable image
 * job and bills `entity_image` at the 1024x1024 the `species` purpose renders (`PURPOSES` in useImageGeneration).
 *
 * The generator's panel and Ask Grimoire both read the price from here, so they cannot disagree.
 */
import { useQuoteKit, type GeneratorQuote } from "@/composables/ai/quotes/quoteKit";

export interface SpeciesQuoteOptions {
  image: boolean;
}

export function useSpeciesQuote(): (options: SpeciesQuoteOptions) => GeneratorQuote {
  const { textLine, artLine, quoteOf } = useQuoteKit();
  return ({ image }) => {
    const lines = [textLine("Species text", "Written by AI", "species_generation")];
    if (image) lines.push(artLine("Picture", "Painted by AI", 1, "entity_image", "1024x1024"));
    return quoteOf(lines);
  };
}
