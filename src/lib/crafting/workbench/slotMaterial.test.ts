import { describe, expect, it } from "vitest";
import { exitForSlot, firstUsed, lostMaterials, slotSprite, slotState } from "./slotMaterial";
import type { IngredientSlot, SlotCandidate } from "@/lib/crafting/ingredients";
import type { PartyInventoryItem } from "@/types/inventory.types";
import type { Item } from "@/types/item.types";

function cand(id: string, quantity: number, reason: SlotCandidate["reason"] = null, tags: string[] = [], name = id): SlotCandidate {
  return { inv: { id, quantity, name } as PartyInventoryItem, item: { id: `i-${id}`, tags, item_type: "gear" } as Item, reason };
}

function slot(over: Partial<IngredientSlot>): IngredientSlot {
  return {
    index: 0,
    requirement: { item_id: null, library_item_id: null, tags: null, quantity: 2 },
    ref: null,
    tags: null,
    name: "Iron",
    needed: 2,
    available: 0,
    met: false,
    candidates: [],
    ...over,
  };
}

describe("firstUsed", () => {
  const candidates = [cand("a", 5), cand("b", 2), cand("c", 9, "equipped")];
  it("takes the largest eligible stack by default", () => {
    expect(firstUsed(slot({ candidates }), undefined)?.inv.id).toBe("a");
  });
  it("honours the player's choice among eligible rows only", () => {
    expect(firstUsed(slot({ candidates }), "b")?.inv.id).toBe("b");
    expect(firstUsed(slot({ candidates }), "c")?.inv.id).toBe("a");
  });
  it("is null when nothing is eligible", () => {
    expect(firstUsed(slot({ candidates: [cand("c", 9, "ruined")] }), undefined)).toBeNull();
  });
});

describe("slotSprite", () => {
  it("draws the item used first", () => {
    const s = slot({ candidates: [cand("a", 5, null, ["gold"])] });
    expect(slotSprite(s, undefined, []).sprite).toBe("mat-ingot-gold");
  });
  it("falls back to the slot's tags when nothing is held", () => {
    expect(slotSprite(slot({ tags: ["leather"] }), undefined, []).sprite).toBe("mat-leather");
  });
  it("falls back to the neutral bundle when nothing identifies the material", () => {
    expect(slotSprite(slot({}), undefined, []).sprite).toBe("mat-bundle");
  });
});

describe("slotState", () => {
  it("reads the holdings before the roll", () => {
    expect(slotState(slot({ met: true, available: 3 }), null)).toBe("ready");
    expect(slotState(slot({ available: 1 }), null)).toBe("short");
    expect(slotState(slot({ available: 0 }), null)).toBe("missing");
  });
  it("reads the outcome after the roll: a success spends all, a ruin only the primary, a fail nothing", () => {
    expect(slotState(slot({ index: 0 }), "success")).toBe("spent");
    expect(slotState(slot({ index: 1 }), "success")).toBe("spent");
    expect(slotState(slot({ index: 0, met: true, available: 3 }), "ruin")).toBe("ruined");
    expect(slotState(slot({ index: 1, met: true, available: 3 }), "ruin")).toBe("ready");
    expect(slotState(slot({ index: 0, met: true, available: 3 }), "fail")).toBe("ready");
    expect(slotState(slot({ index: 1, available: 1 }), "fail")).toBe("short");
  });
});

describe("lostMaterials", () => {
  it("names the primary's spend on a ruin, by the row the player chose, with its sprite", () => {
    const s = slot({ needed: 2, candidates: [cand("a", 5, null, ["gold"], "Gold Ingot"), cand("b", 3, null, [], "Iron Ingot")] });
    expect(lostMaterials([s], { 0: "b" }, "ruin")).toEqual([
      { name: "Iron Ingot", qty: 2, sprite: expect.objectContaining({ sprite: "mat-bundle" }) },
    ]);
    expect(lostMaterials([s], {}, "ruin")[0]).toMatchObject({ name: "Gold Ingot", qty: 2, sprite: { sprite: "mat-ingot-gold" } });
  });
  it("loses only slot 0 on a ruin, the other slots are untouched", () => {
    const a = slot({ index: 0, needed: 2, candidates: [cand("a", 5, null, [], "Hide")] });
    const b = slot({ index: 1, needed: 1, candidates: [cand("b", 5, null, [], "Thread")] });
    expect(lostMaterials([a, b], {}, "ruin")).toMatchObject([{ name: "Hide", qty: 2 }]);
  });
  it("loses nothing on a success or a failure", () => {
    const a = slot({ index: 0, needed: 2, candidates: [cand("a", 5, null, [], "Hide")] });
    expect(lostMaterials([a], {}, "success")).toEqual([]);
    expect(lostMaterials([a], {}, "fail")).toEqual([]);
  });
  it("is empty when nothing is eligible", () => {
    expect(lostMaterials([slot({ candidates: [cand("c", 9, "ruined")] })], {}, "ruin")).toEqual([]);
  });
});

describe("exitForSlot", () => {
  it("lifts every material into the work on a success", () => {
    expect(exitForSlot(slot({ index: 0 }), "success")).toBe("made");
    expect(exitForSlot(slot({ index: 2 }), "success")).toBe("made");
  });
  it("destroys only the primary on a ruin", () => {
    expect(exitForSlot(slot({ index: 0 }), "ruin")).toBe("destroyed");
    expect(exitForSlot(slot({ index: 1 }), "ruin")).toBeNull();
  });
  it("keeps every material on a failure or before the roll", () => {
    expect(exitForSlot(slot({ index: 0 }), "fail")).toBeNull();
    expect(exitForSlot(slot({ index: 0 }), null)).toBeNull();
  });
});
