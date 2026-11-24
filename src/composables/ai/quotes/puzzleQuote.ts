/**
 * What one run of the puzzle generator costs (#1253), read by its panel and by Ask Grimoire so the two cannot disagree.
 *
 * The server charges `puzzle_generation` for the text, and the picture is its own `entity_image` charge at 1024x1536 (the durable
 * image job's `puzzle` purpose), counted only when asked for.
 */
import { useQuoteKit, type GeneratorQuote } from "@/composables/ai/quotes/quoteKit";

export interface PuzzleQuoteOptions {
  image: boolean;
}

export function usePuzzleQuote(): (options: PuzzleQuoteOptions) => GeneratorQuote {
  const { textLine, artLine, quoteOf } = useQuoteKit();
  return ({ image }) => {
    const lines = [textLine("Puzzle text", "Written by AI", "puzzle_generation")];
    if (image) lines.push(artLine("Picture", "Painted by AI", 1));
    return quoteOf(lines);
  };
}
