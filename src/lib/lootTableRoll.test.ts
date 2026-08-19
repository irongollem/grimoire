import { describe, it, expect, vi, afterEach } from "vitest";
import {
  rollLootTable,
  unresolvedReasonLabel,
  type RolledItemEntry,
  type RolledCurrencyEntry,
  type RolledUnresolvedEntry,
} from "@/lib/lootTableRoll";
import type { Item } from "@/types/item.types";
import type { LootEntry, LootTable } from "@/types/lootTable.types";

// ── Randomness control ──────────────────────────────────────────────────────
//
// rollLootTable consumes Math.random() in exactly two shapes:
//   - via rollDie(sides) = Math.floor(Math.random() * sides) + 1   (entryHits, dice qty)
//   - via Math.floor(Math.random() * pool.length)                  ("random" entry pick)
//
// randAt(roll, sides) returns the smallest Math.random() value that makes
// rollDie(sides) produce exactly `roll`. poolIndex(k, len) does the same for
// the pool-index pick. Both are exact (no floating point slop) because the
// numerator is always an integer strictly less than the denominator.

function randAt(roll: number, sides: number): number {
  return (roll - 1) / sides;
}

function poolIndex(k: number, len: number): number {
  return k / len;
}

/** Queue of Math.random() return values; throws if drained past its length
 *  (a stricter signal than silently repeating the last value) — this way an
 *  unexpected extra/missing random-consuming branch fails the test loudly. */
function stubRandom(values: number[]): void {
  let i = 0;
  vi.spyOn(Math, "random").mockImplementation(() => {
    if (i >= values.length) {
      throw new Error(`Math.random() called more times than the ${values.length} stubbed value(s)`);
    }
    return values[i++];
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

// ── Fixtures ─────────────────────────────────────────────────────────────────

function makeItem(overrides: Partial<Item> = {}): Item {
  return {
    id: "item-default",
    user_id: "user-1",
    name: "Default Item",
    item_type: "gear",
    subtype: null,
    rarity: "common",
    requires_attunement: false,
    attunement_requirements: null,
    weight: null,
    cost: null,
    damage_rolls: null,
    armor_class: null,
    properties: [],
    charges: null,
    recharge: null,
    spell_ids: [],
    weapon_range: null,
    versatile_damage: null,
    description: "",
    source: null,
    source_title: null,
    source_url: null,
    tags: [],
    bundle_items: null,
    image_url: null,
    image_focal_point: null,
    is_arcane_focus: false,
    mundane_description: null,
    mundane_image_url: null,
    mundane_image_focal_point: null,
    curse_description: null,
    campaign_id: null,
    dm_notes: null,
    content: null,
    content_player_writable: false,
    content_updated_at: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeLootEntry(overrides: Partial<LootEntry> = {}): LootEntry {
  return {
    id: "entry-default",
    drop_chance: 100,
    ...overrides,
  };
}

function makeLootTable(entries: LootEntry[]): LootTable {
  return {
    id: "table-1",
    user_id: "user-1",
    campaign_id: null,
    name: "Test Table",
    description: null,
    cr_tier: "any",
    entries,
    tags: [],
    notes: null,
    monster_ids: [],
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  };
}

// ── entryHits: drop_chance resolution ───────────────────────────────────────

describe("rollLootTable — drop_chance resolution", () => {
  it("excludes an entry that never hits (drop_chance 0), even on the lowest possible d100 roll", () => {
    const item = makeItem({ id: "sword" });
    const entry = makeLootEntry({ id: "e1", drop_chance: 0, type: "item", item_id: "sword", fixed_qty: 5 });
    stubRandom([randAt(1, 100)]); // lowest possible roll — still excluded, since 1 <= 0 is false
    const result = rollLootTable(makeLootTable([entry]), new Map([["sword", item]]));
    expect(result).toEqual([]);
  });

  it("always hits when drop_chance >= 100, without consuming a d100 roll at all", () => {
    const item = makeItem({ id: "sword" });
    const entry = makeLootEntry({ id: "e1", drop_chance: 100, type: "item", item_id: "sword", fixed_qty: 3 });
    stubRandom([]); // any Math.random() call here would throw — proves entryHits short-circuits
    const result = rollLootTable(makeLootTable([entry]), new Map([["sword", item]]));
    expect(result).toHaveLength(1);
    expect((result[0] as RolledItemEntry).qty).toBe(3);
  });

  it("also short-circuits for drop_chance above 100", () => {
    const item = makeItem({ id: "sword" });
    const entry = makeLootEntry({ id: "e1", drop_chance: 150, type: "item", item_id: "sword", fixed_qty: 1 });
    stubRandom([]);
    const result = rollLootTable(makeLootTable([entry]), new Map([["sword", item]]));
    expect(result).toHaveLength(1);
  });

  it("boundary: a rolled value exactly equal to drop_chance counts as a hit (<=, not <)", () => {
    const item = makeItem({ id: "sword" });
    const entry = makeLootEntry({ id: "e1", drop_chance: 42, type: "item", item_id: "sword", fixed_qty: 1 });
    stubRandom([randAt(42, 100)]);
    const result = rollLootTable(makeLootTable([entry]), new Map([["sword", item]]));
    expect(result).toHaveLength(1);
  });

  it("boundary: a rolled value one above drop_chance is a miss", () => {
    const item = makeItem({ id: "sword" });
    const entry = makeLootEntry({ id: "e1", drop_chance: 42, type: "item", item_id: "sword", fixed_qty: 1 });
    stubRandom([randAt(43, 100)]);
    const result = rollLootTable(makeLootTable([entry]), new Map([["sword", item]]));
    expect(result).toEqual([]);
  });
});

// ── rollQuantity ─────────────────────────────────────────────────────────────

describe("rollLootTable — quantity resolution", () => {
  it("rolls quantity from a dice expression", () => {
    const item = makeItem({ id: "arrow" });
    const entry = makeLootEntry({ id: "e1", drop_chance: 100, type: "item", item_id: "arrow", dice: "2d6" });
    stubRandom([randAt(4, 6), randAt(3, 6)]); // 4 + 3 = 7
    const result = rollLootTable(makeLootTable([entry]), new Map([["arrow", item]]));
    expect((result[0] as RolledItemEntry).qty).toBe(7);
  });

  it("falls back to fixed_qty when dice is null/empty", () => {
    const item = makeItem({ id: "arrow" });
    const entry = makeLootEntry({ id: "e1", drop_chance: 100, type: "item", item_id: "arrow", dice: null, fixed_qty: 5 });
    stubRandom([]);
    const result = rollLootTable(makeLootTable([entry]), new Map([["arrow", item]]));
    expect((result[0] as RolledItemEntry).qty).toBe(5);
  });

  it("defaults to quantity 1 when dice is empty and fixed_qty is absent", () => {
    const item = makeItem({ id: "arrow" });
    const entry = makeLootEntry({ id: "e1", drop_chance: 100, type: "item", item_id: "arrow", dice: "", fixed_qty: null });
    stubRandom([]);
    const result = rollLootTable(makeLootTable([entry]), new Map([["arrow", item]]));
    expect((result[0] as RolledItemEntry).qty).toBe(1);
  });

  it("honours an explicit fixed_qty of 0 as 'hit but nothing' — surfacing an unresolved entry, not defaulting to 1 (#487)", () => {
    // fixed_qty=0 is now distinguished from unset: it means "this entry hits but
    // grants nothing", which surfaces as a non_positive_quantity unresolved entry
    // rather than the old silent default of qty=1.
    const item = makeItem({ id: "arrow", name: "Arrow" });
    const entry = makeLootEntry({ id: "e1", drop_chance: 100, type: "item", item_id: "arrow", dice: null, fixed_qty: 0 });
    stubRandom([]);
    const result = rollLootTable(makeLootTable([entry]), new Map([["arrow", item]]));
    expect(result).toEqual([
      { type: "unresolved", entry_id: "e1", reason: "non_positive_quantity", wanted: "Arrow", notes: null } satisfies RolledUnresolvedEntry,
    ]);
  });

  it("surfaces a dice expression that rolls to a non-positive total as unresolved, not a silent drop (#487)", () => {
    // "1d4-10" at its maximum roll (4) totals -6; the entry hit but can't produce
    // a positive quantity, so it is now reported as unresolved rather than dropped.
    const item = makeItem({ id: "arrow", name: "Arrow" });
    const entry = makeLootEntry({ id: "e1", drop_chance: 100, type: "item", item_id: "arrow", dice: "1d4-10" });
    stubRandom([randAt(4, 4)]);
    const result = rollLootTable(makeLootTable([entry]), new Map([["arrow", item]]));
    expect(result).toEqual([
      { type: "unresolved", entry_id: "e1", reason: "non_positive_quantity", wanted: "Arrow", notes: null } satisfies RolledUnresolvedEntry,
    ]);
  });
});

// ── currency entries ─────────────────────────────────────────────────────────

describe("rollLootTable — currency entries", () => {
  it("passes coin fields through as-is, defaulting unset coins to 0, without rolling a quantity", () => {
    const entry = makeLootEntry({
      id: "e1",
      drop_chance: 100,
      type: "currency",
      currency_label: "Belt pouch",
      gp: 15,
      sp: 3,
    });
    stubRandom([]); // currency entries never consume a random for quantity
    const result = rollLootTable(makeLootTable([entry]), new Map());
    expect(result).toEqual([
      {
        type: "currency",
        entry_id: "e1",
        currency_label: "Belt pouch",
        pp: 0,
        gp: 15,
        ep: 0,
        sp: 3,
        cp: 0,
        notes: null,
      } satisfies RolledCurrencyEntry,
    ]);
  });
});

// ── "random" entries — vault pool pick ────────────────────────────────────────

describe("rollLootTable — random (pool-pick) entries", () => {
  it("filters the vault pool by rarity", () => {
    const rareA = makeItem({ id: "rare-a", rarity: "rare", item_type: "potion" });
    const rareB = makeItem({ id: "rare-b", rarity: "rare", item_type: "scroll" });
    const common = makeItem({ id: "common-c", rarity: "common", item_type: "potion" });
    const itemsById = new Map([
      [rareA.id, rareA],
      [rareB.id, rareB],
      [common.id, common],
    ]);
    const entry = makeLootEntry({ id: "e1", drop_chance: 100, type: "random", rarity: "rare", fixed_qty: 1 });
    // pool = [rareA, rareB] (Map insertion order); pick index 1 → rareB
    stubRandom([poolIndex(1, 2)]);
    const result = rollLootTable(makeLootTable([entry]), itemsById);
    expect((result[0] as RolledItemEntry).item_id).toBe("rare-b");
  });

  it("further narrows the pool by item_type_filter", () => {
    const rarePotion = makeItem({ id: "rare-potion", rarity: "rare", item_type: "potion" });
    const rareScroll = makeItem({ id: "rare-scroll", rarity: "rare", item_type: "scroll" });
    const itemsById = new Map([
      [rarePotion.id, rarePotion],
      [rareScroll.id, rareScroll],
    ]);
    const entry = makeLootEntry({
      id: "e1",
      drop_chance: 100,
      type: "random",
      rarity: "rare",
      item_type_filter: "potion",
      fixed_qty: 1,
    });
    // pool = [rarePotion] only; single-element pick.
    stubRandom([poolIndex(0, 1)]);
    const result = rollLootTable(makeLootTable([entry]), itemsById);
    expect((result[0] as RolledItemEntry).item_id).toBe("rare-potion");
  });

  it("resolves into an item-shaped result even though the entry's own type is 'random'", () => {
    const rareItem = makeItem({ id: "rare-a", rarity: "rare", name: "Wand of Wonder", image_url: "wand.webp" });
    const itemsById = new Map([[rareItem.id, rareItem]]);
    const entry = makeLootEntry({ id: "e1", drop_chance: 100, type: "random", rarity: "rare", fixed_qty: 2, notes: "flavor text" });
    stubRandom([poolIndex(0, 1)]);
    const result = rollLootTable(makeLootTable([entry]), itemsById);
    expect(result).toEqual([
      {
        type: "item",
        entry_id: "e1",
        item_id: "rare-a",
        item_name: "Wand of Wonder",
        item_image_url: "wand.webp",
        qty: 2,
        notes: "flavor text",
      } satisfies RolledItemEntry,
    ]);
  });

  it("surfaces an empty candidate pool as unresolved 'no_matching_items', not a silent drop (#487)", () => {
    const commonItem = makeItem({ id: "common-a", rarity: "common" });
    const itemsById = new Map([[commonItem.id, commonItem]]);
    const entry = makeLootEntry({ id: "e1", drop_chance: 100, type: "random", rarity: "artifact", fixed_qty: 1 });
    // pool is empty before any random call is made — the pick and qty roll never happen.
    stubRandom([]);
    const result = rollLootTable(makeLootTable([entry]), itemsById);
    expect(result).toHaveLength(1);
    const u = result[0] as RolledUnresolvedEntry;
    expect(u.type).toBe("unresolved");
    expect(u.reason).toBe("no_matching_items");
    expect(u.entry_id).toBe("e1");
    expect(u.wanted).toBeTruthy(); // a human label of what it wanted (e.g. "Artifact item")
  });
});

// ── item entries referencing a deleted/missing vault item ────────────────────

describe("rollLootTable — dangling item references", () => {
  it("surfaces an item entry whose item_id is absent as unresolved 'item_deleted', not a silent drop (#487)", () => {
    const entry = makeLootEntry({ id: "e1", drop_chance: 100, type: "item", item_id: "deleted-item", fixed_qty: 1 });
    stubRandom([]);
    const result = rollLootTable(makeLootTable([entry]), new Map());
    expect(result).toHaveLength(1);
    const u = result[0] as RolledUnresolvedEntry;
    expect(u.type).toBe("unresolved");
    expect(u.reason).toBe("item_deleted");
    expect(u.entry_id).toBe("e1");
  });
});

// ── misc ───────────────────────────────────────────────────────────────────

describe("rollLootTable — misc", () => {
  it("returns an empty array for a table with no entries", () => {
    stubRandom([]);
    const result = rollLootTable(makeLootTable([]), new Map());
    expect(result).toEqual([]);
  });

  it("treats an entry with no explicit type as an item entry", () => {
    const item = makeItem({ id: "sword", name: "Legacy Sword" });
    const entry = makeLootEntry({ id: "e1", drop_chance: 100, item_id: "sword", fixed_qty: 1 });
    expect(entry.type).toBeUndefined();
    stubRandom([]);
    const result = rollLootTable(makeLootTable([entry]), new Map([["sword", item]]));
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("item");
    expect((result[0] as RolledItemEntry).item_name).toBe("Legacy Sword");
  });
});

// ── unresolvedReasonLabel ─────────────────────────────────────────────────────

describe("unresolvedReasonLabel", () => {
  it("returns a non-empty human string for every reason", () => {
    for (const reason of ["no_matching_items", "non_positive_quantity", "item_deleted"] as const) {
      expect(unresolvedReasonLabel(reason)).toBeTruthy();
    }
  });
});
