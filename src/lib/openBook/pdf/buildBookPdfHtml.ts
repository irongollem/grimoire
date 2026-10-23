/**
 * A release, laid out and ready to print (#1085): the articles drawn with the reader's components, wrapped in the
 * cover, title page and contents, cut into pages, and assembled into one self-contained HTML document. Everything
 * the document loads from the app's own origin travels inside it, because the renderer cannot reach that origin.
 *
 * This stops short of the network. The export (`useOpenBookPdf`) sends the string to the renderer; a developer
 * without the renderer's secrets can print it in a local browser to look at the pages.
 */

import { buildBookModel } from "@/lib/openBook/bookModel";
import { inlineSameOriginAssets } from "@/lib/scriptorium/inlineSameOriginAssets";
import scriptoriumFontsCss from "@/assets/scriptorium/fonts.css?inline";
import type { OpenBookSnapshot } from "@/types/openBook.types";
import { prepareSectionHtml } from "./bookLinks";
import { buildPagedCss } from "./bookCss";
import { buildBookDocumentHtml } from "./bookDocument";
import { buildBookMarkup, coverMarkup, type PrintRelease } from "./bookMarkup";
import { layoutBook } from "./layoutBook";
import { renderArticles } from "./renderArticles";
import { INDEX_KEY } from "@/lib/openBook/sections";

export interface BuildBookPdfOptions {
  snapshot: OpenBookSnapshot;
  release: PrintRelease;
  slug: string;
  /** Where the public book is read: links the PDF cannot keep inside itself point here. */
  origin: string;
}

async function fetchSameOrigin(path: string): Promise<ArrayBuffer> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${path} answered ${res.status}`);
  return res.arrayBuffer();
}

export interface BuiltBookPdf {
  html: string;
  pageCount: number;
}

export async function buildBookPdfHtml({ snapshot, release, slug, origin }: BuildBookPdfOptions): Promise<BuiltBookPdf> {
  const model = buildBookModel(snapshot);
  const rendered = await renderArticles(model, slug);
  const ctx = { slug, origin, entryIds: new Set(model.entries.map((e) => e.id)) };
  const sectionHtml = new Map<string, string>();
  for (const [key, html] of rendered) {
    sectionHtml.set(key, prepareSectionHtml(html, ctx, { pageRefs: key === INDEX_KEY }));
  }

  const markup = buildBookMarkup({ model, release, sectionHtml });
  const pagedCss = buildPagedCss();
  const laid = await layoutBook(markup, pagedCss);

  const html = await inlineSameOriginAssets(
    buildBookDocumentHtml({
      title: snapshot.book.title,
      leather: snapshot.book.leather,
      fontsCss: scriptoriumFontsCss,
      pagedStyles: laid.pagedStyles,
      coverHtml: coverMarkup(snapshot.book),
      pagesHtml: laid.pagesHtml,
    }),
    fetchSameOrigin,
  );
  return { html, pageCount: laid.pageCount };
}
