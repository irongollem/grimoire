/*
 * Reads a chapter laid out by Paged.js and says where each page and column
 * starts (#1175). The preview is the truth (it is what prints); the editor
 * draws these as page gaps and column breaks.
 *
 * Geometry is injected so the logic runs in jsdom, which has no layout.
 */

import { CHAPTER_ID_ATTR } from "@/lib/scriptorium/furniture/renderFurniture";
import { layoutTextLength, layoutTextNodes } from "./layoutText";
import type { ChapterFlow, FlowBreak, FlowPosition } from "./types";

export interface FlowRect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface FlowGeometry {
  rectOfElement(el: Element): FlowRect;
  /** The rect of one character, or null when it draws nothing (collapsed whitespace). */
  rectOfTextChar(node: Text, index: number): FlowRect | null;
  /** True for a `column-span: all` element, which splits a page into column rows. */
  spansAllColumns(el: Element): boolean;
}

export const domGeometry: FlowGeometry = {
  rectOfElement(el) {
    return el.getBoundingClientRect();
  },
  rectOfTextChar(node, index) {
    const range = node.ownerDocument.createRange();
    range.setStart(node, index);
    range.setEnd(node, index + 1);
    const rect = range.getClientRects()[0];
    if (!rect || (rect.width === 0 && rect.height === 0)) return null;
    return rect;
  },
  spansAllColumns(el) {
    const view = el.ownerDocument.defaultView;
    return view !== null && view.getComputedStyle(el).columnSpan === "all";
  },
};

const BLANK_PAGE_CLASS = "pagedjs_blank_page";
const CONTENT_SELECTOR = ".pagedjs_page_content";
// Injected after layout, never the author's text.
const CHROME_SELECTOR = ".sc-footer, .sc-furniture";
// Leaves that hold no text but still start a block of content.
const VOID_LEAF_SELECTOR = "img, hr, svg, canvas, video, iframe";
// Sub-pixel slack when comparing a character's top to a spanner's bottom.
const ROW_EPSILON = 0.5;

interface Leaf {
  node: Text | Element;
  /** Characters before the leaf inside a text node; 0 for an element. */
  index: number;
}

function isText(node: Node): node is Text {
  return node.nodeType === Node.TEXT_NODE;
}

function isChrome(el: Element): boolean {
  return (
    el.matches(CHROME_SELECTOR) ||
    el.getAttribute("contenteditable") === "false"
  );
}

/** Text nodes and void elements of the page, in order, minus chrome and whitespace-only runs. */
function pageLeaves(content: HTMLElement): Leaf[] {
  const doc = content.ownerDocument;
  const out: Leaf[] = [];
  const walker = doc.createTreeWalker(
    content,
    NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
    {
      acceptNode(n) {
        if (isText(n))
          return n.data.trim() === ""
            ? NodeFilter.FILTER_REJECT
            : NodeFilter.FILTER_ACCEPT;
        const el = n as Element;
        if (isChrome(el)) return NodeFilter.FILTER_REJECT;
        return el.matches(VOID_LEAF_SELECTOR)
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_SKIP;
      },
    },
  );
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    out.push({ node: n as Text | Element, index: 0 });
  }
  return out;
}

function nearestBlock(node: Node): Element | null {
  const el = isText(node) ? node.parentElement : (node as Element);
  return el?.closest("[data-block-id]") ?? null;
}

/**
 * For every block fragment, the layout characters of the same block that sit in
 * fragments before it. Paged.js repeats `data-block-id` on each piece of a block
 * it splits, so this is where a continuation fragment's text starts in the block.
 */
function fragmentOffsets(contents: HTMLElement[]): Map<Element, number> {
  const running = new Map<string, number>();
  const before = new Map<Element, number>();
  for (const content of contents) {
    for (const frag of content.querySelectorAll("[data-block-id]")) {
      if (frag.closest(CHROME_SELECTOR)) continue;
      const id = frag.getAttribute("data-block-id");
      if (id === null) continue;
      const so = running.get(id);
      const base = so === undefined ? 0 : so;
      before.set(frag, base);
      running.set(id, base + layoutTextLength(frag));
    }
  }
  return before;
}

function positionOf(
  leaf: Leaf,
  before: Map<Element, number>,
): FlowPosition | null {
  const block = nearestBlock(leaf.node);
  const blockId = block?.getAttribute("data-block-id");
  if (!block || blockId == null) return null;
  const prior = before.get(block);
  if (prior === undefined) return null;
  let within = 0;
  for (const t of layoutTextNodes(block)) {
    if (t === leaf.node)
      return { blockId, textOffset: prior + within + leaf.index };
    // An element leaf sits after the text nodes that precede it, and before the rest.
    if (
      !isText(leaf.node) &&
      !(leaf.node.compareDocumentPosition(t) & Node.DOCUMENT_POSITION_PRECEDING)
    )
      break;
    within += t.data.length;
  }
  return { blockId, textOffset: prior + within };
}

/** The first leaf at or after `from` that sits in a block, as a position. */
function firstPositionFrom(
  leaves: Leaf[],
  from: number,
  before: Map<Element, number>,
): FlowPosition | null {
  for (let i = from; i < leaves.length; i++) {
    const leaf = i === from ? leaves[i] : { node: leaves[i].node, index: 0 };
    const pos = positionOf(leaf, before);
    if (pos) return pos;
  }
  return null;
}

/** Where the second column of the page's last column row starts, "page-end" when empty, null when unlocatable. */
function columnStart(
  content: HTMLElement,
  leaves: Leaf[],
  geometry: FlowGeometry,
  before: Map<Element, number>,
): FlowBreak["at"] | null {
  const box = geometry.rectOfElement(content);
  const mid = (box.left + box.right) / 2;

  // Everything above the last column-span element is balanced by the browser and
  // says nothing about where the sequentially filled last row breaks.
  const spanners: Element[] = [];
  for (const el of content.querySelectorAll("*")) {
    if (
      !isChrome(el) &&
      !el.closest(CHROME_SELECTOR) &&
      geometry.spansAllColumns(el)
    )
      spanners.push(el);
  }
  let rowTop = -Infinity;
  for (const s of spanners)
    rowTop = Math.max(rowTop, geometry.rectOfElement(s).bottom);

  const inRow = (r: FlowRect) => r.top >= rowTop - ROW_EPSILON;
  const inColumnTwo = (r: FlowRect) => inRow(r) && (r.left + r.right) / 2 > mid;
  const inColumnOne = (r: FlowRect) =>
    inRow(r) && (r.left + r.right) / 2 <= mid;

  const row = leaves.filter(
    ({ node }) => !spanners.some((s) => s.contains(node)),
  );

  // Native column fragmentation can push a float into column 2 while the text
  // after it in the DOM still fills column 1, so "first leaf in column 2" is
  // wrong. The break sits right after the LAST leaf that is in column 1.
  // Per text node: characters run column 1 then column 2, so the first column-2
  // character is a binary search, and the character before it decides column 1.
  const boundaryOf = (node: Text): number => {
    const col2At = (at: number): boolean => {
      for (let j = at; j < node.data.length; j++) {
        const r = geometry.rectOfTextChar(node, j);
        if (r) return inColumnTwo(r);
      }
      return false;
    };
    let lo = 0;
    let hi = node.data.length;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (col2At(m)) hi = m;
      else lo = m + 1;
    }
    return lo;
  };
  const hasColumnOneBefore = (node: Text, end: number): boolean => {
    for (let j = end - 1; j >= 0; j--) {
      const r = geometry.rectOfTextChar(node, j);
      if (r) return inColumnOne(r);
    }
    return false;
  };

  let lastOne = -1;
  let lastBoundary = 0;
  let firstTwo = -1;
  for (let i = 0; i < row.length; i++) {
    const { node } = row[i];
    if (isText(node)) {
      const bound = boundaryOf(node);
      if (hasColumnOneBefore(node, bound)) {
        lastOne = i;
        lastBoundary = bound;
      }
      if (bound < node.data.length && firstTwo < 0) firstTwo = i;
    } else {
      const r = geometry.rectOfElement(node);
      if (inColumnOne(r)) lastOne = i;
      else if (inColumnTwo(r) && firstTwo < 0) firstTwo = i;
    }
  }

  if (lastOne < 0) {
    // Nothing in column 1 of this row: the second column starts at its first leaf.
    if (firstTwo < 0) return "page-end";
    const node = row[firstTwo].node;
    const inText = isText(node)
      ? positionOf({ node, index: boundaryOf(node) }, before)
      : null;
    return (
      inText ??
      firstPositionFrom(row, firstTwo + (isText(node) ? 1 : 0), before)
    );
  }
  const last = row[lastOne].node;
  if (isText(last) && lastBoundary < last.data.length) {
    // Null (omitted) when the character sits in no block.
    return (
      positionOf({ node: last, index: lastBoundary }, before) ??
      firstPositionFrom(row, lastOne + 1, before)
    );
  }
  if (lastOne + 1 >= row.length) return "page-end";
  return firstPositionFrom(row, lastOne + 1, before);
}

export function measureChapterFlow(
  pages: HTMLElement[],
  opts: { chapterId: string; twoColumn: boolean },
  geometry: FlowGeometry = domGeometry,
): ChapterFlow {
  const own = pages.filter(
    (p) =>
      p.getAttribute(CHAPTER_ID_ATTR) === opts.chapterId &&
      !p.classList.contains(BLANK_PAGE_CLASS),
  );
  const contents = own.map((p) =>
    p.querySelector<HTMLElement>(CONTENT_SELECTOR),
  );
  const before = fragmentOffsets(
    contents.filter((c): c is HTMLElement => c !== null),
  );

  const breaks: FlowBreak[] = [];
  contents.forEach((content, i) => {
    if (!content) return;
    const page = i + 1;
    const leaves = pageLeaves(content);
    if (page >= 2) {
      const at = firstPositionFrom(leaves, 0, before);
      if (at) breaks.push({ kind: "page", page, at });
    }
    // A page's column break comes before the next page's gap.
    if (opts.twoColumn) {
      const at = columnStart(content, leaves, geometry, before);
      if (at !== null) breaks.push({ kind: "column", page, at });
    }
  });
  return {
    chapterId: opts.chapterId,
    pageCount: own.length,
    twoColumn: opts.twoColumn,
    breaks,
    layoutClasses: layoutClassesOf(contents.filter((c): c is HTMLElement => c !== null)),
  };
}

/**
 * The blocks the preparation reshaped, read off the laid-out pages: a table
 * spanning both columns, and the last block of each picture group (whatever
 * follows a group starts below its picture). A block split across pages is
 * named once.
 */
function layoutClassesOf(contents: HTMLElement[]): Record<string, string[]> {
  const out: Record<string, Set<string>> = {};
  const add = (el: Element | null, cls: string) => {
    const id = el?.getAttribute("data-block-id");
    if (id) (out[id] ??= new Set()).add(cls);
  };
  for (const content of contents) {
    content.querySelectorAll("table.sc-table--span").forEach((t) => add(t.closest("[data-block-id]"), "sc-table--span"));
    content.querySelectorAll(".sc-float-group").forEach((g) => add(g.lastElementChild, "sc-flow-float-end"));
  }
  return Object.fromEntries(Object.entries(out).map(([id, set]) => [id, [...set]]));
}
