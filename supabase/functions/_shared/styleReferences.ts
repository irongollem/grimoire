/**
 * Style references (#1252): the campaign's Look entry can hold up to four pictures, and every AI picture painted
 * from the look hands them to the image model beside the written look. They are references for HOW to paint,
 * never for WHAT to paint, and this sentence is the one place that says so, for the server and the browser alike.
 *
 * Pure (no Deno-only imports) so the browser imports it as `@edge-shared/styleReferences.ts`.
 */

/** The most style pictures a call carries; the Look entry holds no more, and every one is billed as image input. */
export const STYLE_REFERENCE_LIMIT = 4;

/** The first `STYLE_REFERENCE_LIMIT` of whatever a caller holds (urls or blobs). */
export function capStyleReferences<T>(items: readonly T[]): T[] {
  return items.slice(0, STYLE_REFERENCE_LIMIT);
}

/** The prompt sentence naming the last `count` images as style references only. Empty when there are none. */
export function styleReferenceSentence(count: number): string {
  if (count <= 0) return "";
  const which = count === 1 ? "The last image is a style reference" : `The last ${count} images are style references`;
  return `${which} only: match their medium, brushwork, palette, light and finish, and never copy their subjects, people, places or composition.`;
}

/** `prompt` with the style sentence appended when there are references, otherwise `prompt` untouched. */
export function withStyleReferenceSentence(prompt: string, count: number): string {
  const sentence = styleReferenceSentence(count);
  return sentence ? `${prompt}\n\n${sentence}` : prompt;
}
