// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { createScriptoriumExtensions } from "@/scriptorium/lib/scriptoriumExtensions";
import { placeKitItem } from "./placeKitItem";

let editor: Editor | null = null;
afterEach(() => {
  editor?.destroy();
  editor = null;
});
function open(html: string): Editor {
  editor = new Editor({ element: document.createElement("div"), content: html, extensions: createScriptoriumExtensions() });
  return editor;
}
const types = (ed: Editor) => (ed.getJSON().content ?? []).map((n) => n.type);
const text = (ed: Editor, i: number) => ed.state.doc.child(i).textContent;

describe("placeKitItem", () => {
  // Fails on: a click splitting the paragraph the writer is typing in, with the block landing mid-sentence.
  it("a click lands after the paragraph the caret is in, not inside it", () => {
    const ed = open("<p>Hello world</p><p>Next</p>");
    ed.commands.setTextSelection(4);
    placeKitItem(ed, { kind: "block", label: "Descriptive (Read-Aloud)" });
    expect(types(ed).slice(0, 3)).toEqual(["paragraph", "descriptiveBlock", "paragraph"]);
    expect(text(ed, 0)).toBe("Hello world");
  });

  // Fails on: an empty line being left behind above the block, one stray paragraph per insert.
  it("an empty line is used, not left behind", () => {
    const ed = open("<p>Hello</p><p></p>");
    ed.commands.setTextSelection(ed.state.doc.content.size - 1);
    placeKitItem(ed, { kind: "block", label: "Table" });
    expect(types(ed).slice(0, 2)).toEqual(["paragraph", "table"]);
  });

  // Fails on: a drop landing at the caret rather than at the drop line.
  it("a drop lands at the boundary it names", () => {
    const ed = open("<p>One</p><p>Two</p>");
    ed.commands.setTextSelection(2);
    placeKitItem(ed, { kind: "block", label: "Page Break" }, { at: ed.state.doc.child(0).nodeSize });
    expect(types(ed).slice(0, 3)).toEqual(["paragraph", "pageBreak", "paragraph"]);
    expect(text(ed, 0)).toBe("One");
  });

  // Fails on: Drop cap giving the writer a new empty paragraph instead of flagging the one under the pointer.
  it("an in-place entry works on the text, with no line of its own", () => {
    const ed = open("<p>One</p><p>Two</p>");
    placeKitItem(ed, { kind: "block", label: "Drop cap" }, { at: 0, pointer: ed.state.doc.child(0).nodeSize + 2 });
    expect(ed.state.doc.childCount).toBe(2);
    expect(ed.state.doc.child(1).attrs.dropCap).toBe(true);
    expect(ed.state.doc.child(0).attrs.dropCap).toBe(false);
  });

  // Fails on: Column Break going into a one-column book, or a block that does not exist inserting a blank line.
  it("refuses a block that is not allowed here or does not exist, and changes nothing", () => {
    const ed = open("<p>One</p>");
    const before = ed.getHTML();
    expect(placeKitItem(ed, { kind: "block", label: "Column Break" }, { isTwoColumn: false })).toBe(false);
    expect(placeKitItem(ed, { kind: "block", label: "No such block" })).toBe(false);
    expect(ed.getHTML()).toBe(before);
  });

  // Fails on: a quest or NPC taking its own page (the node default is true), or the wrong ids on the embed.
  it("a campaign entry becomes a linked entry; only a monster starts its own page", () => {
    const ed = open("<p>One</p>");
    placeKitItem(ed, { kind: "entity", entityType: "quest", entityId: "q1", name: "Heist" });
    placeKitItem(ed, { kind: "entity", entityType: "monster", entityId: "m1", name: "Drudge" });
    const embeds = (ed.getJSON().content ?? []).filter((n) => n.type === "entityEmbed");
    expect(embeds.map((n) => [n.attrs?.entityType, n.attrs?.entityId, n.attrs?.startsPage])).toEqual([
      ["quest", "q1", false],
      ["monster", "m1", true],
    ]);
  });

  it("a picture becomes a picture in the text", () => {
    const ed = open("<p>One</p>");
    placeKitItem(ed, { kind: "art", src: "https://x/y.png" });
    const image = (ed.getJSON().content ?? []).find((n) => n.type === "image");
    expect(image?.attrs?.src).toBe("https://x/y.png");
  });
});
