// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { Editor, generateHTML, generateJSON } from "@tiptap/core";
import { createScriptoriumExtensions } from "@/scriptorium/lib/scriptoriumExtensions";

let editor: Editor | null = null;
afterEach(() => {
  editor?.destroy();
  editor = null;
});

function open(html: string): Editor {
  editor = new Editor({ element: document.createElement("div"), content: html, extensions: createScriptoriumExtensions() });
  return editor;
}

describe("drop cap", () => {
  // Fails on: the toggle flagging every paragraph, or the paragraph the caret is not in.
  it("flags only the paragraph the caret is in, and a second toggle takes it off", () => {
    const ed = open("<p>One</p><p>Two</p>");
    ed.commands.setTextSelection(ed.state.doc.child(0).nodeSize + 2);
    const flags = () => [0, 1].map((i) => ed.state.doc.child(i).attrs.dropCap);
    ed.commands.toggleDropCap();
    expect(flags()).toEqual([false, true]);
    expect(ed.getHTML()).toContain('class="sc-drop-cap">Two');
    ed.commands.toggleDropCap();
    expect(flags()).toEqual([false, false]);
    expect(ed.getHTML()).not.toContain("sc-drop-cap");
  });

  // Fails on: the drop cap disappearing when a book is laid out, because the layout reads the document back
  // through generateJSON and the flag was only in the editor's state.
  it("survives the trip the layout makes: to HTML and back", () => {
    const extensions = createScriptoriumExtensions();
    const json = generateJSON('<p class="sc-drop-cap">Once</p><p>Plain</p>', extensions);
    expect(json.content?.[0].attrs?.dropCap).toBe(true);
    expect(json.content?.[1].attrs?.dropCap).toBe(false);
    expect(generateHTML(json, extensions)).toContain('<p class="sc-drop-cap">Once</p>');
  });

  // Fails on: the toggle reporting success when the caret is in no paragraph (a heading), so the toolbar lights up for nothing.
  it("does nothing in a heading", () => {
    const ed = open("<h2>Title</h2>");
    ed.commands.setTextSelection(2);
    expect(ed.commands.toggleDropCap()).toBe(false);
    expect(ed.getHTML()).not.toContain("sc-drop-cap");
  });
});
