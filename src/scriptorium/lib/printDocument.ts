/*
 * The document the export sends to the printer, assembled from already
 * laid-out pages (#565). Its own module so the print test in CI
 * (scripts/scriptorium/print-check.ts) builds the very same document the
 * export does, with the same print CSS, without the Supabase client.
 */
import { PAGE_CONTENT_SELECTOR } from "@/scriptorium/lib/pagedPreviewCss";
import type {
  ScriptoriumFooterStyle,
  ScriptoriumPageSize,
  ScriptoriumPaperTone,
  ScriptoriumTheme,
} from "@/scriptorium/types";
import themeBaseCss from "@/scriptorium/styles/theme-base.css?inline";
import { bookSurfaceClasses } from "@/scriptorium/lib/looks";
import { escapeHtml } from "@/lib/escapeHtml";

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
 * (pageGeometry.ts); this sheet comes last, so it wins. A table header
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
export function serializeStyle(el: HTMLStyleElement): string {
  try {
    return Array.from(el.sheet?.cssRules ?? []).map((r) => r.cssText).join("\n");
  } catch {
    return el.textContent ?? "";
  }
}

export interface PdfDocumentAssembly {
  title: string;
  theme: ScriptoriumTheme;
  paperTone?: ScriptoriumPaperTone | null;
  footerStyle?: ScriptoriumFooterStyle;
  inkFriendly?: boolean;
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
  const cls = bookSurfaceClasses(opts).join(" ");
  return (
    `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(opts.title || "Untitled")}</title>` +
    `<style>${opts.fontsCss}</style>` +
    `<style>${themeBaseCss}</style><style>${opts.themeCss}</style>` +
    `<style>${opts.pagedStyles}</style>` +
    `<style>${printResetCss(opts.pageSize)}</style></head>` +
    `<body class="sc-theme ${cls}">${opts.pagesHtml}</body></html>`
  );
}

