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

/**
 * A copy of a stored Tiptap document (object, or its JSON string) with a fresh
 * id on every secret block. Cloning an entity must call this: a copied block
 * keeps the original's id otherwise, and an NPC memory that disclosed the
 * original's secret would then read as disclosing the clone's too. Anything
 * that is not a document holding a secret block comes back untouched (same
 * reference), so it is safe to run over every rich-text field of a row.
 */
export function reMintSecretIds<T>(value: T): T {
  if (typeof value === "string") {
    if (!value.includes("secretBlock")) return value;
    try {
      const parsed: unknown = JSON.parse(value);
      return JSON.stringify(reMintSecretIds(parsed)) as T;
    } catch {
      return value;
    }
  }
  if (typeof value !== "object" || value === null) return value;
  if (secretIdsIn(value).length === 0) return value;
  const walk = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(walk);
    if (typeof node !== "object" || node === null) return node;
    const copy: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(node)) copy[key] = walk(child);
    const attrs = copy.attrs;
    if (copy.type === "secretBlock" && typeof attrs === "object" && attrs !== null) {
      const id = (attrs as { secretId?: unknown }).secretId;
      if (typeof id === "string" && id !== "") copy.attrs = { ...attrs, secretId: crypto.randomUUID() };
    }
    return copy;
  };
  return walk(value) as T;
}
