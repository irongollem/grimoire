import { describe, expect, it } from "vitest";
import { craftChatMessage, outcomeDetail, outcomeLabel, outputDisplayNames, type CraftMessageInput } from "./craftMessage";

const base: CraftMessageInput = {
  memberName: "Brann",
  recipeName: "Healing Potion",
  dc: 12,
  result: { roll: 14, total: 19, outcome: "success", hasDisadvantage: false },
  abilityMod: 2,
  abilityLabel: "INT",
  hasProficiency: true,
  profBonus: 3,
  modifierBonuses: [],
  outputNames: ["2× Healing Potion"],
};

describe("craftChatMessage", () => {
  it("success with proficiency", () => {
    expect(craftChatMessage(base)).toBe(
      "🔨 **Brann** attempted to craft **Healing Potion** (DC 12)\nRoll: 14 + 2 (INT) + 3 (prof) = **19** vs DC 12\n✅ **Success!** 2× Healing Potion crafted.",
    );
  });
  it("fail without proficiency, with a positive modifier sum", () => {
    expect(
      craftChatMessage({ ...base, hasProficiency: false, modifierBonuses: [1, 2], result: { roll: 5, total: 10, outcome: "fail", hasDisadvantage: false } }),
    ).toBe(
      "🔨 **Brann** attempted to craft **Healing Potion** (DC 12)\nRoll: 5 + 2 (INT) (no proficiency) +3 (modifiers) = **10** vs DC 12\n❌ **Failed.** Time lost; the primary ingredient is a step worse.",
    );
  });
  it("ruin with disadvantage and a negative modifier sum", () => {
    expect(
      craftChatMessage({ ...base, modifierBonuses: [-2], result: { roll: 1, roll2: 17, total: 4, outcome: "ruin", hasDisadvantage: true } }),
    ).toBe(
      "🔨 **Brann** attempted to craft **Healing Potion** (DC 12)\nRoll: 1 (disadvantage: also rolled 17) + 2 (INT) + 3 (prof) -2 (modifiers) = **4** vs DC 12\n💀 **Critical failure!** Primary ingredient ruined; the rest kept.",
    );
  });
  it("says a Fine result came out Fine", () => {
    expect(craftChatMessage({ ...base, fine: true })).toContain("2× Healing Potion crafted, and it came out Fine.");
    expect(craftChatMessage(base)).not.toContain("Fine");
    expect(outcomeDetail("success", ["A"], true)).toBe("A added to your backpack, and it came out Fine.");
  });
  it("omits the modifiers part when they sum to zero", () => {
    expect(craftChatMessage({ ...base, modifierBonuses: [2, -2] })).not.toContain("(modifiers)");
  });
});

describe("outcome text", () => {
  it("labels", () => {
    expect(outcomeLabel("success")).toBe("Success!");
    expect(outcomeLabel("ruin")).toBe("Critical Failure: Item Ruined");
    expect(outcomeLabel("fail")).toBe("Failure");
  });
  it("details", () => {
    expect(outcomeDetail("success", ["A", "2× B"])).toBe("A, 2× B added to your backpack.");
    expect(outcomeDetail("ruin", [])).toBe("The primary ingredient was ruined and returned to your inventory as wreckage. Your other ingredients are untouched.");
    expect(outcomeDetail("fail", [])).toBe("The attempt failed. The time is lost and your primary ingredient is a step worse.");
  });
  it("output names fall back to item and prefix quantities", () => {
    const outs = [
      { item_id: "a", library_item_id: null, quantity: 2 },
      { item_id: "z", library_item_id: null, quantity: 1 },
    ] as unknown as Parameters<typeof outputDisplayNames>[0];
    expect(outputDisplayNames(outs, (r) => (r === "a" ? "Ale" : undefined))).toEqual(["2× Ale", "item"]);
  });
});
