/**
 * What one NPC Generator run costs (#1253), read by the Ask Grimoire NPC adapter.
 *
 * Verified against the server: the NPC text is `generate-npc`'s `npc_text`, and every picture goes through the durable
 * image job, which bills `entity_image` (generate-chronicle-image, `PURPOSE_CONFIG`). generate-npc paints nothing.
 */
import { useQuoteKit, type GeneratorQuote } from "@/composables/ai/quotes/quoteKit";

export interface NpcQuoteOptions {
  portrait: boolean;
  alterEgo: boolean;
}

export function useNpcQuote(): (options: NpcQuoteOptions) => GeneratorQuote {
  const { textLine, artLine, quoteOf } = useQuoteKit();
  return ({ portrait, alterEgo }) => {
    const lines = [textLine("NPC text", "Written by AI", "npc_text")];
    if (portrait) {
      const count = alterEgo ? 2 : 1;
      lines.push(artLine("Portrait", count === 2 ? "Painted by AI, with the alter ego" : "Painted by AI", count));
    }
    return quoteOf(lines);
  };
}
