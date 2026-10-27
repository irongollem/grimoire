import { afterEach, describe, expect, it, vi } from "vitest";
import { describeValidation, getLoadedPack, isPackLoaded, loadPack, standInVariant } from "./packLoader";
import { BASE_TILE_SIZE, TILE_PACK_SCHEMA, type AssetSlot, type PackCategory, type TilePackManifest } from "./packSchema";

const placeholders = vi.hoisted(() => ({ tile: vi.fn(() => ({ placeholder: true })) }));
vi.mock("./placeholderTile", () => ({
  getPlaceholderTile: placeholders.tile,
  getStalePackTile: () => ({ stale: true }),
}));

describe("standInVariant", () => {
  it("borrows a drawn sibling for a variant with no art", () => {
    const drawn = [0, 1, 2, 3, 4, 5, 6, 7];
    expect(standInVariant(drawn, 8)).toBe(0);
    expect(standInVariant(drawn, 9)).toBe(1);
  });

  it("is the same answer however the drawn list arrives", () => {
    expect(standInVariant([3, 0, 5], 4)).toBe(standInVariant([0, 3, 5], 4));
  });

  it("works when the drawn variants are not contiguous", () => {
    expect(standInVariant([2, 5], 0)).toBe(2);
    expect(standInVariant([2, 5], 1)).toBe(5);
  });

  it("has nothing to offer a group with no drawn art", () => {
    expect(standInVariant([], 3)).toBeNull();
  });
});

describe("standInVariant with a negative variant", () => {
  it("still lands on a drawn variant", () => {
    expect(standInVariant([0, 1, 2], -4)).toBe(1);
  });
});

describe("loadPack", () => {
  const MANIFEST_URL = "https://cdn.test/packs/p/manifest.json";
  let seq = 0;

  // A pack id per test: the loader keeps one runtime per pack id and version for the whole session.
  function manifestOf(assets: Partial<Record<PackCategory, AssetSlot[]>>): TilePackManifest {
    seq += 1;
    return {
      pack_id: `pack-${seq}`,
      name: "P",
      description: "",
      pack_version: 1,
      schema_version: TILE_PACK_SCHEMA.version,
      base_tile_size: BASE_TILE_SIZE,
      assets,
    };
  }

  /** `failing` urls never load; everything else does. Returns the urls the pack asked for. */
  function stubNetwork(manifest: TilePackManifest, failing: string[] = [], status = 200): string[] {
    const asked: string[] = [];
    class FakeImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      crossOrigin = "";
      private url = "";
      set src(value: string) {
        this.url = value;
        asked.push(value);
        queueMicrotask(() => (failing.includes(value) ? this.onerror?.() : this.onload?.()));
      }
      get src(): string {
        return this.url;
      }
    }
    vi.stubGlobal("Image", FakeImage);
    vi.stubGlobal("window", { location: { href: "https://app.test/cartographer" } });
    vi.stubGlobal("fetch", async () => ({ ok: status === 200, status, json: async () => manifest }));
    return asked;
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    placeholders.tile.mockClear();
  });

  it("refuses a manifest that cannot be fetched", async () => {
    stubNetwork(manifestOf({}), [], 404);
    await expect(loadPack(MANIFEST_URL)).rejects.toThrow("404");
  });

  it("resolves each slot url against the manifest's own address", async () => {
    const manifest = manifestOf({ floor: [{ variant: 0, url: "floor/0.webp" }] });
    const asked = stubNetwork(manifest);
    await loadPack(MANIFEST_URL);
    expect(asked).toEqual(["https://cdn.test/packs/p/floor/0.webp"]);
  });

  it("trusts a pack's urls to last unless told they are signed", async () => {
    stubNetwork(manifestOf({}));
    expect((await loadPack(MANIFEST_URL)).lastingUrls).toBe(true);
    stubNetwork(manifestOf({}));
    expect((await loadPack(MANIFEST_URL, { lastingUrls: false })).lastingUrls).toBe(false);
  });

  it("serves a drawn tile as art, borrows a drawn sibling for a variant with none, and falls back to a placeholder", async () => {
    const manifest = manifestOf({
      floor: [{ variant: 0, url: "floor/0.webp" }, { variant: 1, url: "floor/1.webp" }, { variant: 2, url: "floor/2.webp" }],
      doorwayH: [{ variant: 0, url: "doorwayH/0.webp" }],
    });
    stubNetwork(manifest, ["https://cdn.test/packs/p/floor/2.webp", "https://cdn.test/packs/p/doorwayH/0.webp"]);
    const rt = await loadPack(MANIFEST_URL);

    const own = rt.getTile("floor", 1);
    expect(own.isPlaceholder).toBe(false);
    // variant 2 failed to load and 5 was never declared: both borrow from the two drawn floors, the same way every time
    const failed = rt.getTile("floor", 2);
    const undeclared = rt.getTile("floor", 5);
    expect(failed.isPlaceholder).toBe(false);
    expect(undeclared.isPlaceholder).toBe(false);
    expect(rt.getTile("floor", 2).source).toBe(failed.source);
    expect([own.source, rt.getTile("floor", 0).source]).toContain(failed.source);
    // nothing drawn in the group at all
    expect(rt.getTile("doorwayH", 0).isPlaceholder).toBe(true);
    expect(rt.getTile("solidBlock", 0).isPlaceholder).toBe(true);
    expect(placeholders.tile).toHaveBeenCalledWith(expect.objectContaining({ category: "doorwayH", variant: 0 }), manifest.palette);
  });

  it("keeps the sides of a directional category apart", async () => {
    const manifest = manifestOf({ stairsUp: [{ side: "N", variant: 0, url: "s/n.webp" }, { side: "E", variant: 0, url: "s/e.webp" }] });
    stubNetwork(manifest, ["https://cdn.test/packs/p/s/e.webp"]);
    const rt = await loadPack(MANIFEST_URL);
    expect(rt.getTile("stairsUp", 0, "N").isPlaceholder).toBe(false);
    // the east stair did not load; the north one must not stand in for it
    expect(rt.getTile("stairsUp", 0, "E").isPlaceholder).toBe(true);
  });

  it("counts the variants of a side, or of the whole category", async () => {
    const manifest = manifestOf({
      stairsUp: [{ side: "N", variant: 0, url: "a.webp" }, { side: "N", variant: 1, url: "b.webp" }, { side: "E", variant: 0, url: "c.webp" }],
    });
    stubNetwork(manifest);
    const rt = await loadPack(MANIFEST_URL);
    expect(rt.variantCount("stairsUp", "N")).toBe(2);
    expect(rt.variantCount("stairsUp", "E")).toBe(1);
    expect(rt.variantCount("stairsUp")).toBe(3);
    expect(rt.variantCount("floor")).toBe(0);
  });

  it("loads a pack and version once and serves it from memory after", async () => {
    const manifest = manifestOf({});
    stubNetwork(manifest);
    expect(isPackLoaded(manifest.pack_id, 1)).toBe(false);
    const first = await loadPack(MANIFEST_URL);
    expect(isPackLoaded(manifest.pack_id, 1)).toBe(true);
    expect(isPackLoaded(manifest.pack_id, 2)).toBe(false);
    expect(await loadPack(MANIFEST_URL)).toBe(first);
    expect(getLoadedPack(manifest.pack_id, 1)).toBe(first);
  });
});

describe("describeValidation", () => {
  it("says nothing about a clean pack", () => {
    expect(describeValidation({ valid: true, missing: [], extras: [], warnings: [] })).toBe("");
  });

  it("lists what is missing, then warnings, then unknown categories", () => {
    const text = describeValidation({
      valid: false,
      missing: [{ category: "floor", variant: 0, reason: "r" }],
      warnings: ["too many"],
      extras: ["moat"],
    });
    expect(text).toContain("1 required slot(s) missing");
    expect(text).toContain("floor/0");
    expect(text).toContain("too many");
    expect(text).toContain("moat");
  });
});
