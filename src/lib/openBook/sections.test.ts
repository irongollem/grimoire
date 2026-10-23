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
});

describe("searchBook", () => {
  const m = buildBookModel(snapshot({ places: [place("p1", "Hollowmere"), place("p2", "Salt Stair"), place("p3", "The Hollow Bell")] }));

  it("ranks prefix before word start before contains", () => {
    expect(searchBook(m, "hollow").map((e) => e.id)).toEqual(["p1", "p3"]);
    expect(searchBook(m, "stair").map((e) => e.id)).toEqual(["p2"]);
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
    expect(crumbsOf(m, secs, "salt", target).map((c) => c.label)).toEqual(["The Atlas", "Hollowmere", "Toll Stair"]);
  });

  it("is short for contents, index and the almanac", () => {
    expect(crumbsOf(model, sections, "salt", sections[0]).map((c) => c.label)).toEqual(["Contents"]);
    expect(crumbsOf(model, sections, "salt", sections[sections.length - 1]).map((c) => c.label)).toEqual(["Index of names"]);
    const almanac = sections.find((x) => x.key === ALMANAC_KEY);
    if (!almanac) throw new Error("fixture");
    expect(crumbsOf(model, sections, "salt", almanac).map((c) => c.label)).toEqual(["The Chronicle"]);
  });
});
