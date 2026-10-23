import { describe, expect, it } from "vitest";
import { buildBookModel } from "@/lib/openBook/bookModel";
import type { OpenBookSnapshot } from "@/types/openBook.types";
import { buildBookMarkup, coverMarkup, releaseLabel } from "./bookMarkup";

function snapshot(book: Partial<OpenBookSnapshot["book"]> = {}): OpenBookSnapshot {
  return {
    v: 1,
    book: {
      title: "The Saltreach",
      subtitle: "An account <of> the coast",
      cover_art: "tooled",
      cover_image_url: null,
      leather: "oxblood",
      chapters: ["atlas", "chronicle"],
      campaign_name: "Saltreach",
      ...book,
    },
    calendar: { calendar_id: null, custom_calendar: null, current: { year: null, month: null, day: null } },
    places: [
      { id: "p1", name: "Hollowmere", parent_id: null, location_type: "town" },
    ] as unknown as OpenBookSnapshot["places"],
    folk: [],
    factions: [],
    pantheons: [],
    deities: [],
    lore: [],
    sessions: [
      { id: "s1", title: "Low tide", session: { number: 1, title: "Low tide" } },
    ] as unknown as OpenBookSnapshot["sessions"],
    events: [],
    names: [],
  } as unknown as OpenBookSnapshot;
}

const release = { number: 2, created_at: "2026-10-23T10:00:00Z", note: "After session 14" };

describe("releaseLabel", () => {
  it("names the release and its date", () => {
    expect(releaseLabel(release)).toBe("Release 2 · 23 October 2026");
  });
  it("drops a date it cannot read", () => {
    expect(releaseLabel({ ...release, created_at: "nope" })).toBe("Release 2");
  });
});

describe("coverMarkup", () => {
  it("falls back to the tooled cover when the picture it asks for is missing", () => {
    expect(coverMarkup(snapshot({ cover_art: "plate" }).book)).toContain('data-art="tooled"');
  });
  it("frames the picture on a plate cover and spreads it on a full one", () => {
    const image = "https://cdn.example/c.webp";
    expect(coverMarkup(snapshot({ cover_art: "plate", cover_image_url: image }).book)).toContain("pb-plate-frame");
    expect(coverMarkup(snapshot({ cover_art: "full", cover_image_url: image }).book)).toContain("pb-cover-art");
  });
  it("escapes the title and subtitle", () => {
    const html = coverMarkup(snapshot({ title: "A & B" }).book);
    expect(html).toContain("A &amp; B");
    expect(html).toContain("An account &lt;of&gt; the coast");
  });
  it("tints a walnut book by its hide, with the photographed texture", () => {
    expect(coverMarkup(snapshot({ leather: "walnut" }).book)).toContain('data-grain="natural"');
    expect(coverMarkup(snapshot({ leather: "sea" }).book)).toContain('data-grain="tinted"');
  });
});

describe("buildBookMarkup", () => {
  const model = buildBookModel(snapshot());
  const sectionHtml = new Map([
    ["entry:p1", "<article>Hollowmere</article>"],
    ["entry:s1", "<article>Low tide</article>"],
    ["almanac", "<section>Almanac</section>"],
    ["index", "<section>Index</section>"],
  ]);
  const markup = buildBookMarkup({ model, release, sectionHtml });

  it("holds the title page, contents, a title page per chapter, each entry, the almanac and the index", () => {
    expect(markup).toContain('class="pb-title"');
    expect(markup).toContain('id="contents"');
    expect(markup).toContain('id="chapter-atlas"');
    expect(markup).toContain('id="chapter-chronicle"');
    expect(markup).toContain('id="e-p1"');
    expect(markup).toContain('id="e-s1"');
    expect(markup).toContain('id="almanac"');
    expect(markup).toContain('id="index"');
  });

  it("leaves the cover to be drawn on its own sheet", () => {
    expect(markup).not.toContain("pb-cover");
  });

  it("marks the first chapter, where the folios begin", () => {
    expect(markup.match(/pb-first/g)).toHaveLength(1);
    expect(markup.indexOf("pb-first")).toBeLessThan(markup.indexOf('id="chapter-atlas"') + 40);
  });

  it("opens the chronicle on its almanac, before the sessions", () => {
    expect(markup.indexOf('id="almanac"')).toBeLessThan(markup.indexOf('id="e-s1"'));
    expect(markup.indexOf('id="chapter-chronicle"')).toBeLessThan(markup.indexOf('id="almanac"'));
  });

  it("lists every page in the contents with a link to it", () => {
    expect(markup).toContain('href="#e-p1"');
    expect(markup).toContain('href="#almanac"');
    expect(markup).toContain('href="#index"');
  });

  it("carries the running head: the chapter and the entry's title", () => {
    expect(markup).toContain('data-chapter="I · The Atlas" data-title="Hollowmere"');
  });
});
