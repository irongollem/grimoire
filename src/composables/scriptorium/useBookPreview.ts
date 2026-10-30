/*
 * useBookPreview — debounced Paged.js rendering of a Scriptorium book into a
 * live "book" container (Phase B, #330; book of chapters, #1115).
 *
 * The book is laid out chapter by chapter (lib/scriptorium/bookLayout), and
 * only the chapters that changed are laid out again; the page numbers, footers
 * and contents page are rewritten over all the pages afterwards. Export lays the
 * book out through the same engine, so this is what prints.
 *
 * Re-renders are debounced so typing latency stays in the (separate) galley,
 * never in pagination. A change that arrives while a render is running calls
 * that render off between chapters (the chapters it finished stay cached) and
 * starts the next one.
 */

import { ref, shallowRef, watch, onUnmounted } from "vue";
import type { Ref } from "vue";
import type { PagedStylesheet } from "pagedjs";
import { createBookLayout } from "@/lib/scriptorium/bookLayout/createBookLayout";
import type {
  BookChapterInput,
  BookLayout,
  BookLayoutInput,
  BookLayoutResult,
  BookLayoutSettings,
} from "@/lib/scriptorium/bookLayout/types";

export interface UseBookPreviewOptions {
  /**
   * The chapters' HTML, already prepared for the page (the body of each).
   * Read only when a render runs, never to notice a change: for a whole book
   * it is a pass over megabytes of HTML, and evaluating it on every keystroke
   * and every embed's data landing froze the Scriptorium for seconds while a
   * 533-page book loaded (#1115).
   */
  chapters: () => BookChapterInput[];
  /**
   * A cheap reactive signal (a version number, a few settings) that changes
   * whenever `chapters` would. Each change schedules a debounced render.
   */
  changes: () => unknown;
  /** Layout and numbering settings; a change schedules a render. */
  settings: () => BookLayoutSettings;
  /**
   * Reactive list of stylesheets Paged.js consumes — URL strings and/or
   * inline-CSS objects (`{ "paged.css": "@page { … }" }`) for per-document
   * rules (page geometry).
   */
  stylesheets: () => PagedStylesheet[];
  /** Page furniture written onto the pages in the post-pass. */
  furniture?: () => BookLayoutInput["furniture"];
  /** The chapter to lay out first when several changed (the one being edited). */
  focusChapterId?: () => string | null | undefined;
  /** Where the paged output is rendered. */
  container: Ref<HTMLElement | null>;
  /** Debounce window for re-render after a change. Default 600 ms. */
  debounceMs?: number;
  /** Runs after each successful render, once the numbering and furniture are on the pages. */
  afterRender?: (container: HTMLElement, result: BookLayoutResult) => void;
}

export function useBookPreview(opts: UseBookPreviewOptions) {
  const { chapters, changes, settings, stylesheets, container, debounceMs = 600, afterRender } = opts;

  const pageCount = ref(0);
  const layoutMs = ref(0);
  const isRendering = ref(false);
  const error = ref<string | null>(null);
  /** The pages and chapter spans of the book on screen, for the Inspect view and the chapter list. */
  const result = shallowRef<BookLayoutResult | null>(null);
  /** Chapters settled so far in the render under way, for a "Laying out chapter 6 of 15" line. */
  const progress = ref<{ done: number; total: number } | null>(null);

  let timer: ReturnType<typeof setTimeout> | null = null;
  let renderToken = 0; // discards stale renders that finish out of order
  let pendingRerender = false;
  let engine: BookLayout | null = null;
  let engineHost: HTMLElement | null = null;

  function engineFor(el: HTMLElement): BookLayout {
    if (engine && engineHost === el) return engine;
    engine?.dispose();
    engineHost = el;
    engine = createBookLayout(el);
    return engine;
  }

  async function renderNow() {
    const el = container.value;
    if (!el) return;
    if (isRendering.value) {
      // A render is in flight; coalesce — run once more when it settles.
      pendingRerender = true;
      return;
    }
    const token = ++renderToken;
    isRendering.value = true;
    error.value = null;
    try {
      const book = engineFor(el);
      const input: BookLayoutInput = {
        chapters: chapters(),
        settings: settings(),
        stylesheets: stylesheets(),
        furniture: opts.furniture?.(),
      };
      const laidOut = await book.layout(input, {
        focusChapterId: opts.focusChapterId?.() ?? null,
        // A newer change calls this render off: the chapters it finished are
        // cached, so the next one picks up where it stopped.
        shouldAbort: () => token !== renderToken || pendingRerender,
        onChapter: ({ done, total }) => {
          if (token === renderToken) progress.value = { done, total };
        },
      });
      if (!laidOut || token !== renderToken) return; // superseded
      result.value = laidOut;
      pageCount.value = laidOut.pageCount;
      layoutMs.value = laidOut.layoutMs;
      afterRender?.(el, laidOut);
    } catch (e: unknown) {
      if (token === renderToken) {
        error.value = e instanceof Error ? e.message : String(e);
      }
    } finally {
      if (token === renderToken) {
        isRendering.value = false;
        progress.value = null;
      }
      if (pendingRerender) {
        pendingRerender = false;
        void renderNow();
      }
    }
  }

  function scheduleRender() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void renderNow();
    }, debounceMs);
  }

  // Re-render whenever the content's signal, the settings or the stylesheets
  // change. The chapters themselves are built only inside renderNow.
  watch([changes, settings, stylesheets], scheduleRender, { flush: "post" });

  onUnmounted(() => {
    if (timer) clearTimeout(timer);
    renderToken++; // invalidate any in-flight render
    engine?.dispose();
    engine = null;
    engineHost = null;
  });

  return { pageCount, layoutMs, isRendering, error, result, progress, renderNow, scheduleRender };
}
