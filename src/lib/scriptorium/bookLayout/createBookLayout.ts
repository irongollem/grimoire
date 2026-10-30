/*
 * The book layout engine (#1115 story 13): a Scriptorium document is a book of
 * chapters, and a chapter is the unit of layout.
 *
 * Every chapter opens on a right-hand page (blankPages.ts adds the blank left
 * page that makes it so), which is what lets each chapter be laid out by its own
 * Paged.js run: a change in one chapter can never move where another chapter's
 * pages break, only the number printed on them. So an edit lays out the chapter
 * it touched and nothing else, and everything that depends on the whole book
 * (page labels, footers, the contents page's numbers, furniture) is written
 * afterwards, in one pass over the pages in book order, from the pages as they
 * stand. The live preview and the PDF export call this same function, so what
 * the preview shows is what prints.
 *
 * Paged.js styles. Each Previewer puts its processed page rules into
 * document.head. Read in pagedjs 0.4.3 (polisher.js, chunker, modules): the
 * rules are unscoped (`.pagedjs_page`, `.pagedjs_<name>_page`, `:root` sizing
 * variables), so the newest run's set styles every chapter's pages whichever
 * run laid them out, and a book's chapters all get the same CSS. The only
 * per-run rules are `[data-ref=...]` ones that the counters module inserts for
 * CSS `counter-increment`, which no Scriptorium stylesheet uses; if one ever
 * does, a chapter laid out in an earlier run would lose them and this must
 * keep every run's styles instead. So one set is kept alive: when a run
 * finishes, the previous run's styles go, and only that run's.
 */
import { Previewer } from "pagedjs";
import type { PagedStylesheet } from "pagedjs";
import { registerPagedEntryFit } from "../pagedEntryFit";
import { registerPagedTableFit } from "../pagedTableFit";
import { removePagedStyles, pagedStyleElements } from "../pagedStyles";
import { preparePagedBody } from "../pagedPrepare";
import { fillPagedTocPages, headingsOfHtml } from "../pagedToc";
import type { BookHeading } from "../pagedToc";
import { injectPagedFooters } from "../pagedFooters";
import { computePageLabels, flagsFromHtml, BLANK_PAGE_ATTR } from "../pageNumbering";
import type { PageNumberFlags } from "../pageNumbering";
import { renderFurniture, CHAPTER_ID_ATTR, CHAPTER_PAGE_ATTR } from "../furniture/renderFurniture";
import { createBlankPage, needsBlankPageAfter } from "./blankPages";
import type {
  BookChapterSpan,
  BookLayout,
  BookLayoutInput,
  BookLayoutOptions,
  BookLayoutResult,
  BookPageInfo,
  BookChapterInput,
} from "./types";

const TOC_MARKER = 'data-type="toc"';
const CHAPTER_CLASS = "sc-book-chapter";
/** A chapter being laid out: in the document so it can be measured, not yet seen. */
const STAGING_STYLE = "position:absolute;visibility:hidden;pointer-events:none;left:0;top:0";
/** A chapter's container takes no box of its own, so the pages sit exactly as if one run had laid them all out. */
const SETTLED_STYLE = "display:contents";

interface ChapterEntry {
  html: string;
  /** What the chapter was laid out under (settings, stylesheets, the book's headings if it holds the contents). */
  signature: string;
  container: HTMLElement;
  pages: HTMLElement[];
  /** Numbering flags, read from the pages as laid out, before any footer or furniture. */
  flags: PageNumberFlags[];
}

/** Everything that decides how a chapter's pages break, as a string to compare. */
function layoutSignature(input: BookLayoutInput): string {
  const s = input.settings;
  return JSON.stringify([
    s.pageSize,
    s.isTwoColumn,
    s.inkFriendly,
    s.theme,
    s.showPageNumbers,
    input.stylesheets,
  ]);
}

function pagesOf(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(".pagedjs_page"));
}

export function createBookLayout(host: HTMLElement): BookLayout {
  const cache = new Map<string, ChapterEntry>();
  const headingsCache = new Map<string, { html: string; headings: BookHeading[] }>();
  /** The one run whose styles stay in the head (see the header). */
  let styled: Previewer | null = null;
  let disposed = false;
  let queue: Promise<unknown> = Promise.resolve();

  host.replaceChildren();

  function headingsFor(chapter: BookChapterInput): BookHeading[] {
    const hit = headingsCache.get(chapter.id);
    if (hit && hit.html === chapter.html) return hit.headings;
    const headings = headingsOfHtml(chapter.html);
    headingsCache.set(chapter.id, { html: chapter.html, headings });
    return headings;
  }

  function dropEntry(id: string): void {
    cache.get(id)?.container.remove();
    cache.delete(id);
    headingsCache.delete(id);
  }

  /** Lays one prepared chapter out into a staged container, and swaps it in for the old one. */
  async function layOutChapter(
    chapter: BookChapterInput,
    prepared: string,
    stylesheets: PagedStylesheet[],
  ): Promise<{ container: HTMLElement; previewer: Previewer }> {
    const stage = document.createElement("div");
    stage.className = CHAPTER_CLASS;
    stage.setAttribute(CHAPTER_ID_ATTR, chapter.id);
    stage.style.cssText = STAGING_STYLE;
    host.appendChild(stage);

    const previewer = new Previewer();
    // Its constructor already set the polisher up, and preview() sets it up
    // again with a fresh <style>; the first one is never used and would stay
    // in the head for good.
    previewer.polisher.styleEl?.remove();
    try {
      registerPagedEntryFit();
      registerPagedTableFit();
      await previewer.preview(prepared, stylesheets, stage);
    } catch (e: unknown) {
      removePagedStyles(previewer);
      stage.remove();
      throw e;
    }
    return { container: stage, previewer };
  }

  function settle(entry: ChapterEntry, chapterId: string): void {
    entry.container.style.cssText = SETTLED_STYLE;
    entry.pages = pagesOf(entry.container);
    entry.pages.forEach((page, i) => {
      page.setAttribute(CHAPTER_ID_ATTR, chapterId);
      page.setAttribute(CHAPTER_PAGE_ATTR, String(i + 1));
      // Paged.js numbers its pages from 1 in every run, so ids would repeat.
      page.id = `${chapterId}-page-${i + 1}`;
    });
    entry.flags = entry.pages.map((p) => flagsFromHtml(p.innerHTML));
  }

  async function run(input: BookLayoutInput, options: BookLayoutOptions): Promise<BookLayoutResult | null> {
    const t0 = performance.now();
    const aborted = () => disposed || (options.shouldAbort?.() ?? false);
    const { chapters, settings } = input;

    const ids = new Set<string>();
    for (const c of chapters) {
      if (ids.has(c.id)) throw new Error(`Two chapters share the id "${c.id}".`);
      ids.add(c.id);
    }
    for (const id of Array.from(cache.keys())) if (!ids.has(id)) dropEntry(id);
    for (const id of Array.from(headingsCache.keys())) if (!ids.has(id)) headingsCache.delete(id);

    const signature = layoutSignature(input);
    // A contents page lists the whole book, so a chapter that holds one is
    // laid out under the book's headings, and again when they change.
    const bookHeadings = chapters.some((c) => c.html.includes(TOC_MARKER))
      ? chapters.flatMap(headingsFor)
      : null;
    const headingsKey = bookHeadings ? JSON.stringify(bookHeadings) : "";

    // The caller's chapter first, then the rest in book order.
    const order = [...chapters];
    const focusAt = order.findIndex((c) => c.id === options.focusChapterId);
    if (focusAt > 0) order.unshift(...order.splice(focusAt, 1));

    const laidOut: string[] = [];
    let done = 0;
    for (const chapter of order) {
      if (aborted()) return null;
      const holdsToc = chapter.html.includes(TOC_MARKER);
      const wanted = holdsToc ? signature + headingsKey : signature;
      const hit = cache.get(chapter.id);
      let fromCache = false;
      if (hit && hit.html === chapter.html && hit.signature === wanted) {
        fromCache = true;
      } else {
        const prepared = preparePagedBody(chapter.html, {
          showPageNumbers: settings.showPageNumbers,
          pageSize: settings.pageSize,
          isTwoColumn: settings.isTwoColumn,
          bookHeadings: holdsToc && bookHeadings ? bookHeadings : undefined,
        });
        // CRITICAL: Paged.js treats falsy content as "paginate document.body",
        // which would fragment the whole app into the container. Checked on the
        // PREPARED html: preparation strips trailing empty paragraphs, so a blank
        // chapter (`<p></p>`) arrives here non-empty and leaves as "" (#1115).
        if (!prepared.trim()) {
          dropEntry(chapter.id);
          done++;
          options.onChapter?.({ done, total: order.length, chapterId: chapter.id, fromCache });
          continue;
        }
        const { container, previewer } = await layOutChapter(chapter, prepared, input.stylesheets);
        // A chapter that finished is good whatever was asked meanwhile, so an
        // abort keeps it (checked at the top of the loop); only a book that is
        // gone drops it.
        if (disposed) {
          removePagedStyles(previewer);
          container.remove();
          return null;
        }
        const entry: ChapterEntry = { html: chapter.html, signature: wanted, container, pages: [], flags: [] };
        settle(entry, chapter.id);
        // The newer run's styles replace the older run's, and only theirs.
        if (styled) removePagedStyles(styled);
        styled = previewer;
        hit?.container.remove();
        cache.set(chapter.id, entry);
        laidOut.push(chapter.id);
      }
      done++;
      options.onChapter?.({ done, total: order.length, chapterId: chapter.id, fromCache });
    }
    if (aborted()) return null;

    // Containers in book order (only moved when they are not already).
    const containers = chapters.flatMap((c) => cache.get(c.id)?.container ?? []);
    const current = Array.from(host.children);
    if (containers.length !== current.length || containers.some((c, i) => c !== current[i])) {
      host.replaceChildren(...containers);
    }
    if (chapters.length === 0 || containers.length === 0) {
      if (styled) removePagedStyles(styled);
      styled = null;
    }

    return postPass(input, laidOut, performance.now() - t0);
  }

  /** Blank pages, then labels, footers, contents numbers and furniture over all pages in order. */
  function postPass(input: BookLayoutInput, laidOutChapterIds: string[], elapsed: number): BookLayoutResult {
    const { settings } = input;
    host.querySelectorAll(`.pagedjs_page[${BLANK_PAGE_ATTR}]`).forEach((p) => p.remove());

    const filled = input.chapters.filter((c) => (cache.get(c.id)?.pages.length ?? 0) > 0);
    const lastFilledId = filled.length > 0 ? filled[filled.length - 1].id : null;

    interface Slot {
      el: HTMLElement;
      chapterId: string;
      pageInChapter: number | null;
      flags: PageNumberFlags;
    }
    const slots: Slot[] = [];
    for (const c of filled) {
      const entry = cache.get(c.id);
      if (!entry) continue;
      entry.pages.forEach((el, i) => {
        slots.push({ el, chapterId: c.id, pageInChapter: i + 1, flags: entry.flags[i] });
      });
      if (needsBlankPageAfter(entry.pages.length, c.id === lastFilledId)) {
        const last = entry.pages[entry.pages.length - 1];
        const blank = createBlankPage(last, c.id, slots.length);
        last.after(blank);
        slots.push({
          el: blank,
          chapterId: c.id,
          pageInChapter: null,
          flags: { isUnnumberedCover: false, hasSkip: false, hasReset: false, isBlank: true },
        });
      }
    }

    const labels = computePageLabels(
      slots.map((s) => s.flags),
      { showPageNumbers: settings.showPageNumbers, start: settings.pageNumberStart },
    );
    injectPagedFooters(host, {
      showPageNumbers: settings.showPageNumbers,
      footerText: settings.footerText,
      start: settings.pageNumberStart,
      labels,
    });
    fillPagedTocPages(host, {
      showPageNumbers: settings.showPageNumbers,
      start: settings.pageNumberStart,
      labels,
    });
    if (input.furniture) renderFurniture(host, input.furniture.items, input.furniture.options);

    const pages: BookPageInfo[] = slots.map((s, i) => ({
      chapterId: s.chapterId,
      pageInChapter: s.pageInChapter,
      globalIndex: i,
      blank: s.pageInChapter === null,
      label: labels[i],
    }));
    const chapters: BookChapterSpan[] = input.chapters.map((c) => {
      const own = pages.filter((p) => p.chapterId === c.id && !p.blank);
      const numbered = own.filter((p) => p.label !== null);
      return {
        id: c.id,
        pageCount: own.length,
        firstIndex: own.length > 0 ? own[0].globalIndex : null,
        lastIndex: own.length > 0 ? own[own.length - 1].globalIndex : null,
        firstLabel: numbered.length > 0 ? numbered[0].label : null,
        lastLabel: numbered.length > 0 ? numbered[numbered.length - 1].label : null,
      };
    });
    return { pageCount: pages.length, pages, chapters, laidOutChapterIds, layoutMs: Math.round(elapsed) };
  }

  return {
    layout(input, options = {}) {
      // One layout at a time: the host and the cache are shared state.
      const next = queue.then(() => run(input, options));
      queue = next.catch(() => undefined);
      return next;
    },
    styleElements() {
      return styled ? pagedStyleElements(styled) : [];
    },
    flattenPages() {
      const flat = document.createElement("div");
      flat.className = "pagedjs_pages";
      flat.append(...pagesOf(host));
      host.replaceChildren(flat);
      cache.clear();
    },
    dispose() {
      disposed = true;
      if (styled) removePagedStyles(styled);
      styled = null;
      cache.clear();
      headingsCache.clear();
      host.replaceChildren();
    },
  };
}
