import { describe, it, expect } from "vitest";
import { validateEntries, type LootEntry } from "./lootTable.types";

function entry(overrides: Partial<LootEntry> = {}): LootEntry {
  return { id: "e1", drop_chance: 100, ...overrides };
}

describe("validateEntries — quantity guards (#487)", () => {
  it("accepts a valid dice quantity", () => {
    expect(validateEntries([entry({ type: "item", item_id: "i1", dice: "2d6+1" })])).toBeNull();
  });

  it("accepts a positive fixed quantity", () => {
    expect(validateEntries([entry({ type: "item", item_id: "i1", dice: null, fixed_qty: 3 })])).toBeNull();
  });

  it("accepts an unset quantity (defaults to 1 at roll time)", () => {
    expect(validateEntries([entry({ type: "item", item_id: "i1", dice: null, fixed_qty: null })])).toBeNull();
  });

  it("rejects a dice expression that can never roll positive", () => {
    const err = validateEntries([entry({ type: "item", item_id: "i1", dice: "1d4-10" })]);
    expect(err).toMatch(/never roll a positive quantity/i);
  });

  it("rejects an unparseable dice expression", () => {
    const err = validateEntries([entry({ type: "item", item_id: "i1", dice: "banana" })]);
    expect(err).toMatch(/valid quantity/i);
  });

  it("rejects fixed_qty 0 with no dice (would always drop nothing)", () => {
    const err = validateEntries([entry({ type: "item", item_id: "i1", dice: null, fixed_qty: 0 })]);
    expect(err).toMatch(/always drop nothing/i);
  });

  it("applies the same quantity guards to random entries", () => {
    const err = validateEntries([entry({ type: "random", rarity: "rare", dice: "1d2-5" })]);
    expect(err).toMatch(/never roll a positive quantity/i);
  });

  it("a valid dice expression takes precedence over a 0 fixed_qty", () => {
    expect(validateEntries([entry({ type: "item", item_id: "i1", dice: "1d6", fixed_qty: 0 })])).toBeNull();
  });

  it("still enforces the pre-existing rules (drop_chance range, item_id, rarity)", () => {
    expect(validateEntries([entry({ drop_chance: 0, type: "item", item_id: "i1" })])).toMatch(/Drop chance/i);
    expect(validateEntries([entry({ type: "item", item_id: "" })])).toMatch(/reference an item/i);
    expect(validateEntries([entry({ type: "random", rarity: "" })])).toMatch(/rarity/i);
  });

  it("leaves currency entries valid regardless of quantity fields", () => {
    expect(validateEntries([entry({ type: "currency", gp: 10 })])).toBeNull();
  });
});
