/*
 * usePagedPreview — debounced Paged.js rendering of Scriptorium content into a
 * live "book" container (Phase B, #330).
 *
 * Validated by the week-1 spike (issue #330): Paged.js handles two-column
 * fragmentation, floats, gutter-bleed, column-span, named cover pages and
 * @page margin-box footers on PHB-representative content at ~27 ms/page.
 *
 * Re-renders are debounced so typing latency stays in the (separate) galley,
 * never in pagination. Each render builds a fresh Previewer and clears the
 * container first — Paged.js appends a `.pagedjs_pages` tree and would
 * otherwise stack duplicates.
 */

import { ref, watch, onUnmounted } from "vue";
import type { Ref } from "vue";
import { Previewer } from "pagedjs";
import type { PagedStylesheet } from "pagedjs";

export interface UsePagedPreviewOptions {
  /** Reactive source: the document body HTML to paginate. */
  content: () => string;
  /**
   * Reactive list of stylesheets Paged.js consumes — URL strings and/or
   * inline-CSS objects (`{ "paged.css": "@page { … }" }`) for per-document
   * rules (footer text, page geometry).
   */
  stylesheets: () => PagedStylesheet[];
  /** Where the paged output is rendered. */
  container: Ref<HTMLElement | null>;
  /** Debounce window for re-render after a change. Default 600 ms. */
  debounceMs?: number;
  /** Runs after each successful render (e.g. to inject page furniture). */
  afterRender?: (container: HTMLElement) => void;
}

export function usePagedPreview(opts: UsePagedPreviewOptions) {
  const { content, stylesheets, container, debounceMs = 600, afterRender } = opts;

  const pageCount = ref(0);
  const layoutMs = ref(0);
  const isRendering = ref(false);
  const error = ref<string | null>(null);

  let timer: ReturnType<typeof setTimeout> | null = null;
  let renderToken = 0; // discards stale renders that finish out of order
  let pendingRerender = false;

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
    const t0 = performance.now();
    try {
      el.replaceChildren();
      // CRITICAL: Paged.js treats falsy content as "paginate document.body"
      // (Previewer.preview → wrapContent()), which would fragment the whole
      // app into the container. Never call preview() with empty content.
      const html = content();
      if (!html.trim()) {
        pageCount.value = 0;
        layoutMs.value = 0;
        return;
      }
      const previewer = new Previewer();
      const flow = await previewer.preview(html, stylesheets(), el);
      if (token !== renderToken) return; // superseded by a newer render
      pageCount.value = flow.total;
      layoutMs.value = Math.round(performance.now() - t0);
      afterRender?.(el);
    } catch (e: unknown) {
      if (token === renderToken) {
        error.value = e instanceof Error ? e.message : String(e);
      }
    } finally {
      if (token === renderToken) isRendering.value = false;
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

  // Re-render whenever content or stylesheets change.
  watch([content, stylesheets], scheduleRender, { flush: "post" });

  onUnmounted(() => {
    if (timer) clearTimeout(timer);
    renderToken++; // invalidate any in-flight render
  });

  return { pageCount, layoutMs, isRendering, error, renderNow, scheduleRender };
}
