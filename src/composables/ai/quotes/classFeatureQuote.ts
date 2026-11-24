/**
 * What one class feature generation costs (#1253): the text call, which the server charges as `class_feature_generation`
 * (generate-entity-text's GENERATORS table). Nothing else is billed: the generator makes no picture.
 *
 * The generator's panel and Ask Grimoire both read the price from here, so they cannot disagree.
 */
import { useQuoteKit, type GeneratorQuote } from "@/composables/ai/quotes/quoteKit";

export function useClassFeatureQuote(): () => GeneratorQuote {
  const { textLine, quoteOf } = useQuoteKit();
  return () => quoteOf([textLine("Ability text", "Written by AI", "class_feature_generation")]);
}
