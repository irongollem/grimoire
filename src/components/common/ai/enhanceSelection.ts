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

/** The Enhance button's words: its price on it, as every generator's button says its own; bare until the price is known. */
export function enhanceLabel(cost: number | null): string {
  return cost === null ? "Enhance" : `Enhance \u00b7 ${cost} credit${cost === 1 ? "" : "s"}`;
}
