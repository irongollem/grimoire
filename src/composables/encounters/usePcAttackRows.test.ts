import { ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import { usePcAttackRows } from "./usePcAttackRows";
import type { Item } from "@/types/item.types";
import type { PartyInventoryItem } from "@/types/inventory.types";
import type { PartyMember } from "@/types/party.types";

const inventory = ref<PartyInventoryItem[]>([]);
const items = ref<Item[]>([]);

vi.mock("@/composables/items/usePartyInventory", () => ({ usePartyInventory: () => ({ data: inventory }) }));
vi.mock("@/composables/items/useStoredItemRefs", () => ({ useStoredItemRefs: () => ({ items }) }));

function member(scores: { str: number; dex: number }, extra: Partial<PartyMember> = {}): PartyMember {
  return { id: "m1", name: "Tamsin", level: 1, proficiency_bonus: 2, custom_attacks: [], ...scores, ...extra } as unknown as PartyMember;
}

function weapon(id: string, name: string, properties: string[], dice: string, extra: Partial<Item> = {}): Item {
  return {
    id, name, item_type: "weapon", properties, tags: [], subtype: null, charges: null, weapon_range: null,
    damage_rolls: [{ dice, type: "piercing" }], ...extra,
  } as unknown as Item;
}

function hold(id: string, itemId: string | null, name: string, extra: Partial<PartyInventoryItem> = {}): PartyInventoryItem {
  return { id, item_id: itemId, library_item_id: null, name, quantity: 1, carried_by: "m1", slot: "main_hand", ...extra } as unknown as PartyInventoryItem;
}

function setup(m: PartyMember, held: PartyInventoryItem[], defs: Item[]) {
  inventory.value = held;
  items.value = defs;
  return usePcAttackRows(() => m);
}

describe("usePcAttackRows", () => {
  // Bug caught live (17 Nov 2026): Rosie held a rapier from the shared library and could only punch. The wrapper
  // hands the rules the item through the reference on the carried row, so a library item reaches them.
  it("resolves a held library weapon through the stored item refs", () => {
    const rows = setup(
      member({ str: 10, dex: 16 }),
      [hold("i1", null, "Rapier", { library_item_id: "srd_srd_rapier" })],
      [weapon("srd_srd_rapier", "Rapier", ["finesse"], "1d8")],
    );
    expect(rows.melee.value.map((r) => r.name)).toContain("Rapier");
  });

  // The runner and the sheet pass one proficiency bonus so they cannot disagree.
  // Bug caught: the option ignored and the level's bonus used instead.
  it("adds the proficiency bonus the caller passes, not the level's", () => {
    inventory.value = [];
    items.value = [];
    const rows = usePcAttackRows(() => member({ str: 10, dex: 10 }), { profBonus: () => 4 });
    expect(rows.melee.value.find((r) => r.key === "unarmed")?.attackBonus).toBe(4);
  });

  // Only this member's rows are theirs. Bug caught: another character's weapon listed as carried.
  it("lists only the weapons this member carries", () => {
    const rows = setup(
      member({ str: 10, dex: 10 }),
      [hold("i1", "sw", "Longsword", { slot: null, carried_by: "someone-else" })],
      [weapon("sw", "Longsword", [], "1d8")],
    );
    expect(rows.carriedWeapons.value).toEqual([]);
    expect(rows.memberInventory.value).toEqual([]);
  });

  it("returns no rows without a member", () => {
    inventory.value = [];
    items.value = [];
    const rows = usePcAttackRows(() => null);
    expect(rows.all.value).toEqual([]);
  });
});
