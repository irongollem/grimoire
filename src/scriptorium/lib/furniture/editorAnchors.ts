/*
 * Reading an anchor block's place from the chapter editor (#1176 story 3).
 * The one DOM-touching helper the editor layer and Place on page share, so a
 * picture is drawn and written against the same measure.
 */
import type { Editor } from "@tiptap/core";
import { offsetWithin } from "@/scriptorium/tiptap/pageFlow";

/** Doc position of each top-level block, by its stable id. */
export function blockPositions(ed: Editor): Map<string, number> {
  const byId = new Map<string, number>();
  ed.state.doc.descendants((node, pos) => {
    const id: unknown = node.attrs.blockId;
    if (typeof id === "string" && !byId.has(id)) byId.set(id, pos);
  });
  return byId;
}

/** Unscaled px from the editor root's top to the block's top, or null when it is not drawn. */
export function blockTopPx(ed: Editor, pos: number): number | null {
  const dom = ed.view.nodeDOM(pos);
  return dom instanceof HTMLElement ? offsetWithin(dom, ed.view.dom as HTMLElement).top : null;
}
