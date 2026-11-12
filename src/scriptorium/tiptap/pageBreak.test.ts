// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from "vitest";
import { Editor } from "@tiptap/core";
import { createScriptoriumExtensions } from "@/scriptorium/lib/scriptoriumExtensions";
import { breakPageHere } from "@/scriptorium/tiptap/pageBreak";

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

  it("parses existing page-break markup back into the node", () => {
    editor = makeEditor('<p>a</p><div data-type="page-break"></div><p>b</p>');
    const types = (editor.getJSON().content ?? []).map((n) => n.type);
    expect(types).toContain("pageBreak");
  });

  /** The doc's top-level shape as "type:text". */
  function shape(ed: Editor): string[] {
    const out: string[] = [];
    ed.state.doc.forEach((n) => out.push(`${n.type.name}:${n.textContent}`));
    return out;
  }
  function caretBlockText(ed: Editor): string {
    return ed.state.selection.$from.parent.textContent;
  }
  function pressCtrlEnter(ed: Editor): boolean {
    const event = new KeyboardEvent("keydown", { key: "Enter", ctrlKey: true, bubbles: true });
    return ed.view.someProp("handleKeyDown", (f) => f(ed.view, event)) ?? false;
  }

  it("Ctrl+Enter in the middle of a paragraph sends the rest to a new page, caret with it", () => {
    editor = makeEditor("<p>before after</p>");
    editor.commands.setTextSelection(8); // after "before "
    expect(pressCtrlEnter(editor)).toBe(true);
    expect(shape(editor)).toEqual(["paragraph:before ", "pageBreak:", "paragraph:after"]);
    expect(caretBlockText(editor)).toBe("after");
    expect(editor.state.selection.$from.parentOffset).toBe(0);
  });

  it("at the start of a block the break goes before it, without an empty paragraph", () => {
    editor = makeEditor("<p>one</p><p>two</p>");
    editor.commands.setTextSelection(6); // start of "two"
    breakPageHere(editor);
    expect(shape(editor)).toEqual(["paragraph:one", "pageBreak:", "paragraph:two"]);
    expect(caretBlockText(editor)).toBe("two");
  });

  it("at the end of a heading the new page opens on an empty paragraph, not a heading", () => {
    editor = makeEditor("<h2>Title</h2><p>body</p>");
    editor.commands.setTextSelection(6); // end of "Title"
    breakPageHere(editor);
    expect(shape(editor)).toEqual(["heading:Title", "pageBreak:", "paragraph:", "paragraph:body"]);
    expect(editor.state.selection.$from.parent.type.name).toBe("paragraph");
  });

  /** The doc's top-level types, with a box's children in brackets. */
  function outline(ed: Editor): string[] {
    const out: string[] = [];
    ed.state.doc.forEach((n) => {
      if (n.type.name === "paragraph" || n.type.name === "pageBreak") return out.push(`${n.type.name}:${n.textContent}`);
      const children: string[] = [];
      n.forEach((c) => children.push(c.textContent));
      return out.push(`${n.type.name}[${children.join("|")}]`);
    });
    return out;
  }
  const BOX = '<p>intro</p><div data-type="descriptiveBlock"><p>first</p><p>second</p></div><p>outro</p>';

  it("at the start of a box the break goes before the whole box, never inside it", () => {
    editor = makeEditor(BOX);
    // doc: p(intro)=0..7, box opens at 7, its first paragraph's text starts at 9.
    editor.commands.setTextSelection(9);
    breakPageHere(editor);
    expect(outline(editor)).toEqual(["paragraph:intro", "pageBreak:", "descriptiveBlock[first|second]", "paragraph:outro"]);
    expect(caretBlockText(editor)).toBe("first");
  });

  it("in the middle of a box the box is split into two whole boxes with the break between", () => {
    editor = makeEditor(BOX);
    editor.commands.setTextSelection(16); // start of "second": 9 + "first".length + 2
    expect(caretBlockText(editor)).toBe("second");
    breakPageHere(editor);
    expect(outline(editor)).toEqual(["paragraph:intro", "descriptiveBlock[first]", "pageBreak:", "descriptiveBlock[second]", "paragraph:outro"]);
    expect(caretBlockText(editor)).toBe("second");
  });

  it("a numbered list broken across pages carries on counting", () => {
    editor = makeEditor("<ol><li><p>a</p></li><li><p>b</p></li><li><p>c</p></li></ol>");
    // ol 0, li 1, p 2, "a" 3; second li 5, p 6, "b" 7.
    editor.commands.setTextSelection(7);
    expect(caretBlockText(editor)).toBe("b");
    breakPageHere(editor);
    const lists = (editor.getJSON().content ?? []).filter((n) => n.type === "orderedList");
    expect(lists).toHaveLength(2);
    expect(lists[1].attrs?.start).toBe(2);
    expect(lists[1].content).toHaveLength(2);
  });

  it("in a table the key is left alone (a cell cannot break across pages)", () => {
    editor = makeEditor("<table><tbody><tr><td><p>x</p></td><td><p>yz</p></td></tr></tbody></table>");
    // Caret inside "yz", so no edge widens it out of the table.
    let pos = 0;
    editor.state.doc.descendants((n, p) => {
      if (n.isText && n.text === "yz") pos = p + 1;
    });
    editor.commands.setTextSelection(pos);
    const before = JSON.stringify(editor.getJSON());
    expect(breakPageHere(editor)).toBe(false);
    expect(JSON.stringify(editor.getJSON())).toBe(before);
  });

  it("a heading split in the middle stays a heading on the new page", () => {
    editor = makeEditor("<h2>Stage one</h2>");
    editor.commands.setTextSelection(7); // after "Stage "
    breakPageHere(editor);
    // (StarterKit's trailing node then adds an empty paragraph after a closing heading.)
    expect(shape(editor).slice(0, 3)).toEqual(["heading:Stage ", "pageBreak:", "heading:one"]);
  });

  it("in a code block the key is left alone", () => {
    editor = makeEditor("<pre><code>x = 1</code></pre>");
    editor.commands.setTextSelection(3);
    expect(breakPageHere(editor)).toBe(false);
    expect(shape(editor).some((s) => s.startsWith("pageBreak"))).toBe(false);
  });

  it("a read-only editor never breaks a page", () => {
    editor = makeEditor("<p>before after</p>");
    editor.setEditable(false);
    editor.commands.setTextSelection(8);
    expect(breakPageHere(editor)).toBe(false);
    expect(shape(editor)).toEqual(["paragraph:before after"]);
  });

  it("does not hijack <hr> parsing (StarterKit horizontalRule still wins)", () => {
    editor = makeEditor("<p>a</p><hr><p>b</p>");
    const types = (editor.getJSON().content ?? []).map((n) => n.type);
    expect(types).toContain("horizontalRule");
    expect(types).not.toContain("pageBreak");
  });
});
