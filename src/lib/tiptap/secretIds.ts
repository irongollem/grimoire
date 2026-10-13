/**
 * Ids of the `secretBlock` nodes in a stored Tiptap document, in document
 * order. A block saved before blocks carried ids has none and is skipped, so
 * an empty result means "nothing here could have been disclosed".
 */
export function secretIdsIn(doc: unknown): string[] {
  const ids: string[] = [];
  const walk = (node: unknown): void => {
    if (typeof node !== "object" || node === null) return;
    const { type, attrs, content } = node as { type?: unknown; attrs?: unknown; content?: unknown };
    if (type === "secretBlock" && typeof attrs === "object" && attrs !== null) {
      const id = (attrs as { secretId?: unknown }).secretId;
      if (typeof id === "string" && id !== "") ids.push(id);
    }
    if (Array.isArray(content)) for (const child of content) walk(child);
  };
  walk(doc);
  return ids;
}
