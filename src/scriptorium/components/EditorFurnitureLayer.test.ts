// @vitest-environment happy-dom
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import type { Editor } from "@tiptap/core";
import EditorFurnitureLayer from "./EditorFurnitureLayer.vue";
import { createFurnitureItem } from "@/scriptorium/lib/furniture/model";
import type { PageBox } from "@/scriptorium/tiptap/pageFlow";
import type { PageFurnitureItem } from "@/scriptorium/types";

const G = { width: 800, height: 1000, marginTop: 50 };

/**
 * An editor with the parts the layer reads: the page boxes, top-level blocks
 * (id, doc position, top in px from the root) and what is under a point.
 */
function fakeEditor(pages: PageBox[], blocks: { id: string; pos: number; top: number }[], under: { id: string | null } = { id: null }) {
  const root = document.createElement("div");
  const doms = new Map<number, HTMLElement>();
  for (const b of blocks) {
    const el = document.createElement("p");
    // A top-level block sits in the editor's root, which is what its offsets are measured from.
    Object.defineProperty(el, "offsetParent", { value: root });
    Object.defineProperty(el, "offsetTop", { value: b.top });
    Object.defineProperty(el, "offsetLeft", { value: 0 });
    doms.set(b.pos, el);
  }
  const underlay = document.createElement("div");
  const storage = {
    pageFlow: { pages, listeners: new Set<() => void>() },
    furnitureUnderlay: { element: underlay, listeners: new Set<() => void>() },
  };
  const nodeAt = (id: string | null) => ({ attrs: { blockId: id } });
  const editor = {
    isDestroyed: false,
    storage,
    state: {
      doc: {
        descendants(cb: (node: { attrs: { blockId: string } }, pos: number) => void) {
          for (const b of blocks) cb(nodeAt(b.id) as { attrs: { blockId: string } }, b.pos);
        },
        resolve: () => ({ depth: 1, node: () => nodeAt(under.id) }),
      },
    },
    view: { dom: root, nodeDOM: (pos: number) => doms.get(pos) ?? null, posAtCoords: () => ({ pos: 1, inside: 1 }) },
  };
  return { editor: editor as unknown as Editor, storage, setPages(next: PageBox[]) { storage.pageFlow.pages = next; } };
}

const page1: PageBox = { page: 1, startPos: 0, contentTop: 50, contentHeight: 900 };
const page2: PageBox = { page: 2, startPos: 40, contentTop: 1124, contentHeight: 900 };

function mountLayer(editor: Editor, furniture: PageFurnitureItem[], selectedId: string | null = null) {
  return mount(EditorFurnitureLayer, {
    attachTo: document.body,
    props: { editor, chapterId: "c1", furniture, selectedId, geometry: G },
  });
}

describe("EditorFurnitureLayer", () => {
  it("a picture that follows its paragraph is drawn at the paragraph's top plus its offset", () => {
    const { editor } = fakeEditor([page1, page2], [{ id: "p", pos: 5, top: 300 }]);
    const item = createFurnitureItem("art", { type: "block", blockId: "p" }, { x: 10, y: 5, width: 30, props: { src: "a.png" } });
    const w = mountLayer(editor, [item]);
    // Block at 300px of a 1000px sheet starting at 0: 30%, plus 5%.
    expect(w.find<HTMLElement>("[data-furniture-id]").element.style.top).toBe("35%");
    w.unmount();
  });

  it("a paragraph moving to the next page says so, and only then", () => {
    const fake = fakeEditor([page1, page2], [{ id: "p", pos: 5, top: 300 }]);
    const item = createFurnitureItem("art", { type: "block", blockId: "p" }, { x: 10, y: 5, props: { src: "a.png" } });
    const w = mountLayer(fake.editor, [item]);
    expect(w.emitted("moved")).toBeUndefined();
    // More text above: the paragraph is now past the start of page 2.
    const moved = fakeEditor([page1, page2], [{ id: "p", pos: 45, top: 1300 }]);
    fake.storage.pageFlow.pages = moved.storage.pageFlow.pages;
    (fake.editor.state.doc as unknown as { descendants: unknown }).descendants = moved.editor.state.doc.descendants;
    (fake.editor.view as unknown as { nodeDOM: unknown }).nodeDOM = moved.editor.view.nodeDOM;
    fake.storage.pageFlow.listeners.forEach((l) => l());
    expect(w.emitted("moved")).toEqual([[[2]]]);
    w.unmount();
  });

  it("moving a picture to another paragraph on a later page is the DM's doing and says nothing", async () => {
    const { editor } = fakeEditor(
      [page1, page2],
      [
        { id: "p", pos: 5, top: 300 },
        { id: "q", pos: 45, top: 1300 },
      ],
    );
    const item = createFurnitureItem("art", { type: "block", blockId: "p" }, { x: 10, y: 5, props: { src: "a.png" } });
    const w = mountLayer(editor, [item]);
    await w.setProps({ furniture: [{ ...item, anchor: { type: "block", blockId: "q" } }] });
    expect(w.find(".sc-editor-furniture-page[data-chapter-page='2'] [data-furniture-id]").exists()).toBe(true);
    expect(w.emitted("moved")).toBeUndefined();
    w.unmount();
  });

  it("a page anchor past the chapter's end is drawn on the last page with a note that says so", () => {
    const { editor } = fakeEditor([page1, page2], []);
    const item = createFurnitureItem("art", { type: "page", chapterId: "c1", page: 5 }, { props: { src: "a.png" } });
    const w = mountLayer(editor, [item]);
    expect(w.find(".sc-editor-furniture-page[data-chapter-page='2'] [data-furniture-id]").exists()).toBe(true);
    expect(w.find(".sc-gone-note").text()).toBe("Page 5 is gone; this waits on the last page.");
    w.unmount();
  });

  it("selecting a picture that follows a paragraph shows the anchor mark level with that paragraph", () => {
    const { editor } = fakeEditor([page1, page2], [{ id: "p", pos: 5, top: 300 }]);
    const item = createFurnitureItem("art", { type: "block", blockId: "p" }, { x: 10, y: 5, props: { src: "a.png" } });
    const w = mountLayer(editor, [item], item.id);
    expect(w.find<HTMLElement>("[data-anchor-mark]").element.style.top).toBe("290px"); // 300 - half the 20px mark
    w.unmount();
    const none = mountLayer(editor, [item], null);
    expect(none.find("[data-anchor-mark]").exists()).toBe(false);
    none.unmount();
  });

  it("dragging the anchor to another paragraph keeps the picture where it is", async () => {
    const under = { id: "q" };
    const { editor } = fakeEditor(
      [page1, page2],
      [
        { id: "p", pos: 5, top: 300 },
        { id: "q", pos: 20, top: 500 },
      ],
      under,
    );
    const item = createFurnitureItem("art", { type: "block", blockId: "p" }, { x: 10, y: 5, props: { src: "a.png" } });
    const w = mountLayer(editor, [item], item.id);
    const mark = w.find<HTMLElement>("[data-anchor-mark]").element;
    mark.dispatchEvent(new PointerEvent("pointerdown", { clientX: 5, clientY: 300, bubbles: true, cancelable: true }));
    window.dispatchEvent(new PointerEvent("pointerup", { clientX: 200, clientY: 510 }));
    const [[items]] = w.emitted("update:furniture") as [[PageFurnitureItem[]]];
    // Drawn at 35% down; paragraph q starts at 50%.
    expect(items[0].anchor).toEqual({ type: "block", blockId: "q" });
    expect(items[0].y).toBe(-15);
    w.unmount();
  });

  it("dropping the anchor on its own paragraph changes nothing", () => {
    const { editor } = fakeEditor([page1, page2], [{ id: "p", pos: 5, top: 300 }], { id: "p" });
    const item = createFurnitureItem("art", { type: "block", blockId: "p" }, { x: 10, y: 5, props: { src: "a.png" } });
    const w = mountLayer(editor, [item], item.id);
    w.find<HTMLElement>("[data-anchor-mark]").element.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true }));
    window.dispatchEvent(new PointerEvent("pointerup", { clientX: 200, clientY: 310 }));
    expect(w.emitted("update:furniture")).toBeUndefined();
    w.unmount();
  });
});
