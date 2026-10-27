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

import { PDFDocument } from "pdf-lib";

/**
 * What one chunk's assembled HTML may weigh. The edge function caps at 40 MB;
 * 32 MB leaves headroom for the JSON envelope's escaping.
 */
export const PDF_CHUNK_BUDGET_BYTES = 32 * 1024 * 1024;

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
 * `overheadBytes + sum(pages)` past the budget. A total that exactly equals the
 * budget fits. A page that cannot fit even alone throws, naming it (1-based).
 */
export function planPdfChunks(
  pageBytes: readonly number[],
  overheadBytes: number,
  budget: number = PDF_CHUNK_BUDGET_BYTES,
): PageRange[] {
  const ranges: PageRange[] = [];
  let start = 0;
  let used = overheadBytes;
  for (let i = 0; i < pageBytes.length; i++) {
    if (overheadBytes + pageBytes[i] > budget) {
      throw new PdfPageTooLargeError(i + 1, overheadBytes + pageBytes[i], budget);
    }
    if (used + pageBytes[i] > budget) {
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

/** Joins chunk PDFs, in order, into one document. */
export async function mergePdfs(parts: readonly (Uint8Array | ArrayBuffer)[]): Promise<Uint8Array> {
  const merged = await PDFDocument.create();
  for (const part of parts) {
    const doc = await PDFDocument.load(part);
    const pages = await merged.copyPages(doc, doc.getPageIndices());
    for (const page of pages) merged.addPage(page);
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
