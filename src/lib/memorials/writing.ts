import { tiptapToPlainText } from "@/lib/tiptap/tiptapText";

/**
 * The account and the last words are written in `RichTextEditor`, which stores a Tiptap
 * document as JSON. A cleared editor still leaves a document (an empty paragraph), so
 * "written" means the document holds text, and an unwritten one is stored as null so the
 * card's invitation to write it comes back.
 */
export function writtenOrNull(value: string | null | undefined): string | null {
  return value !== null && value !== undefined && tiptapToPlainText(value).trim() !== "" ? value : null;
}
