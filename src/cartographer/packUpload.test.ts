import { afterEach, describe, expect, it, vi } from "vitest";
import { strToU8, zipSync } from "fflate";
import { createDraftManifest, enumerateSchemaSlots, slotRelativePath, upsertManifestSlot } from "./authoringPlan";
import { preparePackUpload } from "./packUpload";

const webp = new Uint8Array([82, 73, 70, 70, 4, 0, 0, 0, 87, 69, 66, 80]);

function completeManifest() {
  const manifest = createDraftManifest({ packId: "moon-vault", name: "Moon Vault", description: "Test pack", packVersion: 1 });
  for (const slot of enumerateSchemaSlots(false)) upsertManifestSlot(manifest, slot, webp.byteLength);
  return manifest;
}

function zipFor(manifest = completeManifest()): File {
  const entries: Record<string, Uint8Array> = {
    "moon-vault/manifest.json": strToU8(JSON.stringify(manifest)),
  };
  for (const slots of Object.values(manifest.assets)) {
    for (const slot of slots ?? []) entries[`moon-vault/${slot.url}`] = webp;
  }
  const zipped = zipSync(entries);
  return new File([zipped.buffer as ArrayBuffer], "moon-vault.zip", { type: "application/zip" });
}

afterEach(() => vi.unstubAllGlobals());

describe("preparePackUpload", () => {
  it("accepts a zipped, schema-complete 128px WebP pack", async () => {
    vi.stubGlobal("createImageBitmap", async () => ({ width: 128, height: 128, close: () => undefined }));

    const prepared = await preparePackUpload([zipFor()]);

    expect(prepared.manifest.pack_id).toBe("moon-vault");
    expect(prepared.assets.size).toBe(20);
    expect([...prepared.assets.keys()]).toContain(slotRelativePath({ category: "doorOpenH", variant: 0 }));
  });

  it("rejects an incomplete pack with the exact missing slot list", async () => {
    const manifest = completeManifest();
    manifest.assets.doorOpenH = [];

    await expect(preparePackUpload([zipFor(manifest)])).rejects.toThrow("doorOpenH/0");
  });
});
