import { describe, expect, it } from "vitest";
import { partitionBundleEntries, buildBackgroundEquipmentRows } from "./useCharacterCreationForm";
import type { VaultEntry } from "./useCharacterEquipmentSeeding";

const CARRIER = "member-1";

describe("partitionBundleEntries", () => {
  it("routes plain items to a batched row and resolves their vault item_id", () => {
    const vaultMap = new Map<string, VaultEntry>([
      ["greataxe", { id: "item-axe", bundle_items: null }],
      ["javelin", { id: "item-javelin", bundle_items: null }],
    ]);
    const { plainRows, packEntries } = partitionBundleEntries(
      [{ name: "Greataxe" }, { name: "Javelin", quantity: 4 }],
      vaultMap,
      CARRIER,
    );

    expect(packEntries).toEqual([]);
    expect(plainRows).toEqual([
      {
        item_id: "item-axe", name: "Greataxe", quantity: 1,
        carried_by: CARRIER, location: "backpack",
        slot: null, is_container: false, container_id: null,
        is_attuned: false, is_equipped: false, notes: null,
        current_charges: null, is_identified: true, is_ruined: false, sort_order: 0,
      },
      {
        item_id: "item-javelin", name: "Javelin", quantity: 4,
        carried_by: CARRIER, location: "backpack",
        slot: null, is_container: false, container_id: null,
        is_attuned: false, is_equipped: false, notes: null,
        current_charges: null, is_identified: true, is_ruined: false, sort_order: 0,
      },
    ]);
  });

  it("routes entries with bundle_items to packEntries instead of batching them", () => {
    const vaultMap = new Map<string, VaultEntry>([
      ["explorer's pack", { id: "item-pack", bundle_items: [{ name: "Bedroll", quantity: 1 }] }],
      ["rapier", { id: "item-rapier", bundle_items: null }],
    ]);
    const { plainRows, packEntries } = partitionBundleEntries(
      [{ name: "Rapier" }, { name: "Explorer's Pack" }],
      vaultMap,
      CARRIER,
    );

    expect(packEntries).toEqual([{ name: "Explorer's Pack" }]);
    expect(plainRows).toHaveLength(1);
    expect(plainRows[0].name).toBe("Rapier");
  });

  it("falls back to item_id: null for a name with no vault match, still batched", () => {
    const { plainRows, packEntries } = partitionBundleEntries(
      [{ name: "Homebrew Whatsit" }],
      new Map(),
      CARRIER,
    );
    expect(packEntries).toEqual([]);
    expect(plainRows[0]).toMatchObject({ item_id: null, name: "Homebrew Whatsit", quantity: 1 });
  });

  it("treats an entry whose vault match has an empty bundle_items array as plain", () => {
    const vaultMap = new Map<string, VaultEntry>([
      ["dagger", { id: "item-dagger", bundle_items: [] }],
    ]);
    const { plainRows, packEntries } = partitionBundleEntries([{ name: "Dagger" }], vaultMap, CARRIER);
    expect(packEntries).toEqual([]);
    expect(plainRows[0].item_id).toBe("item-dagger");
  });
});

describe("buildBackgroundEquipmentRows", () => {
  it("splits the background's free-text equipment into one plain row each", () => {
    const rows = buildBackgroundEquipmentRows(
      "a holy symbol, a prayer book, vestments, a set of common clothes, and a belt pouch containing 15 gp",
      CARRIER,
    );
    expect(rows.map((r) => r.name)).toEqual([
      "a holy symbol",
      "a prayer book",
      "vestments",
      "a set of common clothes",
      "a belt pouch containing 15 gp",
    ]);
    for (const row of rows) {
      expect(row.item_id).toBeNull();
      expect(row.quantity).toBe(1);
      expect(row.carried_by).toBe(CARRIER);
      expect(row.location).toBe("backpack");
      expect(row.is_container).toBe(false);
    }
  });

  it("returns no rows for empty equipment text", () => {
    expect(buildBackgroundEquipmentRows("", CARRIER)).toEqual([]);
    expect(buildBackgroundEquipmentRows("   ", CARRIER)).toEqual([]);
  });
});
