import { describe, it, expect } from "vitest";
import { inventoryItemRef, itemRefColumns, sameItemRef } from "./itemRef";

const VAULT = "dddebe6d-10ca-4404-9df2-a6e447a6c9aa";
const LIBRARY = "srd_grimoire_bundled_forgery_kit";

describe("inventoryItemRef", () => {
  it("returns the vault id when the row references the owner's own item", () => {
    expect(inventoryItemRef({ item_id: VAULT, library_item_id: null })).toBe(VAULT);
  });

  it("returns the library id when the row references shared content", () => {
    expect(inventoryItemRef({ item_id: null, library_item_id: LIBRARY })).toBe(LIBRARY);
  });

  it("returns null for free-text loot with no catalogue entry", () => {
    // Both-null is legal and common — the caller must handle absence rather
    // than being handed a placeholder id that resolves to nothing.
    expect(inventoryItemRef({ item_id: null, library_item_id: null })).toBeNull();
  });
});

describe("itemRefColumns", () => {
  it("routes a uuid to item_id", () => {
    expect(itemRefColumns(VAULT)).toEqual({ item_id: VAULT, library_item_id: null });
  });

  it("routes a library text id to library_item_id", () => {
    // The whole point: this value in item_id is the 22P02 that started #815.
    expect(itemRefColumns(LIBRARY)).toEqual({ item_id: null, library_item_id: LIBRARY });
  });

  it("yields both null for no selection", () => {
    expect(itemRefColumns(null)).toEqual({ item_id: null, library_item_id: null });
    expect(itemRefColumns(undefined)).toEqual({ item_id: null, library_item_id: null });
    expect(itemRefColumns("")).toEqual({ item_id: null, library_item_id: null });
  });

  it("never sets both columns, so the check constraint cannot be violated", () => {
    for (const id of [VAULT, LIBRARY, "", null]) {
      const cols = itemRefColumns(id);
      expect(Number(cols.item_id !== null) + Number(cols.library_item_id !== null)).toBeLessThanOrEqual(1);
    }
  });
});

describe("sameItemRef", () => {
  it("matches two rows referencing the same vault item", () => {
    expect(sameItemRef({ item_id: VAULT, library_item_id: null }, { item_id: VAULT, library_item_id: null })).toBe(true);
  });

  it("matches two rows referencing the same library item", () => {
    expect(sameItemRef({ item_id: null, library_item_id: LIBRARY }, { item_id: null, library_item_id: LIBRARY })).toBe(true);
  });

  it("does not match across the two id spaces", () => {
    expect(sameItemRef({ item_id: VAULT, library_item_id: null }, { item_id: null, library_item_id: LIBRARY })).toBe(false);
  });

  it("never matches two free-text rows", () => {
    // Two unlinked rows both named "a bloodied ledger" are not the same item;
    // treating null as equal would silently stack unrelated loot.
    expect(sameItemRef({ item_id: null, library_item_id: null }, { item_id: null, library_item_id: null })).toBe(false);
  });
});
