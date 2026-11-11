/*
 * Writing a node's attrs by position (#1176).
 *
 * The panel edits the node the selection names, not whatever the cursor is in
 * by the time a field is touched, and it must not take the focus off the field
 * being typed in. One transaction per call, so one undo step per change.
 */
import type { Editor } from "@tiptap/core";

export function updateNodeAttrs(ed: Editor, pos: number, patch: Readonly<Record<string, unknown>>): boolean {
  if (ed.isDestroyed) return false;
  const node = ed.state.doc.nodeAt(pos);
  if (!node) return false;
  ed.view.dispatch(ed.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...patch }));
  return true;
}

export function removeNodeAt(ed: Editor, pos: number): boolean {
  if (ed.isDestroyed) return false;
  const node = ed.state.doc.nodeAt(pos);
  if (!node) return false;
  ed.view.dispatch(ed.state.tr.delete(pos, pos + node.nodeSize));
  return true;
}
