// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { createScriptoriumExtensions } from "@/scriptorium/lib/scriptoriumExtensions";
import { onThisPage } from "./onThisPage";
import type { PageBox } from "@/scriptorium/tiptap/pageFlow";
import type { PageFurnitureItem } from "@/scriptorium/types";

let editor: Editor | null = null;
afterEach(() => {
  editor?.destroy();
  editor = null;
});

function item(id: string, kind: PageFurnitureItem["kind"], blockId: string, over: Partial<PageFurnitureItem> = {}): PageFurnitureItem {
  return { id, kind, anchor: { type: "block", blockId }, x: 0, y: 0, width: 30, z: "under", props: kind === "art" ? { src: `${id}.webp` } : {}, ...over };
}

describe("onThisPage", () => {
  function setup() {
    const ed = new Editor({
      element: document.createElement("div"),
      content: {
        type: "doc",
        content: [
          { type: "paragraph", attrs: { blockId: "b1" }, content: [{ type: "text", text: "One" }] },
          { type: "image", attrs: { src: "page1.webp" } },
          { type: "paragraph", attrs: { blockId: "b2" }, content: [{ type: "text", text: "Two" }] },
          { type: "image", attrs: { src: "page2.webp" } },
        ],
      },
      extensions: createScriptoriumExtensions(),
    });
    editor = ed;
    const secondPageStart = ed.state.doc.child(0).nodeSize + ed.state.doc.child(1).nodeSize;
    const pages: PageBox[] = [
      { page: 1, startPos: 0, contentTop: 0, contentHeight: 900 },
      { page: 2, startPos: secondPageStart, contentTop: 900, contentHeight: 900 },
    ];
    const blockPos = (id: string) => (id === "b1" ? 0 : id === "b2" ? secondPageStart : null);
    return { doc: ed.state.doc, pages, blockPos };
  }

  // Fails on: the list showing the whole chapter's pictures, or only one of a picture's two homes.
  it("lists the pictures in the text and the art on that page, and nothing from other pages", () => {
    const { doc, pages, blockPos } = setup();
    const furniture = [item("f1", "art", "b1"), item("f2", "watercolor", "b1"), item("f3", "watermark", "b2")];
    const page1 = onThisPage({ doc, pages, page: 1, chapterId: "c1", furniture, blockPos });
    expect(page1.map((e) => [e.kind, e.label])).toEqual([
      ["picture", "Picture in the text"],
      ["picture", "Picture behind the text"],
      ["decoration", "Watercolour"],
    ]);
    expect(page1.find((e) => e.kind === "picture" && e.source === "node")).toMatchObject({ src: "page1.webp" });
    const page2 = onThisPage({ doc, pages, page: 2, chapterId: "c1", furniture, blockPos });
    expect(page2.map((e) => e.label)).toEqual(["Picture in the text", "Watermark"]);
  });

  it("says in front or behind for art by its layer", () => {
    const { doc, pages, blockPos } = setup();
    const [entry] = onThisPage({ doc, pages, page: 1, chapterId: "c1", furniture: [item("f1", "art", "b1", { z: "over" })], blockPos }).filter(
      (e) => e.kind === "picture" && e.source === "furniture",
    );
    expect(entry.label).toBe("Picture in front");
  });

  // Fails on: a page painting being listed as an ordinary picture, so the DM cannot tell it from art.
  it("names a painting on the page Painting", () => {
    const { doc, pages, blockPos } = setup();
    const painting = item("p1", "art", "b1", { props: { src: "p.webp", painting: 1 } });
    const [entry] = onThisPage({ doc, pages, page: 1, chapterId: "c1", furniture: [painting], blockPos }).filter((e) => e.kind === "picture" && e.source === "furniture");
    expect(entry.label).toBe("Painting");
  });

  it("lists nothing for an empty page", () => {
    const { doc, pages, blockPos } = setup();
    expect(onThisPage({ doc, pages, page: 3, chapterId: "c1", furniture: [], blockPos })).toEqual([]);
  });
});
