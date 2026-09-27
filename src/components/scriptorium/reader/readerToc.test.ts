import { describe, expect, it } from "vitest";
import { collectReaderToc } from "./readerToc";

/** Builds a small DOM subtree from an HTML string — collectReaderToc reads
 *  the live rendered DOM, not stored JSON (see the module doc for why), so
 *  its tests build markup shaped like what ScriptoriumDocumentView's Tiptap
 *  output actually renders rather than a Tiptap JSON document. */
function root(html: string): HTMLElement {
  const el = document.createElement("div");
  el.innerHTML = html;
  return el;
}

describe("collectReaderToc", () => {
  it("collects h1–h3 headings in document order with their text and blockId", () => {
    const doc = root(`
      <h1 data-block-id="b1">Chapter One</h1>
      <p>...</p>
      <h2 data-block-id="b2">A Section</h2>
    `);
    expect(collectReaderToc(doc)).toEqual([
      { blockId: "b1", level: 1, text: "Chapter One" },
      { blockId: "b2", level: 2, text: "A Section" },
    ]);
  });

  it("finds headings nested inside a wide block", () => {
    const doc = root('<div class="sc-wide"><h2 data-block-id="b1">Boxed Text</h2></div>');
    expect(collectReaderToc(doc)).toEqual([{ blockId: "b1", level: 2, text: "Boxed Text" }]);
  });

  // #915 story 6 round 2: the reader's contents list had no exclusion at all
  // for these — the printed book's own TOC (pagedToc.ts) already excludes
  // them, and the reader is meant to follow the same rule.
  it("excludes a heading used as a sidebar's own title (a run-in label, not document structure)", () => {
    const doc = root('<div class="sc-note"><h3 data-block-id="b1">DM Tip</h3></div>');
    expect(collectReaderToc(doc)).toEqual([]);
  });

  it("excludes a heading inside a read-aloud box", () => {
    const doc = root('<div class="sc-descriptive"><h2 data-block-id="b1">Not Structure</h2></div>');
    expect(collectReaderToc(doc)).toEqual([]);
  });

  it("excludes a regular heading nested inside a linked entity embed's own body", () => {
    const doc = root(
      '<div data-type="entity-embed" data-block-id="embed-1"><h2 data-block-id="b1">Identity</h2></div>',
    );
    expect(collectReaderToc(doc)).toEqual([]);
  });

  it("includes a monster/NPC entry's own name heading, keyed to its entityEmbed wrapper's blockId", () => {
    const doc = root(
      '<div data-type="entity-embed" data-block-id="embed-1">' +
        '<h2 class="sc-statblock-entry-heading">Owlbear</h2>' +
        '<div class="sc-statblock"><p class="sc-statblock-name">Owlbear</p></div>' +
        "</div>",
    );
    expect(collectReaderToc(doc)).toEqual([{ blockId: "embed-1", level: 2, text: "Owlbear" }]);
  });

  it("still counts an entry heading hidden by the no-lore modifier (visually hidden ≠ excluded)", () => {
    const doc = root(
      '<div data-type="entity-embed" data-block-id="embed-1">' +
        '<h2 class="sc-statblock-entry-heading sc-statblock-entry-heading--no-lore">Owlbear</h2>' +
        "</div>",
    );
    expect(collectReaderToc(doc)).toEqual([{ blockId: "embed-1", level: 2, text: "Owlbear" }]);
  });

  it("omits an entry heading whose entityEmbed wrapper has no blockId to scroll to", () => {
    const doc = root('<div data-type="entity-embed"><h2 class="sc-statblock-entry-heading">Owlbear</h2></div>');
    expect(collectReaderToc(doc)).toEqual([]);
  });

  it("keeps document order between regular headings and entry headings", () => {
    const doc = root(
      '<h1 data-block-id="b1">Chapter One</h1>' +
        '<div data-type="entity-embed" data-block-id="embed-1"><h2 class="sc-statblock-entry-heading">Owlbear</h2></div>' +
        '<h2 data-block-id="b2">Next Section</h2>',
    );
    expect(collectReaderToc(doc)).toEqual([
      { blockId: "b1", level: 1, text: "Chapter One" },
      { blockId: "embed-1", level: 2, text: "Owlbear" },
      { blockId: "b2", level: 2, text: "Next Section" },
    ]);
  });

  it("reads the full text of a heading that mixes marks (e.g. a bolded word mid-heading)", () => {
    const doc = root('<h1 data-block-id="b1">The <strong>Sunken</strong> Temple</h1>');
    expect(collectReaderToc(doc)).toEqual([{ blockId: "b1", level: 1, text: "The Sunken Temple" }]);
  });

  it("excludes headings deeper than h3 (h4 carries no matching selector)", () => {
    const doc = root('<h4 data-block-id="b1">Too Deep</h4>');
    expect(collectReaderToc(doc)).toEqual([]);
  });

  it("excludes a heading with no blockId — nothing to scroll to", () => {
    const doc = root("<h1>No Id</h1>");
    expect(collectReaderToc(doc)).toEqual([]);
  });

  it("excludes a heading with empty text", () => {
    const doc = root('<h1 data-block-id="b1">   </h1>');
    expect(collectReaderToc(doc)).toEqual([]);
  });

  it("never matches a cover's own hand-built title (coverPage.ts's <h1> carries no data-block-id)", () => {
    const doc = root('<div data-type="coverPage"><h1>My Book</h1></div>');
    expect(collectReaderToc(doc)).toEqual([]);
  });

  it("returns an empty list when there are no headings", () => {
    expect(collectReaderToc(root("<p>Just prose.</p>"))).toEqual([]);
  });
});
