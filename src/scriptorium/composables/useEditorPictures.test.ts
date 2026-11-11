// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { shallowRef } from "vue";
import { Editor } from "@tiptap/core";
import { NodeSelection } from "@tiptap/pm/state";
import { createScriptoriumExtensions } from "@/scriptorium/lib/scriptoriumExtensions";
import { ScriptoriumImage } from "@/scriptorium/tiptap/scriptoriumImage";
import { PageFlow, type PageFlowStorage } from "@/scriptorium/tiptap/pageFlow";
import { useEditorPictures } from "./useEditorPictures";
import type { PageFurnitureItem } from "@/scriptorium/types";

// The drawn height of a block is layout, which happy-dom has none of: a block 35% down its page.
vi.mock("@/scriptorium/lib/furniture/editorAnchors", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/scriptorium/lib/furniture/editorAnchors")>()),
  blockTopPx: () => 96 - 96 + 0.35 * 1123,
}));

const GEOMETRY = { width: 800, height: 1123, marginTop: 96 };
const recipe = { steps: [{ type: "grade" }] };

// The picture's treatment keys live on the image node as attrs; written here so the test does not depend on who adds them.
const TreatedImage = ScriptoriumImage.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      original: { default: null },
      illuminate: { default: null },
      bakedFor: { default: null },
    };
  },
});

let editor: Editor | null = null;
afterEach(() => {
  editor?.destroy();
  editor = null;
});

function para(id: string, text: string) {
  return { type: "paragraph", attrs: { blockId: id }, content: [{ type: "text", text }] };
}

function setup(furniture: PageFurnitureItem[], content: object[] = [para("b1", "One"), para("b2", "Two"), para("b3", "Three")]) {
  const extensions = [...createScriptoriumExtensions().filter((e) => e.name !== "image"), TreatedImage, PageFlow];
  const ed = new Editor({ element: document.createElement("div"), content: { type: "doc", content }, extensions });
  editor = ed;
  // Page 2 starts at the second paragraph.
  const second = ed.state.doc.child(0).nodeSize;
  (ed.storage as unknown as { pageFlow: PageFlowStorage }).pageFlow.pages = [
    { page: 1, startPos: 0, contentTop: 96, contentHeight: 900 },
    { page: 2, startPos: second, contentTop: 96, contentHeight: 900 },
  ];
  const state = { furniture, selected: null as string | null };
  const sheet = document.createElement("div");
  const pictures = useEditorPictures({
    editor: shallowRef<Editor | undefined>(ed),
    chapterId: () => "c1",
    geometry: () => GEOMETRY,
    furniture: () => state.furniture,
    setFurniture: (items) => {
      state.furniture = items;
    },
    select: (id) => {
      state.selected = id;
    },
    sheet: () => sheet,
  });
  return { ed, state, sheet, pictures };
}

function art(over: Partial<PageFurnitureItem> = {}): PageFurnitureItem {
  return {
    id: "f1",
    kind: "art",
    anchor: { type: "block", blockId: "b1" },
    x: 20,
    y: 10,
    width: 50,
    z: "over",
    props: { src: "a.webp", original: "o.webp", illuminate: recipe as never, bakedFor: "h1" },
    ...over,
  };
}

function topLevel(ed: Editor): string[] {
  return (ed.getJSON().content ?? []).map((n) => (n.type === "image" ? `image:${String(n.attrs?.src)}` : String(n.attrs?.blockId)));
}

describe("a picture's layer", () => {
  // Fails on: switching to In the text dropping the picture at the document's end, or losing its treatment on the way.
  it("switching a picture to In the text puts it back after its paragraph with its treatment", () => {
    const { ed, state, pictures } = setup([art()]);
    pictures.putInText("f1");
    expect(topLevel(ed)).toEqual(["b1", "image:a.webp", "b2", "b3"]);
    const image = ed.getJSON().content?.[1]?.attrs;
    expect(image).toMatchObject({ width: "400", original: "o.webp", illuminate: recipe, bakedFor: "h1" });
    expect(state.furniture).toEqual([]);
    expect(state.selected).toBeNull();
    expect(ed.state.selection).toBeInstanceOf(NodeSelection);
  });

  // Fails on: a page-anchored picture landing after the first block of the chapter instead of the first block of its page.
  it("puts a picture that stays on page 2 after the first paragraph on page 2", () => {
    const { ed, pictures } = setup([art({ anchor: { type: "page", chapterId: "c1", page: 2 } })]);
    pictures.putInText("f1");
    expect(topLevel(ed)).toEqual(["b1", "b2", "image:a.webp", "b3"]);
  });

  // Fails on: Place on page losing the picture's treatment, so a treated picture returns to its raw file.
  it("placing a picture on the page carries its treatment to the art and takes it out of the text", () => {
    const { ed, state, pictures } = setup([], [
      para("b1", "One"),
      { type: "image", attrs: { src: "p.webp", width: "330", original: "o.webp", illuminate: recipe, bakedFor: "h2" } },
      para("b3", "Three"),
    ]);
    pictures.placeOnPage(ed.state.doc.child(0).nodeSize, "under");
    expect(topLevel(ed)).toEqual(["b1", "b3"]);
    expect(state.furniture).toHaveLength(1);
    expect(state.furniture[0]).toMatchObject({ kind: "art", z: "under", props: { src: "p.webp", original: "o.webp", illuminate: recipe, bakedFor: "h2" } });
    expect(state.selected).toBe(state.furniture[0].id);
  });

  // Fails on: the contract with the two-column warning: a pos that is not a picture must change nothing.
  it("places nothing when the position is not a picture", () => {
    const { ed, state, pictures } = setup([]);
    pictures.placeOnPage(0);
    expect(state.furniture).toEqual([]);
    expect(topLevel(ed)).toEqual(["b1", "b2", "b3"]);
  });
});

describe("what a placed picture stays with", () => {
  function drawn(sheet: HTMLElement, id: string, page: number, top: string) {
    sheet.innerHTML = `<div data-chapter-id="c1" data-chapter-page="${page}"><div data-furniture-id="${id}" style="top:${top}"></div></div>`;
  }

  // Fails on: "With its paragraph" keeping the page-relative y.
  it("With its paragraph keeps the picture where it is drawn", () => {
    const item = art({ anchor: { type: "page", chapterId: "c1", page: 2 }, y: 60 });
    const { sheet, state, pictures } = setup([item]);
    drawn(sheet, "f1", 2, "60%");
    pictures.chooseAnchor(item, "block");
    // The paragraph is 35% down its page and the picture is drawn at 60%: 25% below the paragraph's top.
    expect(state.furniture[0]).toMatchObject({ anchor: { type: "block", blockId: "b2" }, y: 25 });
  });

  // Fails on: On page N keeping the paragraph offset as a page coordinate.
  it("On its page keeps a following picture where it is drawn", () => {
    const item = art({ anchor: { type: "block", blockId: "b2" }, y: 25 });
    const { sheet, state, pictures } = setup([item]);
    drawn(sheet, "f1", 2, "60%");
    pictures.chooseAnchor(item, "page");
    expect(state.furniture[0]).toMatchObject({ anchor: { type: "page", chapterId: "c1", page: 2 }, y: 60 });
  });

  it("offers a paragraph to follow only on a page that has one, and Free only when it can be worked out", () => {
    const item = art({ anchor: { type: "page", chapterId: "c1", page: 2 }, corner: "bottom-right", x: 2, y: 2 });
    const { sheet, pictures } = setup([item]);
    drawn(sheet, "f1", 2, "60%");
    expect(pictures.anchorState(item)).toMatchObject({ page: 2, hasParagraph: true });
    // A bottom corner needs the drawn height, which a page with no layout cannot give.
    expect(pictures.anchorState(item).canFree).toBe(false);
  });
});

describe("replacing a picture", () => {
  // Fails on: the old picture's recipe surviving onto the new file, which would then be baked from the wrong original.
  it("swaps the file and drops the old treatment, for art and for an image in the text", () => {
    const { state, pictures } = setup([art()]);
    pictures.replaceSrc({ source: "furniture", id: "f1" }, "new.webp");
    expect(state.furniture[0].props).toEqual({ src: "new.webp" });
  });

  it("clears an image node's recipe when its file is replaced", () => {
    const { ed, pictures } = setup([], [
      para("b1", "One"),
      { type: "image", attrs: { src: "p.webp", original: "o.webp", bakedFor: "h" } },
    ]);
    pictures.replaceSrc({ source: "node", pos: ed.state.doc.child(0).nodeSize }, "new.webp");
    expect(ed.getJSON().content?.[1]?.attrs).toMatchObject({ src: "new.webp", original: null, bakedFor: null });
  });
});
