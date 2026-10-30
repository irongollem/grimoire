import { describe, expect, it, vi, beforeEach } from "vitest";
import { ref, shallowRef } from "vue";
import type { Editor } from "@tiptap/core";

const nav = vi.hoisted(() => ({
  query: {} as Record<string, string>,
  push: vi.fn(),
  replace: vi.fn(),
}));
vi.mock("vue-router", () => ({
  useRoute: () => ({ query: nav.query }),
  useRouter: () => ({ push: nav.push, replace: nav.replace }),
}));
vi.mock("@/lib/storage", () => ({ isBucketUrl: () => true }));

import { useScriptoriumIlluminator } from "./useScriptoriumIlluminator";

const SRC = "https://cdn.example/asset-images/u1/a.webp";

/** Just enough of a Tiptap editor: an image selected, and one image in the doc. */
function fakeEditor() {
  const updateAttributes = vi.fn(() => chain);
  const chain = { setNodeSelection: () => chain, updateAttributes, run: vi.fn() };
  const editor = {
    isActive: () => true,
    getAttributes: () => ({ src: SRC }),
    chain: () => chain,
    state: {
      doc: {
        descendants: (fn: (node: { type: { name: string }; attrs: { src: string } }, pos: number) => unknown) =>
          fn({ type: { name: "image" }, attrs: { src: SRC } }, 3),
      },
    },
  } as unknown as Editor;
  return { editor, updateAttributes };
}

beforeEach(() => {
  nav.query = {};
  nav.push.mockReset();
  nav.replace.mockReset();
});

describe("the Illuminator round trip (#1115: a book is chapters)", () => {
  it("sends the chapter holding the image, so the way back opens that chapter", () => {
    const { editor } = fakeEditor();
    const api = useScriptoriumIlluminator(shallowRef(editor), ref("book-1"), ref("chapter-7"));
    api.editInIlluminator();
    const url = new URL(`https://x${nav.push.mock.calls[0][0] as string}`);
    expect(url.searchParams.get("returnChapter")).toBe("chapter-7");
    expect(url.searchParams.get("returnTo")).toBe("book-1");
  });

  it("patches the image on return and keeps the chapter in the address when clearing the rest", () => {
    nav.query = { chapter: "chapter-7", updatedSrc: "https://cdn.example/new.webp", oldSrc: SRC };
    const { editor, updateAttributes } = fakeEditor();
    useScriptoriumIlluminator(shallowRef(editor), ref("book-1"), ref("chapter-7"));
    expect(updateAttributes).toHaveBeenCalledWith("image", { src: "https://cdn.example/new.webp" });
    expect(nav.replace).toHaveBeenCalledWith({ query: { chapter: "chapter-7" } });
  });
});
