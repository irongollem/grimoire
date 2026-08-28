import { describe, it, expect } from "vitest";
import { PDFDocument } from "pdf-lib";
import { attachBundleToPdf, extractBundleFromPdf, isGrimoireBundle } from "./campaignBundlePdf";
import type { GrimoireBundle } from "@/composables/campaign/useWorldBundle";

const bundle: GrimoireBundle = {
  version: "1",
  file_type: "world_bundle",
  name: "Rime of the Frostmaiden",
  description: "Test export",
  exported_at: "2026-06-22T00:00:00.000Z",
  npcs: [{ id: "n1", name: "Vellynne" }],
  monsters: [{ id: "m1", name: "Frost Druid" }],
  _meta: { entity_counts: { npcs: 1, monsters: 1 }, app_version: "test" },
};

async function blankPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.addPage([300, 400]);
  return doc.save();
}

describe("isGrimoireBundle", () => {
  it("accepts a world bundle and rejects anything else", () => {
    expect(isGrimoireBundle(bundle)).toBe(true);
    expect(isGrimoireBundle({ file_type: "nope", version: "1" })).toBe(false);
    expect(isGrimoireBundle(null)).toBe(false);
    expect(isGrimoireBundle("x")).toBe(false);
  });
});

describe("attach/extract round-trip", () => {
  it("embeds a bundle and reads it back intact", async () => {
    const withData = await attachBundleToPdf(await blankPdf(), bundle);
    const out = await extractBundleFromPdf(withData);
    expect(out).not.toBeNull();
    expect(out!.name).toBe("Rime of the Frostmaiden");
    expect(out!.npcs?.[0]?.name).toBe("Vellynne");
    expect(out!.monsters?.[0]?.id).toBe("m1");
  });

  it("returns null for a PDF with no attachment", async () => {
    expect(await extractBundleFromPdf(await blankPdf())).toBeNull();
  });

  it("returns null for non-PDF bytes", async () => {
    expect(await extractBundleFromPdf(new TextEncoder().encode("not a pdf"))).toBeNull();
  });

  it("preserves the original page (attachment is additive)", async () => {
    const withData = await attachBundleToPdf(await blankPdf(), bundle);
    const reloaded = await PDFDocument.load(withData);
    expect(reloaded.getPageCount()).toBe(1);
  });
});
