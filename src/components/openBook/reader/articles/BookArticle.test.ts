import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import { createMemoryHistory, createRouter } from "vue-router";
import { buildBookModel, type BookModel } from "@/lib/openBook/bookModel";
import type { OpenBookSnapshot } from "@/types/openBook.types";
import BookArticle from "./BookArticle.vue";
import AlmanacPage from "./AlmanacPage.vue";
import IndexPage from "./IndexPage.vue";

const doc = (text: string) => JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] });

const snapshot: OpenBookSnapshot = {
  v: 1,
  book: { title: "T", subtitle: null, cover_art: "tooled", cover_image_url: null, leather: "oxblood", chapters: ["atlas", "folk", "factions", "pantheon", "lore", "chronicle"], campaign_name: "C" },
  calendar: { calendar_id: "faerun", custom_calendar: null, current: { year: 1492, month: 1, day: 5 } },
  places: [
    { id: "town", parent_id: null, name: "Hollowmere", location_type: "city", player_summary: "A sunken town.", description: doc("Boats tie up."), image_url: null, tags: null, is_level: null, is_battle_map: null, npcs_shared: null, map: null, pins: [] },
    { id: "stair", parent_id: "town", name: "The Toll Stair", location_type: null, player_summary: null, description: null, image_url: null, tags: null, is_level: null, is_battle_map: null, npcs_shared: null, map: null, pins: [] },
  ],
  folk: [
    { id: "maren", name: "Maren Vell", race: "Human", occupation: "Harbourmaster", status: "dead", relationship: "friendly", portrait_url: null, portrait_focal_point: null, cutout_url: null, location_id: "town", former_name: "The Quiet One", former_portrait_url: null },
  ],
  factions: [{ id: "brine", name: "House Brine", faction_type: "noble_house", description: doc("Salt-lords."), emblem_url: null, alignment: "Lawful neutral", tags: null, party_standing: "wary", descent: null }],
  pantheons: [{ id: "reach", name: "Gods of the Reach", description: doc("Many."), emblem_url: null, tags: null }],
  deities: [{ id: "orla", pantheon_id: "reach", name: "Orla", titles: "Saint of the drowned", alternate_names: ["The Ringer"], alignment: "Neutral good", symbol: "A bell", symbol_image_url: null, portrait_url: null, portrait_focal_point: null, domains: ["Tempest", "Light"], portfolio: "Bells", description: doc("A ringer."), tags: null }],
  lore: [{ id: "tide", title: "The Long Tide", category: "history", content: doc("Water."), tags: null, is_pinned: null, created_at: "", updated_at: "" }],
  sessions: [
    { id: "s14", title: "The Lamp Goes Out", content: JSON.stringify({ type: "doc", content: [{ type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "The climb" }] }, { type: "paragraph", content: [{ type: "entityMention", attrs: { id: "maren", entityType: "npc" } }] }] }), tags: null, session: { number: 14, title: null, played_on: "2026-10-22" }, date: { year: 1492, month: 1, day: 5, end_year: null, end_month: null, end_day: null }, real_date: null, created_at: "2026-10-22" },
  ],
  events: [{ id: "ev", title: "Feast of Orla", description: null, event_type: null, year: 1492, month: 1, day: 14, festival_day: null, is_multi_day: null, end_year: null, end_month: null, end_day: null, color: null }],
  names: {},
};

async function mountWith(model: BookModel, component: typeof BookArticle | typeof AlmanacPage | typeof IndexPage, props: object) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: "/book/:slug/:chapter/:entryId", name: "open-book-entry", component: { template: "<div />" } }],
  });
  await router.push({ name: "open-book-entry", params: { slug: "s", chapter: "atlas", entryId: "x" } });
  await router.isReady();
  return mount(component as typeof BookArticle, { props: { model, ...props } as never, global: { plugins: [router] } });
}

async function article(id: string) {
  const model = buildBookModel(snapshot);
  const entry = model.byId.get(id)!;
  return mountWith(model, BookArticle, { entry });
}

describe("BookArticle", () => {
  it("lays out a place with its lede, kind line and lists", async () => {
    const w = await article("town");
    expect(w.find("h1").text()).toBe("Hollowmere");
    expect(w.find(".book-lede").text()).toBe("A sunken town.");
    expect(w.text()).toContain("Places within");
    expect(w.text()).toContain("The Toll Stair");
    expect(w.find(".book-plate").exists()).toBe(false);
    expect(w.text()).toContain("Folk met here");
    expect(w.find("a[href$='/atlas/stair']").exists()).toBe(true);
  });

  it("lays out a person as facts and ties, with no prose", async () => {
    const w = await article("maren");
    expect(w.text()).toContain("Once known as The Quiet One");
    expect(w.text()).toContain("Friendly");
    expect(w.text()).toContain("Dead");
    expect(w.find(".book-prose").exists()).toBe(false);
    expect(w.find("a[href$='/chronicle/s14']").exists()).toBe(true);
    expect(w.find("a[href$='/atlas/town']").exists()).toBe(true);
  });

  it("lays out a faction without a members table or motto", async () => {
    const w = await article("brine");
    expect(w.text()).toContain("Lawful neutral");
    expect(w.text()).toContain("Noble house");
    expect(w.text()).toContain("Wary");
    expect(w.find(".book-cols").exists()).toBe(false);
  });

  it("lays out a pantheon and its deity", async () => {
    const pantheon = await article("reach");
    expect(pantheon.text()).toContain("Orla");
    const deity = await article("orla");
    expect(deity.findAll(".book-dom").map((d) => d.text())).toEqual(["Tempest", "Light"]);
    expect(deity.text()).toContain("The Ringer");
    expect(deity.find("a[href$='/pantheon/reach']").exists()).toBe(true);
  });

  it("lays out lore and a session report", async () => {
    expect((await article("tide")).text()).toContain("History");
    const w = await article("s14");
    expect(w.find(".book-rubric").text()).toBe("Session XIV");
    expect(w.text()).toContain("played 22 Oct 2026");
    expect(w.find("h2").text()).toBe("The climb");
    expect(w.find("a[href$='/folk/maren']").exists()).toBe(true);
  });
});

describe("AlmanacPage and IndexPage", () => {
  it("draws the current month with red-letter days and the sessions that have passed", async () => {
    const model = buildBookModel(snapshot);
    const w = await mountWith(model, AlmanacPage, {});
    expect(w.findAll(".book-cal-d.is-red")).toHaveLength(2);
    expect(w.find(".book-cal-d.is-today").exists()).toBe(true);
    expect(w.text()).toContain("What has passed");
    expect(w.text()).toContain("The Lamp Goes Out");
  });

  it("indexes every page under its letter", async () => {
    const w = await mountWith(buildBookModel(snapshot), IndexPage, {});
    expect(w.findAll(".book-index-letter").map((l) => l.text())).toContain("H");
    expect(w.find("a[href$='/atlas/town']").exists()).toBe(true);
  });
});
