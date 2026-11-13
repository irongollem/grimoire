import { describe, expect, it } from "vitest";
import { ITEM_RARITIES, RARITY_LETTERS } from "@/types/item.types";

describe("rarity bookmark letters", () => {
  it("keeps every rarity distinct, so two ledger rows never share a tab", () => {
    const letters = ITEM_RARITIES.map((r) => RARITY_LETTERS[r]);
    expect(new Set(letters).size).toBe(ITEM_RARITIES.length);
  });

  it("writes very rare as VR and mundane as M", () => {
    expect(RARITY_LETTERS.very_rare).toBe("VR");
    expect(RARITY_LETTERS.mundane).toBe("M");
  });
});
