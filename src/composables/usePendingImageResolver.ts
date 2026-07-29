/**
 * usePendingImageResolver — watches a Tiptap document for `pendingImage`
 * anchors (block atoms inserted where a chronicle image job is still
 * rendering) and resolves each one exactly once:
 *
 *   - server job id  → waitForImageJob (Realtime + poll on image_generation_jobs)
 *   - "local-" job id → getLocalImageJob (in-memory promise, BYOK client render)
 *
 * On success the anchor is replaced with a standard `image` node at its
 * current position. On failure (or a local job orphaned by a reload) the
 * anchor's `status` attr is set to "failed" so the UI can render its own
 * error state; a toast only fires when the anchor itself is gone by then,
 * since otherwise the anchor's failed state IS the visible signal.
 *
 * `scan()` is idempotent and safe to call on every editor update — a
 * module-level set tracks jobIds already being resolved so re-scanning
 * mid-flight doesn't start a second wait for the same job.
 */

import type { Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { findPendingImages } from "@/lib/pendingImages";
import { waitForImageJob } from "@/ai/useImageJob";
import { getLocalImageJob } from "@/ai/useImageGeneration";
import { useToast } from "@/composables/useToast";

// Module-level so multiple resolver instances (or repeated scan() calls)
// never race to resolve the same job twice.
const trackedJobIds = new Set<string>();

interface PendingImageNodeMatch {
  pos: number;
  node: ProseMirrorNode;
}

function findPendingImageNode(
  editor: Editor,
  jobId: string,
): PendingImageNodeMatch | null {
  let match: PendingImageNodeMatch | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (match) return false;
    if (node.type.name === "pendingImage" && node.attrs.jobId === jobId) {
      match = { pos, node };
    }
    return true;
  });
  return match;
}

function replaceWithImage(editor: Editor, jobId: string, url: string): void {
  const match = findPendingImageNode(editor, jobId);
  if (!match) return; // user deleted the anchor — the image is already in the gallery
  const { pos, node } = match;
  const imageNode = editor.schema.nodes.image.create({ src: url });
  const tr = editor.state.tr.replaceWith(pos, pos + node.nodeSize, imageNode);
  editor.view.dispatch(tr);
}

/** Returns true when an anchor was found and marked failed. */
function markFailed(editor: Editor, jobId: string): boolean {
  const match = findPendingImageNode(editor, jobId);
  if (!match) return false;
  const tr = editor.state.tr.setNodeMarkup(match.pos, undefined, {
    ...match.node.attrs,
    status: "failed",
  });
  editor.view.dispatch(tr);
  return true;
}

async function resolveLocalJob(jobId: string): Promise<string> {
  const promise = getLocalImageJob(jobId);
  if (!promise) {
    // Reload orphan — the in-memory render promise didn't survive a page
    // reload/note re-open. There is nothing left to wait for.
    throw new Error(
      "This image didn't finish rendering before the session ended. Try generating it again.",
    );
  }
  return promise;
}

function handleFailure(
  getEditor: () => Editor | null | undefined,
  jobId: string,
  e: unknown,
): void {
  const editor = getEditor();
  if (!editor || editor.isDestroyed) return; // note closed mid-wait — a future scan on reopen re-tracks
  const anchorStillPresent = markFailed(editor, jobId);
  if (!anchorStillPresent) {
    const { error } = useToast();
    error(e instanceof Error ? e.message : "Image generation failed.");
  }
}

async function resolveOne(
  getEditor: () => Editor | null | undefined,
  jobId: string,
): Promise<void> {
  try {
    const url = jobId.startsWith("local-")
      ? await resolveLocalJob(jobId)
      : await waitForImageJob(jobId);

    const editor = getEditor();
    if (!editor || editor.isDestroyed) return;
    replaceWithImage(editor, jobId, url);
  } catch (e) {
    handleFailure(getEditor, jobId, e);
  } finally {
    trackedJobIds.delete(jobId);
  }
}

export function usePendingImageResolver(
  getEditor: () => Editor | null | undefined,
) {
  function scan(): void {
    const editor = getEditor();
    if (!editor || editor.isDestroyed) return;

    const doc: unknown = editor.getJSON();
    const anchors = findPendingImages(doc);

    for (const { jobId } of anchors) {
      if (trackedJobIds.has(jobId)) continue;
      trackedJobIds.add(jobId);
      void resolveOne(getEditor, jobId);
    }
  }

  return { scan };
}
