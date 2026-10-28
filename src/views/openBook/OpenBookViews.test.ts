// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

import { endPreview, startPreview } from "@/lib/openBook/preview";
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

// Every mount stays alive until the test ends, so a later preview marker cannot light up an earlier test's view.
const mounted: { unmount: () => void }[] = [];
afterEach(() => {
  mounted.splice(0).forEach((w) => w.unmount());
});

async function mountView(component: typeof OpenBookCoverView, path: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/campaign/settings", name: "campaign-settings", component: stub },
      { path: "/w/:slug", name: "open-book", component: stub },
      { path: "/w/:slug/contents", name: "open-book-contents", component: stub },
      { path: "/w/:slug/index", name: "open-book-index", component: stub },
      { path: "/w/:slug/:chapter", name: "open-book-chapter", component: stub },
      { path: "/w/:slug/:chapter/:entryId", name: "open-book-entry", component: stub },
    ],
  });
  await router.push(path);
  const wrapper = mount(component, { global: { plugins: [router] } });
  mounted.push(wrapper);
  await flushPromises();
  return wrapper;
}

beforeEach(() => {
  endPreview();
  document.head.querySelectorAll("meta[name=robots]").forEach((m) => m.remove());
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

describe("the cover and a visitor's own ribbons", () => {
  it("drops a ribbon for a page that is no longer in the book, so it never links to a page that does not exist", async () => {
    localStorage.setItem(
      "open-book:ribbons:salt",
      JSON.stringify([
        { key: "entry:town", unit: 0, title: "Hollowmere" },
        { key: "entry:gone", unit: 0, title: "A page cut from the book" },
      ]),
    );
    const w = await mountView(OpenBookCoverView, "/w/salt");
    expect(w.text()).toContain("Your ribbon: Hollowmere");
    expect(w.text()).not.toContain("A page cut from the book");
  });

  it("does not read another book's ribbons", async () => {
    localStorage.setItem("open-book:ribbons:other", JSON.stringify([{ key: "entry:town", unit: 0, title: "Hollowmere" }]));
    const w = await mountView(OpenBookCoverView, "/w/salt");
    expect(w.text()).not.toContain("Your ribbon");
  });

  it("links a ribbon on a later turn of a page to that turn", async () => {
    localStorage.setItem("open-book:ribbons:salt", JSON.stringify([{ key: "entry:town", unit: 2, title: "Hollowmere" }]));
    const w = await mountView(OpenBookCoverView, "/w/salt");
    expect(w.find(".ob-cover-ribbons a").attributes("href")).toBe("/w/salt/atlas/town?s=2");
  });

  it("offers a tab only for a chapter that has pages", async () => {
    state.data = {
      status: "found",
      book: { ...book, snapshot: { ...book.snapshot, book: { ...book.snapshot.book, chapters: ["atlas", "folk"] } } },
    } satisfies PublicOpenBookResult;
    const w = await mountView(OpenBookCoverView, "/w/salt");
    expect(w.findAll("a[aria-label^='Open the book at']").map((a) => a.attributes("aria-label"))).toEqual(["Open the book at Atlas"]);
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

describe("the owner's preview", () => {
  it("shows the banner on both views, only for the previewed slug", async () => {
    startPreview("salt", "c1");
    const cover = await mountView(OpenBookCoverView, "/w/salt");
    expect(cover.find(".ob-preview-bar").exists()).toBe(true);
    expect(document.head.querySelector("meta[name='robots']")?.getAttribute("content")).toContain("noindex");
    cover.unmount();
    expect(document.head.querySelector("meta[name='robots']")).toBeNull();
    const reader = await mountView(OpenBookReaderView, "/w/salt/contents");
    expect(reader.find(".ob-preview-bar").exists()).toBe(true);
    reader.unmount();
    const other = await mountView(OpenBookCoverView, "/w/other");
    expect(other.find(".ob-preview-bar").exists()).toBe(false);
    other.unmount();
    state.data = { status: "found", book: { ...book, slug: "other" } } satisfies PublicOpenBookResult;
    const otherReader = await mountView(OpenBookReaderView, "/w/other/contents");
    expect(otherReader.find(".ob-preview-bar").exists()).toBe(false);
  });

  it("ends from the banner", async () => {
    startPreview("salt", "c1");
    const w = await mountView(OpenBookCoverView, "/w/salt");
    await w.findAll(".ob-preview-bar button")[1]!.trigger("click");
    expect(w.find(".ob-preview-bar").exists()).toBe(false);
  });

  it("goes back to the settings tab", async () => {
    startPreview("salt", "c1");
    const w = await mountView(OpenBookCoverView, "/w/salt");
    // The bare test router has no outlet, so the cover would linger and fail to resolve its links: stop at the call.
    const push = vi.spyOn(w.vm.$router, "push").mockResolvedValue(undefined);
    await w.findAll(".ob-preview-bar button")[0]!.trigger("click");
    expect(push).toHaveBeenCalledWith({ name: "campaign-settings", query: { tab: "openbook" } });
  });
});
