/*
 * "Across both columns" for the block the panel is about (#1176 frame 13).
 *
 * A block spans the columns by sitting inside the wide block, so the choice is
 * wrapping it in one or taking it out of one; nothing else about the block
 * changes. The wide block itself is "across" by being one.
 */
import type { Editor } from "@tiptap/core";
import type { Node as ProseNode } from "@tiptap/pm/model";

/** The position of the wide block that is, or holds, the block at `pos`; null when it is in one column. */
export function wideAround(doc: ProseNode, pos: number): number | null {
  const node = doc.nodeAt(pos);
  if (!node) return null;
  if (node.type.name === "wideBlock") return pos;
  const $pos = doc.resolve(pos);
  for (let depth = $pos.depth; depth > 0; depth--) {
    if ($pos.node(depth).type.name === "wideBlock") return $pos.before(depth);
  }
  return null;
}

/** Wraps the block at `pos` in a wide block, or takes it (and what shares its wide block) out of one. */
export function setAcross(ed: Editor, pos: number, on: boolean): boolean {
  if (ed.isDestroyed) return false;
  const wide = wideAround(ed.state.doc, pos);
  if (on) {
    if (wide !== null) return true;
    return ed.chain().setNodeSelection(pos).wrapIn("wideBlock").run();
  }
  if (wide === null) return true;
  const node = ed.state.doc.nodeAt(wide);
  if (!node) return false;
  ed.view.dispatch(ed.state.tr.replaceWith(wide, wide + node.nodeSize, node.content));
  return true;
}
