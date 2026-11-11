// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { effectScope, nextTick, ref, shallowRef } from "vue";
import { Editor } from "@tiptap/core";
import { createScriptoriumExtensions } from "@/scriptorium/lib/scriptoriumExtensions";
import { PageFlow, type PageFlowStorage } from "@/scriptorium/tiptap/pageFlow";
import { deriveSelection, selectionKey, useScriptoriumSelection, type SelectionInputs } from "./useScriptoriumSelection";
import type { FurnitureKind } from "@/scriptorium/types";

const none: SelectionInputs = { node: null, coverPos: null, furniture: null, page: 3 };

describe("deriveSelection", () => {
  // Fails on: the panel showing a stale text-selected picture while the DM is dragging art on the page.
  it("a picture the DM pressed on the page wins over a node the text still has selected", () => {
    expect(deriveSelection({ ...none, node: { name: "image", pos: 4 }, furniture: { id: "f1", kind: "art" } })).toEqual({
      kind: "picture",
      source: "furniture",
      id: "f1",
    });
  });

  it.each([
    ["watercolor", "decoration"],
    ["watermark", "decoration"],
    ["artistCredit", "decoration"],
    ["art", "picture"],
  ] as [FurnitureKind, string][])("selected %s furniture is a %s", (kind, expected) => {
    expect(deriveSelection({ ...none, furniture: { id: "f", kind } }).kind).toBe(expected);
  });

  it("names the node kinds the text can select", () => {
    expect(deriveSelection({ ...none, node: { name: "image", pos: 4 } })).toEqual({ kind: "picture", source: "node", pos: 4 });
    expect(deriveSelection({ ...none, node: { name: "entityEmbed", pos: 9 } })).toEqual({ kind: "embed", pos: 9 });
    expect(deriveSelection({ ...none, node: { name: "coverPage", pos: 0 } })).toEqual({ kind: "cover", pos: 0 });
  });

  // Fails on: a node that has no section (a table, a callout) hiding the page the panel should describe.
  it("describes the page when nothing it has a section for is selected", () => {
    expect(deriveSelection({ ...none, node: { name: "table", pos: 2 } })).toEqual({ kind: "page", page: 3 });
    expect(deriveSelection(none)).toEqual({ kind: "page", page: 3 });
  });

  it("a cursor inside a cover is the cover", () => {
    expect(deriveSelection({ ...none, coverPos: 0 })).toEqual({ kind: "cover", pos: 0 });
  });

  it("tells one selection from another by key", () => {
    expect(selectionKey({ kind: "picture", source: "node", pos: 4 })).not.toBe(selectionKey({ kind: "picture", source: "node", pos: 5 }));
    expect(selectionKey({ kind: "page", page: 1 })).toBe(selectionKey({ kind: "page", page: 2 }));
  });
});

let editor: Editor | null = null;
afterEach(() => {
  editor?.destroy();
  editor = null;
});

describe("useScriptoriumSelection", () => {
  function setup() {
    const ed = new Editor({
      element: document.createElement("div"),
      content: {
        type: "doc",
        content: [
          { type: "paragraph", attrs: { blockId: "b1" }, content: [{ type: "text", text: "One" }] },
          { type: "image", attrs: { src: "p.webp" } },
          { type: "paragraph", attrs: { blockId: "b2" }, content: [{ type: "text", text: "Two" }] },
        ],
      },
      extensions: [...createScriptoriumExtensions(), PageFlow],
    });
    editor = ed;
    const second = ed.state.doc.child(0).nodeSize + ed.state.doc.child(1).nodeSize;
    (ed.storage as unknown as { pageFlow: PageFlowStorage }).pageFlow.pages = [
      { page: 1, startPos: 0, contentTop: 0, contentHeight: 900 },
      { page: 2, startPos: second, contentTop: 900, contentHeight: 900 },
    ];
    const furniture = ref<{ id: string; kind: FurnitureKind } | null>(null);
    const scope = effectScope();
    const result = scope.run(() => useScriptoriumSelection({ editor: shallowRef<Editor | undefined>(ed), furniture: () => furniture.value }));
    if (!result) throw new Error("no scope");
    return { ed, furniture, ...result, scope };
  }

  // Fails on: the panel not following the editor, so it keeps describing the page after a picture is clicked in the text.
  it("follows the editor from the page to a selected picture and back", async () => {
    const { ed, selection, scope } = setup();
    ed.commands.setTextSelection(2);
    await nextTick();
    expect(selection.value).toEqual({ kind: "page", page: 1 });
    ed.commands.setNodeSelection(ed.state.doc.child(0).nodeSize);
    await nextTick();
    expect(selection.value).toEqual({ kind: "picture", source: "node", pos: 5 });
    ed.commands.setTextSelection(ed.state.doc.content.size - 2);
    await nextTick();
    expect(selection.value).toEqual({ kind: "page", page: 2 });
    scope.stop();
  });

  it("says which page the caret is on from the laid-out pages", async () => {
    const { ed, selection, scope } = setup();
    ed.commands.setTextSelection(ed.state.doc.content.size - 2);
    await nextTick();
    expect(selection.value).toMatchObject({ kind: "page", page: 2 });
    scope.stop();
  });

  it("is the selected furniture when the shell has one", async () => {
    const { furniture, selection, version, scope } = setup();
    furniture.value = { id: "f1", kind: "watermark" };
    version.value++;
    await nextTick();
    expect(selection.value).toEqual({ kind: "decoration", id: "f1" });
    scope.stop();
  });
});
