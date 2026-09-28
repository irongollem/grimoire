/**
 * Pure helpers for finding `entityMention` nodes (see `EntityMention.ts`)
 * inside a parsed Tiptap document. Used by `useEntityBacklinks` to confirm a
 * "Mentioned in" hit: a `content ILIKE '%id%'` query is cheap but can match
 * the id as a plain substring of something unrelated (another mention's id,
 * stray text), so every row is re-checked here by actually walking its doc
 * for a mention node whose `attrs.id` matches.
 */

interface MentionNodeAttrs {
  id?: unknown;
}

interface TiptapNodeLike {
  type?: unknown;
  attrs?: MentionNodeAttrs;
  content?: unknown;
}

/**
 * Walks an already-parsed Tiptap document looking for an `entityMention` node
 * whose `attrs.id` equals `id`. Never throws: a note's content is free-form
 * client JSON, and any shape that isn't a plain object with an optional
 * `content` array is treated as "no mention here" rather than an error.
 */
export function docMentionsEntity(doc: unknown, id: string): boolean {
  if (!id) return false;
  if (!doc || typeof doc !== "object") return false;

  const node = doc as TiptapNodeLike;

  if (node.type === "entityMention" && node.attrs && typeof node.attrs === "object") {
    if (node.attrs.id === id) return true;
  }

  if (Array.isArray(node.content)) {
    for (const child of node.content) {
      if (docMentionsEntity(child, id)) return true;
    }
  }

  return false;
}

/**
 * Parses a note's stored Tiptap JSON string and checks it for a mention of
 * `id`. A parse failure or non-string content drops the row (returns
 * `false`) rather than throwing — the caller is confirming a substring match
 * it already found, so a malformed row is simply not a match.
 */
export function contentMentionsEntity(content: string | null | undefined, id: string): boolean {
  if (!content || !id) return false;

  let doc: unknown;
  try {
    doc = JSON.parse(content);
  } catch {
    return false;
  }

  return docMentionsEntity(doc, id);
}
