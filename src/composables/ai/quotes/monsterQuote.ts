/**
 * What one Monster Generator run costs (#1253), shared by the generator's card in the Familiar and the Ask Grimoire monster adapter.
 *
 * Verified against the server: the stat block is `monster_stat_block`, and the picture goes through the durable image
 * job, which bills `entity_image` at the tall size (generate-chronicle-image, `PURPOSE_CONFIG`).
 */
import { useQuoteKit, type GeneratorQuote } from "@/composables/ai/quotes/quoteKit";

export interface MonsterQuoteOptions {
  image: boolean;
}

export function useMonsterQuote(): (options: MonsterQuoteOptions) => GeneratorQuote {
  const { textLine, artLine, quoteOf } = useQuoteKit();
  return ({ image }) => {
    const lines = [textLine("Stat block", "Written by AI", "monster_stat_block")];
    if (image) lines.push(artLine("Picture", "Painted by AI", 1));
    return quoteOf(lines);
  };
}
