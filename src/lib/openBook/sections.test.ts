import { describe, expect, it } from "vitest";
import type { OpenBookLore, OpenBookPlace, OpenBookSession, OpenBookSnapshot } from "@/types/openBook.types";
import { buildBookModel } from "./bookModel";
import { searchBook } from "./bookSearch";
import {
  ALMANAC_KEY,
  CONTENTS_KEY,
  INDEX_KEY,
  chapterOpener,
  crumbsOf,
  entryKey,
  estimateSectionPages,
  hasFrontispiece,
  neighbours,
  resolveSection,
  sectionLocation,
  sectionsOf,
  tabOf,
} from "./sections";

const place = (id: string, name: string, description: string | null = null): OpenBookPlace => ({
  id,
  parent_id: null,
  name,
  location_type: "Town",
  player_summary: null,
  description,
  image_url: null,
  tags: null,
  is_level: null,
  is_battle_map: null,
  npcs_shared: null,
  map: null,
  pins: [],
});

const lore = (id: string, title: string): OpenBookLore => ({
  id,
  title,
  category: null,
  content: null,
  tags: null,
  is_pinned: null,
  created_at: "2026-01-01",
  updated_at: "2026-01-01",
});

const session = (id: string, n: number): OpenBookSession => ({
  id,
  title: `Raw ${id}`,
  content: null,
  tags: null,
  session: { number: n, title: `Session ${n}`, played_on: null },
  date: null,
  real_date: null,
  created_at: "2026-01-01",
});

function snapshot(over: Partial<OpenBookSnapshot> = {}): OpenBookSnapshot {
  return {
    v: 1,
    book: {
      title: "The Saltreach",
      subtitle: null,
      cover_art: "tooled",
      cover_image_url: null,
      leather: "oxblood",
      chapters: ["atlas", "lore", "chronicle"],
      campaign_name: "Saltreach",
    },
    calendar: { calendar_id: null, custom_calendar: null, current: { year: null, month: null, day: null } },
    places: [place("p1", "Hollowmere"), place("p2", "Salt Stair")],
    folk: [],
    factions: [],
    pantheons: [],
    deities: [],
    lore: [lore("l1", "The Drowned Roads")],
    sessions: [session("s1", 1)],
    events: [],
    names: {},
    ...over,
  };
}

const model = buildBookModel(snapshot());
const sections = sectionsOf(model);

describe("sectionsOf", () => {
  it("runs contents, chapters in order, almanac before the Chronicle, index last", () => {
    expect(sections.map((s) => s.key)).toEqual([
      CONTENTS_KEY,
      entryKey("p1"),
      entryKey("p2"),
      entryKey("l1"),
      ALMANAC_KEY,
      entryKey("s1"),
      INDEX_KEY,
    ]);
  });

  it("leaves out chapters with nothing in them", () => {
    const bare = sectionsOf(buildBookModel(snapshot({ lore: [], sessions: [] })));
    expect(bare.map((s) => s.key)).toEqual([CONTENTS_KEY, entryKey("p1"), entryKey("p2"), INDEX_KEY]);
  });
});

describe("resolveSection", () => {
  it("finds contents, index, entries and chapter openers", () => {
    expect(resolveSection(sections, "open-book-contents", {})?.key).toBe(CONTENTS_KEY);
    expect(resolveSection(sections, "open-book-index", {})?.key).toBe(INDEX_KEY);
    expect(resolveSection(sections, "open-book-entry", { chapter: "atlas", entryId: "p2" })?.key).toBe(entryKey("p2"));
    expect(resolveSection(sections, "open-book-chapter", { chapter: "atlas" })?.key).toBe(entryKey("p1"));
    expect(resolveSection(sections, "open-book-chapter", { chapter: "chronicle" })?.key).toBe(ALMANAC_KEY);
  });

  it("answers null for a page that is not in the book", () => {
    expect(resolveSection(sections, "open-book-entry", { chapter: "atlas", entryId: "nope" })).toBeNull();
    expect(resolveSection(sections, "open-book-entry", { chapter: "folk", entryId: "p1" })).toBeNull();
    expect(resolveSection(sections, "open-book-chapter", { chapter: "folk" })).toBeNull();
    expect(resolveSection(sections, "open-book-chapter", { chapter: "banana" })).toBeNull();
    expect(resolveSection(sections, "other", {})).toBeNull();
  });
});

describe("navigation helpers", () => {
  it("names the neighbours at the ends", () => {
    expect(neighbours(sections, CONTENTS_KEY).prev).toBeNull();
    expect(neighbours(sections, INDEX_KEY).next).toBeNull();
    expect(neighbours(sections, entryKey("p1")).prev?.key).toBe(CONTENTS_KEY);
    expect(neighbours(sections, "missing")).toEqual({ prev: null, next: null });
  });

  it("builds a location per kind", () => {
    const p2 = sections.find((s) => s.key === entryKey("p2"));
    if (!p2) throw new Error("fixture");
    expect(sectionLocation("salt", p2, { s: "2" })).toEqual({
      name: "open-book-entry",
      params: { slug: "salt", chapter: "atlas", entryId: "p2" },
      query: { s: "2" },
    });
    expect(sectionLocation("salt", sections[0])).toEqual({ name: "open-book-contents", params: { slug: "salt" }, query: undefined });
    // An empty query is no query, so the first spread keeps a clean address.
    expect(sectionLocation("salt", sections[0], {})).toEqual({ name: "open-book-contents", params: { slug: "salt" } });
  });

  it("opens a chapter on its title page: its opener, the almanac and the index, never contents or a later entry", () => {
    const frontispiece = (key: string) => hasFrontispiece(sections, key);
    expect(frontispiece(CONTENTS_KEY)).toBe(false);
    expect(frontispiece(entryKey("p1"))).toBe(true);
    expect(frontispiece(entryKey("p2"))).toBe(false);
    expect(frontispiece(entryKey("l1"))).toBe(true);
    // The Chronicle opens on its almanac, so its first session starts straight on its own pages.
    expect(frontispiece(ALMANAC_KEY)).toBe(true);
    expect(frontispiece(entryKey("s1"))).toBe(false);
    expect(frontispiece(INDEX_KEY)).toBe(true);
    expect(frontispiece("entry:unknown")).toBe(true);
  });

  it("picks the tab to pull out", () => {
    expect(tabOf(sections[1])).toBe("atlas");
    expect(tabOf(sections[sections.length - 1])).toBe("index");
    expect(tabOf(sections[0])).toBeNull();
    expect(chapterOpener(sections, "lore")?.key).toBe(entryKey("l1"));
  });
});

describe("estimateSectionPages", () => {
  it("gives every section at least a page, and longer text more", () => {
    const long = buildBookModel(snapshot({ places: [place("p1", "Hollowmere", "x".repeat(9000)), place("p2", "Salt Stair")] }));
    const est = estimateSectionPages(long, sectionsOf(long));
    expect(est.get(entryKey("p2"))).toBe(1);
    expect(est.get(entryKey("p1"))).toBeGreaterThan(1);
    expect(est.get(CONTENTS_KEY)).toBe(2);
    for (const count of est.values()) expect(count).toBeGreaterThanOrEqual(1);
  });

  it("gives the almanac more pages for more events, the index more for more entries, a pantheon more for more deities", () => {
    const event = (n: number) => ({
      id: `e${n}`, title: "Feast", description: null, event_type: null, year: 1, month: 1, day: 1, festival_day: null,
      is_multi_day: null, end_year: null, end_month: null, end_day: null, color: null,
    });
    const pagesOf = (over: Partial<OpenBookSnapshot>, key: string) => {
      const m = buildBookModel(snapshot(over));
      return estimateSectionPages(m, sectionsOf(m)).get(key) ?? 0;
    };
    expect(pagesOf({ events: Array.from({ length: 100 }, (_, i) => event(i)) }, ALMANAC_KEY)).toBeGreaterThan(pagesOf({}, ALMANAC_KEY));
    const manyPlaces = Array.from({ length: 200 }, (_, i) => place(`q${i}`, `Place ${i}`));
    expect(pagesOf({ places: manyPlaces }, INDEX_KEY)).toBeGreaterThan(pagesOf({}, INDEX_KEY));
    const deity = (i: number) => ({
      id: `d${i}`, pantheon_id: "pa", name: `God ${i}`, titles: null, alternate_names: null, alignment: null, symbol: null, symbol_image_url: null,
      portrait_url: null, portrait_focal_point: null, domains: null, portfolio: null, description: null, tags: null,
    });
    const pantheon = { id: "pa", name: "Choir", description: null, emblem_url: null, tags: null };
    const book = { ...snapshot().book, chapters: ["pantheon" as const] };
    expect(pagesOf({ book, pantheons: [pantheon], deities: Array.from({ length: 40 }, (_, i) => deity(i)) }, entryKey("pa")))
      .toBeGreaterThan(pagesOf({ book, pantheons: [pantheon], deities: [] }, entryKey("pa")));
  });

  it("counts a place's player summary toward its length", () => {
    const withSummary = buildBookModel(snapshot({ places: [{ ...place("p1", "Hollowmere"), player_summary: "x".repeat(9000) }] }));
    const est = estimateSectionPages(withSummary, sectionsOf(withSummary));
    expect(est.get(entryKey("p1"))).toBeGreaterThan(1);
  });
});

describe("searchBook", () => {
  const m = buildBookModel(snapshot({ places: [place("p1", "Hollowmere"), place("p2", "Salt Stair"), place("p3", "The Hollow Bell")] }));

  it("ranks prefix before word start before contains", () => {
    expect(searchBook(m, "hollow").map((e) => e.id)).toEqual(["p1", "p3"]);
    expect(searchBook(m, "stair").map((e) => e.id)).toEqual(["p2"]);
  });

  it("ranks a title start, a word start, a mid-word match and a subtitle match in that order, an exact title first of all", () => {
    const ranked = buildBookModel(snapshot({
      places: [
        { ...place("sub", "Chime"), location_type: "bell ringers" },
        place("mid", "Handbell"),
        place("word", "Hollow Bell"),
        place("pre", "Bell Tower"),
        place("exact", "Bell"),
      ],
    }));
    expect(searchBook(ranked, "bell").map((e) => e.id)).toEqual(["exact", "pre", "word", "mid", "sub"]);
  });

  it("starts a word after any punctuation, not only a space", () => {
    const m2 = buildBookModel(snapshot({ places: [place("in", "Upstairs"), place("hy", "Salt-Stair")] }));
    expect(searchBook(m2, "stair").map((e) => e.id)).toEqual(["hy", "in"]);
  });

  it("finds an entry by its subtitle alone", () => {
    const m3 = buildBookModel(snapshot({ places: [{ ...place("t", "Hollowmere"), location_type: "Harbour" }] }));
    expect(searchBook(m3, "harbour").map((e) => e.id)).toEqual(["t"]);
  });

  it("ignores case and accents, and wants every word", () => {
    expect(searchBook(m, "HOLLOWMÈRE").map((e) => e.id)).toEqual(["p1"]);
    expect(searchBook(m, "salt bell")).toEqual([]);
  });

  it("is empty for an empty query", () => {
    expect(searchBook(m, "   ")).toEqual([]);
  });

  it("honours the limit", () => {
    expect(searchBook(m, "e", 1)).toHaveLength(1);
  });
});

describe("crumbsOf", () => {
  it("names the chapter and the page, linking only what you are not on", () => {
    const entry = sections.find((x) => x.key === entryKey("p2"));
    if (!entry) throw new Error("fixture");
    const crumbs = crumbsOf(model, sections, "salt", entry);
    expect(crumbs.map((c) => c.label)).toEqual(["The Atlas", "Salt Stair"]);
    expect(crumbs[0].to).not.toBeNull();
    expect(crumbs[1].to).toBeNull();
  });

  it("does not link the chapter from its own opener", () => {
    const entry = sections.find((x) => x.key === entryKey("p1"));
    if (!entry) throw new Error("fixture");
    expect(crumbsOf(model, sections, "salt", entry)[0].to).toBeNull();
  });

  it("walks a place's ancestors that are in the book", () => {
    const child: OpenBookPlace = { ...place("p9", "Toll Stair"), parent_id: "p1" };
    const m = buildBookModel(snapshot({ places: [place("p1", "Hollowmere"), child] }));
    const secs = sectionsOf(m);
    const target = secs.find((x) => x.key === entryKey("p9"));
    if (!target) throw new Error("fixture");
    const crumbs = crumbsOf(m, secs, "salt", target);
    expect(crumbs.map((c) => c.label)).toEqual(["The Atlas", "Hollowmere", "Toll Stair"]);
    // The ancestor is a page of the book, so it links; the page you are on does not.
    expect(crumbs.map((c) => c.to !== null)).toEqual([true, true, false]);
  });

  it("is short for contents, index and the almanac", () => {
    expect(crumbsOf(model, sections, "salt", sections[0]).map((c) => c.label)).toEqual(["Contents"]);
    expect(crumbsOf(model, sections, "salt", sections[sections.length - 1]).map((c) => c.label)).toEqual(["Index of names"]);
    const almanac = sections.find((x) => x.key === ALMANAC_KEY);
    if (!almanac) throw new Error("fixture");
    expect(crumbsOf(model, sections, "salt", almanac).map((c) => c.label)).toEqual(["The Chronicle"]);
  });
});
