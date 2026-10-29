import { tiptapToPlainText } from "@/lib/tiptap/tiptapText";

/**
 * Whether a rich-text column (a beat's rumour or reveal copy) holds any words.
 * An emptied editor leaves a doc with one blank paragraph, which is truthy as a
 * string but is not copy; the server reads the column the same way
 * (`get_quest_board`'s `has_*_text`).
 */
export function hasBeatText(value: string | null | undefined): boolean {
  return tiptapToPlainText(value).trim() !== "";
}

/** The first of these rich-text values that holds words, else null. A blank doc is skipped, not returned. */
export function firstBeatText(...values: Array<string | null | undefined>): string | null {
  for (const value of values) if (value && hasBeatText(value)) return value;
  return null;
}
