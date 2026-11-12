// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { createScriptoriumExtensions } from "@/scriptorium/lib/scriptoriumExtensions";
import { setAcross, wideAround } from "./blockSpan";

let editor: Editor | null = null;
afterEach(() => {
  editor?.destroy();
  editor = null;
});
function open(html: string): Editor {
  editor = new Editor({ element: document.createElement("div"), content: html, extensions: createScriptoriumExtensions() });
  return editor;
}
const NOTE = '<div data-type="noteBlock" class="sc-note"><p>aside</p></div>';

describe("across both columns", () => {
  // Fails on: the switch wrapping the wrong block, or nothing at all, when the box is not first in the chapter.
  it("wraps the chosen block in a wide block and no other", () => {
    const ed = open(`<p>before</p>${NOTE}<p>after</p>`);
    const pos = ed.state.doc.child(0).nodeSize;
    expect(wideAround(ed.state.doc, pos)).toBeNull();
    setAcross(ed, pos, true);
    const names = [0, 1, 2].map((i) => ed.state.doc.child(i).type.name);
    expect(names).toEqual(["paragraph", "wideBlock", "paragraph"]);
    expect(ed.state.doc.child(1).child(0).type.name).toBe("noteBlock");
  });

  // Fails on: turning it off leaving an empty wide block, or deleting the box with it.
  it("takes the block back out and keeps its text", () => {
    const ed = open(`<div data-type="wide-block" class="sc-wide">${NOTE}</div>`);
    const note = 1;
    expect(wideAround(ed.state.doc, note)).toBe(0);
    setAcross(ed, note, false);
    expect(ed.state.doc.child(0).type.name).toBe("noteBlock");
    expect(ed.getHTML()).toContain("aside");
    expect(ed.getHTML()).not.toContain("sc-wide");
  });
});
