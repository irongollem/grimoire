/**
 * Extract plain text from a Tiptap/ProseMirror document that is stored as a JSON
 * string in the DB. Used where a rich renderer can't run — notably the
 * html2canvas character-sheet PDF, where mounting a Tiptap viewer is unreliable
 * and an unparsed JSON string would otherwise be printed verbatim.
 *
 * Legacy plain-text values (anything that isn't valid Tiptap JSON) are returned
 * as-is, so pre-migration data and starter-recipe seeds keep rendering.
 */
export function tiptapToPlainText(value: string | null | undefined): string {
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
  walk(doc, out);
  return out.join("").replace(/\n{2,}/g, "\n").trim();
}

function walk(node: unknown, out: string[]): void {
  if (!node || typeof node !== "object") return;
  const n = node as { type?: string; text?: string; content?: unknown[] };

  if (n.type === "hardBreak") {
    out.push("\n");
    return;
  }
  if (typeof n.text === "string") out.push(n.text);
  if (Array.isArray(n.content)) n.content.forEach((c) => walk(c, out));

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
