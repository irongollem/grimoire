/*
 * Real PDF export for Scriptorium (#565): the app hands the user a PDF file,
 * not a print dialog.
 *
 * Pipeline:
 *   1. Lay the book out in the client with Paged.js, in an off-screen host in
 *      the main document (Paged.js needs real layout and injects its page-sizing
 *      rules into document.head via insertRule, so textContent is empty). The
 *      book is laid out chapter by chapter by the same engine as the live
 *      preview (scriptorium/lib/bookLayout), with the same pre-layout pass,
 *      blank pages, footers and TOC numbering, so the PDF breaks exactly where
 *      the preview does. `progress` says which chapter is being laid out.
 *   2. Redraw pictures at print size as data: URLs (printImages.ts) and inline
 *      everything the document loads from the app's own origin (the
 *      self-hosted fonts, the page background) as data: URIs
 *      (inlineSameOriginAssets.ts). The server's browser cannot reach the
 *      app's origin, so all of it has to travel inside the HTML; a font it
 *      could not fetch would fall back to Georgia, the failure the
 *      self-hosted fonts exist to prevent. (A picture the canvas cannot read
 *      keeps its public CDN URL, which the server can fetch.)
 *   3. Assemble the HTML document from the already-laid-out pages and send it
 *      to the `render-pdf` edge function, which prints it and answers with the
 *      PDF bytes. No layout happens server-side. The edge function refuses
 *      HTML over 40 MB, so a big book (480 pages of 300-ppi art is ~61 MB) is
 *      split into consecutive batches of whole pages (pdfChunks.ts, 40 MB
 *      budget each, the fonts and CSS repeated in every one), printed one
 *      request at a time (retrying a busy printer after a wait), and merged
 *      with pdf-lib. Page numbers, footers and TOC numbers are already in each
 *      page's DOM, so a split changes none of them. A book that fits is one
 *      request and no merge (#1115). `progress` says which part is printing.
 *   4. Optionally attach the campaign data to the PDF (campaignBundlePdf.ts),
 *      then download the bytes through an object URL.
 *   5. Read the PDF back (#1176): pdf.js reads each page's text and printCheck
 *      compares it with what the laid-out page said, naming a page that
 *      printed differently. It runs after the download is handed over and
 *      never blocks it; a check that cannot run says so and changes nothing.
 */

import { ref } from "vue";
import { supabase } from "@/lib/supabase";
import { edgeErrorMessage } from "@edge-shared/edgeError.ts";
import { buildPagedPreviewCss } from "@/scriptorium/lib/pagedPreviewCss";
import { createBookLayout } from "@/scriptorium/lib/bookLayout/createBookLayout";
import type { BookChapterInput } from "@/scriptorium/lib/bookLayout/types";
import { compactPrintImages, fitCroppedArt, fitCroppedPictures } from "@/scriptorium/lib/printImages";
import type { PageFurnitureItem } from "@/scriptorium/types";
import type {
  ScriptoriumFooterStyle,
  ScriptoriumFooterTitle,
  ScriptoriumPageSize,
  ScriptoriumPaperTone,
  ScriptoriumTheme,
} from "@/scriptorium/types";
import scriptoriumFontsCss from "@/scriptorium/styles/fonts.css?inline";
import { bookSurfaceClasses, scriptoriumThemeCss } from "@/scriptorium/lib/looks";
import { buildPdfDocumentHtml, serializeStyle } from "@/scriptorium/lib/printDocument";
import { inlineSameOriginAssets } from "@/scriptorium/lib/inlineSameOriginAssets";
import { attachBundleToPdf } from "@/scriptorium/lib/campaignBundlePdf";
import type { GrimoireBundle } from "@/composables/campaign/useWorldBundle";
import { downloadBlob } from "@/lib/downloadBlob";
import { checkPrintedPages } from "@/scriptorium/lib/printCheck";
import { expectedPagesFromDom } from "@/scriptorium/lib/printCheckDom";
import type { ExpectedPage, PrintMismatch } from "@/scriptorium/lib/printCheck";
import { readPdfPageTexts } from "@/scriptorium/lib/pdfPageTexts";
import type { BookPageInfo } from "@/scriptorium/lib/bookLayout/types";
import {
  chunkPagesHtml,
  mergePdfs,
  planPdfChunks,
  splitPagesHtml,
  utf8ByteLength,
  withBusyRetry,
} from "@/scriptorium/lib/pdfChunks";
import type { PageRange, PdfProgress, SplitPages } from "@/scriptorium/lib/pdfChunks";

/**
 * Where an export is: laying out chapter `part` of `total`, then printing part
 * `part` of `total`. (`part`/`total` keep the shape PdfProgress has, so a
 * consumer that only counts still works.)
 */
export interface PdfExportProgress extends PdfProgress {
  phase: "layout" | "print";
}

/** The button/dialog label while a PDF is building. */
export function pdfExportProgressLabel(progress: PdfExportProgress | null): string {
  if (!progress) return "Building…";
  if (progress.phase === "layout") return `Laying out chapter ${progress.part} of ${progress.total}…`;
  return progress.total > 1 ? `Printing part ${progress.part} of ${progress.total}…` : "Building…";
}

/** A page that printed differently, with where the editor can show it. */
export interface PrintCheckMismatch extends PrintMismatch {
  chapterId: string | null;
  /** 1-based within its chapter; null for a blank or an extra page, which the editor cannot jump to. */
  pageInChapter: number | null;
}

/** Where the read-back of the last export is. */
export type PrintCheckState =
  | { status: "checking" }
  | { status: "done"; pageCount: number; mismatches: PrintCheckMismatch[] }
  /** pdf.js could not read the file: nothing is claimed either way. */
  | { status: "unavailable" };

/**
 * Compares the PDF that came back with the pages that were sent. `read` is
 * pdf.js in the browser; tests hand it a stand-in.
 */
export async function verifyPrintedPdf(
  bytes: Uint8Array,
  expected: ExpectedPage[],
  pages: BookPageInfo[],
  read: (bytes: Uint8Array) => Promise<string[]> = readPdfPageTexts,
): Promise<PrintCheckState> {
  try {
    const result = checkPrintedPages(expected, await read(bytes));
    if (result.ok) return { status: "done", pageCount: expected.length, mismatches: [] };
    return {
      status: "done",
      pageCount: expected.length,
      mismatches: result.pages.map((m) => {
        // An extra page lies past the sent ones, so it has no entry here.
        const info = pages[m.index];
        return { ...m, chapterId: info?.chapterId ?? null, pageInChapter: info?.pageInChapter ?? null };
      }),
    };
  } catch {
    return { status: "unavailable" };
  }
}

export interface PdfDocumentOptions {
  /** The book's chapters, in order; each is laid out on its own (bookLayout). */
  chapters: BookChapterInput[];
  title: string;
  theme: ScriptoriumTheme;
  paperTone: ScriptoriumPaperTone | null;
  footerStyle: ScriptoriumFooterStyle;
  pageSize: ScriptoriumPageSize;
  inkFriendly: boolean;
  isTwoColumn: boolean;
  showPageNumbers: boolean;
  footerText: string;
  /** What the right-hand pages' running title says; left pages carry `title`. */
  footerTitle: ScriptoriumFooterTitle;
  pageNumberStart: number;
  furniture: PageFurnitureItem[];
}

export interface PdfExportOptions extends PdfDocumentOptions {
  /** When set, the campaign data is embedded in the PDF as an invisible attachment. */
  bundle?: GrimoireBundle;
}

/** A filename for the download: illegal characters stripped, whitespace collapsed. */
export function sanitizePdfFilename(title: string, withCampaignData = false): string {
  const base =
    title
      // eslint-disable-next-line no-control-regex
      .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/^\.+/, "") || "Untitled";
  return withCampaignData ? `${base} (with campaign data).pdf` : `${base}.pdf`;
}

/** One print request; a failure carries the edge function's own message. */
async function renderPart(html: string): Promise<Blob> {
  const { data, error: fnError } = await supabase.functions.invoke("render-pdf", { body: { html } });
  if (fnError) throw new Error(await edgeErrorMessage(fnError));
  if (!(data instanceof Blob)) throw new Error("The PDF renderer returned an unexpected answer.");
  return data;
}

/** Where the pages go in the inlined shell. */
const PAGES_MARKER = "<!--sc-pages-->";

async function fetchSameOrigin(path: string): Promise<ArrayBuffer> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${path} answered ${res.status}`);
  return res.arrayBuffer();
}

export function useScriptoriumPdf() {
  const isExporting = ref(false);
  const exportError = ref<string | null>(null);
  /** Which part of a multi-part export is printing; null when idle. */
  const progress = ref<PdfExportProgress | null>(null);
  /** The read-back of the last export; null before one has been made. */
  const printCheck = ref<PrintCheckState | null>(null);

  /** Resolves true when the file was downloaded, false when it failed (exportError says why). */
  async function exportPdf(opts: PdfExportOptions): Promise<boolean> {
    if (isExporting.value) return false;
    isExporting.value = true;
    exportError.value = null;
    printCheck.value = null;

    const cls = bookSurfaceClasses(opts).join(" ");
    const themeCss = scriptoriumThemeCss(opts.theme);
    const pagedCss = buildPagedPreviewCss({ pageSize: opts.pageSize, inkFriendly: opts.inkFriendly });
    // 1. Off-screen render in the main document.
    const host = document.createElement("div");
    host.className = `sc-theme ${cls}`;
    // px on purpose: 794px is A4's width at 96 dpi, the geometry Paged.js
    // lays out against; a rem width would scale with the root font size.
    host.style.cssText = "position:fixed; left:-99999px; top:0; width:794px;";
    document.body.appendChild(host);

    // The same engine as the live preview, so the exported PDF breaks where
    // the screen does: pre-layout pass, a Paged.js run per chapter, blank
    // pages, then footers, contents numbers and furniture over all the pages.
    const book = createBookLayout(host);
    try {
      // Cropped pictures take the crop's shape before layout, so a stale bake cannot give them the wrong box.
      const chapters = await Promise.all(opts.chapters.map(async (c) => ({ ...c, html: await fitCroppedPictures(c.html) })));
      const furniture = await fitCroppedArt(opts.furniture);
      const laid = await book.layout(
        {
          chapters,
          settings: {
            pageSize: opts.pageSize,
            isTwoColumn: opts.isTwoColumn,
            showPageNumbers: opts.showPageNumbers,
            pageNumberStart: opts.pageNumberStart,
            footerText: opts.footerText,
            footerTitle: opts.footerTitle,
            bookTitle: opts.title,
            inkFriendly: opts.inkFriendly,
            theme: opts.theme,
          },
          stylesheets: [{ "scriptorium-paged.css": pagedCss }],
          furniture: { items: furniture }, // non-interactive, decorations only
        },
        {
          onChapter: ({ done, total }) => {
            progress.value = { phase: "layout", part: done, total };
          },
        },
      );
      await document.fonts.ready;
      // One wrapper around every page: the print runs are cut from its markup.
      book.flattenPages();
      // Pictures at 300 ppi of their printed size, opaque ones as JPEG, before
      // the pages are copied: otherwise every WebP goes into the PDF
      // losslessly at full size (printImages.ts).
      await compactPrintImages(host);

      // 2. Capture the page-sizing rules Paged.js injected into the main head.
      const pagedStyles = book.styleElements().map(serializeStyle).join("\n");
      let pagesHtml = host.innerHTML;

      // 3. Everything the document loads from the app's own origin (fonts,
      //    the page background) travels inside the HTML (see header), then
      //    the server prints it. The shell (head + styles) is inlined once with
      //    a marker where the pages go; each page is inlined on its own so its
      //    byte size is known exactly for the chunk planner.
      const assetCache = new Map<string, Promise<ArrayBuffer>>();
      const fetchCached = (path: string) => {
        let hit = assetCache.get(path);
        if (!hit) {
          hit = fetchSameOrigin(path);
          assetCache.set(path, hit);
        }
        return hit;
      };
      const shell = await inlineSameOriginAssets(
        buildPdfDocumentHtml({
          title: opts.title,
          theme: opts.theme,
          paperTone: opts.paperTone,
          footerStyle: opts.footerStyle,
          inkFriendly: opts.inkFriendly,
          pageSize: opts.pageSize,
          fontsCss: scriptoriumFontsCss,
          themeCss,
          pagedStyles,
          pagesHtml: PAGES_MARKER,
        }),
        fetchCached,
      );
      const [shellHead, shellTail] = shell.split(PAGES_MARKER);
      const assemble = (pages: string) => shellHead + pages + shellTail;

      const pageEls = Array.from(host.querySelectorAll<HTMLElement>(".pagedjs_page"));
      // What each page says, for the read-back; taken before the DOM is let go.
      // Only trusted when the layout's page list and the DOM agree.
      const pageInfos = laid && laid.pages.length === pageEls.length ? laid.pages : null;
      const expected = pageInfos ? expectedPagesFromDom(pageEls, pageInfos.map((p) => p.label)) : null;
      const split: SplitPages = splitPagesHtml(
        pagesHtml,
        pageEls.map((el) => el.outerHTML),
      );
      // The laid-out DOM and its serialisation are done with: a 60 MB book
      // otherwise holds them beside the inlined segments (tablets run out).
      pageEls.length = 0;
      pagesHtml = "";
      host.replaceChildren();
      split.prefix = await inlineSameOriginAssets(split.prefix, fetchCached);
      split.suffix = await inlineSameOriginAssets(split.suffix, fetchCached);
      // One page at a time, replacing the original so it can be collected;
      // utf8ByteLength measures without allocating an encoded copy.
      const segmentBytes: number[] = [];
      for (let i = 0; i < split.segments.length; i++) {
        split.segments[i] = await inlineSameOriginAssets(split.segments[i], fetchCached);
        segmentBytes.push(utf8ByteLength(split.segments[i]));
      }
      const overhead = utf8ByteLength(assemble(split.prefix + split.suffix));
      const ranges = planPdfChunks(segmentBytes, overhead);
      // A book with no pages is still one (empty) request.
      if (ranges.length === 0) ranges.push({ start: 0, end: 0 });

      // A book that fits is one request with the pages exactly as laid out;
      // a big one is printed in consecutive parts and stitched below. Each
      // part's HTML is built, sent and dropped before the next is built.
      const renderRange = async (range: PageRange): Promise<Blob> => {
        const html = assemble(chunkPagesHtml(split, range));
        return withBusyRetry(() => renderPart(html));
      };
      const parts: Blob[] = [];
      for (const [i, range] of ranges.entries()) {
        progress.value = { phase: "print", part: i + 1, total: ranges.length };
        parts.push(await renderRange(range));
      }
      const data =
        parts.length === 1
          ? parts[0]
          : new Blob(
              [
                (await mergePdfs(await Promise.all(parts.map((part) => part.arrayBuffer())))) as Uint8Array<ArrayBuffer>,
              ],
              { type: "application/pdf" },
            );

      // 4. Optionally attach the campaign data, then hand the file over.
      const printedBytes = new Uint8Array(await data.arrayBuffer());
      if (opts.bundle) {
        const bytes = await attachBundleToPdf(printedBytes.buffer.slice(0) as ArrayBuffer, opts.bundle);
        downloadBlob(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: "application/pdf" }), sanitizePdfFilename(opts.title, true));
      } else {
        downloadBlob(data, sanitizePdfFilename(opts.title));
      }

      // 5. The read-back runs on the PDF the printer made, after the download
      //    is handed over and without holding the export open.
      if (expected && pageInfos) {
        printCheck.value = { status: "checking" };
        void verifyPrintedPdf(printedBytes, expected, pageInfos).then((state) => {
          printCheck.value = state;
        });
      }
      return true;
    } catch (err) {
      exportError.value = err instanceof Error ? err.message : "The PDF could not be created.";
      return false;
    } finally {
      // Remove the off-screen host + the Paged.js styles it added to the app head.
      host.remove();
      book.dispose();
      isExporting.value = false;
      progress.value = null;
    }
  }

  return { isExporting, exportError, progress, printCheck, exportPdf };
}
