// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { createScriptoriumExtensions } from "@/scriptorium/lib/scriptoriumExtensions";
import { flagsFromHtml } from "@/scriptorium/lib/pageNumbering";

let editor: Editor | null = null;
afterEach(() => {
  editor?.destroy();
  editor = null;
});

function make(content: object[]): Editor {
  editor = new Editor({
    element: document.createElement("div"),
    content: { type: "doc", content },
    extensions: createScriptoriumExtensions(),
  });
  return editor;
}

describe("skipCounting's keepFooter", () => {
  it("prints as the marker the numbering reads, and the numbering sees it keeps its footer", () => {
    // Bug caught: an attribute the HTML does not carry, or in an order the numbering's pattern misses, prints "Don't count" as "No footer".
    const kept = make([{ type: "skipCounting", attrs: { keepFooter: true } }]).getHTML();
    expect(flagsFromHtml(kept)).toMatchObject({ hasSkip: true, keepsFooter: true });
    const plain = make([{ type: "skipCounting" }]).getHTML();
    expect(plain).not.toContain("data-keep-footer");
    expect(flagsFromHtml(plain)).toMatchObject({ hasSkip: true, keepsFooter: false });
  });

  it("reads back from saved HTML, and a marker saved before the choice existed means no footer", () => {
    // Bug caught: a stored book changing how it prints because the new attribute defaulted the other way.
    const kept = make([]);
    kept.commands.setContent('<div data-type="skip-counting" data-keep-footer="true"></div>');
    expect(kept.getJSON().content?.[0]?.attrs?.keepFooter).toBe(true);
    kept.commands.setContent('<div data-type="skip-counting"></div>');
    expect(kept.getJSON().content?.[0]?.attrs?.keepFooter).toBe(false);
  });
});
