// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { ref } from "vue";
import { createMemoryHistory, createRouter } from "vue-router";
import type { PublicOpenBookResult } from "@/composables/openBook/usePublicOpenBook";
import type { PublicOpenBook } from "@/types/openBook.types";

const state = vi.hoisted(() => ({ data: null as unknown, pending: false }));

vi.mock("@/composables/openBook/usePublicOpenBook", () => ({
  usePublicOpenBook: () => ({
    data: { get value() { return state.data; } },
    isPending: { get value() { return state.pending; } },
  }),
}));
vi.mock("@/composables/useBreakpoint", async () => {
  const actual = await vi.importActual<typeof import("@/composables/useBreakpoint")>("@/composables/useBreakpoint");
  return { ...actual, useBelow: () => ref(false) };
});

import OpenBookCoverView from "./OpenBookCoverView.vue";
import OpenBookReaderView from "./OpenBookReaderView.vue";

const stub = { template: "<div />" };
const book: PublicOpenBook = {
  slug: "salt",
  allow_pdf: false,
  indexable: false,
  release: { number: 1, note: null, created_at: "2026-10-23T10:00:00Z", pdf_url: null, stats: { places: 1, folk: 0, factions: 0, pantheons: 0, deities: 0, lore: 0, sessions: 0, events: 0 } },
  snapshot: {
    v: 1,
    book: { title: "The Saltreach", subtitle: "A drowned coast", cover_art: "tooled", cover_image_url: null, leather: "night", chapters: ["atlas"], campaign_name: "C" },
    calendar: { calendar_id: null, custom_calendar: null, current: { year: null, month: null, day: null } },
    places: [{ id: "town", parent_id: null, name: "Hollowmere", location_type: null, player_summary: null, description: null, image_url: null, tags: null, is_level: null, is_battle_map: null, npcs_shared: null, map: null, pins: [] }],
    folk: [], factions: [], pantheons: [], deities: [], lore: [], sessions: [], events: [], names: {},
  },
};

async function mountView(component: typeof OpenBookCoverView, path: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/w/:slug", name: "open-book", component: stub },
      { path: "/w/:slug/contents", name: "open-book-contents", component: stub },
      { path: "/w/:slug/index", name: "open-book-index", component: stub },
      { path: "/w/:slug/:chapter", name: "open-book-chapter", component: stub },
      { path: "/w/:slug/:chapter/:entryId", name: "open-book-entry", component: stub },
    ],
  });
  await router.push(path);
  const wrapper = mount(component, { global: { plugins: [router] } });
  await flushPromises();
  return wrapper;
}

beforeEach(() => {
  localStorage.clear();
  state.pending = false;
  state.data = { status: "found", book } satisfies PublicOpenBookResult;
});

describe("the cover", () => {
  it("shows the title, chapter tabs and a way in", async () => {
    const w = await mountView(OpenBookCoverView, "/w/salt");
    expect(w.find("h1").text()).toBe("The Saltreach");
    expect(w.find("a[aria-label='Open the book at Atlas']").attributes("href")).toBe("/w/salt/atlas/town");
    expect(w.text()).toContain("Open the book");
    expect(document.title).toBe("The Saltreach");
  });

  it("is a quiet closed book when there is none", async () => {
    state.data = { status: "not_found" } satisfies PublicOpenBookResult;
    const w = await mountView(OpenBookCoverView, "/w/nope");
    expect(w.text()).toContain("This book is closed, or was never opened.");
    expect(w.find(".ob-cover").exists()).toBe(false);
  });

  it("waits quietly while the book is being fetched", async () => {
    state.pending = true;
    state.data = undefined;
    const w = await mountView(OpenBookCoverView, "/w/salt");
    expect(w.find("[role='status']").exists()).toBe(true);
    expect(w.text()).not.toContain("closed");
  });

  it("lists the visitor's own ribbon, if they have one", async () => {
    localStorage.setItem("open-book:ribbons:salt", JSON.stringify([{ key: "entry:town", unit: 0, title: "Hollowmere" }]));
    const w = await mountView(OpenBookCoverView, "/w/salt");
    expect(w.text()).toContain("Your ribbon: Hollowmere");
  });
});

describe("the reader view", () => {
  it("is a quiet closed book when there is none", async () => {
    state.data = { status: "not_found" } satisfies PublicOpenBookResult;
    const w = await mountView(OpenBookReaderView, "/w/nope/contents");
    expect(w.text()).toContain("This book is closed, or was never opened.");
  });

  it("opens the book when it exists", async () => {
    const w = await mountView(OpenBookReaderView, "/w/salt/contents");
    expect(w.find(".ob-book").exists()).toBe(true);
    expect(w.text()).toContain("Contents");
  });
});
