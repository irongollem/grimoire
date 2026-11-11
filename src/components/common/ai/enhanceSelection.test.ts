// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { NodeSelection, TextSelection } from "@tiptap/pm/state";
import { hasTextToEnhance } from "./enhanceSelection";

let editor: Editor | null = null;
afterEach(() => {
  editor?.destroy();
  editor = null;
});

function make(): Editor {
  editor = new Editor({
    extensions: [StarterKit, Image],
    content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "The inn" }] }, { type: "image", attrs: { src: "a.webp" } }] },
  });
  return editor;
}

describe("hasTextToEnhance", () => {
  // Fails on: Enhance offered over a selected picture, its bubble covering the heading above it.
  it("is false for a selected picture", () => {
    const ed = make();
    const imagePos = ed.state.doc.firstChild?.nodeSize ?? 0;
    ed.view.dispatch(ed.state.tr.setSelection(NodeSelection.create(ed.state.doc, imagePos)));
    const { from, to } = ed.state.selection;
    expect(hasTextToEnhance({ editor: ed, from, to })).toBe(false);
  });

  it("is true for selected prose, and false for a caret or a read-only editor", () => {
    const ed = make();
    ed.view.dispatch(ed.state.tr.setSelection(TextSelection.create(ed.state.doc, 1, 8)));
    expect(hasTextToEnhance({ editor: ed, from: 1, to: 8 })).toBe(true);
    expect(hasTextToEnhance({ editor: ed, from: 3, to: 3 })).toBe(false);
    ed.setEditable(false);
    expect(hasTextToEnhance({ editor: ed, from: 1, to: 8 })).toBe(false);
  });
});
