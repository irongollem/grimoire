import type { Editor } from "@tiptap/core";

/**
 * Whether the book is in two columns, read from the page the editor sits on
 * (the chapter editor puts `sc-sheet--column-strip` on it). A tiptap extension
 * cannot be handed the book's settings, and this is the same fact the page
 * draws its column strip from.
 */
export function isTwoColumnPage(editor: Editor): boolean {
  return editor.view.dom.closest(".sc-sheet--column-strip") !== null;
}
