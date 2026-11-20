/**
 * Append one Tiptap document to another (a note's text moved into a character's backstory, or into the DM's own
 * note on a character). Returns null when either side is not a Tiptap document (legacy HTML or plain text): the
 * caller must refuse rather than overwrite text it cannot read. Nothing is appended for a blank `extra`.
 */
function parseDoc(content: string | null): { type: "doc"; content: unknown[] } | null | "blank" {
  if (content === null || content.trim() === "") return "blank";
  try {
    const doc: unknown = JSON.parse(content);
    if (typeof doc !== "object" || doc === null || (doc as { type?: unknown }).type !== "doc") return null;
    const body = (doc as { content?: unknown }).content;
    return { ...(doc as object), type: "doc", content: Array.isArray(body) ? body : [] };
  } catch {
    return null;
  }
}

export function appendTiptapDoc(base: string | null, extra: string | null): string | null {
  const add = parseDoc(extra);
  if (add === null) return null;
  const into = parseDoc(base);
  if (into === null) return null;
  if (add === "blank") return base;
  if (into === "blank") return JSON.stringify(add);
  return JSON.stringify({ ...into, content: [...into.content, ...add.content] });
}
