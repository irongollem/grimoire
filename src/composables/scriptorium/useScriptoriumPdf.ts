/*
 * Real PDF export for Scriptorium (#565): the app hands the user a PDF file,
 * not a print dialog.
 *
 * Pipeline:
 *   1. Lay the book out in the client with Paged.js, in an off-screen host in
 *      the main document (Paged.js needs real layout and injects its page-sizing
 *      rules into document.head via insertRule, so textContent is empty). The
 *      same pre-layout pass, footers and TOC numbering as the live preview run,
 *      so the PDF breaks exactly where the preview does.
 *   2. Redraw pictures at print size as data: URLs (printImages.ts) and inline
 *      everything the document loads from the app's own origin (the
 *      self-hosted fonts, the page background) as data: URIs
 *      (inlineSameOriginAssets.ts). The server's browser cannot reach the
 *      app's origin, so all of it has to travel inside the HTML; a font it
 *      could not fetch would fall back to Georgia, the failure the
 *      self-hosted fonts exist to prevent. (A picture the canvas cannot read
 *      keeps its public CDN URL, which the server can fetch.)
 *   3. Assemble one HTML document from the already-laid-out pages and send it
 *      to the `render-pdf` edge function, which prints it and answers with the
 *      PDF bytes. No layout happens server-side.
 *   4. Optionally attach the campaign data to the PDF (campaignBundlePdf.ts),
 *      then download the bytes through an object URL.
 */

import { ref } from "vue";
import { supabase } from "@/lib/supabase";
import { edgeErrorMessage } from "@edge-shared/edgeError.ts";
import { Previewer } from "pagedjs";
import { buildPagedPreviewCss } from "@/lib/scriptorium/pagedPreviewCss";
import { injectPagedFooters } from "@/lib/scriptorium/pagedFooters";
import { fillPagedTocPages } from "@/lib/scriptorium/pagedToc";
import { preparePagedBody } from "@/lib/scriptorium/pagedPrepare";
import { registerPagedEntryFit } from "@/lib/scriptorium/pagedEntryFit";
import { compactPrintImages } from "@/lib/scriptorium/printImages";
import { renderFurniture } from "@/lib/scriptorium/furniture/renderFurniture";
import type { PageFurnitureItem } from "@/types/scriptorium.types";
import type { ScriptoriumPageSize, ScriptoriumTheme } from "@/types/scriptorium.types";
import scriptoriumFontsCss from "@/assets/scriptorium/fonts.css?inline";
import themeBaseCss from "@/assets/scriptorium/theme-base.css?inline";
import themeOnednd2024Css from "@/assets/scriptorium/theme-onednd2024.css?inline";
import themePhb2014Css from "@/assets/scriptorium/theme-phb2014.css?inline";
import { escapeHtml } from "@/lib/escapeHtml";
import { inlineSameOriginAssets } from "@/lib/scriptorium/inlineSameOriginAssets";
import { attachBundleToPdf } from "@/lib/scriptorium/campaignBundlePdf";
import type { GrimoireBundle } from "@/composables/campaign/useWorldBundle";

export interface PdfDocumentOptions {
  bodyHtml: string;
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

function themeClass(theme: ScriptoriumTheme): string {
  return theme === "phb2014" ? "theme-phb2014" : "theme-onednd2024";
}

/**
 * Print CSS: each laid-out .pagedjs_page is already a full page-sized box, so
 * the print sheet uses margin:0 and the page's own margins (baked in by
 * Paged.js) provide the gutter. print-color-adjust keeps the parchment.
 */
function printResetCss(pageSize: ScriptoriumPageSize): string {
  return `
@page { size: ${PAGE_SIZE_KEYWORD[pageSize]}; margin: 0; }
html, body { margin: 0; padding: 0; background: #fff; }
.pagedjs_pages { display: block; }
.pagedjs_page { box-shadow: none !important; margin: 0 !important; break-after: page; }
.pagedjs_page:last-of-type { break-after: auto; }
* { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
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
  /** The per-document paged CSS (buildPagedPreviewCss output). */
  pagedCss: string;
  /** Serialised rules Paged.js injected into <head> for this render. */
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
  const cls = themeClass(opts.theme);
  return (
    `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(opts.title || "Untitled")}</title>` +
    `<style>${opts.fontsCss}</style>` +
    `<style>${themeBaseCss}</style><style>${opts.themeCss}</style>` +
    `<style>${opts.pagedCss}</style><style>${opts.pagedStyles}</style>` +
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

async function fetchSameOrigin(path: string): Promise<ArrayBuffer> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${path} answered ${res.status}`);
  return res.arrayBuffer();
}

function downloadBytes(bytes: Uint8Array<ArrayBuffer> | Blob, filename: string): void {
  const blob = bytes instanceof Blob ? bytes : new Blob([bytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function useScriptoriumPdf() {
  const isExporting = ref(false);
  const exportError = ref<string | null>(null);

  /** Resolves true when the file was downloaded, false when it failed (exportError says why). */
  async function exportPdf(opts: PdfExportOptions): Promise<boolean> {
    if (isExporting.value) return false;
    isExporting.value = true;
    exportError.value = null;

    const cls = themeClass(opts.theme);
    const themeCss = opts.theme === "phb2014" ? themePhb2014Css : themeOnednd2024Css;
    const pagedCss = buildPagedPreviewCss({ pageSize: opts.pageSize, inkFriendly: opts.inkFriendly });
    // The same pre-layout pass the live preview runs (pagedPrepare.ts), so
    // the exported PDF breaks where the screen does.
    const content = preparePagedBody(opts.bodyHtml, {
      showPageNumbers: opts.showPageNumbers,
      pageSize: opts.pageSize,
      isTwoColumn: opts.isTwoColumn,
    });

    // 1. Off-screen render in the main document.
    const host = document.createElement("div");
    host.className = `sc-theme ${cls}`;
    // px on purpose: 794px is A4's width at 96 dpi, the geometry Paged.js
    // lays out against; a rem width would scale with the root font size.
    host.style.cssText = "position:fixed; left:-99999px; top:0; width:794px;";
    document.body.appendChild(host);

    const stylesBefore = new Set(Array.from(document.head.querySelectorAll("style")));
    try {
      registerPagedEntryFit();
      await new Previewer().preview(content, [{ "scriptorium-paged.css": pagedCss }], host);
      await document.fonts.ready;
      injectPagedFooters(host, {
        showPageNumbers: opts.showPageNumbers,
        footerText: opts.footerText,
        start: opts.pageNumberStart,
      });
      fillPagedTocPages(host, { showPageNumbers: opts.showPageNumbers, start: opts.pageNumberStart });
      renderFurniture(host, opts.furniture); // non-interactive, decorations only
      // Pictures at 300 ppi of their printed size, opaque ones as JPEG, before
      // the pages are copied: otherwise every WebP goes into the PDF
      // losslessly at full size (printImages.ts).
      await compactPrintImages(host);

      // 2. Capture the page-sizing rules Paged.js injected into the main head.
      const pagedStyles = Array.from(document.head.querySelectorAll("style"))
        .filter((s) => !stylesBefore.has(s))
        .map(serializeStyle)
        .join("\n");
      const pagesHtml = host.innerHTML;

      // 3. Everything the document loads from the app's own origin (fonts,
      //    the page background) travels inside the HTML (see header), then
      //    the server prints it.
      const html = await inlineSameOriginAssets(
        buildPdfDocumentHtml({
          title: opts.title,
          theme: opts.theme,
          pageSize: opts.pageSize,
          fontsCss: scriptoriumFontsCss,
          themeCss,
          pagedCss,
          pagedStyles,
          pagesHtml,
        }),
        fetchSameOrigin,
      );
      const { data, error: fnError } = await supabase.functions.invoke("render-pdf", { body: { html } });
      if (fnError) throw new Error(await edgeErrorMessage(fnError));
      if (!(data instanceof Blob)) throw new Error("The PDF renderer returned an unexpected answer.");

      // 4. Optionally attach the campaign data, then hand the file over.
      if (opts.bundle) {
        const bytes = await attachBundleToPdf(await data.arrayBuffer(), opts.bundle);
        downloadBytes(bytes as Uint8Array<ArrayBuffer>, sanitizePdfFilename(opts.title, true));
      } else {
        downloadBytes(data, sanitizePdfFilename(opts.title));
      }
      return true;
    } catch (err) {
      exportError.value = err instanceof Error ? err.message : "The PDF could not be created.";
      return false;
    } finally {
      // Remove the off-screen host + the Paged.js styles it added to the app head.
      host.remove();
      Array.from(document.head.querySelectorAll("style"))
        .filter((s) => !stylesBefore.has(s))
        .forEach((s) => s.remove());
      isExporting.value = false;
    }
  }

  return { isExporting, exportError, exportPdf };
}
