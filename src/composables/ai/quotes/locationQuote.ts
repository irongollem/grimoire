/**
 * What one Location Generator run costs (#1253), shared by `LocationGeneratorPanel` and the Ask Grimoire place adapter.
 *
 * Verified against the server: `generate-location` charges `location_generation` for the text only, and the scene and
 * the map sketch are painted through the durable image job (`generate-chronicle-image`), each its own `entity_image`
 * charge at the square 1024x1024 size. Rounded per picture, as the server records each as its own whole-credit line.
 */
import { useQuoteKit, type GeneratorQuote } from "@/composables/ai/quotes/quoteKit";

export interface LocationQuoteOptions {
  image: boolean;
  /** The map sketch: the page has a switch for it, Ask never asks for one. */
  map?: boolean;
}

export function useLocationQuote(): (options: LocationQuoteOptions) => GeneratorQuote {
  const { textLine, artLine, quoteOf } = useQuoteKit();
  return ({ image, map = false }) => {
    const lines = [textLine("Place", "Written by AI", "location_generation")];
    if (image) lines.push(artLine("Picture", "Painted by AI", 1, "entity_image", "1024x1024"));
    if (map) lines.push(artLine("Map sketch", "Drawn by AI", 1, "entity_image", "1024x1024"));
    return quoteOf(lines);
  };
}
