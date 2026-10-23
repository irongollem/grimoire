/**
 * Draws a release's articles with the reader's components, off-screen (#1085).
 *
 * The articles link with `RouterLink` and read `useRoute().params.slug`, which the owner's settings page does not
 * have, so they are drawn in a small app of their own: a memory router that knows the book's routes and is sitting
 * at `/w/<slug>`. That app is thrown away as soon as the markup is taken.
 */

import { createApp, nextTick } from "vue";
import { createMemoryHistory, createRouter } from "vue-router";
import type { BookModel } from "@/lib/openBook/bookModel";
import { sectionsOf } from "@/lib/openBook/sections";
import OpenBookPrintArticles from "@/components/openBook/print/OpenBookPrintArticles.vue";

const Blank = { render: () => null };

/** The routes `sectionLocation` names. Only their shape matters here: nothing is ever navigated to. */
const BOOK_ROUTES = [
  { path: "/w/:slug", name: "open-book", component: Blank },
  { path: "/w/:slug/contents", name: "open-book-contents", component: Blank },
  { path: "/w/:slug/index", name: "open-book-index", component: Blank },
  { path: "/w/:slug/:chapter", name: "open-book-chapter", component: Blank },
  { path: "/w/:slug/:chapter/:entryId", name: "open-book-entry", component: Blank },
];

/** Each section's rendered HTML, by section key. */
export async function renderArticles(model: BookModel, slug: string): Promise<Map<string, string>> {
  const router = createRouter({ history: createMemoryHistory(), routes: BOOK_ROUTES });
  await router.push({ name: "open-book", params: { slug } });
  await router.isReady();

  const host = document.createElement("div");
  const app = createApp(OpenBookPrintArticles, { model });
  app.use(router);
  try {
    app.mount(host);
    await nextTick();
    const out = new Map<string, string>();
    host.querySelectorAll<HTMLElement>("[data-section]").forEach((el) => {
      out.set(el.dataset.section ?? "", el.innerHTML);
    });
    // Every section the book has must have come out, or a page would silently be missing.
    for (const section of sectionsOf(model)) {
      if (section.kind !== "contents" && !out.has(section.key)) throw new Error(`The page "${section.title}" could not be drawn.`);
    }
    return out;
  } finally {
    app.unmount();
  }
}
