import { describe, it, expect, afterEach } from "vitest";
import { Editor, Node } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { AiGenerated } from "./AiGenerated";
import { insertionPos } from "./insertionPos";

const CustomDocument = Node.create({
  name: "doc",
  topNode: true,
  content: "block+",
  addAttributes() {
    return { twoColumn: { default: false } };
  },
});

let editor: Editor | null = null;
afterEach(() => {
  editor?.destroy();
  editor = null;
});

function makeEditor(content: string | object = "") {
  return new Editor({
    element: document.createElement("div"),
    content,
    extensions: [StarterKit.configure({ document: false }), CustomDocument, AiGenerated],
  });
}

const CHRONICLE = { type: "aiGenerated", attrs: { model: null }, content: [{ type: "paragraph", content: [{ type: "text", text: "AI recap." }] }] };

describe("insertionPos", () => {
  it("appends when no cursor has been placed, instead of landing above the DM's own notes", () => {
    editor = makeEditor("<p>Prep notes.</p><p>More prep.</p>");
    // The untouched selection sits at the very top — the trap this exists for.
    expect(editor.state.selection.to).toBe(1);

    editor.chain().insertContentAt(insertionPos(editor, false), CHRONICLE).run();
    // The trailing empty paragraph is ProseMirror giving the DM somewhere to
    // type after a block node that ends the document.
    expect(editor.getHTML()).toBe(
      '<p>Prep notes.</p><p>More prep.</p><div data-ai-generated="true"><p>AI recap.</p></div><p></p>',
    );
  });

  it("honours a cursor the DM actually placed", () => {
    editor = makeEditor("<p>Prep notes.</p><p>More prep.</p>");
    editor.commands.setTextSelection(13); // end of the first paragraph

    editor.chain().insertContentAt(insertionPos(editor, true), CHRONICLE).run();
    expect(editor.getHTML()).toBe(
      '<p>Prep notes.</p><div data-ai-generated="true"><p>AI recap.</p></div><p>More prep.</p>',
    );
  });

  it("inserts after an aiGenerated wrapper rather than nesting inside it", () => {
    editor = makeEditor({ type: "doc", content: [CHRONICLE] });
    editor.commands.focus("end"); // cursor now sits inside the first chronicle

    editor.chain().insertContentAt(insertionPos(editor, true), CHRONICLE).run();
    const html = editor.getHTML();
    expect(html).toBe(
      '<div data-ai-generated="true"><p>AI recap.</p></div><div data-ai-generated="true"><p>AI recap.</p></div><p></p>',
    );
    // Belt and braces, structurally: no wrapper may contain another.
    const doc = editor.getJSON();
    const wrappers = (doc.content ?? []).filter((n) => n.type === "aiGenerated");
    expect(wrappers).toHaveLength(2);
    for (const w of wrappers) {
      expect((w.content ?? []).some((c) => c.type === "aiGenerated")).toBe(false);
    }
  });

  it("appends into an empty document without throwing", () => {
    editor = makeEditor("");
    editor.chain().insertContentAt(insertionPos(editor, false), CHRONICLE).run();
    expect(editor.getHTML()).toContain('data-ai-generated="true"');
  });
});
