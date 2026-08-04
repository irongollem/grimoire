/**
 * Covers the resolver's cross-instance handoff: a wait started by one
 * instance (the read-only viewer) must still land in whichever editor holds
 * the anchor when the job settles (the user may have clicked Edit mid-wait,
 * destroying the viewer's editor). The module-level trackedJobIds set makes
 * the second instance's scan skip the in-flight job, so settlement notifies
 * every live instance to re-scan — that re-scan is what this file locks in.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { effectScope, type EffectScope } from "vue";
import { usePendingImageResolver } from "./usePendingImageResolver";

vi.mock("@/ai/useImageJob", () => ({ waitForImageJob: vi.fn() }));
vi.mock("@/ai/useImageGeneration", () => ({ getLocalImageJob: vi.fn() }));
vi.mock("@/composables/useToast", () => ({
  useToast: () => ({ error: vi.fn() }),
}));

import { waitForImageJob } from "@/ai/useImageJob";

const waitForImageJobMock = vi.mocked(waitForImageJob);

interface FakeAnchor {
  jobId: string;
  status: string;
}

/**
 * Minimal stand-in for the slice of the Tiptap Editor API the resolver
 * touches. Anchors live in `anchors`; a successful resolution moves the
 * image URL into `images` and removes the anchor, mirroring replaceWith.
 */
function makeFakeEditor(jobIds: string[]) {
  const anchors: FakeAnchor[] = jobIds.map((jobId) => ({ jobId, status: "pending" }));
  const images: string[] = [];
  const editor = {
    isDestroyed: false,
    getJSON: () => ({
      type: "doc",
      content: anchors.map((a) => ({
        type: "pendingImage",
        attrs: { jobId: a.jobId, status: a.status, prompt: "" },
      })),
    }),
    state: {
      doc: {
        descendants(cb: (node: unknown, pos: number) => boolean) {
          for (let i = 0; i < anchors.length; i++) {
            const a = anchors[i];
            cb({ type: { name: "pendingImage" }, attrs: { jobId: a.jobId, status: a.status }, nodeSize: 1 }, i);
          }
        },
      },
      get tr() {
        return {
          replaceWith: (pos: number, _end: number, node: { attrs: { src: string } }) =>
            ({ kind: "replace" as const, pos, src: node.attrs.src }),
          setNodeMarkup: (pos: number, _type: undefined, attrs: FakeAnchor) =>
            ({ kind: "markFailed" as const, pos, attrs }),
        };
      },
    },
    schema: { nodes: { image: { create: (attrs: { src: string }) => ({ attrs }) } } },
    view: {
      dispatch(tr: { kind: "replace"; pos: number; src: string } | { kind: "markFailed"; pos: number; attrs: FakeAnchor }) {
        if (tr.kind === "replace") {
          images.push(tr.src);
          anchors.splice(tr.pos, 1);
        } else {
          anchors[tr.pos].status = tr.attrs.status;
        }
      },
    },
  };
  return { editor, anchors, images };
}

type FakeEditor = ReturnType<typeof makeFakeEditor>["editor"];

const scopes: EffectScope[] = [];

/** Instantiate the composable inside a scope so afterEach unregisters it. */
function makeResolver(getEditor: () => FakeEditor | null) {
  const scope = effectScope();
  scopes.push(scope);
  // The resolver takes a real Editor; the fake covers the used surface.
  return scope.run(() => usePendingImageResolver(getEditor as never))!;
}

afterEach(() => {
  for (const scope of scopes.splice(0)) scope.stop();
  vi.clearAllMocks();
});

describe("usePendingImageResolver", () => {
  it("replaces a pending anchor with the image once the job resolves", async () => {
    const { editor, anchors, images } = makeFakeEditor(["job-basic"]);
    waitForImageJobMock.mockResolvedValue("https://img/basic.webp");

    makeResolver(() => editor).scan();

    await vi.waitFor(() => expect(images).toEqual(["https://img/basic.webp"]));
    expect(anchors).toHaveLength(0);
  });

  it("hands a mid-wait job over to a later instance holding the anchor", async () => {
    let settle!: (url: string) => void;
    waitForImageJobMock
      .mockReturnValueOnce(new Promise<string>((resolve) => { settle = resolve; }))
      .mockResolvedValue("https://img/handoff.webp");

    // The viewer starts the wait…
    const viewer = makeFakeEditor(["job-handoff"]);
    makeResolver(() => viewer.editor).scan();

    // …the user clicks Edit: viewer unmounts, editor opens the same doc.
    viewer.editor.isDestroyed = true;
    const editing = makeFakeEditor(["job-handoff"]);
    const editingResolver = makeResolver(() => editing.editor);
    editingResolver.scan(); // skipped: the job is still tracked by the viewer's wait

    settle("https://img/handoff.webp");

    await vi.waitFor(() => expect(editing.images).toEqual(["https://img/handoff.webp"]));
    expect(editing.anchors).toHaveLength(0);
  });

  it("marks the anchor failed on rejection without re-resolving it", async () => {
    const { editor, anchors, images } = makeFakeEditor(["job-fails"]);
    waitForImageJobMock.mockRejectedValue(new Error("render exploded"));

    makeResolver(() => editor).scan();

    await vi.waitFor(() => expect(anchors[0]?.status).toBe("failed"));
    expect(images).toHaveLength(0);
    // The settle-notification re-scan must skip failed anchors, or a
    // rejecting job would loop: notify → scan → reject → notify → …
    expect(waitForImageJobMock).toHaveBeenCalledTimes(1);
  });
});
