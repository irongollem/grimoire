/*
 * Runs in the browser for the print test (#1176): lays the fixture book out
 * with the app's own engine, exactly as exportPdf does, and hands back the
 * document the export would send to the printer plus what each page says.
 * No Supabase, no network: nothing of the export that needs them is used.
 */
import { buildPagedPreviewCss } from "@/scriptorium/lib/pagedPreviewCss";
import { createBookLayout } from "@/scriptorium/lib/bookLayout/createBookLayout";
import { buildPdfDocumentHtml, serializeStyle } from "@/scriptorium/lib/printDocument";
import { expectedPagesFromDom } from "@/scriptorium/lib/printCheckDom";
import type { LaidOutFixture } from "../laidOutFixture";
import { scriptoriumThemeClass, scriptoriumThemeCss } from "@/scriptorium/lib/looks";
import scriptoriumFontsCss from "@/scriptorium/styles/fonts.css?inline";
import { FIXTURE_CHAPTERS } from "./printCheckFixture";

// The book's own stylesheets, as the app's main.css loads them: the page is laid
// out under them, so the layout measures what the printer will print. (Tailwind
// is left out on purpose; the book states its own baseline, theme-base.css.)
import "@/scriptorium/styles/theme-base.css";
import "@/scriptorium/styles/theme-grimoire.css";
import "@/scriptorium/styles/theme-onednd2024.css";
import "@/scriptorium/styles/theme-phb2014.css";
import "@/scriptorium/styles/theme-letter.css";
import "@/scriptorium/styles/theme-notice.css";
import "@/scriptorium/styles/theme-journal.css";
import "@/scriptorium/styles/theme-plain.css";
import "@/scriptorium/styles/scriptorium-page-flow.css";

async function layoutFixture(): Promise<LaidOutFixture> {
  const theme = "onednd2024" as const;
  const pageSize = "A4" as const;
  const fonts = document.createElement("style");
  fonts.textContent = scriptoriumFontsCss;
  document.head.appendChild(fonts);
  const host = document.createElement("div");
  host.className = `sc-theme ${scriptoriumThemeClass(theme)}`;
  host.style.cssText = "position:fixed; left:-99999px; top:0; width:794px;";
  document.body.appendChild(host);

  const book = createBookLayout(host);
  const laid = await book.layout({
    chapters: FIXTURE_CHAPTERS,
    settings: {
      pageSize,
      isTwoColumn: true,
      showPageNumbers: true,
      pageNumberStart: 1,
      footerText: "The Sunken Gate",
      inkFriendly: false,
      theme,
    },
    stylesheets: [{ "scriptorium-paged.css": buildPagedPreviewCss({ pageSize, inkFriendly: false }) }],
  });
  if (!laid) throw new Error("The fixture layout was called off.");
  await document.fonts.ready;
  book.flattenPages();

  const pagedStyles = book.styleElements().map(serializeStyle).join("\n");
  const pageEls = Array.from(host.querySelectorAll<HTMLElement>(".pagedjs_page"));
  if (pageEls.length !== laid.pages.length) {
    throw new Error(`The layout reports ${laid.pages.length} pages but ${pageEls.length} are on the page.`);
  }
  const expected = expectedPagesFromDom(
    pageEls,
    laid.pages.map((p) => p.label),
  );
  const html = buildPdfDocumentHtml({
    title: "Print check",
    theme,
    pageSize,
    fontsCss: scriptoriumFontsCss,
    themeCss: scriptoriumThemeCss(theme),
    pagedStyles,
    pagesHtml: host.innerHTML,
  });
  return { html, expected };
}

declare global {
  interface Window {
    layoutFixture: typeof layoutFixture;
  }
}
window.layoutFixture = layoutFixture;
