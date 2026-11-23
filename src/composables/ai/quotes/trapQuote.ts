/**
 * What one run of the trap generator costs (#1253), read by its panel and by Ask Grimoire so the two cannot disagree.
 *
 * The server charges `trap_generation` for the text, and the picture is its own `entity_image` charge at 1024x1536 (the durable
 * image job's `trap` purpose), counted only when asked for.
 */
import { useQuoteKit, type GeneratorQuote } from "@/composables/ai/quotes/quoteKit";

export interface TrapQuoteOptions {
  image: boolean;
}

export function useTrapQuote(): (options: TrapQuoteOptions) => GeneratorQuote {
  const { textLine, artLine, quoteOf, textIsByok, imageIsByok } = useQuoteKit();
  return ({ image }) => {
    const lines = [textLine("Trap text", "Written by AI", "trap_generation")];
    if (image) lines.push(artLine("Picture", "Painted by AI", 1));
    return quoteOf(lines, textIsByok.value && (!image || imageIsByok.value));
  };
}
