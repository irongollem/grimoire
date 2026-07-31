import { describe, it, expect } from "vitest";
import { mergeLibraryWithCustom, type Shadowable } from "@/lib/libraryShadow";

function row(name: string, extra: Partial<Shadowable> = {}): Shadowable {
  return { name, source: null, source_document_key: null, source_record_key: null, ...extra };
}

describe("mergeLibraryWithCustom", () => {
  it("shadows a shared row when a custom row shares its source identity", () => {
    const srd = [row("Longsword", { source: "srd-2014", source_document_key: "srd-2014", source_record_key: "srd-2014_longsword" })];
    const custom = [row("Longsword (mine)", { source: "srd-2014", source_document_key: "srd-2014", source_record_key: "srd-2014_longsword" })];
    const merged = mergeLibraryWithCustom(srd, custom);
    expect(merged).toHaveLength(1);
    expect(merged[0].name).toBe("Longsword (mine)");
  });

  it("shadows by lowercase name for legacy rows with null identity keys", () => {
    const srd = [row("Longsword", { source: "srd-2014", source_document_key: "srd-2014", source_record_key: "srd-2014_longsword" })];
    // legacy import: source set, identity keys null (pre-20260720000018)
    const custom = [row("longsword", { source: "SRD" })];
    const merged = mergeLibraryWithCustom(srd, custom);
    expect(merged).toHaveLength(1);
    expect(merged[0].name).toBe("longsword");
  });

  it("never shadows a shared row with a homebrew row of the same name", () => {
    const srd = [row("Longsword", { source: "srd-2014", source_document_key: "srd-2014", source_record_key: "srd-2014_longsword" })];
    const custom = [row("Longsword")]; // homebrew: source null
    const merged = mergeLibraryWithCustom(srd, custom);
    expect(merged).toHaveLength(2);
  });

  it("keeps every shared row when there is no matching custom row, sorted by name", () => {
    const srd = [row("Warhammer", { source: "srd-2024", source_document_key: "srd-2024", source_record_key: "srd-2024_warhammer" }), row("Club", { source: "srd-2024", source_document_key: "srd-2024", source_record_key: "srd-2024_club" })];
    const merged = mergeLibraryWithCustom(srd, []);
    expect(merged.map((r) => r.name)).toEqual(["Club", "Warhammer"]);
  });

  it("merges and sorts custom + shared together", () => {
    const srd = [row("Dagger", { source: "srd-2014", source_document_key: "srd-2014", source_record_key: "srd-2014_dagger" })];
    const custom = [row("Amulet")]; // homebrew
    const merged = mergeLibraryWithCustom(srd, custom);
    expect(merged.map((r) => r.name)).toEqual(["Amulet", "Dagger"]);
  });
});
