import { describe, it, expect, vi, beforeEach } from "vitest";

// #917: a monster/item/trap/location's image can be shared with another row
// (a same-account campaign copy, a "duplicate"/"Customize" clone) or logged
// as a Gallery entry (image_generation_jobs.image_url) for AI-generated art.
// These tests pin the "check before delete" behaviour against both cases.

const deleteByPublicUrl = vi.fn(async (..._urls: (string | null | undefined)[]) => {});
vi.mock("./remove", () => ({
  deleteByPublicUrl: (...urls: (string | null | undefined)[]) => deleteByPublicUrl(...urls),
}));

const refs = new Set<string>();
const failing = new Set<string>();
function rowKey(table: string, column: string, value: string): string {
  return `${table}.${column}=${value}`;
}
/** Every URL is unreferenced unless a row is set here. */
function setCount(table: string, column: string, value: string, count: number): void {
  if (count > 0) refs.add(rowKey(table, column, value));
}

const inCall = vi.fn();
const from = vi.fn((table: string) => ({
  select: vi.fn((column: string) => ({
    in: vi.fn(async (_column: string, values: string[]) => {
      inCall(table, column, values);
      if (failing.has(`${table}.${column}`)) return { data: null, error: new Error("read failed") };
      return { data: values.filter((v) => refs.has(rowKey(table, column, v))).map((v) => ({ [column]: v })), error: null };
    }),
  })),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: { from: (table: string) => from(table) },
}));

beforeEach(() => {
  deleteByPublicUrl.mockClear();
  from.mockClear();
  inCall.mockClear();
  refs.clear();
  failing.clear();
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
    expect(inCall).toHaveBeenCalledTimes(columnCount);
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

  it("keeps an NPC's cutout that a monster promoted from the NPC shares (#917 story 4)", async () => {
    const { deleteUnreferencedByPublicUrl } = await import("./deleteUnreferenced");
    const url = "https://cdn.example.com/npc-portraits/u1/ribbon-cutout.webp";
    setCount("npcs", "cutout_url", url, 1);

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

  it("keeps every file, and throws, when a reference read fails", async () => {
    const { deleteUnreferencedByPublicUrl } = await import("./deleteUnreferenced");
    failing.add("monsters.image_url");

    await expect(deleteUnreferencedByPublicUrl({ urls: ["https://cdn.example.com/monster-images/u1/a.webp"] })).rejects.toThrow();
    expect(deleteByPublicUrl).not.toHaveBeenCalled();
  });

  it("reads a campaign's worth of files in chunks, one read per column per chunk (#918)", async () => {
    const { deleteUnreferencedByPublicUrl, IMAGE_REFERENCES } = await import("./deleteUnreferenced");
    const urls = Array.from({ length: 120 }, (_, i) => `https://cdn.example.com/location-images/u1/${i}.webp`);
    setCount("deities", "symbol_image_url", urls[7], 1);

    await deleteUnreferencedByPublicUrl({ urls });

    const columnCount = IMAGE_REFERENCES.reduce((n, [, columns]) => n + columns.length, 0);
    expect(inCall.mock.calls.length).toBeLessThanOrEqual(columnCount * 3);
    expect(inCall.mock.calls.every(([, , values]) => (values as string[]).length <= 50)).toBe(true);
    const deleted = deleteByPublicUrl.mock.calls[0];
    expect(deleted).toHaveLength(119);
    expect(deleted).not.toContain(urls[7]);
  });

  it("keeps a Hall of Heroes card's portrait and a campaign's group portrait (#918)", async () => {
    const { deleteUnreferencedByPublicUrl } = await import("./deleteUnreferenced");
    const card = "https://cdn.example.com/npc-portraits/u1/hero.webp";
    const group = "https://cdn.example.com/location-images/u1/group.webp";
    setCount("hall_of_heroes", "portrait_url", card, 1);
    setCount("campaigns", "group_portrait_url", group, 1);

    await deleteUnreferencedByPublicUrl({ urls: [card, group] });

    expect(deleteByPublicUrl).not.toHaveBeenCalled();
  });
});
