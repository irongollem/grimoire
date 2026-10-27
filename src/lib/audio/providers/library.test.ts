import { beforeEach, describe, expect, it, vi } from "vitest";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});
vi.mock("@/lib/supabase", () => ({ supabase: fake.client }));

import { DEFAULT_PROVIDER_FILTERS } from "./types";
import { libraryProvider, librarySearchFilter } from "./library";

describe("librarySearchFilter", () => {
  it("quotes every value, so PostgREST syntax in the search text stays data", () => {
    expect(librarySearchFilter("rain")).toBe(
      'title.ilike."%rain%",collection.ilike."%rain%",tags.cs."{\\"rain\\"}"',
    );
  });

  it("keeps separators, dots, colons and parentheses inside the quotes", () => {
    const filter = librarySearchFilter("door: creak (old), drip.");
    // Three conditions, however many commas the text holds.
    expect(filter.match(/,(title|collection|tags)\./g)).toHaveLength(2);
    expect(filter).toContain('title.ilike."%door: creak (old), drip.%"');
  });

  it("escapes quotes and backslashes, and keeps a typed % from being a wildcard", () => {
    expect(librarySearchFilter('50% "loud"')).toBe(
      'title.ilike."%50\\\\% \\"loud\\"%",collection.ilike."%50\\\\% \\"loud\\"%",tags.cs."{\\"50% \\\\\\"loud\\\\\\"\\"}"',
    );
  });
});

describe("libraryProvider.search", () => {
  const entry = (over: Record<string, unknown>) => ({
    slug: "x", collection: "weather", category: "ambient", title: "Untitled", author: "Someone",
    source: "freesound", source_page: "https://example.test/page", license: "CC0", license_url: null,
    attribution: null, storage_path: "p", file_url: "https://cdn.example.test/a.ogg", duration_seconds: 10,
    tags: [], is_loopable: false, gain_trim: 1, sort_order: 0, created_at: "", ...over,
  });
  const search = (over: Partial<Parameters<typeof libraryProvider.search>[0]> = {}) =>
    libraryProvider.search({ query: "", page: 1, filters: DEFAULT_PROVIDER_FILTERS, ...over });

  beforeEach(() => {
    fake.reset();
  });

  it("browses beds before one-shots, then alphabetically, when there is no query", async () => {
    fake.seed("sound_library", [
      entry({ id: "1", category: "effects", title: "Anvil" }),
      entry({ id: "2", category: "ambient", title: "Wind" }),
      entry({ id: "3", category: "ambient", title: "Rain" }),
    ]);
    const { hits } = await search();
    expect(hits.map((h) => h.name)).toEqual(["Rain", "Wind", "Anvil"]);
  });

  it("sorts by length, shortest or longest first", async () => {
    fake.seed("sound_library", [
      entry({ id: "1", title: "Mid", duration_seconds: 30 }),
      entry({ id: "2", title: "Short", duration_seconds: 2 }),
      entry({ id: "3", title: "Long", duration_seconds: 120 }),
    ]);
    const shortest = await search({ filters: { ...DEFAULT_PROVIDER_FILTERS, sort: "shortest" } });
    const longest = await search({ filters: { ...DEFAULT_PROVIDER_FILTERS, sort: "longest" } });
    expect(shortest.hits.map((h) => h.name)).toEqual(["Short", "Mid", "Long"]);
    expect(longest.hits.map((h) => h.name)).toEqual(["Long", "Mid", "Short"]);
  });

  it("keeps only clips within the duration bounds, the bounds themselves included", async () => {
    fake.seed("sound_library", [2, 5, 10, 11].map((d) => entry({ id: `d${d}`, title: `${d}s`, duration_seconds: d })));
    const { hits } = await search({ filters: { ...DEFAULT_PROVIDER_FILTERS, minDuration: 5, maxDuration: 10 } });
    expect(hits.map((h) => h.name).sort()).toEqual(["10s", "5s"]);
  });

  it("pages twenty at a time, and knows when a full page may have a next one", async () => {
    fake.seed("sound_library", Array.from({ length: 25 }, (_, i) => entry({ id: `r${i}`, title: `Sound ${String(i).padStart(2, "0")}` })));
    const first = await search({ page: 1 });
    const second = await search({ page: 2 });
    expect(first.hits).toHaveLength(20);
    expect(first.hasNext).toBe(true);
    expect(first.hits[0].name).toBe("Sound 00");
    expect(second.hits.map((h) => h.name)).toEqual(["Sound 20", "Sound 21", "Sound 22", "Sound 23", "Sound 24"]);
    expect(second.hasNext).toBe(false);
    expect(second.page).toBe(2);
  });

  it("labels a clip public domain when it needs no credit, and carries the credit when it does", async () => {
    fake.seed("sound_library", [
      entry({ id: "free", title: "A", attribution: null }),
      entry({ id: "credit", title: "B", attribution: '"B" by Someone (CC-BY)', source_page: "https://example.test/b" }),
    ]);
    const { hits } = await search();
    const [free, credit] = hits;
    expect(free).toMatchObject({ license: "public-domain", attribution: null, attributionUrl: null });
    expect(credit).toMatchObject({ license: "attribution", attribution: '"B" by Someone (CC-BY)', attributionUrl: "https://example.test/b" });
  });

  it("reports an unread duration as 0, and carries the catalogue's own loop flag and bus", async () => {
    fake.seed("sound_library", [entry({ id: "row-1", title: "Loop", duration_seconds: null, is_loopable: true, category: "music" })]);
    const { hits } = await search();
    expect(hits[0]).toMatchObject({ duration: 0, isLoopable: true, libraryId: "row-1", category: "music", providerId: "grimoire" });
  });

  it("sends a text filter only for a non-blank query", async () => {
    fake.seed("sound_library", [entry({ id: "1" })]);
    await search({ query: "   " });
    await search({ query: " rain " });
    const filters = fake.calls.map((c) => c.filters.filter((f) => f.op === "or"));
    expect(filters[0]).toHaveLength(0);
    expect(filters[1]).toHaveLength(1);
    // The term is trimmed before it reaches the filter.
    expect(String(filters[1][0].value)).toContain('"%rain%"');
  });

  it("surfaces a failed search instead of an empty page", async () => {
    fake.failNext("sound_library", { message: "boom" });
    await expect(search()).rejects.toMatchObject({ message: "boom" });
  });
});
