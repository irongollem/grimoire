/*
 * Asks the page flow to measure the sheet again (#1176).
 *
 * The flow sizes the gap before each page from how full the page above it is,
 * and measures when the editor updates. A node view that changes its own height
 * with no edit (the contents page when a layout lands, an entry when the
 * printer's fit arrives) changes how full its page is, so it asks: an empty
 * transaction, which reaches the plugin's view and nothing else.
 */
import type { Editor } from "@tiptap/core";

export function remeasurePages(editor: Editor): void {
  requestAnimationFrame(() => {
    if (editor.isDestroyed) return;
    editor.view.dispatch(editor.state.tr.setMeta("addToHistory", false));
  });
}
