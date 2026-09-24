import { describe, it, expect } from "vitest";
import { inventoryItemWeight, inventoryItemWeightPerUnit } from "./inventoryWeight";

const VAULT = "dddebe6d-10ca-4404-9df2-a6e447a6c9aa";
const LIBRARY = "srd_grimoire_bundled_forgery_kit";

describe("inventoryItemWeightPerUnit", () => {
  it("resolves weight through the vault reference", () => {
    const map = new Map([[VAULT, 3]]);
    expect(inventoryItemWeightPerUnit({ item_id: VAULT, library_item_id: null }, map)).toBe(3);
  });

  it("resolves weight through the library reference — the bug this guards against", () => {
    // A library-sourced row has item_id === null; looking that up against a
    // map keyed by library id (as the old `inv.item_id` lookup did) silently
    // returned 0 and dropped it from carry weight.
    const map = new Map([[LIBRARY, 5]]);
    expect(inventoryItemWeightPerUnit({ item_id: null, library_item_id: LIBRARY }, map)).toBe(5);
  });

  it("returns 0 for free-text loot with no catalogue entry", () => {
    const map = new Map([[VAULT, 3]]);
    expect(inventoryItemWeightPerUnit({ item_id: null, library_item_id: null }, map)).toBe(0);
  });

  it("returns 0 when the referenced id isn't in the map yet", () => {
    expect(inventoryItemWeightPerUnit({ item_id: VAULT, library_item_id: null }, new Map())).toBe(0);
  });
});

describe("inventoryItemWeight", () => {
  it("multiplies per-unit weight by quantity for a vault item", () => {
    const map = new Map([[VAULT, 2]]);
    expect(inventoryItemWeight({ item_id: VAULT, library_item_id: null, quantity: 4 }, map)).toBe(8);
  });

  it("multiplies per-unit weight by quantity for a library item", () => {
    const map = new Map([[LIBRARY, 1.5]]);
    expect(inventoryItemWeight({ item_id: null, library_item_id: LIBRARY, quantity: 3 }, map)).toBe(4.5);
  });
});
