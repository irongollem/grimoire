/**
 * What one Faction Generator run costs (#1253), shared by the generator's card in the Familiar and the Ask Grimoire faction adapter.
 *
 * Verified against the server: `generate-entity-text` charges `faction_generation` for the text; the emblem goes
 * through the durable image job (purpose `faction`), which bills `entity_image` at the purpose's square 1024x1024.
 * The leader and headquarters ties are plain database writes and cost nothing.
 */
import { useQuoteKit, type GeneratorQuote } from "@/composables/ai/quotes/quoteKit";

export interface FactionQuoteOptions {
  image: boolean;
}

export function useFactionQuote(): (options: FactionQuoteOptions) => GeneratorQuote {
  const { textLine, artLine, quoteOf } = useQuoteKit();
  return ({ image }) => {
    const lines = [textLine("Faction", "Written by AI", "faction_generation")];
    if (image) lines.push(artLine("Emblem", "Painted by AI", 1, "entity_image", "1024x1024"));
    return quoteOf(lines);
  };
}
