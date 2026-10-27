import { describe, it, expect, vi, beforeEach } from "vitest";

// #917: an entity's image file can be shared with another row (a same-account
// campaign copy, a "Customize"/duplicate clone, promoted NPC art, library art)
// or logged as a Gallery entry (image_generation_jobs.image_url). A delete
// must keep every file something still points at, and must keep EVERYTHING
// when it cannot tell (a failed read), because deleting cannot be undone.

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});

const deleteByPublicUrl = vi.fn(async (..._urls: (string | null | undefined)[]) => {});
vi.mock("./remove", () => ({
  deleteByPublicUrl: (...urls: (string | null | undefined)[]) => deleteByPublicUrl(...urls),
}));
vi.mock("@/lib/supabase", () => ({ supabase: fake.client }));

import { deleteUnreferencedByPublicUrl } from "./deleteUnreferenced";

const url = (n: string | number) => `https://cdn.example.com/location-images/u1/${n}.webp`;

/** URLs an Open Book release holds; the real RPC answers with the subset of the asked URLs. */
const releaseUrls = new Set<string>();

beforeEach(() => {
  fake.reset();
  deleteByPublicUrl.mockClear();
  releaseUrls.clear();
  fake.onRpc("open_book_images_in_use", (args) =>
    (args.p_urls as string[]).filter((u) => releaseUrls.has(u)),
  );
});

describe("deleteUnreferencedByPublicUrl", () => {
  it("deletes a file nothing references", async () => {
    await deleteUnreferencedByPublicUrl({ urls: [url("a")] });
    expect(deleteByPublicUrl).toHaveBeenCalledWith(url("a"));
  });

  // One row per place a file can still be in use. The list is stated here, not
  // read from IMAGE_REFERENCES, so dropping a table or column from the source
  // list fails the matching row.
  it.each([
    ["a monster", "monsters", "image_url"],
    ["an item's second picture", "items", "mundane_image_url"],
    ["a Gallery entry (#917)", "image_generation_jobs", "image_url"],
    ["a location map", "locations", "map_url"],
    ["an NPC portrait a promoted monster shares", "npcs", "portrait_url"],
    ["an NPC cutout a promoted monster shares (#917 story 4)", "npcs", "cutout_url"],
    ["canonical library art a customized clone points at", "library_monsters", "image_url"],
    ["a deity's symbol (#918)", "deities", "symbol_image_url"],
    ["a Hall of Heroes card (#918)", "hall_of_heroes", "portrait_url"],
    ["a campaign's group portrait (#918)", "campaigns", "group_portrait_url"],
    ["a Dungeon Craft library trap (#1060)", "library_traps", "image_url"],
    ["a Dressing prop (#1062)", "library_dressing", "image_url"],
    ["a notice pin (#1064)", "notice_board_pins", "image_url"],
  ])("keeps a file used by %s", async (_label, table, column) => {
    fake.seed(table, [{ id: "r1", [column]: url("shared") }]);
    await deleteUnreferencedByPublicUrl({ urls: [url("shared")] });
    expect(deleteByPublicUrl).not.toHaveBeenCalled();
  });

  it("deletes only the unreferenced URLs out of several, in one call, ignoring nulls and duplicates", async () => {
    fake.seed("locations", [{ id: "l1", map_url: url("kept") }]);
    await deleteUnreferencedByPublicUrl({ urls: [url("kept"), url("gone"), url("gone"), null, undefined] });
    expect(deleteByPublicUrl).toHaveBeenCalledTimes(1);
    expect(deleteByPublicUrl).toHaveBeenCalledWith(url("gone"));
  });

  it("reads and deletes nothing when every URL is null", async () => {
    await deleteUnreferencedByPublicUrl({ urls: [null, undefined] });
    expect(fake.calls).toEqual([]);
    expect(deleteByPublicUrl).not.toHaveBeenCalled();
  });

  it("keeps every file, and throws, when a reference read fails", async () => {
    fake.failNext("monsters", { message: "read failed" });
    await expect(deleteUnreferencedByPublicUrl({ urls: [url("a")] })).rejects.toMatchObject({ message: "read failed" });
    expect(deleteByPublicUrl).not.toHaveBeenCalled();
  });

  it("checks a campaign's worth of files in chunks without losing one at a chunk edge (#918)", async () => {
    const urls = Array.from({ length: 120 }, (_, i) => url(i));
    // The last of one chunk, the first of the next, and the ends: a chunker that skips or repeats an edge loses one of these.
    const held = [0, 49, 50, 99, 100, 119];
    fake.seed("deities", held.map((i) => ({ id: `d${i}`, symbol_image_url: urls[i] })));

    await deleteUnreferencedByPublicUrl({ urls });

    const deleted = deleteByPublicUrl.mock.calls[0];
    expect(deleted).toHaveLength(120 - held.length);
    for (const i of held) expect(deleted).not.toContain(urls[i]);
    const asked = fake.calls.filter((c) => c.kind === "table").flatMap((c) => c.filters.map((f) => f.value as string[]));
    expect(Math.max(...asked.map((values) => values.length))).toBeLessThanOrEqual(50);
  });

  describe("Open Book releases (#1085)", () => {
    it("keeps a file a release still holds, even though no row does", async () => {
      releaseUrls.add(url("published"));
      await deleteUnreferencedByPublicUrl({ urls: [url("published")] });
      expect(deleteByPublicUrl).not.toHaveBeenCalled();
    });

    it("deletes a file no release holds", async () => {
      releaseUrls.add(url("other"));
      await deleteUnreferencedByPublicUrl({ urls: [url("free")] });
      expect(deleteByPublicUrl).toHaveBeenCalledWith(url("free"));
    });

    it("keeps every file, and throws, when the release check errors", async () => {
      fake.failNext("open_book_images_in_use", { message: "rpc failed" });
      await expect(deleteUnreferencedByPublicUrl({ urls: [url("a")] })).rejects.toMatchObject({ message: "rpc failed" });
      expect(deleteByPublicUrl).not.toHaveBeenCalled();
    });
  });
});
