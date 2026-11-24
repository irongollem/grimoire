/**
 * What one Spell Generator run costs (#1253), shared by `SpellGeneratorPanel` and the Ask Grimoire spell adapter.
 *
 * Verified against the server: `generate-entity-text` charges `spell_generation` for the text; the picture goes through
 * the durable image job (purpose `spell`), which bills `entity_image` at the purpose's square 1024x1024 size, not the
 * tall size NPC and monster portraits use.
 */
import { useQuoteKit, type GeneratorQuote } from "@/composables/ai/quotes/quoteKit";

export interface SpellQuoteOptions {
  image: boolean;
}

export function useSpellQuote(): (options: SpellQuoteOptions) => GeneratorQuote {
  const { textLine, artLine, quoteOf } = useQuoteKit();
  return ({ image }) => {
    const lines = [textLine("Spell", "Written by AI", "spell_generation")];
    if (image) lines.push(artLine("Picture", "Painted by AI", 1, "entity_image", "1024x1024"));
    return quoteOf(lines);
  };
}
