/*
 * Chunked PDF export (#1115). The render-pdf edge function refuses HTML over
 * 40 MB (PDF_HTML_MAX_BYTES), and a 480-page book with ~160 pictures at 300 ppi
 * is ~61 MB. Quality stays; the book is printed in consecutive batches of pages
 * and the PDFs are stitched together here, in the browser.
 *
 * Everything pure lives in this file so it tests without Paged.js or a network:
 * the batch planner, the split of the laid-out markup into per-page segments,
 * the retry rule for a busy printer, and the merge.
 */

import {
  PDFArray,
  PDFBool,
  PDFContext,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFNumber,
  PDFObject,
  PDFRef,
  PDFString,
} from "pdf-lib";

/**
 * What one chunk's assembled HTML may weigh, and how many pages it may hold.
 * render-pdf ACCEPTS up to 40 MB (PDF_HTML_MAX_BYTES), but Cloudflare's printer
 * does not finish everything it accepts: measured on 27 Oct 2026 against the
 * real Browser Run /pdf endpoint with the 478-page Sothery draft, a 319-page,
 * 31 MB part failed after 35 s with 503 "Service unavailable" (code 7010),
 * while 160 pages at 13.5 MB (6 s of browser time) and the book's heaviest 40
 * pages at 17.5 MB (8 s) printed. The limits leave room under both measured
 * successes; a part costs one render, so smaller parts only cost requests.
 */
export const PDF_CHUNK_BUDGET_BYTES = 16 * 1024 * 1024;
export const PDF_CHUNK_MAX_PAGES = 150;

/** UTF-8 byte length of a string without allocating the encoded copy. */
export function utf8ByteLength(s: string): number {
  let bytes = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) bytes += 1;
    else if (c < 0x800) bytes += 2;
    else if (c >= 0xd800 && c < 0xdc00 && i + 1 < s.length) {
      const next = s.charCodeAt(i + 1);
      if (next >= 0xdc00 && next < 0xe000) {
        bytes += 4;
        i++;
      } else bytes += 3; // lone high surrogate: TextEncoder writes U+FFFD
    } else bytes += 3;
  }
  return bytes;
}

/** A half-open range of page indexes: `start` included, `end` excluded. */
export interface PageRange {
  start: number;
  end: number;
}

export class PdfPageTooLargeError extends Error {
  constructor(
    public readonly pageNumber: number,
    public readonly bytes: number,
    public readonly budget: number,
  ) {
    super(
      `Page ${pageNumber} alone is ${(bytes / 1024 / 1024).toFixed(1)} MB with the book's fonts and styles, ` +
        `over the ${(budget / 1024 / 1024).toFixed(0)} MB limit for one PDF part. ` +
        "Shrink or remove the pictures on that page and try again.",
    );
    this.name = "PdfPageTooLargeError";
  }
}

/**
 * Greedy, in order: a chunk takes pages until the next one would push
 * `overheadBytes + sum(pages)` past the budget or the chunk past `maxPages`. A
 * total that exactly equals a limit fits. A page that cannot fit even alone
 * throws, naming it (1-based).
 */
export function planPdfChunks(
  pageBytes: readonly number[],
  overheadBytes: number,
  budget: number = PDF_CHUNK_BUDGET_BYTES,
  maxPages: number = PDF_CHUNK_MAX_PAGES,
): PageRange[] {
  const ranges: PageRange[] = [];
  let start = 0;
  let used = overheadBytes;
  for (let i = 0; i < pageBytes.length; i++) {
    if (overheadBytes + pageBytes[i] > budget) {
      throw new PdfPageTooLargeError(i + 1, overheadBytes + pageBytes[i], budget);
    }
    if (used + pageBytes[i] > budget || i - start >= maxPages) {
      ranges.push({ start, end: i });
      start = i;
      used = overheadBytes;
    }
    used += pageBytes[i];
  }
  if (pageBytes.length > 0) ranges.push({ start, end: pageBytes.length });
  return ranges;
}

export interface SplitPages {
  /** Everything before the first page (the `.pagedjs_pages` wrapper's opening). */
  prefix: string;
  /** One entry per page; any markup between two pages stays with the earlier one. */
  segments: string[];
  /** Everything after the last page (the wrapper's closing). */
  suffix: string;
}

/**
 * Cuts the host's serialised markup into per-page segments without assuming
 * what sits around the pages: `prefix + segments.join("") + suffix` is always
 * exactly `full`, so every chunk keeps the same wrapper structure.
 * `pageHtmls` are the pages' `outerHTML`, in document order.
 */
export function splitPagesHtml(full: string, pageHtmls: readonly string[]): SplitPages {
  const starts: number[] = [];
  let from = 0;
  for (const page of pageHtmls) {
    const at = full.indexOf(page, from);
    if (at < 0) throw new Error("The laid-out pages could not be split for printing.");
    starts.push(at);
    from = at + page.length;
  }
  if (pageHtmls.length === 0) return { prefix: full, segments: [], suffix: "" };
  const end = from;
  const segments = starts.map((s, i) => full.slice(s, i + 1 < starts.length ? starts[i + 1] : end));
  return { prefix: full.slice(0, starts[0]), segments, suffix: full.slice(end) };
}

/** The wrapper and the pages of one chunk, ready to drop into the document. */
export function chunkPagesHtml(split: SplitPages, range: PageRange): string {
  return split.prefix + split.segments.slice(range.start, range.end).join("") + split.suffix;
}

/** True when the renderer is only busy (retry in a moment), not out of quota. */
export function isPrinterBusy(message: string): boolean {
  return /printer is busy/i.test(message);
}

/** Cloudflare Workers Free: one /pdf request per 10 s account-wide. */
export const PRINTER_BUSY_WAIT_MS = 11_000;
export const PRINTER_BUSY_RETRIES = 5;

/**
 * Runs one chunk's render, waiting and retrying (never in parallel) while the
 * printer reports busy, a bounded number of times. Any other failure, and the
 * last busy one, propagates.
 */
export async function withBusyRetry<T>(
  attempt: () => Promise<T>,
  opts: { retries?: number; waitMs?: number; sleep?: (ms: number) => Promise<void> } = {},
): Promise<T> {
  const retries = opts.retries ?? PRINTER_BUSY_RETRIES;
  const waitMs = opts.waitMs ?? PRINTER_BUSY_WAIT_MS;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  for (let tries = 0; ; tries++) {
    try {
      return await attempt();
    } catch (err) {
      const busy = err instanceof Error && isPrinterBusy(err.message);
      if (!busy || tries >= retries) throw err;
      await sleep(waitMs);
    }
  }
}

const N = (name: string) => PDFName.of(name);

/** Old page ref (by its tag) to the same page's ref in the merged document. */
type PageMap = Map<string, PDFRef>;

/**
 * A destination array or `<< /D array >>`, pointed at the merged page; undefined
 * when its page was not copied. References are resolved in the part they came
 * from (`src`), never in the merged document, where the same number is another object.
 */
function remapDest(src: PDFContext, ctx: PDFContext, value: PDFObject | undefined, pages: PageMap): PDFObject | undefined {
  const v = value instanceof PDFRef ? src.lookup(value) : value;
  if (v instanceof PDFArray) {
    const page = v.get(0);
    const mapped = page instanceof PDFRef ? pages.get(page.tag) : undefined;
    const rest = v.asArray().slice(1).map((item) => (item instanceof PDFRef ? src.lookup(item) : item));
    return mapped && rest.every((item) => item !== undefined) ? ctx.obj([mapped, ...(rest as PDFObject[])]) : undefined;
  }
  if (v instanceof PDFDict) {
    const d = remapDest(src, ctx, v.get(N("D")), pages);
    return d ? ctx.obj({ D: d }) : undefined;
  }
  return undefined;
}

interface NamedDests {
  /** Old-style catalog /Dests dictionary: name object to destination. */
  legacy: Map<string, PDFObject>;
  /** Name tree under /Names /Dests: string key (kept as written, so links match bytewise) to destination. */
  tree: { key: PDFString | PDFHexString; value: PDFObject }[];
}

function collectNameTree(node: PDFDict, out: NamedDests["tree"], seen: Set<PDFDict>): void {
  if (seen.has(node)) return;
  seen.add(node);
  const names = node.lookupMaybe(N("Names"), PDFArray);
  if (names) {
    for (let i = 0; i + 1 < names.size(); i += 2) {
      const key = names.lookup(i);
      if (key instanceof PDFString || key instanceof PDFHexString) out.push({ key, value: names.get(i + 1) });
    }
  }
  const kids = node.lookupMaybe(N("Kids"), PDFArray);
  if (kids) for (let i = 0; i < kids.size(); i++) collectNameTree(kids.lookup(i, PDFDict), out, seen);
}

function readNamedDests(doc: PDFDocument): NamedDests {
  const legacy = new Map<string, PDFObject>();
  const tree: NamedDests["tree"] = [];
  const dests = doc.catalog.lookupMaybe(N("Dests"), PDFDict);
  if (dests) for (const [key, value] of dests.entries()) legacy.set(key.decodeText(), value);
  const root = doc.catalog.lookupMaybe(N("Names"), PDFDict)?.lookupMaybe(N("Dests"), PDFDict);
  if (root) collectNameTree(root, tree, new Set());
  return { legacy, tree };
}

/** One bookmark rebuilt in the merged document, before its siblings are linked. */
interface BuiltItem {
  ref: PDFRef;
  dict: PDFDict;
  /** Entries this item shows when its parent is open: itself plus the visible part of its subtree. */
  open: boolean;
  visible: number;
}
function linkSiblings(items: BuiltItem[]): void {
  items.forEach((item, i) => {
    if (i > 0) item.dict.set(N("Prev"), items[i - 1].ref);
    if (i + 1 < items.length) item.dict.set(N("Next"), items[i + 1].ref);
  });
}

/** Rebuilds a sibling chain starting at `first`, under `parent`, in the merged context. */
function buildOutlineLevel(
  src: PDFContext,
  ctx: PDFContext,
  first: PDFDict | undefined,
  parent: PDFRef | null,
  pages: PageMap,
): BuiltItem[] {
  const built: BuiltItem[] = [];
  const seen = new Set<PDFDict>();
  for (let item = first; item && !seen.has(item); item = item.lookupMaybe(N("Next"), PDFDict)) {
    seen.add(item);
    const dict = ctx.obj({}) as PDFDict;
    const ref = ctx.register(dict);
    // Every value is looked up, not got: a reference belongs to the part's own context.
    const title = item.lookup(N("Title"));
    if (title) dict.set(N("Title"), title);
    // A destination that is a name stays a name; the merged name tables resolve it.
    const dest = item.lookup(N("Dest"));
    if (dest instanceof PDFArray) {
      const mapped = remapDest(src, ctx, dest, pages);
      if (mapped) dict.set(N("Dest"), mapped);
    } else if (dest) {
      dict.set(N("Dest"), dest);
    }
    const action = item.lookupMaybe(N("A"), PDFDict);
    if (action) {
      const d = action.lookup(N("D"));
      const mapped = d instanceof PDFArray ? remapDest(src, ctx, d, pages) : d;
      if (mapped) dict.set(N("A"), ctx.obj({ S: action.lookup(N("S")) ?? N("GoTo"), D: mapped }));
    }
    for (const key of ["C", "F"]) {
      const v = item.lookup(N(key));
      if (v instanceof PDFArray) dict.set(N(key), ctx.obj(v.asArray().map((x) => (x instanceof PDFRef ? src.lookup(x) : x)) as PDFObject[]));
      else if (v) dict.set(N(key), v);
    }
    if (parent) dict.set(N("Parent"), parent);

    const kids = buildOutlineLevel(src, ctx, item.lookupMaybe(N("First"), PDFDict), ref, pages);
    const count = item.lookupMaybe(N("Count"), PDFNumber)?.asNumber() ?? 0;
    const open = count >= 0;
    const kidsVisible = kids.reduce((n, k) => n + 1 + (k.open ? k.visible : 0), 0);
    if (kids.length > 0) {
      dict.set(N("First"), kids[0].ref);
      dict.set(N("Last"), kids[kids.length - 1].ref);
      dict.set(N("Count"), PDFNumber.of(open ? kidsVisible : -kidsVisible));
    }
    built.push({ ref, dict, open, visible: kidsVisible });
  }
  linkSiblings(built);
  return built;
}

function bytesLess(a: PDFString | PDFHexString, b: PDFString | PDFHexString): number {
  const x = a.asBytes();
  const y = b.asBytes();
  for (let i = 0; i < Math.min(x.length, y.length); i++) if (x[i] !== y[i]) return x[i] - y[i];
  return x.length - y.length;
}

/**
 * Joins chunk PDFs, in order, into one document. copyPages carries only the
 * pages (and their link annotations, which cite destinations by name), so what
 * hangs off the catalog is rebuilt here: the title and other Info fields, the
 * named destinations (so a contents link in part 1 reaches a heading in part
 * 3) and, when a part has one, the outline. The printer is not asked for an
 * outline today (render-pdf passes only printBackground and preferCSSPageSize),
 * so the outline path is kept for when it is. A destination name defined in two
 * parts keeps the first.
 */
export async function mergePdfs(parts: readonly (Uint8Array | ArrayBuffer)[]): Promise<Uint8Array> {
  const merged = await PDFDocument.create();
  const ctx = merged.context;
  const legacyDests = new Map<string, PDFObject>();
  const treeDests = new Map<string, { key: PDFString | PDFHexString; value: PDFObject }>();
  const topItems: BuiltItem[] = [];

  for (const [index, part] of parts.entries()) {
    const doc = await PDFDocument.load(part, { updateMetadata: false });
    const copied = await merged.copyPages(doc, doc.getPageIndices());
    const pageMap: PageMap = new Map(doc.getPages().map((p, i) => [p.ref.tag, copied[i].ref]));
    for (const page of copied) merged.addPage(page);

    if (index === 0) {
      const title = doc.getTitle();
      if (title !== undefined) {
        const prefs = doc.catalog.lookupMaybe(N("ViewerPreferences"), PDFDict);
        const showTitle = prefs?.lookup(N("DisplayDocTitle")) === PDFBool.True;
        merged.setTitle(title, { showInWindowTitleBar: showTitle });
      }
      const author = doc.getAuthor();
      if (author !== undefined) merged.setAuthor(author);
      const subject = doc.getSubject();
      if (subject !== undefined) merged.setSubject(subject);
      const creator = doc.getCreator();
      if (creator !== undefined) merged.setCreator(creator);
      const producer = doc.getProducer();
      if (producer !== undefined) merged.setProducer(producer);
      const lang = doc.catalog.get(N("Lang"));
      if (lang) merged.catalog.set(N("Lang"), lang);
    }

    const named = readNamedDests(doc);
    for (const [name, value] of named.legacy) {
      const dest = remapDest(doc.context, ctx, value, pageMap);
      if (dest && !legacyDests.has(name)) legacyDests.set(name, dest);
    }
    for (const { key, value } of named.tree) {
      const dest = remapDest(doc.context, ctx, value, pageMap);
      const id = key.decodeText();
      if (dest && !treeDests.has(id)) treeDests.set(id, { key, value: dest });
    }

    const outlines = doc.catalog.lookupMaybe(N("Outlines"), PDFDict);
    if (outlines) topItems.push(...buildOutlineLevel(doc.context, ctx, outlines.lookupMaybe(N("First"), PDFDict), null, pageMap));
  }

  if (legacyDests.size > 0) {
    const dict = ctx.obj({}) as PDFDict;
    for (const [name, dest] of legacyDests) dict.set(N(name), dest);
    merged.catalog.set(N("Dests"), ctx.register(dict));
  }
  if (treeDests.size > 0) {
    const sorted = [...treeDests.values()].sort((a, b) => bytesLess(a.key, b.key));
    const names = sorted.flatMap(({ key, value }) => [key, value]);
    const tree = ctx.register(ctx.obj({ Names: names }));
    const existing = merged.catalog.lookupMaybe(N("Names"), PDFDict);
    if (existing) existing.set(N("Dests"), tree);
    else merged.catalog.set(N("Names"), ctx.obj({ Dests: tree }));
  }
  if (topItems.length > 0) {
    linkSiblings(topItems);
    const root = ctx.obj({}) as PDFDict;
    const rootRef = ctx.register(root);
    for (const item of topItems) item.dict.set(N("Parent"), rootRef);
    root.set(N("Type"), N("Outlines"));
    root.set(N("First"), topItems[0].ref);
    root.set(N("Last"), topItems[topItems.length - 1].ref);
    root.set(N("Count"), PDFNumber.of(topItems.reduce((n, i) => n + 1 + (i.open ? i.visible : 0), 0)));
    merged.catalog.set(N("Outlines"), rootRef);
  }
  return merged.save();
}

export interface PdfProgress {
  part: number;
  total: number;
}

/** The button/dialog label while a PDF is building. */
export function pdfProgressLabel(progress: PdfProgress | null): string {
  return progress && progress.total > 1
    ? `Building part ${progress.part} of ${progress.total}…`
    : "Building…";
}
