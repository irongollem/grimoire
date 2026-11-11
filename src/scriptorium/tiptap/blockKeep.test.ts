// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { Editor, generateHTML, generateJSON } from "@tiptap/core";
import { createScriptoriumExtensions } from "@/scriptorium/lib/scriptoriumExtensions";
import { KEEPABLE_BLOCKS } from "@/scriptorium/tiptap/blockKeep";

let editor: Editor | null = null;
afterEach(() => {
  editor?.destroy();
  editor = null;
});

const HTML_FOR: Record<(typeof KEEPABLE_BLOCKS)[number], string> = {
  descriptiveBlock: '<div data-type="descriptiveBlock" class="sc-descriptive"%><p>x</p></div>',
  noteBlock: '<div data-type="noteBlock" class="sc-note"%><p>x</p></div>',
  quoteBlock: '<div data-type="quoteBlock" class="sc-quote"%><p>x</p></div>',
  wideBlock: '<div data-type="wide-block" class="sc-wide"%><p>x</p></div>',
  blockquote: "<blockquote%><p>x</p></blockquote>",
  table: "<table%><tbody><tr><td><p>x</p></td></tr></tbody></table>",
};

describe("keep on one page", () => {
  // Fails on: a block losing the flag in the layout's HTML round trip, so the PDF splits what the writer kept whole;
  // run for every block that has the panel switch, since each is its own node with its own renderHTML.
  it.each(KEEPABLE_BLOCKS)("%s keeps data-keep through the HTML the layout reads back", (name) => {
    const extensions = createScriptoriumExtensions();
    const json = generateJSON(HTML_FOR[name].replace("%", ' data-keep="true"'), extensions);
    const node = json.content?.[0];
    expect(node?.type).toBe(name);
    expect(node?.attrs?.keepTogether).toBe(true);
    expect(generateHTML(json, extensions)).toContain('data-keep="true"');
  });

  // Fails on: every block printing data-keep (default true), making each box unbreakable.
  it.each(KEEPABLE_BLOCKS)("%s is not kept by default and prints no attribute", (name) => {
    const extensions = createScriptoriumExtensions();
    const json = generateJSON(HTML_FOR[name].replace("%", ""), extensions);
    expect(json.content?.[0].attrs?.keepTogether).toBe(false);
    expect(generateHTML(json, extensions)).not.toContain("data-keep");
  });

  it("a paragraph cannot be kept: it has no such attribute", () => {
    editor = new Editor({ element: document.createElement("div"), content: "<p>x</p>", extensions: createScriptoriumExtensions() });
    expect(editor.state.doc.child(0).attrs).not.toHaveProperty("keepTogether");
  });
});
