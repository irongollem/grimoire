/**
 * The printed book's markup (#1085), before it is cut into pages: title page, contents, then each chapter's title
 * page and its entries, the almanac, and the index. The cover is not among them: it is one full sheet that needs no
 * margins, heads or folios, so it is drawn by `coverMarkup` and put in front of the laid-out pages. Each entry is its own `section` so the stylesheet can
 * start it on a new page and name it in the running head. The entries' bodies are the reader's own articles,
 * rendered elsewhere and handed in by section key.
 *
 * Pure string work: the same input gives the same markup, which is what the tests hold.
 */

import { escapeHtml } from "@/lib/escapeHtml";
import type { BookModel } from "@/lib/openBook/bookModel";
import { ALMANAC_KEY, INDEX_KEY, entryKey } from "@/lib/openBook/sections";
import type { OpenBookSnapshot } from "@/types/openBook.types";
import { LEATHERS } from "@/lib/openBook/leather";
import { ALMANAC_ID, CONTENTS_ID, INDEX_ID, chapterAnchor, entryAnchor } from "./bookLinks";

export interface PrintRelease {
  number: number;
  created_at: string;
  note: string | null;
}

export interface PrintBookInput {
  model: BookModel;
  release: PrintRelease;
  /** Rendered, link-rewritten article HTML by section key (`entry:<id>`, `almanac`, `index`). */
  sectionHtml: ReadonlyMap<string, string>;
}

export function releaseLabel(release: PrintRelease): string {
  const when = new Date(release.created_at);
  if (Number.isNaN(when.getTime())) return `Release ${release.number}`;
  const date = when.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  return `Release ${release.number} · ${date}`;
}

const COMPASS = `<svg viewBox="0 0 100 100" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="50" cy="50" r="40"/><circle cx="50" cy="50" r="34"/><circle cx="50" cy="50" r="6"/></g><g fill="currentColor"><path d="M50 6 55 45 50 50 45 45Z"/><path d="M50 94 45 55 50 50 55 55Z"/><path d="M6 50 45 45 50 50 45 55Z"/><path d="M94 50 55 55 50 50 55 45Z"/><path d="M50 50 70 30 54 47Z" opacity=".7"/><path d="M50 50 30 70 46 53Z" opacity=".7"/><path d="M50 50 30 30 47 46Z" opacity=".7"/><path d="M50 50 70 70 53 54Z" opacity=".7"/></g></svg>`;

export function coverMarkup(book: OpenBookSnapshot["book"]): string {
  const def = LEATHERS[book.leather];
  const grain = def.blend === "normal" ? "natural" : "tinted";
  const image = book.cover_image_url ? escapeHtml(book.cover_image_url) : null;
  // A cover that asks for a picture the book does not have falls back to the tooled one, as the reader's does.
  const art = book.cover_art !== "tooled" && !image ? "tooled" : book.cover_art;
  const title = escapeHtml(book.title);
  const subtitle = book.subtitle ? `<p class="pb-cover-sub">${escapeHtml(book.subtitle)}</p>` : "";
  const style = `--pb-hide: ${def.tint}; --pb-leather: url('${def.textureUrl}')`;
  const spine = `<div class="pb-spine"><span style="top:12.5%"></span><span style="top:35%"></span><span style="top:62.5%"></span><span style="top:85%"></span></div>`;

  let inner: string;
  if (art === "full" && image) {
    inner = `<div class="pb-cover-art"><img src="${image}" alt=""/></div>
<div class="pb-cover-label"><div class="pb-label"><span class="pb-vol">VOLUME I</span><h1 class="pb-cover-title">${title}</h1></div></div>
${book.subtitle ? `<p class="pb-cover-foot">${escapeHtml(book.subtitle)}</p>` : ""}`;
  } else {
    const middle =
      art === "plate" && image
        ? `<div class="pb-plate-frame"><div><img src="${image}" alt=""/></div></div>`
        : `<div class="pb-compass">${COMPASS}</div>`;
    inner = `<div class="pb-tool"><i></i><i></i><i></i><i></i></div>
<div class="pb-cover-text">
${art === "tooled" ? `<span class="pb-vol">VOLUME I</span>` : ""}
<h1 class="pb-cover-title">${title}</h1>
${middle}
${subtitle}
</div>`;
  }
  return `<section class="pb-cover" data-grain="${grain}" data-art="${art}" style="${style}">${spine}${inner}</section>`;
}

function titlePageMarkup(book: OpenBookSnapshot["book"], release: PrintRelease): string {
  return `<section class="pb-title" data-title="${escapeHtml(book.title)}">
<div class="pb-compass">${COMPASS}</div>
<h1>${escapeHtml(book.title)}</h1>
${book.subtitle ? `<p class="pb-title-sub">${escapeHtml(book.subtitle)}</p>` : ""}
<span class="pb-rule"></span>
<p class="pb-title-release">${escapeHtml(releaseLabel(release))}</p>
${release.note ? `<p class="pb-title-note">${escapeHtml(release.note)}</p>` : ""}
<p class="pb-colophon">Made with Dungeon Grimoire</p>
</section>`;
}

function tocRow(href: string, name: string, level: "chapter" | "entry" | "back", numeral = ""): string {
  const num = level === "chapter" ? `<span class="pb-toc-num">${escapeHtml(numeral)}</span>` : "";
  return `<li class="pb-toc-${level}"><a href="${href}">${num}<span class="pb-toc-name">${escapeHtml(name)}</span><span class="pb-toc-leader"></span></a></li>`;
}

function contentsMarkup(model: BookModel): string {
  const rows: string[] = [];
  for (const chapter of model.chapters) {
    rows.push(tocRow(`#${chapterAnchor(chapter.chapter)}`, chapter.title, "chapter", chapter.numeral));
    if (chapter.chapter === "chronicle") rows.push(tocRow(`#${ALMANAC_ID}`, "The Almanac", "entry"));
    for (const entry of chapter.entries) rows.push(tocRow(`#${entryAnchor(entry.id)}`, entry.title, "entry"));
  }
  rows.push(tocRow(`#${INDEX_ID}`, "Index of names", "back"));
  return `<section class="pb-contents" id="${CONTENTS_ID}" data-title="Contents" data-chapter="Contents"><h1>Contents</h1><ol class="pb-toc">${rows.join("")}</ol></section>`;
}

function chapterHead(meta: { numeral: string; title: string }): string {
  return `${meta.numeral} · ${meta.title}`;
}

export function buildBookMarkup({ model, release, sectionHtml }: PrintBookInput): string {
  const book = model.snapshot.book;
  const parts: string[] = [titlePageMarkup(book, release), contentsMarkup(model)];

  model.chapters.forEach((chapter, i) => {
    const head = chapterHead(chapter);
    // The first chapter starts the book proper: its folios count from 1, after the front matter's numerals.
    parts.push(
      `<section class="pb-chapter${i === 0 ? " pb-first" : ""}" id="${chapterAnchor(chapter.chapter)}" data-chapter="${escapeHtml(head)}" data-title="${escapeHtml(chapter.title)}">
<span class="pb-chapter-num">${escapeHtml(chapter.numeral)}</span><h1>${escapeHtml(chapter.title)}</h1><span class="pb-rule"></span></section>`,
    );
    if (chapter.chapter === "chronicle") {
      const almanac = sectionHtml.get(ALMANAC_KEY);
      if (almanac) {
        parts.push(
          `<section class="pb-entry" id="${ALMANAC_ID}" data-chapter="${escapeHtml(head)}" data-title="The Almanac">${almanac}</section>`,
        );
      }
    }
    for (const entry of chapter.entries) {
      const body = sectionHtml.get(entryKey(entry.id));
      if (!body) continue;
      parts.push(
        `<section class="pb-entry" id="${entryAnchor(entry.id)}" data-kind="${entry.kind}" data-chapter="${escapeHtml(head)}" data-title="${escapeHtml(entry.title)}">${body}</section>`,
      );
    }
  });

  const index = sectionHtml.get(INDEX_KEY);
  if (index) {
    parts.push(`<section class="pb-entry pb-index-section" id="${INDEX_ID}" data-chapter="Index" data-title="Index of names">${index}</section>`);
  }
  return `<div class="pb">${parts.join("\n")}</div>`;
}

