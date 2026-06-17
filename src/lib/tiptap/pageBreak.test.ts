import { describe, it, expect, afterEach } from "vitest";
import { Editor } from "@tiptap/core";
import { createScriptoriumExtensions } from "@/lib/scriptorium/scriptoriumExtensions";

let editor: Editor | null = null;
afterEach(() => {
  editor?.destroy();
  editor = null;
});

function makeEditor(content: string | object = "") {
  return new Editor({
    element: document.createElement("div"),
    content,
    extensions: createScriptoriumExtensions(),
  });
}

describe("PageBreak node", () => {
  it("inserts via command and renders div.sc-page-break", () => {
    editor = makeEditor("<p>before</p>");
    editor.commands.insertPageBreak();
    expect(editor.getHTML()).toContain('data-type="page-break"');
    expect(editor.getHTML()).toContain("sc-page-break");
  });

  it("round-trips through JSON as a pageBreak node", () => {
    editor = makeEditor("<p>a</p>");
    editor.commands.insertPageBreak();
    const json = editor.getJSON();
    const types = (json.content ?? []).map((n) => n.type);
    expect(types).toContain("pageBreak");
  });

  it("parses existing page-break markup back into the node", () => {
    editor = makeEditor('<p>a</p><div data-type="page-break"></div><p>b</p>');
    const types = (editor.getJSON().content ?? []).map((n) => n.type);
    expect(types).toContain("pageBreak");
  });

  it("does not hijack <hr> parsing (StarterKit horizontalRule still wins)", () => {
    editor = makeEditor("<p>a</p><hr><p>b</p>");
    const types = (editor.getJSON().content ?? []).map((n) => n.type);
    expect(types).toContain("horizontalRule");
    expect(types).not.toContain("pageBreak");
  });
});
