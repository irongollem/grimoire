/*
 * The text a page break is counted in (#1175).
 *
 * The preview and the editor render the same chapter with different chrome:
 * a lens pair's label, an embed's hover toolbar, a node view's strip. All of
 * that is marked `contenteditable="false"`, on both sides, and none of it is
 * the author's text. Counting only the rest gives both sides the same offset
 * for the same character.
 */

/** True when a text node is the chapter's own text, not chrome around it. */
export function isLayoutText(node: Text): boolean {
  return node.parentElement?.closest('[contenteditable="false"]') == null;
}

/** The layout text nodes under `root`, in document order. */
export function layoutTextNodes(root: Node): Text[] {
  const out: Text[] = [];
  const doc = root.ownerDocument ?? (root as Document);
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = n as Text;
    if (text.data.length > 0 && isLayoutText(text)) out.push(text);
  }
  return out;
}

/** How many layout characters `root` holds. */
export function layoutTextLength(root: Node): number {
  return layoutTextNodes(root).reduce((sum, t) => sum + t.data.length, 0);
}

/**
 * The text node and offset holding layout character `offset` of `root`, or
 * null when `root` has fewer characters than that. An offset at a node
 * boundary resolves to the start of the later node, so a break lands at the
 * start of the line it opens.
 */
export function locateLayoutOffset(root: Node, offset: number): { node: Text; offset: number } | null {
  let remaining = offset;
  for (const node of layoutTextNodes(root)) {
    if (remaining < node.data.length) return { node, offset: remaining };
    remaining -= node.data.length;
  }
  return null;
}
