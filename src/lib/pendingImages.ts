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
