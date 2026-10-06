/**
 * Pure helpers over a Tiptap JSON document for locating `pendingImage`
 * anchor nodes — the block atom a chronicle-image generation job renders as
 * while its render is in flight. No tiptap imports here: the document is
 * walked as plain, unknown-typed JSON so this stays trivially unit-testable
 * and usable from anywhere that only has the serialized doc.
 */

interface RawNode {
  type?: unknown;
  attrs?: unknown;
  content?: unknown;
}

function isRawNode(value: unknown): value is RawNode {
  return typeof value === "object" && value !== null;
}

/**
 * Walks a Tiptap JSON document and collects every `pendingImage` anchor
 * whose status isn't "failed" (a failed anchor is a settled dead-end, not
 * something to keep resolving), deduped by jobId (first occurrence wins).
 */
export function findPendingImages(
  doc: unknown,
): { jobId: string; prompt: string }[] {
  const found: { jobId: string; prompt: string }[] = [];
  const seen = new Set<string>();

  function walk(node: unknown): void {
    if (!isRawNode(node)) return;

    if (node.type === "pendingImage" && isRawNode(node.attrs)) {
      const attrs = node.attrs as Record<string, unknown>;
      const jobId = attrs.jobId;
      const status = attrs.status;
      if (typeof jobId === "string" && jobId && status !== "failed" && !seen.has(jobId)) {
        seen.add(jobId);
        found.push({
          jobId,
          prompt: typeof attrs.prompt === "string" ? attrs.prompt : "",
        });
      }
    }

    if (Array.isArray(node.content)) {
      for (const child of node.content) walk(child);
    }
  }

  walk(doc);
  return found;
}

type JsonObject = Record<string, unknown>;

function isPlainObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Returns a copy of `doc` with the first `pendingImage` anchor for `jobId`
 * transformed by `change` (a node to put in its place), or null when no such
 * anchor exists. The input is never mutated: the viewer holds the document in
 * reactive state and needs a new reference to re-render.
 */
function replaceAnchor(
  doc: unknown,
  jobId: string,
  change: (anchor: JsonObject) => JsonObject,
): unknown | null {
  let replaced = false;

  function walk(node: unknown): unknown {
    if (replaced || !isPlainObject(node)) return node;
    if (
      node.type === "pendingImage" &&
      isPlainObject(node.attrs) &&
      node.attrs.jobId === jobId
    ) {
      replaced = true;
      return change(node);
    }
    if (!Array.isArray(node.content)) return node;
    const content = node.content.map(walk);
    return replaced ? { ...node, content } : node;
  }

  const next = walk(doc);
  return replaced ? next : null;
}

/** The finished image takes the anchor's place; null when the anchor is gone. */
export function replacePendingImageWithImage(
  doc: unknown,
  jobId: string,
  url: string,
): unknown | null {
  return replaceAnchor(doc, jobId, () => ({ type: "image", attrs: { src: url } }));
}

/** The anchor stays, with status "failed"; null when the anchor is gone. */
export function markPendingImageFailed(doc: unknown, jobId: string): unknown | null {
  return replaceAnchor(doc, jobId, (anchor) => ({
    ...anchor,
    attrs: { ...(anchor.attrs as JsonObject), status: "failed" },
  }));
}
