import type { Editor } from "@tiptap/core";

/**
 * Whether Enhance has prose to rewrite. A selected picture, cover or linked
 * entry is a whole node with no prose in it: offering Enhance there put the
 * bubble over the page for nothing.
 */
export function hasTextToEnhance({ editor, from, to }: { editor: Editor; from: number; to: number }): boolean {
  if (!editor.isEditable || from === to) return false;
  return editor.state.doc.textBetween(from, to, " ").trim() !== "";
}
