/*
 * Real PDF export for Scriptorium (#565): the app hands the user a PDF file,
 * not a print dialog.
 *
 * Pipeline:
 *   1. Lay the book out in the client with Paged.js, in an off-screen host in
 *      the main document (Paged.js needs real layout and injects its page-sizing
 *      rules into document.head via insertRule, so textContent is empty). The
 *      book is laid out chapter by chapter by the same engine as the live
 *      preview (lib/scriptorium/bookLayout), with the same pre-layout pass,
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
 */

import { ref } from "vue";
import { supabase } from "@/lib/supabase";
import { edgeErrorMessage } from "@edge-shared/edgeError.ts";
import { buildPagedPreviewCss, PAGE_CONTENT_SELECTOR } from "@/lib/scriptorium/pagedPreviewCss";
import { createBookLayout } from "@/lib/scriptorium/bookLayout/createBookLayout";
import type { BookChapterInput } from "@/lib/scriptorium/bookLayout/types";
import { compactPrintImages } from "@/lib/scriptorium/printImages";
import type { PageFurnitureItem } from "@/types/scriptorium.types";
import type { ScriptoriumPageSize, ScriptoriumTheme } from "@/types/scriptorium.types";
import scriptoriumFontsCss from "@/assets/scriptorium/fonts.css?inline";
import themeBaseCss from "@/assets/scriptorium/theme-base.css?inline";
import { scriptoriumThemeClass, scriptoriumThemeCss } from "@/lib/scriptorium/looks";
import { escapeHtml } from "@/lib/escapeHtml";
import { inlineSameOriginAssets } from "@/lib/scriptorium/inlineSameOriginAssets";
import { attachBundleToPdf } from "@/lib/scriptorium/campaignBundlePdf";
import type { GrimoireBundle } from "@/composables/campaign/useWorldBundle";
import { downloadBlob } from "@/lib/downloadBlob";
import {
  chunkPagesHtml,
  mergePdfs,
  planPdfChunks,
  splitPagesHtml,
  utf8ByteLength,
  withBusyRetry,
} from "@/lib/scriptorium/pdfChunks";
import type { PageRange, PdfProgress, SplitPages } from "@/lib/scriptorium/pdfChunks";

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

export interface PdfDocumentOptions {
  /** The book's chapters, in order; each is laid out on its own (bookLayout). */
  chapters: BookChapterInput[];
  title: string;
  theme: ScriptoriumTheme;
  pageSize: ScriptoriumPageSize;
  inkFriendly: boolean;
  isTwoColumn: boolean;
  showPageNumbers: boolean;
  footerText: string;
  pageNumberStart: number;
  furniture: PageFurnitureItem[];
}

const PAGE_SIZE_KEYWORD: Record<ScriptoriumPageSize, string> = {
  A4: "A4",
  A5: "A5",
  Letter: "letter",
};

/**
 * Print CSS: each laid-out .pagedjs_page is already a full page-sized box, so
 * the print sheet uses margin:0 and the page's own margins (baked in by
 * Paged.js) provide the gutter. print-color-adjust keeps the parchment. The
 * page's text area gets back the PRINT_SLACK_PX it was fitted without
 * (pagedPreviewCss.ts); this sheet comes last, so it wins. A table header
 * prints once per table piece, as it was measured: Paged.js already copies
 * the header into each page's piece, and Chrome's print layout (not its
 * screen layout) also repeats it at a column break, which made a name table
 * split across Sothery's two columns 24px taller than its page allowed and
 * pushed the next table's last rows off the page (#1115).
 */
function printResetCss(pageSize: ScriptoriumPageSize): string {
  return `
@page { size: ${PAGE_SIZE_KEYWORD[pageSize]}; margin: 0; }
html, body { margin: 0; padding: 0; background: #fff; }
.pagedjs_pages { display: block; }
.pagedjs_page { box-shadow: none !important; margin: 0 !important; break-after: page; }
.pagedjs_page:last-of-type { break-after: auto; }
* { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
${PAGE_CONTENT_SELECTOR} { height: calc(100% - var(--pagedjs-footnotes-height)); }
thead { display: table-row-group; }
`;
}

/** Serialise stylesheet rules (Paged.js uses insertRule, so textContent is empty). */
function serializeStyle(el: HTMLStyleElement): string {
  try {
    return Array.from(el.sheet?.cssRules ?? []).map((r) => r.cssText).join("\n");
  } catch {
    return el.textContent ?? "";
  }
}

export interface PdfDocumentAssembly {
  title: string;
  theme: ScriptoriumTheme;
  pageSize: ScriptoriumPageSize;
  /** The fonts CSS with its font files already inlined as data: URIs. */
  fontsCss: string;
  /** Already-selected theme CSS (theme-onednd2024.css / theme-phb2014.css contents). */
  themeCss: string;
  /**
   * Serialised rules Paged.js injected into <head> for this render: its own
   * page rules and its processed copy of the per-document paged CSS. That
   * copy, never buildPagedPreviewCss's text, is what the pages were laid out
   * under. Paged.js takes `break-after`/`break-before` out of it and applies
   * them itself, so the raw text would hand Chrome native breaks the
   * pagination never saw: a heading kept with its table pushed a column 36px
   * down and Sothery's calendar lost its last paragraph (#1115).
   */
  pagedStyles: string;
  /** The rendered `.pagedjs_pages` markup. */
  pagesHtml: string;
}

/**
 * Pure assembly of the final HTML document sent to the renderer: title escaping, CSS
 * ordering, and the page-size-to-`@page`-keyword mapping. Split out from
 * `exportPdf()` (which has to render with Paged.js and touch the network
 * first) so this part is testable without either.
 */
export function buildPdfDocumentHtml(opts: PdfDocumentAssembly): string {
  const cls = scriptoriumThemeClass(opts.theme);
  return (
    `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(opts.title || "Untitled")}</title>` +
    `<style>${opts.fontsCss}</style>` +
    `<style>${themeBaseCss}</style><style>${opts.themeCss}</style>` +
    `<style>${opts.pagedStyles}</style>` +
    `<style>${printResetCss(opts.pageSize)}</style></head>` +
    `<body class="sc-theme ${cls}">${opts.pagesHtml}</body></html>`
  );
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

  /** Resolves true when the file was downloaded, false when it failed (exportError says why). */
  async function exportPdf(opts: PdfExportOptions): Promise<boolean> {
    if (isExporting.value) return false;
    isExporting.value = true;
    exportError.value = null;

    const cls = scriptoriumThemeClass(opts.theme);
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
      await book.layout(
        {
          chapters: opts.chapters,
          settings: {
            pageSize: opts.pageSize,
            isTwoColumn: opts.isTwoColumn,
            showPageNumbers: opts.showPageNumbers,
            pageNumberStart: opts.pageNumberStart,
            footerText: opts.footerText,
            inkFriendly: opts.inkFriendly,
            theme: opts.theme,
          },
          stylesheets: [{ "scriptorium-paged.css": pagedCss }],
          furniture: { items: opts.furniture }, // non-interactive, decorations only
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
      if (opts.bundle) {
        const bytes = await attachBundleToPdf(await data.arrayBuffer(), opts.bundle);
        downloadBlob(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: "application/pdf" }), sanitizePdfFilename(opts.title, true));
      } else {
        downloadBlob(data, sanitizePdfFilename(opts.title));
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

  return { isExporting, exportError, progress, exportPdf };
}
