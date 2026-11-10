// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import {
  measureChapterFlow,
  type FlowGeometry,
  type FlowRect,
} from "./measureFlow";

const CH = "chapter-1";

function page(
  n: number,
  html: string,
  opts: { chapter?: string; blank?: boolean } = {},
): HTMLElement {
  const el = document.createElement("div");
  el.className = opts.blank
    ? "pagedjs_page pagedjs_blank_page"
    : "pagedjs_page";
  el.setAttribute("data-chapter-id", opts.chapter ?? CH);
  if (!opts.blank) el.setAttribute("data-chapter-page", String(n));
  el.innerHTML = `<div class="pagedjs_page_content">${html}</div>`;
  document.body.appendChild(el);
  return el;
}

interface Place {
  top: number;
  /** Characters from this index on are in column 2; undefined means all column 1. */
  col2From?: number;
}

/** A page content box 400 wide (middle at 200) and a character grid placed by hand. */
function fakeGeometry(
  placements: Map<Node, Place>,
  elementRects = new Map<Element, FlowRect>(),
  spanners: Element[] = [],
  scale = 1,
): FlowGeometry {
  const s = (r: FlowRect): FlowRect => ({
    left: r.left * scale,
    right: r.right * scale,
    top: r.top * scale,
    bottom: r.bottom * scale,
  });
  return {
    rectOfElement(el) {
      if (el.classList.contains("pagedjs_page_content"))
        return s({ left: 0, right: 400, top: 0, bottom: 600 });
      const r = elementRects.get(el);
      if (!r) throw new Error("no rect for element");
      return s(r);
    },
    rectOfTextChar(node, index) {
      const p = placements.get(node);
      const col2 = p?.col2From !== undefined && index >= p.col2From;
      const left = col2 ? 250 : 20;
      const top = p ? p.top : 0;
      return s({ left, right: left + 8, top, bottom: top + 12 });
    },
    spansAllColumns: (el) => spanners.includes(el),
  };
}

const textOf = (root: ParentNode, selector: string): Text => {
  const el = root.querySelector(selector);
  if (!el?.firstChild) throw new Error(`no text under ${selector}`);
  return el.firstChild as Text;
};

afterEach(() => {
  document.body.innerHTML = "";
});

describe("page breaks", () => {
  it("a paragraph split across pages breaks at the characters page 1 printed, not before the paragraph", () => {
    // Bug caught: counting only this page's fragment gives offset 0 for the continuation.
    const p1 = page(1, '<p data-block-id="a">Hello world</p>');
    const p2 = page(
      2,
      '<p data-block-id="a" data-split-from="x">, again</p><p data-block-id="b">B</p>',
    );
    const flow = measureChapterFlow(
      [p1, p2],
      { chapterId: CH, twoColumn: false },
      fakeGeometry(new Map()),
    );
    expect(flow.breaks).toEqual([
      { kind: "page", page: 2, at: { blockId: "a", textOffset: 11 } },
    ]);
    expect(flow.pageCount).toBe(2);
  });

  it("text inside a contenteditable=false label is not counted, before the break or after it", () => {
    // Bug caught: the preview's label text inflates the offset the editor never has.
    const p1 = page(
      1,
      '<p data-block-id="a"><span contenteditable="false">LABEL</span>abc</p>',
    );
    const p2 = page(
      2,
      '<p data-block-id="a">def</p><p data-block-id="b"><span contenteditable="false">Tag</span>xyz</p>',
    );
    const p3 = page(
      3,
      '<p data-block-id="b"><span contenteditable="false">Tag</span>more</p>',
    );
    const flow = measureChapterFlow(
      [p1, p2, p3],
      { chapterId: CH, twoColumn: false },
      fakeGeometry(new Map()),
    );
    expect(flow.breaks.map((b) => b.at)).toEqual([
      { blockId: "a", textOffset: 3 },
      { blockId: "b", textOffset: 3 },
    ]);
  });

  it("furniture and footers inside a page never become a break", () => {
    // Bug caught: a decoration injected at the top of a page opens the page in the editor.
    const p1 = page(1, '<p data-block-id="a">one</p>');
    const p2 = page(
      2,
      '<div class="sc-furniture" data-block-id="art">decor</div><div class="sc-footer">12</div><p data-block-id="b">two</p>',
    );
    const flow = measureChapterFlow(
      [p1, p2],
      { chapterId: CH, twoColumn: false },
      fakeGeometry(new Map()),
    );
    expect(flow.breaks).toEqual([
      { kind: "page", page: 2, at: { blockId: "b", textOffset: 0 } },
    ]);
  });

  it("blank pages and other chapters' pages are skipped and do not count as pages", () => {
    // Bug caught: the blank page inserted after a chapter becomes a phantom page of it.
    const p1 = page(1, '<p data-block-id="a">one</p>');
    const blank = page(0, "", { blank: true });
    const other = page(1, '<p data-block-id="z">other</p>', {
      chapter: "chapter-2",
    });
    const p2 = page(2, '<p data-block-id="b">two</p>');
    const flow = measureChapterFlow(
      [p1, blank, other, p2],
      { chapterId: CH, twoColumn: false },
      fakeGeometry(new Map()),
    );
    expect(flow.pageCount).toBe(2);
    expect(flow.breaks).toEqual([
      { kind: "page", page: 2, at: { blockId: "b", textOffset: 0 } },
    ]);
  });

  it("a page opening on an image breaks before that block at offset 0", () => {
    // Bug caught: a page with no text is dropped or tied to the previous block.
    const p1 = page(1, '<p data-block-id="a">one</p>');
    const p2 = page(
      2,
      '<img data-block-id="pic" src="x.png"><p data-block-id="b">two</p>',
    );
    const flow = measureChapterFlow(
      [p1, p2],
      { chapterId: CH, twoColumn: false },
      fakeGeometry(new Map()),
    );
    expect(flow.breaks).toEqual([
      { kind: "page", page: 2, at: { blockId: "pic", textOffset: 0 } },
    ]);
  });

  it("generated chrome with no block id falls forward to the next block, and with none the break is omitted", () => {
    // Bug caught: a break with no block id reaches the editor, which cannot place it.
    const p1 = page(1, '<p data-block-id="a">one</p>');
    const p2 = page(
      2,
      '<div class="gen">chrome</div><p data-block-id="b">two</p>',
    );
    const p3 = page(3, '<div class="gen">only chrome</div>');
    const flow = measureChapterFlow(
      [p1, p2, p3],
      { chapterId: CH, twoColumn: false },
      fakeGeometry(new Map()),
    );
    expect(flow.breaks).toEqual([
      { kind: "page", page: 2, at: { blockId: "b", textOffset: 0 } },
    ]);
    expect(flow.pageCount).toBe(3);
  });
});

describe("column breaks", () => {
  it("a single-column chapter has no column breaks even when text is laid out far right", () => {
    // Bug caught: twoColumn ignored, so every page gets a column break.
    const p1 = page(1, '<p data-block-id="a">abcdef</p>');
    const geo = fakeGeometry(
      new Map([[textOf(p1, "p"), { top: 10, col2From: 3 }]]),
    );
    expect(
      measureChapterFlow([p1], { chapterId: CH, twoColumn: false }, geo).breaks,
    ).toEqual([]);
  });

  it("a two-column page whose second column is empty gives a page-end column break", () => {
    // Bug caught: an empty second column is reported as a position, or crashes.
    const p1 = page(1, '<p data-block-id="a">abc</p>');
    const geo = fakeGeometry(new Map([[textOf(p1, "p"), { top: 10 }]]));
    expect(
      measureChapterFlow([p1], { chapterId: CH, twoColumn: true }, geo).breaks,
    ).toEqual([{ kind: "column", page: 1, at: "page-end" }]);
  });

  it("a column-2 start inside a text node is found at the first character past the midpoint", () => {
    // Bug caught: the break lands at the start of the paragraph instead of inside it.
    const p1 = page(1, '<p data-block-id="a">aaaaabbbbb</p>');
    const p2 = page(2, '<p data-block-id="a">cc</p>');
    const geo = fakeGeometry(
      new Map([
        [textOf(p1, "p"), { top: 10, col2From: 5 }],
        [textOf(p2, "p"), { top: 10 }],
      ]),
    );
    const flow = measureChapterFlow(
      [p1, p2],
      { chapterId: CH, twoColumn: true },
      geo,
    );
    expect(flow.breaks[0]).toEqual({
      kind: "column",
      page: 1,
      at: { blockId: "a", textOffset: 5 },
    });
  });

  it("a column break in a continuation fragment counts the characters of the earlier fragments", () => {
    // Bug caught: the offset restarts at the fragment, not the block.
    const p1 = page(1, '<p data-block-id="a">0123456789</p>');
    const p2 = page(2, '<p data-block-id="a" data-split-from="x">abcdefgh</p>');
    const geo = fakeGeometry(
      new Map([
        [textOf(p1, "p"), { top: 10 }],
        [textOf(p2, "p"), { top: 10, col2From: 4 }],
      ]),
    );
    const flow = measureChapterFlow(
      [p1, p2],
      { chapterId: CH, twoColumn: true },
      geo,
    );
    expect(
      flow.breaks.filter((b) => b.kind === "column").map((b) => b.at),
    ).toEqual(["page-end", { blockId: "a", textOffset: 14 }]);
  });

  it("only the last column row counts: a row above an h1 spanner is ignored", () => {
    // Bug caught: the balanced row above a heading reports its own column 2 as the page's break.
    const p1 = page(
      1,
      '<p data-block-id="a">above</p><h1 data-block-id="h">Title</h1><p data-block-id="b">below</p>',
    );
    const h1 = p1.querySelector("h1");
    if (!h1) throw new Error("no h1");
    const geo = fakeGeometry(
      new Map([
        [textOf(p1, '[data-block-id="a"]'), { top: 20, col2From: 2 }],
        [textOf(p1, "h1"), { top: 90, col2From: 2 }],
        [textOf(p1, '[data-block-id="b"]'), { top: 150 }],
      ]),
      new Map([[h1, { left: 0, right: 400, top: 80, bottom: 120 }]]),
      [h1],
    );
    expect(
      measureChapterFlow([p1], { chapterId: CH, twoColumn: true }, geo).breaks,
    ).toEqual([{ kind: "column", page: 1, at: "page-end" }]);
  });

  it("the last row's column 2 is found below a spanner", () => {
    // Bug caught: filtering by the spanner drops the real break too.
    const p1 = page(
      1,
      '<h1 data-block-id="h">Title</h1><p data-block-id="b">0123456789</p>',
    );
    const h1 = p1.querySelector("h1");
    if (!h1) throw new Error("no h1");
    const geo = fakeGeometry(
      new Map([
        [textOf(p1, "h1"), { top: 10, col2From: 0 }],
        [textOf(p1, '[data-block-id="b"]'), { top: 150, col2From: 6 }],
      ]),
      new Map([[h1, { left: 0, right: 400, top: 0, bottom: 40 }]]),
      [h1],
    );
    expect(
      measureChapterFlow([p1], { chapterId: CH, twoColumn: true }, geo).breaks,
    ).toEqual([
      { kind: "column", page: 1, at: { blockId: "b", textOffset: 6 } },
    ]);
  });

  it("a float pushed into column 2 ahead of text still in column 1 does not pull the column break before the paragraph", () => {
    // Bug caught: "first leaf in column 2" picks the DOM-first pushed image and moves the whole paragraph.
    const p1 = page(
      1,
      '<div class="sc-float-group"><img data-block-id="pic" src="x.png"></div><p data-block-id="p">0123456789</p>',
    );
    const img = p1.querySelector("img");
    if (!img) throw new Error("no img");
    const geo = fakeGeometry(
      new Map([[textOf(p1, "p"), { top: 10, col2From: 4 }]]),
      new Map([[img, { left: 250, right: 390, top: 10, bottom: 100 }]]),
    );
    expect(
      measureChapterFlow([p1], { chapterId: CH, twoColumn: true }, geo).breaks,
    ).toEqual([
      { kind: "column", page: 1, at: { blockId: "p", textOffset: 4 } },
    ]);
  });

  it("footer text in the right half never becomes the second column", () => {
    // Bug caught: a page number drawn at the right reads as column-2 content.
    const p1 = page(
      1,
      '<p data-block-id="a">abc</p><div class="sc-footer">12</div>',
    );
    const geo = fakeGeometry(
      new Map([
        [textOf(p1, "p"), { top: 10 }],
        [textOf(p1, ".sc-footer"), { top: 500, col2From: 0 }],
      ]),
    );
    expect(
      measureChapterFlow([p1], { chapterId: CH, twoColumn: true }, geo).breaks,
    ).toEqual([{ kind: "column", page: 1, at: "page-end" }]);
  });

  it("a column break comes before the next page's break, in document order", () => {
    // Bug caught: all column breaks trail the page breaks, so the editor places them out of order.
    const p1 = page(1, '<p data-block-id="a">abcd</p>');
    const p2 = page(2, '<p data-block-id="b">efgh</p>');
    const geo = fakeGeometry(
      new Map([
        [textOf(p1, "p"), { top: 10, col2From: 2 }],
        [textOf(p2, "p"), { top: 10, col2From: 2 }],
      ]),
    );
    const flow = measureChapterFlow(
      [p1, p2],
      { chapterId: CH, twoColumn: true },
      geo,
    );
    expect(flow.breaks.map((b) => `${b.kind}${b.page}`)).toEqual([
      "column1",
      "page2",
      "column2",
    ]);
  });

  it("the result does not depend on the preview's display scale", () => {
    // Bug caught: a pixel constant in the column test breaks when the preview is scaled.
    const make = (scale: number) => {
      const p1 = page(1, '<p data-block-id="a">aaaaabbbbb</p>');
      const geo = fakeGeometry(
        new Map([[textOf(p1, "p"), { top: 10, col2From: 5 }]]),
        undefined,
        [],
        scale,
      );
      return measureChapterFlow([p1], { chapterId: CH, twoColumn: true }, geo)
        .breaks;
    };
    expect(make(0.37)).toEqual(make(1));
    expect(make(1)).toEqual([
      { kind: "column", page: 1, at: { blockId: "a", textOffset: 5 } },
    ]);
  });
});

describe("layout classes", () => {
  it("names a table set across both columns and the end of a picture group, once each, for the editor to copy", () => {
    // Without them the editor keeps the table in one column and lets the next block wrap beside the picture.
    const p1 = page(1, '<table class="sc-table--span" data-block-id="t1"><tbody><tr><td>a</td></tr></tbody></table>');
    const p2 = page(
      2,
      '<table class="sc-table--span" data-block-id="t1" data-split-from="x"><tbody><tr><td>b</td></tr></tbody></table>' +
        '<div class="sc-float-group"><div class="sc-img-wrap--wrapRight" data-block-id="i1"><img></div><p data-block-id="c1">caption</p></div>' +
        '<p data-block-id="n1">next</p>',
    );
    const flow = measureChapterFlow([p1, p2], { chapterId: CH, twoColumn: false }, fakeGeometry(new Map()));
    expect(flow.layoutClasses).toEqual({ t1: ["sc-table--span"], c1: ["sc-flow-float-end"] });
  });
});
