import { describe, it, expect } from "vitest";
import { buildCursedItems } from "./cursedItems";
import type { PartyInventoryItem } from "@/types/inventory.types";
import type { Item } from "@/types/item.types";
import type { PartyMember } from "@/types/party.types";

/** Just the fields the join reads — see deathSaves.test.ts for why a full
 *  row is not spelled out on every case. */
function inv(overrides: Partial<PartyInventoryItem> & { id: string }): PartyInventoryItem {
  return {
    campaign_id: "campaign-1",
    user_id: "dm-1",
    item_id: overrides.item_id ?? null,
    name: overrides.name ?? overrides.id,
    quantity: 1,
    carried_by: overrides.carried_by ?? null,
    location: "backpack",
    slot: null,
    is_container: false,
    container_id: null,
    is_attuned: false,
    is_equipped: false,
    notes: null,
    current_charges: null,
    updated_at: "2026-08-01T00:00:00Z",
    is_identified: true,
    is_ruined: false,
    sort_order: 0,
    curse_revealed: overrides.curse_revealed ?? false,
    ...overrides,
  } as PartyInventoryItem;
}

function member(overrides: Partial<PartyMember> & { id: string }): PartyMember {
  return {
    name: overrides.name ?? overrides.id,
    ...overrides,
  } as PartyMember;
}

function item(overrides: Partial<Item> & { id: string }): Item {
  return {
    name: overrides.name ?? overrides.id,
    curse_description: overrides.curse_description ?? null,
    ...overrides,
  } as Item;
}

describe("buildCursedItems", () => {
  it("returns nothing for an empty inventory", () => {
    expect(buildCursedItems([], [], [])).toEqual([]);
  });

  it("excludes a cursed item whose curse has already been revealed", () => {
    const rows = buildCursedItems(
      [inv({ id: "a", item_id: "cursed-ring", curse_revealed: true })],
      [],
      [item({ id: "cursed-ring", curse_description: "Slowly turns the wearer to stone." })],
    );
    expect(rows).toEqual([]);
  });

  it("includes a cursed item whose curse has not been revealed", () => {
    const rows = buildCursedItems(
      [inv({ id: "a", item_id: "cursed-ring", curse_revealed: false })],
      [],
      [item({ id: "cursed-ring", curse_description: "Slowly turns the wearer to stone." })],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].invId).toBe("a");
  });

  it("excludes a non-cursed item", () => {
    const rows = buildCursedItems(
      [inv({ id: "a", item_id: "plain-ring" })],
      [],
      [item({ id: "plain-ring", curse_description: null })],
    );
    expect(rows).toEqual([]);
  });

  it("excludes an inventory row with no linked vault item at all", () => {
    // A custom-named entry (no item_id) has no curse text to have — must not
    // crash on the missing lookup.
    const rows = buildCursedItems([inv({ id: "a", item_id: null })], [], []);
    expect(rows).toEqual([]);
  });

  it("labels an unassigned cursed item as the party stash, not a removed carrier", () => {
    const rows = buildCursedItems(
      [inv({ id: "a", item_id: "cursed-ring", carried_by: null })],
      [],
      [item({ id: "cursed-ring", curse_description: "Cursed." })],
    );
    expect(rows[0]).toMatchObject({ carrierName: "Party stash", carrierId: null });
  });

  it("resolves a carrier id to the roster member's name", () => {
    const rows = buildCursedItems(
      [inv({ id: "a", item_id: "cursed-ring", carried_by: "member-1" })],
      [member({ id: "member-1", name: "Thistle" })],
      [item({ id: "cursed-ring", curse_description: "Cursed." })],
    );
    expect(rows[0]).toMatchObject({ carrierName: "Thistle", carrierId: "member-1" });
  });

  it("falls back to the removed-marker when the carrier id matches no party member, without crashing", () => {
    const rows = buildCursedItems(
      [inv({ id: "a", item_id: "cursed-ring", carried_by: "gone" })],
      [],
      [item({ id: "cursed-ring", curse_description: "Cursed." })],
    );
    expect(rows[0]).toMatchObject({ carrierName: "??? (removed)", carrierId: null });
  });

  it("orders rows alphabetically by item name, regardless of input order", () => {
    const rows = buildCursedItems(
      [
        inv({ id: "z", name: "Zephyr Cloak", item_id: "cursed-cloak" }),
        inv({ id: "a", name: "Amulet of Woe", item_id: "cursed-amulet" }),
        inv({ id: "m", name: "Moonlit Blade", item_id: "cursed-blade" }),
      ],
      [],
      [
        item({ id: "cursed-cloak", curse_description: "Cursed." }),
        item({ id: "cursed-amulet", curse_description: "Cursed." }),
        item({ id: "cursed-blade", curse_description: "Cursed." }),
      ],
    );
    expect(rows.map((r) => r.itemName)).toEqual(["Amulet of Woe", "Moonlit Blade", "Zephyr Cloak"]);
  });
});
