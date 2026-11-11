// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { effectScope, nextTick, ref, shallowRef } from "vue";
import { Editor } from "@tiptap/core";
import type { JSONContent } from "@tiptap/core";
import { createScriptoriumExtensions } from "@/scriptorium/lib/scriptoriumExtensions";
import { PageFlow, type PageFlowStorage } from "@/scriptorium/tiptap/pageFlow";
import { deriveSelection, selectionKey, useScriptoriumSelection, type SelectionInputs } from "./useScriptoriumSelection";
import type { FurnitureKind } from "@/scriptorium/types";

const none: SelectionInputs = { node: null, coverPos: null, blockPos: null, furniture: null, footer: null, page: 3 };

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
    expect(deriveSelection({ ...none, node: { name: "tocBlock", pos: 6 } })).toEqual({ kind: "contents", pos: 6 });
    // Fails on: a selected divider falling through to the page section, so its style can never be changed.
    expect(deriveSelection({ ...none, node: { name: "divider", pos: 7 } })).toEqual({ kind: "divider", pos: 7 });
  });

  // Fails on: a clicked footer losing to the text's selection, so the panel never shows the footer's options.
  it("a clicked footer wins over the text's selection, and a placed picture wins over the footer", () => {
    expect(deriveSelection({ ...none, footer: 15, node: { name: "image", pos: 4 } })).toEqual({ kind: "footer", page: 15 });
    expect(deriveSelection({ ...none, footer: 15, furniture: { id: "f", kind: "art" } }).kind).toBe("picture");
  });

  // Fails on: a node that has no section (a spacer) hiding the page the panel should describe.
  it("describes the page when nothing it has a section for is selected", () => {
    expect(deriveSelection({ ...none, node: { name: "spacerVertical", pos: 2 } })).toEqual({ kind: "page", page: 3 });
    expect(deriveSelection(none)).toEqual({ kind: "page", page: 3 });
  });

  // Fails on: a read-aloud, sidebar or table having no panel (Keep on one page, Across both columns), on the
  // selected box or on a caret inside it, or the box beating a cover that holds it.
  it("a selected box, or a caret inside one, is a block; a cover holding it still wins", () => {
    expect(deriveSelection({ ...none, node: { name: "descriptiveBlock", pos: 8 } })).toEqual({ kind: "block", pos: 8 });
    expect(deriveSelection({ ...none, blockPos: 12 })).toEqual({ kind: "block", pos: 12 });
    expect(deriveSelection({ ...none, blockPos: 12, coverPos: 0 })).toEqual({ kind: "cover", pos: 0 });
  });

  it("a cursor inside a cover is the cover", () => {
    expect(deriveSelection({ ...none, coverPos: 0 })).toEqual({ kind: "cover", pos: 0 });
  });

  it("tells one selection from another by key", () => {
    expect(selectionKey({ kind: "picture", source: "node", pos: 4 })).not.toBe(selectionKey({ kind: "picture", source: "node", pos: 5 }));
    expect(selectionKey({ kind: "page", page: 1 })).toBe(selectionKey({ kind: "page", page: 2 }));
    expect(selectionKey({ kind: "footer", page: 14 })).not.toBe(selectionKey({ kind: "footer", page: 15 }));
  });
});

let editor: Editor | null = null;
afterEach(() => {
  editor?.destroy();
  editor = null;
});

describe("useScriptoriumSelection", () => {
  function setup(content?: JSONContent) {
    const ed = new Editor({
      element: document.createElement("div"),
      content: content ?? {
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

  // Fails on: the caret inside a box naming no block, so Keep on one page never shows; and on the outer
  // box winning when the caret is in a table inside it (the panel must describe the thing the caret is in).
  it("is the innermost box around the caret", async () => {
    const { ed, selection, scope } = setup({
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Before" }] },
        {
          type: "wideBlock",
          content: [
            { type: "noteBlock", content: [{ type: "paragraph", content: [{ type: "text", text: "Inside" }] }] },
          ],
        },
      ],
    });
    const wide = ed.state.doc.child(0).nodeSize;
    ed.commands.setTextSelection(wide + 4);
    await nextTick();
    expect(selection.value).toEqual({ kind: "block", pos: wide + 1 });
    ed.commands.setTextSelection(2);
    await nextTick();
    expect(selection.value.kind).toBe("page");
    scope.stop();
  });
});
