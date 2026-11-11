// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { Schema } from "@tiptap/pm/model";
import { EditorState } from "@tiptap/pm/state";
import { NO_MARKERS, pageMarkerTransaction, readPageMarkers } from "./pageMarkers";
import type { PageBox } from "@/scriptorium/tiptap/pageFlow";

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { group: "block", content: "text*" },
    text: { group: "inline" },
    skipCounting: { group: "block", atom: true, attrs: { keepFooter: { default: false } } },
    resetCounting: { group: "block", atom: true },
  },
});

const p = (text: string) => schema.nodes.paragraph.create(null, schema.text(text));
/** Three paragraphs of 3 chars: each node is 5 wide, so they start at 0, 5 and 10. */
function stateWith() {
  return EditorState.create({ doc: schema.nodes.doc.create(null, [p("one"), p("two"), p("six")]) });
}
const pages = (...starts: number[]): PageBox[] =>
  starts.map((startPos, i) => ({ page: i + 1, startPos, contentTop: 0, contentHeight: 100 }));

function apply(state: EditorState, page: number, next: Parameters<typeof pageMarkerTransaction>[3], box = pages(0, 5, 10)) {
  const tr = pageMarkerTransaction(state, box, page, next);
  return tr ? state.apply(tr) : state;
}

describe("page markers as choices about one page", () => {
  it("a new marker lands at the page's own first block, so it is on that page and no other", () => {
    // Bug caught: a marker put at the caret or the chapter start numbers the wrong page.
    const s = apply(stateWith(), 2, { ...NO_MARKERS, noFooter: true, dontCount: true });
    expect(s.doc.child(1).type.name).toBe("skipCounting");
    // The page breaks are mapped through the insert: page 2 keeps its start, page 3 moves one on.
    const moved = pages(0, 5, 11);
    expect(readPageMarkers(s.doc, moved, 2).noFooter).toBe(true);
    expect(readPageMarkers(s.doc, moved, 1)).toEqual(NO_MARKERS);
    expect(readPageMarkers(s.doc, moved, 3)).toEqual(NO_MARKERS);
  });

  it("'Don't count' keeps the footer; 'No footer' takes it away", () => {
    // Bug caught: both choices writing the same marker makes one of them do nothing.
    const kept = apply(stateWith(), 1, { ...NO_MARKERS, dontCount: true });
    expect(kept.doc.child(0).attrs.keepFooter).toBe(true);
    expect(readPageMarkers(kept.doc, pages(0, 6, 11), 1)).toEqual({ noFooter: false, dontCount: true, restart: false });
    const none = apply(kept, 1, { ...NO_MARKERS, noFooter: true, dontCount: true }, pages(0, 6, 11));
    expect(none.doc.child(0).attrs.keepFooter).toBe(false);
    expect(none.doc.childCount).toBe(4);
  });

  it("turning a choice off removes its marker and leaves the text alone", () => {
    // Bug caught: leaving the marker behind keeps the page unnumbered after the DM undid the choice.
    const on = apply(stateWith(), 3, { ...NO_MARKERS, noFooter: true, dontCount: true });
    const off = apply(on, 3, NO_MARKERS, pages(0, 5, 10));
    expect(off.doc.toJSON()).toEqual(stateWith().doc.toJSON());
  });

  it("restart and skip are both kept when both are chosen", () => {
    const s = apply(stateWith(), 2, { noFooter: false, dontCount: true, restart: true });
    expect(s.doc.child(1).type.name).toBe("resetCounting");
    expect(s.doc.child(2).type.name).toBe("skipCounting");
    expect(readPageMarkers(s.doc, pages(0, 5, 12), 2)).toEqual({ noFooter: false, dontCount: true, restart: true });
  });

  it("a page that starts in the middle of a paragraph takes its marker after that paragraph", () => {
    // Bug caught: a marker inside the page's first paragraph cannot exist; one before it lands on the previous page.
    const s = apply(stateWith(), 2, { ...NO_MARKERS, noFooter: true, dontCount: true }, pages(0, 7, 10));
    expect(s.doc.child(1).type.name).toBe("paragraph");
    expect(s.doc.child(2).type.name).toBe("skipCounting");
  });

  it("changes nothing for a page that is not laid out, or that already has the choice", () => {
    const s = stateWith();
    expect(pageMarkerTransaction(s, pages(0, 5, 10), 9, { ...NO_MARKERS, noFooter: true })).toBeNull();
    expect(pageMarkerTransaction(s, pages(0, 5, 10), 1, NO_MARKERS)).toBeNull();
  });
});
