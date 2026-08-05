import { describe, it, expect } from "vitest";
import { resolveGeneratedLoot, type LootItemPoolRow } from "./resolveGeneratedLoot";
import type { LootEntryAiResult } from "./types";

const POOL: LootItemPoolRow[] = [
  { id: "uuid-flame-tongue", name: "Flame Tongue", rarity: "rare", item_type: "weapon" },
  { id: "srd_potion_of_healing", name: "Potion of Healing", rarity: "common", item_type: "potion" },
  // Shadowing pair: the DM's own copy is listed first by the merged catalogue,
  // so it must win the name lookup.
  { id: "uuid-own-cloak", name: "Cloak of Elvenkind", rarity: "uncommon", item_type: "wondrous_item" },
  { id: "srd_cloak_of_elvenkind", name: "Cloak of Elvenkind", rarity: "uncommon", item_type: "wondrous_item" },
];

function itemEntry(overrides: Partial<LootEntryAiResult> = {}): LootEntryAiResult {
  return { type: "item", item_name: "Flame Tongue", drop_chance: 40, dice: null, fixed_qty: 1, ...overrides };
}

describe("resolveGeneratedLoot — item entries", () => {
  it("resolves a name to its vault row", () => {
    const [entry] = resolveGeneratedLoot([itemEntry()], POOL);
    expect(entry).toMatchObject({ kind: "item", generatedName: "Flame Tongue", dropChance: 40 });
    expect(entry.kind === "item" && entry.item.id).toBe("uuid-flame-tongue");
  });

  it("matches case- and whitespace-insensitively but keeps the model's spelling", () => {
    const [entry] = resolveGeneratedLoot([itemEntry({ item_name: "  flame TONGUE " })], POOL);
    expect(entry).toMatchObject({ kind: "item", generatedName: "flame TONGUE" });
    expect(entry.kind === "item" && entry.item.name).toBe("Flame Tongue");
  });

  it("prefers the DM's own row over the shared row of the same name", () => {
    const [entry] = resolveGeneratedLoot([itemEntry({ item_name: "Cloak of Elvenkind" })], POOL);
    expect(entry.kind === "item" && entry.item.id).toBe("uuid-own-cloak");
  });

  it("surfaces an unknown name as unresolved rather than dropping it", () => {
    const [entry] = resolveGeneratedLoot([itemEntry({ item_name: "Sword of Nonexistence" })], POOL);
    expect(entry).toEqual({
      kind: "unresolved",
      generatedName: "Sword of Nonexistence",
      reason: "not in your Vault or enabled sources",
    });
  });

  it("surfaces an item entry with no name at all", () => {
    const [entry] = resolveGeneratedLoot([itemEntry({ item_name: "   " })], POOL);
    expect(entry).toMatchObject({ kind: "unresolved", reason: "the entry named no item" });
  });

  it("marks a repeated item as unresolved instead of silently merging it", () => {
    const resolved = resolveGeneratedLoot([itemEntry(), itemEntry()], POOL);
    expect(resolved[0].kind).toBe("item");
    expect(resolved[1]).toMatchObject({ kind: "unresolved", reason: "already listed by an earlier entry" });
  });

  it("prefers a dice expression over a fixed quantity, never keeping both", () => {
    const [entry] = resolveGeneratedLoot([itemEntry({ dice: "2d4", fixed_qty: 3 })], POOL);
    expect(entry).toMatchObject({ kind: "item", dice: "2d4", fixedQty: null });
  });

  it("rejects a dice expression that can never roll positive, falling back to a fixed quantity (#487)", () => {
    const [entry] = resolveGeneratedLoot([itemEntry({ dice: "1d4-10", fixed_qty: 2 })], POOL);
    expect(entry).toMatchObject({ kind: "item", dice: null, fixedQty: 2 });
  });

  it("rejects an unparseable dice expression rather than persisting it", () => {
    const [entry] = resolveGeneratedLoot([itemEntry({ dice: "a handful", fixed_qty: null })], POOL);
    expect(entry).toMatchObject({ kind: "item", dice: null, fixedQty: 1 });
  });

  it("falls back to a quantity of 1 when the model sets neither dice nor a usable fixed_qty", () => {
    const [entry] = resolveGeneratedLoot([itemEntry({ dice: null, fixed_qty: 0 })], POOL);
    expect(entry).toMatchObject({ kind: "item", dice: null, fixedQty: 1 });
  });

  it("clamps an out-of-range drop chance rather than discarding the entry", () => {
    const [tooHigh] = resolveGeneratedLoot([itemEntry({ drop_chance: 140 })], POOL);
    const [tooLow] = resolveGeneratedLoot([itemEntry({ drop_chance: 0 })], POOL);
    expect(tooHigh).toMatchObject({ dropChance: 100 });
    expect(tooLow).toMatchObject({ dropChance: 1 });
  });
});

describe("resolveGeneratedLoot — currency entries", () => {
  it("normalises coin amounts and keeps the label", () => {
    const [entry] = resolveGeneratedLoot([{
      type: "currency", currency_label: "Belt pouch", drop_chance: 100,
      gp: 120, sp: 40.4, pp: -5,
    }], POOL);
    expect(entry).toEqual({
      kind: "currency", label: "Belt pouch", dropChance: 100,
      pp: 0, gp: 120, ep: 0, sp: 40, cp: 0, notes: null,
    });
  });

  it("treats a blank label as absent", () => {
    const [entry] = resolveGeneratedLoot([{ type: "currency", currency_label: "  ", drop_chance: 50 }], POOL);
    expect(entry).toMatchObject({ kind: "currency", label: null });
  });
});

describe("resolveGeneratedLoot — random entries", () => {
  it("keeps a valid rarity and item-type filter", () => {
    const [entry] = resolveGeneratedLoot([{
      type: "random", rarity: "uncommon", item_type_filter: "potion", drop_chance: 50, fixed_qty: 2,
    }], POOL);
    expect(entry).toMatchObject({ kind: "random", rarity: "uncommon", itemTypeFilter: "potion", fixedQty: 2 });
  });

  it("drops an unrecognised item-type filter but keeps the entry", () => {
    const [entry] = resolveGeneratedLoot([{
      type: "random", rarity: "rare", item_type_filter: "greatsword", drop_chance: 25,
    }], POOL);
    expect(entry).toMatchObject({ kind: "random", rarity: "rare", itemTypeFilter: null });
  });

  it("surfaces a random entry whose rarity is not a real rarity", () => {
    const [entry] = resolveGeneratedLoot([{
      type: "random", rarity: "super rare", drop_chance: 25,
    }], POOL);
    expect(entry).toMatchObject({
      kind: "unresolved",
      generatedName: "Random super rare",
      reason: "the random pick had no usable rarity",
    });
  });
});

describe("resolveGeneratedLoot — ordering", () => {
  it("returns one result per generated entry, in the model's order", () => {
    const resolved = resolveGeneratedLoot([
      { type: "currency", drop_chance: 100, gp: 50 },
      itemEntry(),
      itemEntry({ item_name: "Ghost Sword" }),
    ], POOL);
    expect(resolved.map((e) => e.kind)).toEqual(["currency", "item", "unresolved"]);
  });
});
