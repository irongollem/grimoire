import { afterEach, describe, expect, it, vi } from "vitest";
import { strToU8, zipSync } from "fflate";
import { createDraftManifest, enumerateSchemaSlots, slotRelativePath, upsertManifestSlot } from "./authoringPlan";
import { preparePackUpload } from "./packUpload";
import { TILE_PACK_SCHEMA } from "./packSchema";

const webp = new Uint8Array([82, 73, 70, 70, 4, 0, 0, 0, 87, 69, 66, 80]);

function completeManifest() {
  const manifest = createDraftManifest({ packId: "moon-vault", name: "Moon Vault", description: "Test pack", packVersion: 1 });
  for (const slot of enumerateSchemaSlots(false)) upsertManifestSlot(manifest, slot, webp.byteLength);
  return manifest;
}

function zipFiles(entries: Record<string, Uint8Array>): File {
  const zipped = zipSync(entries);
  return new File([zipped.buffer as ArrayBuffer], "moon-vault.zip", { type: "application/zip" });
}

function zipFor(manifest = completeManifest(), asset: Uint8Array = webp): File {
  const entries: Record<string, Uint8Array> = {
    "moon-vault/manifest.json": strToU8(JSON.stringify(manifest)),
  };
  for (const slots of Object.values(manifest.assets)) {
    for (const slot of slots ?? []) entries[`moon-vault/${slot.url}`] = asset;
  }
  return zipFiles(entries);
}

const tile = (width: number, height: number) => async () => ({ width, height, close: () => undefined });

afterEach(() => vi.unstubAllGlobals());

describe("preparePackUpload", () => {
  it("accepts a zipped, schema-complete 128px WebP pack", async () => {
    vi.stubGlobal("createImageBitmap", async () => ({ width: 128, height: 128, close: () => undefined }));

    const prepared = await preparePackUpload([zipFor()]);

    expect(prepared.manifest.pack_id).toBe("moon-vault");
    expect(prepared.assets.size).toBe(enumerateSchemaSlots(false).length);
    expect([...prepared.assets.keys()]).toContain(slotRelativePath({ category: "doorLeaf", variant: 0 }));
  });

  it("rejects an incomplete pack with the exact missing slot list", async () => {
    const manifest = completeManifest();
    manifest.assets.doorLeaf = [];

    await expect(preparePackUpload([zipFor(manifest)])).rejects.toThrow("doorLeaf/0");
  });

  describe("refuses a pack the app cannot draw", () => {
    it("rejects a manifest that is not JSON, and a zip without one", async () => {
      await expect(preparePackUpload([zipFiles({ "moon-vault/manifest.json": strToU8("{nope") })])).rejects.toThrow("not valid JSON");
      await expect(preparePackUpload([zipFiles({ "moon-vault/readme.txt": strToU8("hi") })])).rejects.toThrow("manifest.json");
      await expect(preparePackUpload([])).rejects.toThrow("Choose a pack");
    });

    it.each(["Moon_Vault", "moon--vault", "-moon", ""])("rejects pack id %j, which is not lowercase kebab-case", async (packId) => {
      const manifest = { ...completeManifest(), pack_id: packId };
      await expect(preparePackUpload([zipFor(manifest)])).rejects.toThrow("kebab-case");
    });

    it("rejects another schema version and another base tile size", async () => {
      const oldSchema = { ...completeManifest(), schema_version: TILE_PACK_SCHEMA.version - 1 };
      await expect(preparePackUpload([zipFor(oldSchema)])).rejects.toThrow(`requires v${TILE_PACK_SCHEMA.version}`);
      const bigTile = Object.assign(completeManifest(), { base_tile_size: 256 });
      await expect(preparePackUpload([zipFor(bigTile)])).rejects.toThrow("base_tile_size");
    });

    it("rejects a slot that points at a non-WebP file", async () => {
      const manifest = completeManifest();
      manifest.assets.floor![0]!.url = "floor/0.png";
      await expect(preparePackUpload([zipFor(manifest)])).rejects.toThrow(".webp");
    });

    it("rejects a slot whose file is missing from the zip", async () => {
      vi.stubGlobal("createImageBitmap", tile(128, 128));
      const manifest = completeManifest();
      const entries: Record<string, Uint8Array> = { "moon-vault/manifest.json": strToU8(JSON.stringify(manifest)) };
      for (const slots of Object.values(manifest.assets)) for (const slot of slots ?? []) entries[`moon-vault/${slot.url}`] = webp;
      delete entries["moon-vault/floor/3.webp"];
      await expect(preparePackUpload([zipFiles(entries)])).rejects.toThrow("floor/3: file not found");
    });

    it.each([
      ["a path that climbs out of the pack", "moon-vault/../escape.webp"],
      ["an absolute path", "/etc/escape.webp"],
    ])("rejects %s inside the zip", async (_name, path) => {
      const manifest = completeManifest();
      const entries: Record<string, Uint8Array> = { "moon-vault/manifest.json": strToU8(JSON.stringify(manifest)), [path]: webp };
      await expect(preparePackUpload([zipFiles(entries)])).rejects.toThrow("Unsafe pack path");
    });
  });

  describe("checks every tile's bytes", () => {
    it("rejects bytes that are not WebP, including a RIFF file of another type", async () => {
      vi.stubGlobal("createImageBitmap", tile(128, 128));
      const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);
      await expect(preparePackUpload([zipFor(completeManifest(), png)])).rejects.toThrow("not WebP");
      const wave = new Uint8Array([82, 73, 70, 70, 4, 0, 0, 0, 87, 65, 86, 69]);
      await expect(preparePackUpload([zipFor(completeManifest(), wave)])).rejects.toThrow("not WebP");
    });

    it.each([[128, 64], [64, 128]])("rejects a %i by %i tile", async (w, h) => {
      vi.stubGlobal("createImageBitmap", tile(w, h));
      await expect(preparePackUpload([zipFor()])).rejects.toThrow(`expected 128×128, got ${w}×${h}`);
    });
  });

  describe("normalises what it keeps", () => {
    it("prefers the shallowest manifest in a zip that holds two", async () => {
      vi.stubGlobal("createImageBitmap", tile(128, 128));
      const manifest = completeManifest();
      const entries: Record<string, Uint8Array> = {
        "moon-vault/manifest.json": strToU8(JSON.stringify(manifest)),
        "moon-vault/old/manifest.json": strToU8(JSON.stringify({ ...manifest, pack_id: "stale-copy" })),
      };
      for (const slots of Object.values(manifest.assets)) for (const slot of slots ?? []) entries[`moon-vault/${slot.url}`] = webp;
      expect((await preparePackUpload([zipFiles(entries)])).manifest.pack_id).toBe("moon-vault");
    });

    it("rewrites each slot to its canonical path and the real file size, telling sides apart", async () => {
      vi.stubGlobal("createImageBitmap", tile(128, 128));
      const manifest = completeManifest();
      manifest.assets.floor![0]!.url = "art/first-floor.webp";
      upsertManifestSlot(manifest, { category: "stairsUp", side: "N", variant: 0 }, 12);
      upsertManifestSlot(manifest, { category: "stairsUp", side: "E", variant: 0 }, 12);
      manifest.assets.stairsUp!.find((s) => s.side === "E")!.url = "art/stairs-east.webp";
      const big = new Uint8Array([...webp, ...Array.from({ length: 30 }, () => 0)]);

      const prepared = await preparePackUpload([zipFor(manifest, big)]);

      const urlOf = (side: string): string | undefined => prepared.manifest.assets.stairsUp!.find((s) => s.side === side)?.url;
      expect(prepared.manifest.assets.floor![0]!.url).toBe(slotRelativePath({ category: "floor", variant: 0 }));
      expect(urlOf("N")).toBe(slotRelativePath({ category: "stairsUp", side: "N", variant: 0 }));
      expect(urlOf("E")).toBe(slotRelativePath({ category: "stairsUp", side: "E", variant: 0 }));
      expect(prepared.manifest.assets.floor![0]!.byteSize).toBe(big.byteLength);
      expect(prepared.assets.get("stairsUp/E/0.webp")?.size).toBe(big.byteLength);
    });
  });
});
