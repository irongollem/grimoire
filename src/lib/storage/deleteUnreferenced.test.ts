import { describe, it, expect, vi, beforeEach } from "vitest";

// #917: a monster/item/trap/location's image can be shared with another row
// (a same-account campaign copy, a "duplicate"/"Customize" clone) or logged
// as a Gallery entry (image_generation_jobs.image_url) for AI-generated art.
// These tests pin the "check before delete" behaviour against both cases.

const deleteByPublicUrl = vi.fn(async (..._urls: (string | null | undefined)[]) => {});
vi.mock("./remove", () => ({
  deleteByPublicUrl: (...urls: (string | null | undefined)[]) => deleteByPublicUrl(...urls),
}));

type CountRow = { count: number | null; error: null };
const counts = new Map<string, CountRow>();
function rowKey(table: string, column: string, value: string): string {
  return `${table}.${column}=${value}`;
}
/** Every combination defaults to count 0 (unreferenced) unless set here. */
function setCount(table: string, column: string, value: string, count: number | null): void {
  counts.set(rowKey(table, column, value), { count, error: null });
}

const eq = vi.fn();
const from = vi.fn((table: string) => ({
  select: vi.fn(() => ({
    eq: vi.fn(async (column: string, value: string) => {
      eq(table, column, value);
      return counts.get(rowKey(table, column, value)) ?? { count: 0, error: null };
    }),
  })),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: { from: (table: string) => from(table) },
}));

beforeEach(() => {
  deleteByPublicUrl.mockClear();
  from.mockClear();
  eq.mockClear();
  counts.clear();
});

describe("deleteUnreferencedByPublicUrl", () => {
  it("deletes a file nothing references", async () => {
    const { deleteUnreferencedByPublicUrl } = await import("./deleteUnreferenced");
    await deleteUnreferencedByPublicUrl({ urls: ["https://cdn.example.com/monster-images/u1/a.webp"],
    });

    expect(deleteByPublicUrl).toHaveBeenCalledWith("https://cdn.example.com/monster-images/u1/a.webp");
  });

  it("keeps a file another row of the same table still uses", async () => {
    const { deleteUnreferencedByPublicUrl } = await import("./deleteUnreferenced");
    const url = "https://cdn.example.com/monster-images/u1/a.webp";
    setCount("monsters", "image_url", url, 1);

    await deleteUnreferencedByPublicUrl({ urls: [url] });

    expect(deleteByPublicUrl).not.toHaveBeenCalled();
  });

  it("keeps a file a Gallery row (image_generation_jobs) still uses", async () => {
    const { deleteUnreferencedByPublicUrl } = await import("./deleteUnreferenced");
    const url = "https://cdn.example.com/item-images/u1/b.webp";
    setCount("image_generation_jobs", "image_url", url, 1);

    await deleteUnreferencedByPublicUrl({ urls: [url] });

    expect(deleteByPublicUrl).not.toHaveBeenCalled();
  });

  it("checks every image column a table has, not just one", async () => {
    const { deleteUnreferencedByPublicUrl } = await import("./deleteUnreferenced");
    const url = "https://cdn.example.com/item-images/u1/mundane.webp";
    // Only referenced via the second column — must still be found and kept.
    setCount("items", "mundane_image_url", url, 1);

    await deleteUnreferencedByPublicUrl({ urls: [url] });

    expect(deleteByPublicUrl).not.toHaveBeenCalled();
  });

  it("ignores null and undefined URLs entirely", async () => {
    const { deleteUnreferencedByPublicUrl } = await import("./deleteUnreferenced");
    await deleteUnreferencedByPublicUrl({ urls: [null, undefined] });

    expect(from).not.toHaveBeenCalled();
    expect(deleteByPublicUrl).not.toHaveBeenCalled();
  });

  it("checks a duplicate URL only once", async () => {
    const { deleteUnreferencedByPublicUrl } = await import("./deleteUnreferenced");
    const url = "https://cdn.example.com/trap-images/u1/a.webp";

    await deleteUnreferencedByPublicUrl({ urls: [url, url, url] });

    // One pass over every referencing column, not one per copy of the URL.
    const { IMAGE_REFERENCES } = await import("./deleteUnreferenced");
    const columnCount = IMAGE_REFERENCES.reduce((n, [, columns]) => n + columns.length, 0);
    expect(eq).toHaveBeenCalledTimes(columnCount);
    expect(deleteByPublicUrl).toHaveBeenCalledTimes(1);
    expect(deleteByPublicUrl).toHaveBeenCalledWith(url);
  });

  it("deletes only the unreferenced URLs out of several, in one call", async () => {
    const { deleteUnreferencedByPublicUrl } = await import("./deleteUnreferenced");
    const kept = "https://cdn.example.com/location-images/u1/map.webp";
    const removed = "https://cdn.example.com/location-images/u1/pic.webp";
    setCount("locations", "map_url", kept, 1);

    await deleteUnreferencedByPublicUrl({ urls: [kept, removed, null],
    });

    expect(deleteByPublicUrl).toHaveBeenCalledTimes(1);
    expect(deleteByPublicUrl).toHaveBeenCalledWith(removed);
  });

  it("keeps an NPC's portrait that a monster promoted from the NPC shares", async () => {
    const { deleteUnreferencedByPublicUrl } = await import("./deleteUnreferenced");
    const url = "https://cdn.example.com/npc-portraits/u1/ribbon.webp";
    setCount("npcs", "portrait_url", url, 1);

    await deleteUnreferencedByPublicUrl({ urls: [url] });

    expect(deleteByPublicUrl).not.toHaveBeenCalled();
  });

  it("keeps canonical library art a customized clone points at", async () => {
    const { deleteUnreferencedByPublicUrl } = await import("./deleteUnreferenced");
    const url = "https://cdn.example.com/monster-images/srd/owlbear.webp";
    setCount("library_monsters", "image_url", url, 1);

    await deleteUnreferencedByPublicUrl({ urls: [url] });

    expect(deleteByPublicUrl).not.toHaveBeenCalled();
  });

  it("keeps a file when a reference count comes back unknown", async () => {
    const { deleteUnreferencedByPublicUrl } = await import("./deleteUnreferenced");
    const url = "https://cdn.example.com/monster-images/u1/a.webp";
    setCount("monsters", "image_url", url, null);

    await deleteUnreferencedByPublicUrl({ urls: [url] });

    expect(deleteByPublicUrl).not.toHaveBeenCalled();
  });
});
