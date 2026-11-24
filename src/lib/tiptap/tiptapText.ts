/**
 * Extract plain text from a Tiptap/ProseMirror document that is stored as a JSON
 * string in the DB. Used where a rich renderer can't run — notably the
 * html2canvas character-sheet PDF, where mounting a Tiptap viewer is unreliable
 * and an unparsed JSON string would otherwise be printed verbatim.
 *
 * A `secretBlock` (DM-only passage, #932) is walked like any other block: this
 * runs on the DM's own copy (previews, search), and players never receive the
 * node because the server strips it from their projections.
 *
 * An `entityMention` stores no name (#932: a stored name leaked a disguised NPC's true one), so it reads as
 * nothing unless the caller passes `nameOf`, which says what the mention is called for whoever is reading. The
 * AI paths run for the DM or the server and pass the true names (`mentionNames.ts`).
 *
 * Legacy plain-text values (anything that isn't valid Tiptap JSON) are returned
 * as-is, so pre-migration data and starter-recipe seeds keep rendering.
 */
/** What a mention is called for this reader; null when it has no name to give (the mention then reads as nothing). */
export type MentionNameOf = (entityType: string, id: string) => string | null;

export function tiptapToPlainText(value: string | null | undefined, nameOf?: MentionNameOf): string {
  if (!value) return "";

  let doc: unknown;
  try {
    doc = JSON.parse(value);
  } catch {
    // Not JSON — legacy plain text.
    return value;
  }
  // Parsed to a primitive (e.g. a bare number/string) — treat as plain text.
  if (!doc || typeof doc !== "object") return value;

  const out: string[] = [];
  walk(doc, out, nameOf);
  return out.join("").replace(/\n{2,}/g, "\n").trim();
}

function walk(node: unknown, out: string[], nameOf: MentionNameOf | undefined): void {
  if (!node || typeof node !== "object") return;
  const n = node as { type?: string; text?: string; content?: unknown[]; attrs?: { id?: unknown; entityType?: unknown } };

  if (n.type === "entityMention") {
    const { id, entityType } = n.attrs ?? {};
    const name = nameOf && typeof id === "string" && typeof entityType === "string" ? nameOf(entityType, id) : null;
    if (name) out.push(name);
    return;
  }

  if (n.type === "hardBreak") {
    out.push("\n");
    return;
  }
  if (typeof n.text === "string") out.push(n.text);
  if (Array.isArray(n.content)) n.content.forEach((c) => walk(c, out, nameOf));

  // Block-level nodes end with a newline so paragraphs/list items don't run
  // together when flattened.
  if (
    n.type === "paragraph" ||
    n.type === "heading" ||
    n.type === "listItem" ||
    (typeof n.type === "string" && n.type.endsWith("List"))
  ) {
    out.push("\n");
  }
}

/**
 * The mentions a stored document holds, each once, in reading order. `skipSecrets` leaves out those inside a
 * `secretBlock`, for a caller that only reads what an AI may be told. A value that is not a Tiptap document holds none.
 */
export function collectMentions(value: string | null | undefined, options: { skipSecrets?: boolean } = {}): { entityType: string; id: string }[] {
  if (!value) return [];
  let doc: unknown;
  try {
    doc = JSON.parse(value);
  } catch {
    return [];
  }
  const found = new Map<string, { entityType: string; id: string }>();
  const visit = (node: unknown): void => {
    if (!node || typeof node !== "object") return;
    const n = node as { type?: string; content?: unknown[]; attrs?: { id?: unknown; entityType?: unknown } };
    if (n.type === "secretBlock" && options.skipSecrets) return;
    if (n.type === "entityMention") {
      const { id, entityType } = n.attrs ?? {};
      if (typeof id === "string" && typeof entityType === "string") found.set(`${entityType}|${id}`, { entityType, id });
      return;
    }
    if (Array.isArray(n.content)) n.content.forEach(visit);
  };
  visit(doc);
  return [...found.values()];
}
