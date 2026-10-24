import { describe, expect, it } from "vitest";
import { buildIngredientSlots, ineligibility, planConsumption } from "./ingredients";
import type { PartyInventoryItem } from "@/types/inventory.types";
import type { Item } from "@/types/item.types";

function inv(id: string, over: Partial<PartyInventoryItem> = {}): PartyInventoryItem {
  return {
    id, campaign_id: "c", user_id: "u", item_id: null, library_item_id: null, name: id, quantity: 1,
    carried_by: "m", location: "backpack", slot: null, is_container: false, container_id: null,
    is_attuned: false, is_equipped: false, notes: null, current_charges: null, updated_at: "",
    is_identified: true, is_ruined: false, sort_order: 0, curse_revealed: false, ...over,
  } as PartyInventoryItem;
}
function item(id: string, name: string, tags: string[] = []): Item {
  return { id, name, tags } as unknown as Item;
}

const items = [item("iron", "Iron Ingot", ["metal"]), item("sword", "Sword", ["metal", "weapon"]), item("herb", "Herb", ["plant"])];

describe("ineligibility", () => {
  it("ranks ruined over equipped over container", () => {
    expect(ineligibility(inv("a", { is_ruined: true, is_equipped: true, is_container: true }))).toBe("ruined");
    expect(ineligibility(inv("a", { is_equipped: true, is_container: true }))).toBe("equipped");
    expect(ineligibility(inv("a", { is_container: true }))).toBe("container");
    expect(ineligibility(inv("a"))).toBeNull();
  });
});

describe("buildIngredientSlots", () => {
  it("names and counts a specific-item slot, resolving either column", () => {
    const [s] = buildIngredientSlots(
      [{ item_id: null, library_item_id: "iron", tags: null, quantity: 2 }],
      [inv("a", { library_item_id: "iron", quantity: 1 }), inv("b", { library_item_id: "iron", quantity: 3 })],
      items,
    );
    expect(s.name).toBe("Iron Ingot");
    expect(s.ref).toBe("iron");
    expect(s.available).toBe(4);
    expect(s.met).toBe(true);
    expect(s.candidates.map((c) => c.inv.id)).toEqual(["b", "a"]);
  });

  it("falls back to the name map, then Unknown item", () => {
    const req = { item_id: "x", library_item_id: null, tags: null, quantity: 1 };
    expect(buildIngredientSlots([req], [], [], new Map([["x", "Mapped"]]))[0].name).toBe("Mapped");
    expect(buildIngredientSlots([req], [], [])[0].name).toBe("Unknown item");
  });

  it("matches tag slots on ALL tags and names them", () => {
    const inventory = [inv("a", { library_item_id: "iron" }), inv("b", { library_item_id: "sword" }), inv("c", { library_item_id: "herb" })];
    const [one, two] = buildIngredientSlots(
      [
        { item_id: null, library_item_id: null, tags: ["metal"], quantity: 1 },
        { item_id: null, library_item_id: null, tags: ["metal", "weapon"], quantity: 1 },
      ],
      inventory,
      items,
    );
    expect(one.name).toBe('Any "metal"');
    expect(one.candidates.map((c) => c.inv.id).sort()).toEqual(["a", "b"]);
    expect(two.name).toBe("Any [metal + weapon]");
    expect(two.candidates.map((c) => c.inv.id)).toEqual(["b"]);
  });

  it("lists ineligible rows with a reason but leaves them out of available", () => {
    const [s] = buildIngredientSlots(
      [{ item_id: null, library_item_id: "iron", tags: null, quantity: 2 }],
      [
        inv("eq", { library_item_id: "iron", quantity: 9, is_equipped: true }),
        inv("ru", { library_item_id: "iron", quantity: 9, is_ruined: true }),
        inv("ct", { library_item_id: "iron", quantity: 9, is_container: true }),
        inv("ok", { library_item_id: "iron", quantity: 1 }),
      ],
      items,
    );
    expect(s.available).toBe(1);
    expect(s.met).toBe(false);
    expect(s.candidates[0].inv.id).toBe("ok");
    expect(s.candidates.slice(1).map((c) => c.reason).sort()).toEqual(["container", "equipped", "ruined"]);
  });
});

describe("planConsumption", () => {
  const req = (quantity: number) => ({ item_id: null, library_item_id: "iron", tags: null, quantity });
  const stacks = [inv("small", { library_item_id: "iron", quantity: 1 }), inv("big", { library_item_id: "iron", quantity: 5 })];

  it("takes only the needed quantity, largest stack first, primary is the first taken", () => {
    const p = planConsumption(buildIngredientSlots([req(2)], stacks, items));
    expect(p.consumption).toEqual([{ id: "big", qty: 2 }]);
    expect(p.primary?.id).toBe("big");
    expect(p.primaryConsumption).toEqual([{ id: "big", qty: 2 }]);
    expect(p.short).toBe(false);
  });

  it("uses the preferred row first and the remainder from the next largest", () => {
    const slots = buildIngredientSlots([req(3)], stacks, items);
    const p = planConsumption(slots, { 0: "small" });
    expect(p.consumption).toEqual([{ id: "small", qty: 1 }, { id: "big", qty: 2 }]);
    expect(p.primary?.id).toBe("small");
  });

  it("reports only slot 0's takes as the primary consumption, honouring the preferred row and cross-slot tracking", () => {
    const rows = [inv("one", { library_item_id: "iron", quantity: 3 }), inv("two", { library_item_id: "iron", quantity: 5 })];
    const slots = buildIngredientSlots([req(2), req(2)], rows, items);
    const p = planConsumption(slots, { 0: "one" });
    expect(p.primaryConsumption).toEqual([{ id: "one", qty: 2 }]);
    expect(p.consumption).toEqual([{ id: "one", qty: 2 }, { id: "two", qty: 2 }]);
    const split = planConsumption(buildIngredientSlots([req(4)], stacks, items), { 0: "small" });
    expect(split.primaryConsumption).toEqual(split.consumption);
  });

  it("ignores a preferred row that is ineligible", () => {
    const rows = [...stacks, inv("eq", { library_item_id: "iron", quantity: 9, is_equipped: true })];
    const p = planConsumption(buildIngredientSlots([req(1)], rows, items), { 0: "eq" });
    expect(p.consumption).toEqual([{ id: "big", qty: 1 }]);
  });

  it("never takes more than a row holds across two slots, and merges repeats", () => {
    const rows = [inv("one", { library_item_id: "iron", quantity: 3 })];
    const ok = planConsumption(buildIngredientSlots([req(1), req(2)], rows, items));
    expect(ok.consumption).toEqual([{ id: "one", qty: 3 }]);
    expect(ok.short).toBe(false);
    const bad = planConsumption(buildIngredientSlots([req(2), req(2)], rows, items));
    expect(bad.short).toBe(true);
  });

  it("has no primary when nothing is required", () => {
    expect(planConsumption([])).toEqual({ consumption: [], primary: null, primaryConsumption: [], short: false });
  });
});
