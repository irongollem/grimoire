// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createMemoryHistory, createRouter, type Router } from "vue-router";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import type { PublicOpenBook } from "@/types/openBook.types";
import { ribbonStorageKey } from "@/lib/openBook/ribbons";
import BookReader from "./BookReader.vue";

const stub = { template: "<div />" };
const doc = (text: string) => JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] });

const book: PublicOpenBook = {
  slug: "salt",
  allow_pdf: true,
  indexable: false,
  release: { number: 3, note: null, created_at: "2026-10-23T10:00:00Z", pdf_url: "https://example.test/salt.pdf", stats: { places: 2, folk: 0, factions: 0, pantheons: 0, deities: 0, lore: 0, sessions: 0, events: 0 } },
  snapshot: {
    v: 1,
    book: { title: "The Saltreach", subtitle: "A drowned coast", cover_art: "tooled", cover_image_url: null, leather: "oxblood", chapters: ["atlas"], campaign_name: "C" },
    calendar: { calendar_id: null, custom_calendar: null, current: { year: null, month: null, day: null } },
    places: [
      { id: "town", parent_id: null, name: "Hollowmere", location_type: null, player_summary: null, description: doc("Boats."), image_url: null, tags: null, is_level: null, is_battle_map: null, npcs_shared: null, map: null, pins: [] },
      { id: "stair", parent_id: null, name: "Toll Stair", location_type: null, player_summary: null, description: null, image_url: null, tags: null, is_level: null, is_battle_map: null, npcs_shared: null, map: null, pins: [] },
    ],
    folk: [], factions: [], pantheons: [], deities: [], lore: [], sessions: [], events: [], names: {},
  },
};

function makeRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/w/:slug", name: "open-book", component: stub },
      { path: "/w/:slug/contents", name: "open-book-contents", component: stub },
      { path: "/w/:slug/index", name: "open-book-index", component: stub },
      { path: "/w/:slug/:chapter", name: "open-book-chapter", component: stub },
      { path: "/w/:slug/:chapter/:entryId", name: "open-book-entry", component: stub },
    ],
  });
}

async function mountAt(path: string, withBook: PublicOpenBook = book) {
  const router = makeRouter();
  await router.push(path);
  const wrapper = mount(BookReader, {
    props: { book: withBook },
    attachTo: document.body,
    global: { plugins: [router, [VueQueryPlugin, { queryClient: new QueryClient() }]] },
  });
  await flushPromises();
  return { router, wrapper };
}

beforeEach(() => localStorage.clear());
afterEach(() => {
  document.body.innerHTML = "";
});

describe("BookReader", () => {
  it("opens at the contents with the chapters and a foreword", async () => {
    const { wrapper } = await mountAt("/w/salt/contents");
    expect(wrapper.text()).toContain("Foreword");
    expect(wrapper.text()).toContain("The Atlas");
    expect(wrapper.text()).toContain("Index of names");
    expect(document.title).toBe("Contents · The Saltreach");
    wrapper.unmount();
  });

  it("draws a chapter's first entry as a frontispiece beside page one", async () => {
    const { wrapper } = await mountAt("/w/salt/atlas/town");
    expect(wrapper.find(".ob-front-title").text()).toBe("The Atlas");
    expect(wrapper.text()).toContain("Hollowmere");
    expect(document.title).toBe("Hollowmere · The Saltreach");
    wrapper.unmount();
  });

  it("says a page is not in the book, in the same chrome, for an unknown entry or chapter", async () => {
    for (const path of ["/w/salt/atlas/nope", "/w/salt/banana"]) {
      const { wrapper } = await mountAt(path);
      expect(wrapper.text()).toContain("This page is not in the book");
      expect(wrapper.find(".ob-deskbar").exists()).toBe(true);
      wrapper.unmount();
    }
  });

  it("turns with the arrow keys, and not while typing", async () => {
    const { router, wrapper } = await mountAt("/w/salt/contents");
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));
    await flushPromises();
    expect(router.currentRoute.value.fullPath).toBe("/w/salt/atlas/town");
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft" }));
    await flushPromises();
    expect(router.currentRoute.value.fullPath).toBe("/w/salt/contents");

    const input = document.createElement("input");
    document.body.appendChild(input);
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    await flushPromises();
    expect(router.currentRoute.value.fullPath).toBe("/w/salt/contents");
    wrapper.unmount();
  });

  it("stops listening for keys once unmounted", async () => {
    const { router, wrapper } = await mountAt("/w/salt/contents");
    const push = vi.spyOn(router, "push");
    wrapper.unmount();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));
    await flushPromises();
    expect(push).not.toHaveBeenCalled();
  });

  it("goes nowhere before the first page or past the last", async () => {
    const first = await mountAt("/w/salt/contents");
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft" }));
    await flushPromises();
    expect(first.router.currentRoute.value.fullPath).toBe("/w/salt/contents");
    first.wrapper.unmount();

    const last = await mountAt("/w/salt/index");
    expect(last.wrapper.find(".ob-lift[data-dir='next']").exists()).toBe(false);
    last.wrapper.unmount();
  });

  it("marks a page with a ribbon, keeps it in this browser, and lifts it again", async () => {
    const { wrapper } = await mountAt("/w/salt/atlas/stair");
    const mark = () => wrapper.findAll("button").find((b) => b.text().includes("Mark this page") || b.text().includes("Marked"));
    await mark()?.trigger("click");
    expect(JSON.parse(localStorage.getItem(ribbonStorageKey("salt")) ?? "[]")).toEqual([{ key: "entry:stair", unit: 0, title: "Toll Stair" }]);
    expect(wrapper.findAll(".ob-ribbon")).toHaveLength(1);
    await mark()?.trigger("click");
    expect(JSON.parse(localStorage.getItem(ribbonStorageKey("salt")) ?? "[]")).toEqual([]);
    wrapper.unmount();
  });

  it("offers the PDF only when the book allows it", async () => {
    const { wrapper } = await mountAt("/w/salt/contents");
    expect(wrapper.find("a[href='https://example.test/salt.pdf']").exists()).toBe(true);
    wrapper.unmount();
  });

  it("labels each page and draws the dog-ear as a button", async () => {
    const { wrapper } = await mountAt("/w/salt/atlas/town");
    expect(wrapper.find("button.ob-lift[data-dir='next']").attributes("aria-label")).toBe("Turn to the next page");
    expect(wrapper.findAll("section.ob-page").every((p) => p.attributes("aria-label"))).toBe(true);
    wrapper.unmount();
  });
});

describe("BookReader, what a visitor is and is not given", () => {
  it("withholds the PDF when the book does not allow it, even though the release has one", async () => {
    const { wrapper } = await mountAt("/w/salt/contents", { ...book, allow_pdf: false });
    expect(wrapper.find("a[href='https://example.test/salt.pdf']").exists()).toBe(false);
    wrapper.unmount();
  });

  it("offers no PDF link when the release has none", async () => {
    const { wrapper } = await mountAt("/w/salt/contents", { ...book, release: { ...book.release, pdf_url: null } });
    expect(wrapper.find("a[href*='.pdf']").exists()).toBe(false);
    wrapper.unmount();
  });
});

describe("BookReader turning", () => {
  const key = (init: KeyboardEventInit) => document.dispatchEvent(new KeyboardEvent("keydown", init));
  const touch = (type: string, x: number, y: number, pointerType = "touch") => {
    const ev = new Event(type, { bubbles: true });
    Object.defineProperties(ev, { pointerType: { value: pointerType }, clientX: { value: x }, clientY: { value: y } });
    return ev;
  };

  it("ignores an arrow pressed with a modifier, so browser shortcuts keep working", async () => {
    const { router, wrapper } = await mountAt("/w/salt/contents");
    for (const mod of [{ altKey: true }, { ctrlKey: true }, { metaKey: true }, { shiftKey: true }]) {
      key({ key: "ArrowRight", ...mod });
      await flushPromises();
    }
    expect(router.currentRoute.value.fullPath).toBe("/w/salt/contents");
    wrapper.unmount();
  });

  it("does not turn the page behind an open search slip", async () => {
    const { router, wrapper } = await mountAt("/w/salt/contents");
    await wrapper.findAll("button").find((b) => b.attributes("aria-label") === "Search the book" || b.text().includes("Search"))?.trigger("click");
    await flushPromises();
    key({ key: "ArrowRight" });
    await flushPromises();
    expect(router.currentRoute.value.fullPath).toBe("/w/salt/contents");
    wrapper.unmount();
  });

  it("turns forward on a finger swipe left and back on one right", async () => {
    const { router, wrapper } = await mountAt("/w/salt/atlas/town");
    const stage = wrapper.get("main.ob-stage").element;
    stage.dispatchEvent(touch("pointerdown", 300, 100));
    stage.dispatchEvent(touch("pointerup", 200, 105));
    await flushPromises();
    expect(router.currentRoute.value.fullPath).toBe("/w/salt/atlas/stair");
    stage.dispatchEvent(touch("pointerdown", 100, 100));
    stage.dispatchEvent(touch("pointerup", 200, 100));
    await flushPromises();
    // Back lands on the last turn of the page before.
    expect(router.currentRoute.value.path).toBe("/w/salt/atlas/town");
    wrapper.unmount();
  });

  it("does not turn on a mouse drag, a short swipe or a mostly vertical one", async () => {
    const { router, wrapper } = await mountAt("/w/salt/atlas/town");
    const stage = wrapper.get("main.ob-stage").element;
    const attempts: [string, number, number, number, number][] = [
      ["mouse", 300, 100, 150, 100],
      ["touch", 300, 100, 260, 100],
      ["touch", 300, 100, 200, 190],
    ];
    for (const [type, x0, y0, x1, y1] of attempts) {
      stage.dispatchEvent(touch("pointerdown", x0, y0, type));
      stage.dispatchEvent(touch("pointerup", x1, y1, type));
      await flushPromises();
    }
    expect(router.currentRoute.value.fullPath).toBe("/w/salt/atlas/town");
    wrapper.unmount();
  });
});
