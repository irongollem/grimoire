/*
 * The page-numbering markers, as choices about one page (#1176 story 6, frame 10).
 *
 * `skipCounting` and `resetCounting` stay the stored form: print honours them
 * and books saved with them keep working. The DM never sees them as chips.
 * They say, on the page's footer, what they do:
 *   - No footer on this page   = a skip marker (nothing printed, count stands still);
 *   - Don't count this page    = a skip marker that keeps the footer's running title;
 *   - Start the count again    = a reset marker.
 * A marker belongs to the page it sits on, so these live at the page's first
 * block boundary and are found there.
 */
import type { Node as PMNode } from "@tiptap/pm/model";
import type { EditorState, Transaction } from "@tiptap/pm/state";
import type { PageBox } from "@/scriptorium/tiptap/pageFlow";

export interface PageMarkers {
  /** The page prints no footer, and the count does not advance. */
  noFooter: boolean;
  /** The page prints its running title but no number, and the count does not advance. */
  dontCount: boolean;
  /** The count starts again at the book's first number from this page. */
  restart: boolean;
}

export const NO_MARKERS: PageMarkers = { noFooter: false, dontCount: false, restart: false };

/** The first top-level block boundary at or after `pos`: a page that starts mid-paragraph takes its marker after that paragraph. */
function boundaryFrom(doc: PMNode, pos: number): number {
  let found = doc.content.size;
  let done = false;
  doc.forEach((_node, offset) => {
    if (done || offset < pos) return;
    found = offset;
    done = true;
  });
  return found;
}

interface Region {
  from: number;
  to: number;
}

function regionOf(doc: PMNode, pages: readonly PageBox[], page: number): Region | null {
  const index = pages.findIndex((p) => p.page === page);
  if (index < 0) return null;
  const next = pages[index + 1];
  return {
    from: boundaryFrom(doc, pages[index].startPos),
    to: next ? boundaryFrom(doc, next.startPos) : doc.content.size,
  };
}

interface Found {
  pos: number;
  size: number;
  type: "skipCounting" | "resetCounting";
  keepFooter: boolean;
}

function markersIn(doc: PMNode, region: Region): Found[] {
  const out: Found[] = [];
  doc.forEach((node, offset) => {
    if (offset < region.from || offset >= region.to) return;
    const type = node.type.name;
    if (type === "skipCounting" || type === "resetCounting") {
      out.push({ pos: offset, size: node.nodeSize, type, keepFooter: node.attrs.keepFooter === true });
    }
  });
  return out;
}

export function readPageMarkers(doc: PMNode, pages: readonly PageBox[], page: number): PageMarkers {
  const region = regionOf(doc, pages, page);
  if (!region) return NO_MARKERS;
  const found = markersIn(doc, region);
  const skip = found.find((m) => m.type === "skipCounting");
  return {
    noFooter: skip !== undefined && !skip.keepFooter,
    dontCount: skip !== undefined,
    restart: found.some((m) => m.type === "resetCounting"),
  };
}

/**
 * The transaction that makes `page` carry exactly `next`, or null when the page
 * is not laid out or already does. "No footer" outranks "Don't count": a page
 * with no footer is not counted either.
 */
export function pageMarkerTransaction(
  state: EditorState,
  pages: readonly PageBox[],
  page: number,
  next: PageMarkers,
): Transaction | null {
  const region = regionOf(state.doc, pages, page);
  if (!region) return null;
  const current = readPageMarkers(state.doc, pages, page);
  if (current.noFooter === next.noFooter && current.dontCount === next.dontCount && current.restart === next.restart) {
    return null;
  }
  const { schema } = state;
  const tr = state.tr;
  // Descending, so each delete leaves the next one's position alone.
  for (const m of markersIn(state.doc, region).reverse()) tr.delete(m.pos, m.pos + m.size);
  const nodes: PMNode[] = [];
  if (next.restart) nodes.push(schema.nodes.resetCounting.create());
  if (next.noFooter || next.dontCount) {
    nodes.push(schema.nodes.skipCounting.create({ keepFooter: !next.noFooter }));
  }
  if (nodes.length > 0) tr.insert(region.from, nodes);
  return tr;
}
