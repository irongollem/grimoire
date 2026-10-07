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
 *
 * Two entry points share one resolution core: `usePendingImageResolver`
 * (an Editor, used by RichTextEditor) and `usePendingImageDocResolver` (a
 * plain JSON document the caller owns, used by the read-only RichTextViewer,
 * which has no editor at all so it does not load Tiptap). Instances are wired
 * into both RichTextEditor and the read-only RichTextViewer, so an anchor can be waited on by one instance while its
 * document is open in another (view a note → click Edit mid-wait). When a
 * job settles, every live instance is asked to re-scan: the instance whose
 * editor still holds the anchor re-tracks the now-settled job and resolves
 * it immediately, so the handoff never strands an anchor as "pending".
 */

import { getCurrentScope, onScopeDispose } from "vue";
import type { Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import {
  findPendingImages,
  markPendingImageFailed,
  replacePendingImageWithImage,
} from "@/lib/pendingImages";
import { waitForImageJob } from "@/ai/useImageJob";
import { getLocalImageJob } from "@/ai/useImageGeneration";
import { useToast } from "@/composables/useToast";

// Module-level so multiple resolver instances (or repeated scan() calls)
// never race to resolve the same job twice.
const trackedJobIds = new Set<string>();

// Live instances' scan functions, notified when any job settles so the
// instance that still holds the anchor picks the result up (see header).
const liveScanners = new Set<() => void>();

function notifyScanners(): void {
  for (const scanFn of liveScanners) scanFn();
}

/**
 * What resolution needs from whatever holds the document. An Editor and a
 * plain JSON document both satisfy it, so the module-level tracking and the
 * cross-instance handoff are written once.
 */
interface ResolverTarget {
  /** The holder is gone (editor destroyed / viewer unmounted): stop touching it. */
  isGone(): boolean;
  getDoc(): unknown;
  /** Swap the anchor for the finished image. No-op when the anchor is gone. */
  replaceWithImage(jobId: string, url: string): void;
  /** Returns true when an anchor was found and marked failed. */
  markFailed(jobId: string): boolean;
}

type GetTarget = () => ResolverTarget | null;

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

function editorTarget(editor: Editor): ResolverTarget {
  return {
    isGone: () => editor.isDestroyed,
    getDoc: () => editor.getJSON(),
    replaceWithImage(jobId, url) {
      const match = findPendingImageNode(editor, jobId);
      if (!match) return; // user deleted the anchor — the image is already in the gallery
      const { pos, node } = match;
      const imageNode = editor.schema.nodes.image.create({ src: url });
      const tr = editor.state.tr.replaceWith(pos, pos + node.nodeSize, imageNode);
      editor.view.dispatch(tr);
    },
    markFailed(jobId) {
      const match = findPendingImageNode(editor, jobId);
      if (!match) return false;
      const tr = editor.state.tr.setNodeMarkup(match.pos, undefined, {
        ...match.node.attrs,
        status: "failed",
      });
      editor.view.dispatch(tr);
      return true;
    },
  };
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

function handleFailure(getTarget: GetTarget, jobId: string, e: unknown): void {
  const target = getTarget();
  if (!target || target.isGone()) return; // note closed mid-wait — a future scan on reopen re-tracks
  const anchorStillPresent = target.markFailed(jobId);
  if (!anchorStillPresent) {
    const { error } = useToast();
    error(e instanceof Error ? e.message : "Image generation failed.");
  }
}

async function resolveOne(getTarget: GetTarget, jobId: string): Promise<void> {
  try {
    const url = jobId.startsWith("local-")
      ? await resolveLocalJob(jobId)
      : await waitForImageJob(jobId);

    const target = getTarget();
    if (!target || target.isGone()) return;
    target.replaceWithImage(jobId, url);
  } catch (e) {
    handleFailure(getTarget, jobId, e);
  } finally {
    trackedJobIds.delete(jobId);
    // The anchor may live in a different instance's document by now (e.g.
    // the wait started in the read-only viewer and the user opened the
    // editor mid-wait). Their re-scan re-tracks the settled job and gets an
    // immediate answer. Termination: a resolved anchor is gone from the doc,
    // and findPendingImages skips status "failed", so re-scans converge.
    notifyScanners();
  }
}

function useResolver(getTarget: GetTarget) {
  function scan(): void {
    const target = getTarget();
    if (!target || target.isGone()) return;

    const anchors = findPendingImages(target.getDoc());

    for (const { jobId } of anchors) {
      if (trackedJobIds.has(jobId)) continue;
      trackedJobIds.add(jobId);
      void resolveOne(getTarget, jobId);
    }
  }

  liveScanners.add(scan);
  if (getCurrentScope()) onScopeDispose(() => liveScanners.delete(scan));

  return { scan };
}

export function usePendingImageResolver(
  getEditor: () => Editor | null | undefined,
) {
  return useResolver(() => {
    const editor = getEditor();
    return editor ? editorTarget(editor) : null;
  });
}

/**
 * The same resolution over a plain Tiptap JSON document, for the read-only
 * viewer. `getDoc` returns the document as currently shown (null once the
 * viewer is gone); `setDoc` receives the next document when an anchor is
 * swapped for its image or marked failed. The caller keeps persistence out of
 * it — the swap is in-memory only, like the editor path in the viewer.
 */
export function usePendingImageDocResolver(
  getDoc: () => unknown,
  setDoc: (doc: unknown) => void,
) {
  return useResolver(() => ({
    isGone: () => getDoc() === null,
    getDoc,
    replaceWithImage(jobId, url) {
      const next = replacePendingImageWithImage(getDoc(), jobId, url);
      if (next) setDoc(next);
    },
    markFailed(jobId) {
      const next = markPendingImageFailed(getDoc(), jobId);
      if (!next) return false;
      setDoc(next);
      return true;
    },
  }));
}
