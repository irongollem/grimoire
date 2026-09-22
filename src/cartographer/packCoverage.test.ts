import { describe, expect, it } from "vitest";
import { coverageCounts, hasCompleteArt, packCoverage, undrawnSlotIds } from "./packCoverage";
import { enumerateSchemaSlots, slotId } from "./authoringPlan";
import type { AssetSlot, PackCategory, TilePackManifest } from "./packSchema";

/** A manifest declaring the given slots, each drawn or not. */
function manifestWith(declared: { category: PackCategory; side?: string; variant: number; byteSize?: number }[]): TilePackManifest {
  const assets: Partial<Record<PackCategory, AssetSlot[]>> = {};
  for (const entry of declared) {
    const slots = assets[entry.category] ?? (assets[entry.category] = []);
    slots.push({
      ...(entry.side ? { side: entry.side } : {}),
      variant: entry.variant,
      url: entry.side ? `${entry.category}/${entry.side}/${entry.variant}.webp` : `${entry.category}/${entry.variant}.webp`,
      ...(entry.byteSize === undefined ? {} : { byteSize: entry.byteSize }),
    });
  }
  return {
    pack_id: "test-pack",
    name: "Test Pack",
    description: "",
    pack_version: 1,
    schema_version: 1,
    base_tile_size: 128,
    assets,
  };
}

/** Every required slot, declared and drawn — the shape of a publishable pack. */
function completeManifest(): TilePackManifest {
  return manifestWith(
    enumerateSchemaSlots(false).map((slot) => ({
      category: slot.category,
      ...(slot.side ? { side: slot.side } : {}),
      variant: slot.variant,
      byteSize: 4096,
    })),
  );
}

describe("packCoverage", () => {
  it("lists every required slot even when the manifest declares nothing", () => {
    const coverage = packCoverage(manifestWith([]));
    const required = enumerateSchemaSlots(false).map(slotId);

    expect(coverage).toHaveLength(required.length);
    expect(coverage.every((entry) => entry.required)).toBe(true);
    expect(coverage.every((entry) => !entry.declared && !entry.drawn)).toBe(true);
    expect(new Set(coverage.map((entry) => entry.id))).toEqual(new Set(required));
  });

  it("is the union of required slots and declared ones, not the whole v3 schema", () => {
    // `objectChest` is optional: it appears only because this manifest claims
    // it. The ~200 other optional slots the schema permits stay out — that is
    // the difference between "fill this pack's gaps" and "drag it to v3".
    const coverage = packCoverage(manifestWith([{ category: "objectChest", variant: 0, byteSize: 512 }]));
    const ids = coverage.map((entry) => entry.id);

    expect(ids).toContain("objectChest:0");
    expect(ids).not.toContain("objectBarrel:0");
    expect(ids).not.toContain("hazardPit:0");
    expect(coverage).toHaveLength(enumerateSchemaSlots(false).length + 1);
    expect(coverage.length).toBeLessThan(enumerateSchemaSlots(true).length);
  });

  it("separates declared from drawn — the distinction validatePack cannot make", () => {
    // Exactly the shape of the ten packs #889 S7 migrated: a full slot list,
    // no bytes behind any of it.
    const declaredButEmpty = manifestWith(
      enumerateSchemaSlots(false).map((slot) => ({
        category: slot.category,
        ...(slot.side ? { side: slot.side } : {}),
        variant: slot.variant,
      })),
    );
    const coverage = packCoverage(declaredButEmpty);

    expect(coverage.every((entry) => entry.declared)).toBe(true);
    expect(coverage.every((entry) => !entry.drawn)).toBe(true);
    expect(coverageCounts(declaredButEmpty).drawn).toBe(0);
  });

  it("carries each drawn slot's rev, so a reader can cache-key on the bytes stored", () => {
    const manifest = manifestWith([{ category: "floor", variant: 0, byteSize: 900 }]);
    manifest.assets.floor![0]!.rev = 1758529974000;
    const coverage = packCoverage(manifest);

    expect(coverage.find((entry) => entry.id === "floor:0")?.rev).toBe(1758529974000);
    // A tile written before the field existed, and an undrawn slot, both leave
    // it absent rather than inventing a stamp — `libraryTileUrl` falls back to
    // the pack version for exactly those.
    expect(coverage.find((entry) => entry.id === "solidBlock:0")?.rev).toBeUndefined();
  });

  it("treats a zero byteSize as undrawn", () => {
    const coverage = packCoverage(manifestWith([{ category: "floor", variant: 0, byteSize: 0 }]));
    expect(coverage.find((entry) => entry.id === "floor:0")?.drawn).toBe(false);
  });

  it("carries the relative path a slot's bytes live at", () => {
    const coverage = packCoverage(manifestWith([{ category: "wallJoint", side: "L_NE", variant: 0, byteSize: 128 }]));
    const joint = coverage.find((entry) => entry.id === "wallJoint:L_NE:0");

    expect(joint?.relativePath).toBe("wallJoint/L_NE/0.webp");
    expect(coverage.find((entry) => entry.id === "floor:0")?.relativePath).toBe("floor/0.webp");
  });

  it("skips categories this build's schema does not define", () => {
    const manifest = manifestWith([{ category: "floor", variant: 0, byteSize: 64 }]);
    (manifest.assets as Record<string, AssetSlot[]>).somethingFromV9 = [{ variant: 0, url: "x/0.webp", byteSize: 1 }];

    expect(packCoverage(manifest).some((entry) => entry.slot.category === ("somethingFromV9" as PackCategory))).toBe(false);
  });

  it("orders slots by schema category, then side, then variant", () => {
    const coverage = packCoverage(manifestWith([]));
    const categories = coverage.map((entry) => entry.slot.category);

    // floor is the schema's first category and solidBlock a later one.
    expect(categories.indexOf("floor")).toBeLessThan(categories.indexOf("solidBlock"));
    const floors = coverage.filter((entry) => entry.slot.category === "floor").map((entry) => entry.slot.variant);
    expect(floors).toEqual([...floors].sort((a, b) => a - b));
  });
});

describe("coverageCounts", () => {
  it("counts the required floor at the schema's 20-tile minimum", () => {
    expect(coverageCounts(manifestWith([])).required).toBe(20);
  });

  it("counts surplus declared slots as drawn without counting them as required", () => {
    const manifest = completeManifest();
    manifest.assets.floor?.push({ variant: 8, url: "floor/8.webp", byteSize: 2048 });
    const counts = coverageCounts(manifest);

    expect(counts.required).toBe(20);
    expect(counts.requiredDrawn).toBe(20);
    expect(counts.drawn).toBe(21);
    expect(counts.declared).toBe(21);
  });
});

describe("undrawnSlotIds", () => {
  it("returns every undrawn slot, declared or not", () => {
    const manifest = manifestWith([
      { category: "floor", variant: 0, byteSize: 900 },
      { category: "floor", variant: 1 },
    ]);
    const undrawn = undrawnSlotIds(manifest);

    expect(undrawn).not.toContain("floor:0");
    expect(undrawn).toContain("floor:1");
    expect(undrawn).toContain("solidBlock:0");
  });

  it("narrows to the required floor when asked — the cost lever from #891", () => {
    const manifest = manifestWith([{ category: "objectChest", variant: 0 }]);

    expect(undrawnSlotIds(manifest)).toContain("objectChest:0");
    expect(undrawnSlotIds(manifest, { requiredOnly: true })).not.toContain("objectChest:0");
    expect(undrawnSlotIds(manifest, { requiredOnly: true })).toHaveLength(20);
  });

  it("returns ids createGenerationPlan accepts", () => {
    // `createGenerationPlan` throws on an id it cannot map back to a schema
    // slot, so this is the contract between the two.
    const known = new Set(enumerateSchemaSlots(true).map(slotId));
    for (const id of undrawnSlotIds(manifestWith([]))) expect(known.has(id)).toBe(true);
  });

  it("is empty for a pack with every required slot drawn", () => {
    expect(undrawnSlotIds(completeManifest())).toEqual([]);
  });
});

describe("hasCompleteArt", () => {
  it("refuses a pack that declares its slots but has no bytes", () => {
    const declaredButEmpty = manifestWith(
      enumerateSchemaSlots(false).map((slot) => ({
        category: slot.category,
        ...(slot.side ? { side: slot.side } : {}),
        variant: slot.variant,
      })),
    );
    expect(hasCompleteArt(declaredButEmpty)).toBe(false);
  });

  it("accepts a pack whose required slots are all drawn", () => {
    expect(hasCompleteArt(completeManifest())).toBe(true);
  });

  it("does not require optional slots a pack merely declares", () => {
    const manifest = completeManifest();
    manifest.assets.hazardPit = [{ variant: 0, url: "hazardPit/0.webp" }];
    expect(hasCompleteArt(manifest)).toBe(true);
  });

  it("refuses when a single required slot is undrawn", () => {
    const manifest = completeManifest();
    delete manifest.assets.solidBlock?.[0].byteSize;
    expect(hasCompleteArt(manifest)).toBe(false);
  });
});
