/*
 * Vector PDF export for Scriptorium via the browser's print pipeline
 * (Phase B, #330). Replaces the html2canvas + jsPDF raster snapshot path.
 *
 * Pipeline (validated by the #330 spike — Paged.js output prints as true
 * vector PDF with selectable text and embedded fonts):
 *   1. Render the document with Paged.js into an off-screen host in the main
 *      document (Paged.js needs real layout + injects its page-sizing rules
 *      into document.head via insertRule, so textContent is empty).
 *   2. Inject footers (shared numbering algorithm — parity with the preview).
 *   3. Serialise the Paged.js-injected styles (cssRules) and transplant the
 *      rendered pages + all required CSS into a hidden same-origin iframe.
 *   4. Print the iframe → the user's "Save as PDF" yields a vector PDF.
 *
 * The iframe fully isolates print from the app's layout/scroll/zoom and is
 * removed after printing. The same HTML+CSS bundle is what the Phase E server
 * renderer will print headlessly.
 */

import { ref } from "vue";
import { Previewer } from "pagedjs";
import { buildPagedPreviewCss } from "@/lib/scriptorium/pagedPreviewCss";
import { injectPagedFooters } from "@/lib/scriptorium/pagedFooters";
import { expandTocPlaceholder, fillPagedTocPages } from "@/lib/scriptorium/pagedToc";
import { stripTrailingEmptyParagraphs } from "@/lib/scriptorium/stripTrailingEmpty";
import { renderFurniture } from "@/lib/scriptorium/furniture/renderFurniture";
import type { PageFurnitureItem } from "@/types/scriptorium.types";
import type { ScriptoriumPageSize, ScriptoriumTheme } from "@/types/scriptorium.types";
import scriptoriumFontsCss from "@/assets/scriptorium/fonts.css?inline";
import themeBaseCss from "@/assets/scriptorium/theme-base.css?inline";
import themeOnednd2024Css from "@/assets/scriptorium/theme-onednd2024.css?inline";
import themePhb2014Css from "@/assets/scriptorium/theme-phb2014.css?inline";

export interface PrintDocumentOptions {
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

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string,
  );
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

export function useScriptoriumPrint() {
  const isPrinting = ref(false);

  async function printDocument(opts: PrintDocumentOptions): Promise<void> {
    if (isPrinting.value) return;
    isPrinting.value = true;

    const cls = themeClass(opts.theme);
    const themeCss = opts.theme === "phb2014" ? themePhb2014Css : themeOnednd2024Css;
    const pagedCss = buildPagedPreviewCss({ pageSize: opts.pageSize, inkFriendly: opts.inkFriendly });
    const bodyHtml = expandTocPlaceholder(stripTrailingEmptyParagraphs(opts.bodyHtml), {
      showPageNumbers: opts.showPageNumbers,
    });
    const content = opts.isTwoColumn ? `<div class="phb-two-col">${bodyHtml}</div>` : bodyHtml;

    // 1. Off-screen render in the main document.
    const host = document.createElement("div");
    host.className = `sc-theme ${cls}`;
    host.style.cssText = "position:fixed; left:-99999px; top:0; width:794px;";
    document.body.appendChild(host);

    const stylesBefore = new Set(Array.from(document.head.querySelectorAll("style")));
    let iframe: HTMLIFrameElement | null = null;
    try {
      await new Previewer().preview(content, [{ "scriptorium-paged.css": pagedCss }], host);
      await document.fonts.ready;
      injectPagedFooters(host, {
        showPageNumbers: opts.showPageNumbers,
        footerText: opts.footerText,
        start: opts.pageNumberStart,
      });
      fillPagedTocPages(host, { showPageNumbers: opts.showPageNumbers, start: opts.pageNumberStart });
      renderFurniture(host, opts.furniture); // non-interactive — decorations only

      // 2. Capture the page-sizing rules Paged.js injected into the main head.
      const pagedStyles = Array.from(document.head.querySelectorAll("style"))
        .filter((s) => !stylesBefore.has(s))
        .map(serializeStyle)
        .join("\n");
      const pagesHtml = host.innerHTML;

      // 3. Transplant into a hidden print iframe.
      iframe = document.createElement("iframe");
      iframe.setAttribute("aria-hidden", "true");
      iframe.style.cssText = "position:fixed; right:0; bottom:0; width:0; height:0; border:0;";
      document.body.appendChild(iframe);
      const idoc = iframe.contentDocument!;
      idoc.open();
      idoc.write(
        `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(opts.title || "Untitled")}</title>` +
          `<style>${scriptoriumFontsCss}</style>` +
          `<style>${themeBaseCss}</style><style>${themeCss}</style>` +
          `<style>${pagedCss}</style><style>${pagedStyles}</style>` +
          `<style>${printResetCss(opts.pageSize)}</style></head>` +
          `<body class="sc-theme ${cls}">${pagesHtml}</body></html>`,
      );
      idoc.close();
    } finally {
      // Remove the off-screen host + the Paged.js styles it added to the app head.
      host.remove();
      Array.from(document.head.querySelectorAll("style"))
        .filter((s) => !stylesBefore.has(s))
        .forEach((s) => s.remove());
    }

    // 4. Wait for the iframe to settle, then print + self-clean.
    const win = iframe.contentWindow!;
    await new Promise<void>((resolve) => {
      const done = () => resolve();
      if (iframe!.contentDocument?.readyState === "complete") {
        void (win.document.fonts?.ready ?? Promise.resolve()).then(done);
      } else {
        iframe!.addEventListener("load", () => void (win.document.fonts?.ready ?? Promise.resolve()).then(done), { once: true });
      }
    });

    const cleanup = () => {
      iframe?.remove();
      isPrinting.value = false;
    };
    win.addEventListener("afterprint", cleanup, { once: true });
    // Fallback in case afterprint never fires (some browsers when cancelled).
    setTimeout(cleanup, 60_000);

    win.focus();
    win.print();
  }

  return { isPrinting, printDocument };
}
