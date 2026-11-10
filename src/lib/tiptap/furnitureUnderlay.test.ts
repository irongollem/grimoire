// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from "vitest";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { FurnitureUnderlay, type FurnitureUnderlayStorage } from "@/lib/tiptap/furnitureUnderlay";

let editor: Editor | null = null;
afterEach(() => {
  editor?.destroy();
  editor = null;
});

function make(html: string): Editor {
  const el = document.createElement("div");
  document.body.appendChild(el);
  return new Editor({ element: el, content: html, extensions: [StarterKit, FurnitureUnderlay] });
}
const storageOf = (ed: Editor) => (ed.storage as unknown as { furnitureUnderlay: FurnitureUnderlayStorage }).furnitureUnderlay;

describe("FurnitureUnderlay", () => {
  it("draws one hidden, non-editable surface inside the editor and exposes it", () => {
    editor = make("<p>one</p><p>two</p>");
    const found = editor.view.dom.querySelectorAll(".sc-furniture-underlay");
    expect(found).toHaveLength(1);
    expect(storageOf(editor).element).toBe(found[0]);
    expect(found[0].getAttribute("contenteditable")).toBe("false");
    expect(found[0].getAttribute("aria-hidden")).toBe("true");
  });

  it("keeps the same surface, with what was drawn into it, while the author types", () => {
    editor = make("<p>one</p>");
    const el = storageOf(editor).element!;
    el.appendChild(document.createElement("img"));
    editor.commands.insertContentAt(editor.state.doc.content.size, "<p>more</p>");
    expect(editor.view.dom.querySelectorAll(".sc-furniture-underlay")).toHaveLength(1);
    expect(storageOf(editor).element).toBe(el);
    expect(el.querySelector("img")).not.toBeNull();
  });

  it("does not become the first child, so the placeholder's first-child rule still finds the paragraph", () => {
    editor = make("<p></p>");
    expect(editor.view.dom.firstElementChild?.tagName).toBe("P");
  });
});
