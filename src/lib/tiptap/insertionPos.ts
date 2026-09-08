import type { Editor } from "@tiptap/core";

/**
 * Where an "insert at the cursor" command should actually land.
 *
 * Two corrections on the raw selection:
 *
 * - **The untouched editor.** ProseMirror's selection starts at the top of the
 *   document and stays there until something moves it, so an editor nobody has
 *   clicked into reports position 1 — indistinguishable from "the cursor is
 *   deliberately at the top". Every insert-at-cursor command therefore dropped
 *   its content *above* the DM's own notes whenever they reached for a toolbar
 *   button without clicking into the prose first, which is the ordinary way to
 *   use a toolbar. Until a cursor has been placed, insertions append instead.
 *
 * - **Nesting an `aiGenerated` wrapper.** Inserting a chronicle while the
 *   cursor sits inside a previous one puts the second inside the first, so the
 *   provenance markers nest and the two recaps read as one block. The insert
 *   moves to just after the enclosing wrapper.
 */
export function insertionPos(editor: Editor, cursorPlaced: boolean): number {
  const { doc, selection } = editor.state;
  if (!cursorPlaced) return doc.content.size;
  const $pos = doc.resolve(selection.to);
  for (let depth = $pos.depth; depth > 0; depth--) {
    if ($pos.node(depth).type.name === "aiGenerated") return $pos.after(depth);
  }
  return $pos.pos;
}
