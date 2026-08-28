import { describe, it, expect } from "vitest";
import type { Location, LocationType } from "@/types/location.types";
import type { StoreStockRow } from "@/composables/items/useStoreItems";
import { buildStoreRestockRows, storeLocations } from "./storeRestock";

function place(id: string, name: string, type: LocationType): Location {
  return { id, name, location_type: type } as Location;
}

const SHOP = place("l-shop", "Blackiron Blades", "store");
const TAVERN = place("l-tavern", "The Northlook", "tavern");
const TOWN = place("l-town", "Bryn Shander", "town");

const stocked = (locationId: string, visible: boolean): StoreStockRow => ({
  location_id: locationId,
  visible,
});

describe("storeLocations", () => {
  // Driven by STORE_LOCATION_TYPES rather than a local list, so a new
  // stock-holding location type is picked up without touching this module.
  it("keeps only location types that can hold stock", () => {
    expect(storeLocations([SHOP, TAVERN, TOWN]).map((l) => l.id)).toEqual([
      "l-shop",
      "l-tavern",
    ]);
  });
});

describe("buildStoreRestockRows", () => {
  it("says nothing when the campaign has no shops", () => {
    expect(buildStoreRestockRows([TOWN], [])).toEqual([]);
  });

  it("flags a shop with no stock at all", () => {
    expect(buildStoreRestockRows([SHOP], [])).toEqual([
      { locationId: "l-shop", name: "Blackiron Blades", reason: "empty", stockCount: 0 },
    ]);
  });

  // The interesting one: from the players' side this is indistinguishable
  // from an empty shop, and the DM thinks it is finished.
  it("flags a shop whose every row is hidden", () => {
    const stock = [stocked("l-shop", false), stocked("l-shop", false)];
    expect(buildStoreRestockRows([SHOP], stock)).toEqual([
      { locationId: "l-shop", name: "Blackiron Blades", reason: "hidden", stockCount: 2 },
    ]);
  });

  it("leaves a shop alone once one row is visible", () => {
    const stock = [stocked("l-shop", false), stocked("l-shop", true)];
    expect(buildStoreRestockRows([SHOP], stock)).toEqual([]);
  });

  it("ignores stock rows belonging to a location that is not a shop", () => {
    expect(buildStoreRestockRows([SHOP, TOWN], [stocked("l-town", true)])).toEqual([
      { locationId: "l-shop", name: "Blackiron Blades", reason: "empty", stockCount: 0 },
    ]);
  });

  // Empty is the bigger gap — nothing to sell at all — and a hidden shop is
  // one click from being fixed.
  it("orders empty before hidden, then by name", () => {
    const zed = place("l-z", "Zephyr Supplies", "store");
    const abe = place("l-a", "Abe's Alchemy", "store");
    const rows = buildStoreRestockRows(
      [zed, abe, SHOP, TAVERN],
      [stocked("l-shop", false), stocked("l-tavern", false)],
    );
    expect(rows.map((r) => `${r.reason}:${r.name}`)).toEqual([
      "empty:Abe's Alchemy",
      "empty:Zephyr Supplies",
      "hidden:Blackiron Blades",
      "hidden:The Northlook",
    ]);
  });
});
