/**
 * What one run of the dungeon feature generator costs (#1253), read by its panel and by Ask Grimoire so the two cannot disagree.
 *
 * The server charges `feature_generation` for the text, and the picture is its own `entity_image` charge at 1024x1536 (the durable
 * image job's `dungeon_feature` purpose), counted only when asked for.
 */
import { useQuoteKit, type GeneratorQuote } from "@/composables/ai/quotes/quoteKit";

export interface DungeonFeatureQuoteOptions {
  image: boolean;
}

export function useDungeonFeatureQuote(): (options: DungeonFeatureQuoteOptions) => GeneratorQuote {
  const { textLine, artLine, quoteOf } = useQuoteKit();
  return ({ image }) => {
    const lines = [textLine("Feature text", "Written by AI", "feature_generation")];
    if (image) lines.push(artLine("Picture", "Painted by AI", 1));
    return quoteOf(lines);
  };
}
