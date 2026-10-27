import { describe, expect, it } from "vitest";
import { autoFailsSave, listedSaveBonus, resolveSave, saveBonusFromStatBlock, saveRollMode } from "./savingThrow.ts";

describe("autoFailsSave", () => {
  // SRD 5.2 "Paralyzed" / "Stunned" / "Petrified" / "Unconscious": automatically fail Strength and Dexterity saves
  it.each([
    [[{ name: "Stunned" }], "dex", true],
    [[{ name: "Paralyzed" }], "str", true],
    [[{ name: "Petrified" }], "dex", true],
    [[{ name: "Unconscious" }], "str", true],
    [[{ name: "Stunned" }], "wis", false],
    [[{ name: "Prone" }], "dex", false],
  ] as const)("%j %s", (c, a, e) => expect(autoFailsSave([...c], a)).toBe(e));
});

describe("saveRollMode", () => {
  // PHB 2014 "Restrained": disadvantage on Dexterity saving throws
  it("Restrained disadvantages Dex only", () => {
    expect(saveRollMode({ conditions: [{ name: "Restrained" }], ability: "dex", ruleset: "2014" }).mode).toBe("disadvantage");
    expect(saveRollMode({ conditions: [{ name: "Restrained" }], ability: "wis", ruleset: "2014" }).mode).toBe("normal");
  });
  it("names Restrained, not Exhaustion, as the cause of a Dex disadvantage", () => {
    const { reasons } = saveRollMode({ conditions: [{ name: "Restrained" }], ability: "dex", ruleset: "2014" });
    expect(reasons.join(" ")).toMatch(/Restrained/);
  });
  // PHB 2014 "Exhaustion" level 3: disadvantage on saving throws; 2024 replaced the table with a flat d20 penalty
  it("2014 exhaustion 3 vs 2024", () => {
    expect(saveRollMode({ conditions: [{ name: "Exhaustion", level: 3 }], ability: "con", ruleset: "2014" }).mode).toBe("disadvantage");
    expect(saveRollMode({ conditions: [{ name: "Exhaustion", level: 3 }], ability: "con", ruleset: "2024" }).mode).toBe("normal");
  });
});

describe("saveRollMode stacking", () => {
  // PHB 2014 "Advantage and Disadvantage": any of each cancels to a straight roll
  it("any advantage with any disadvantage is straight, whatever the order", () => {
    // Restrained on a Dex save (dis) + DM advantage -> straight; a further source must not flip it.
    expect(saveRollMode({ conditions: [{ name: "Restrained" }, { name: "Exhaustion", level: 3 }], ability: "dex", ruleset: "2014", dmMode: "advantage" }).mode).toBe("normal");
    expect(saveRollMode({ conditions: [{ name: "Restrained" }], ability: "dex", ruleset: "2014", dmMode: "disadvantage" }).mode).toBe("disadvantage");
  });
});

describe("listedSaveBonus forms", () => {
  it.each([
    ["Con +5, Wis +3", "con", 5],
    ["Constitution +6, Wisdom +4", "wis", 4],
    ["Con+5", "con", 5],
    ["CON +5", "con", 5],
    ["Dex +3 (advantage vs. traps)", "dex", 3],
    ["Str -1", "str", -1],
    ["Str \u22121", "str", -1],
  ] as const)("%s -> %s %i", (text, ability, bonus) => {
    expect(listedSaveBonus({ saving_throws: text }, ability)).toBe(bonus);
  });
});

describe("resolveSave", () => {
  it("meets DC", () => expect(resolveSave({ d20: 8, bonus: 5, dc: 13 }).success).toBe(true));
  it("below DC", () => expect(resolveSave({ d20: 7, bonus: 5, dc: 13 }).success).toBe(false));
  // PHB 2014 "Saving Throws" / "The Natural 20": natural 1 and 20 are special on attack rolls only
  it("no nat-20 rule", () => expect(resolveSave({ d20: 20, bonus: -10, dc: 15 }).success).toBe(false));
  it("no nat-1 rule", () => expect(resolveSave({ d20: 1, bonus: 20, dc: 15 }).success).toBe(true));
  it("auto fail wins", () => expect(resolveSave({ d20: 20, bonus: 20, dc: 5, autoFail: true }).success).toBe(false));
  it("penalty", () => expect(resolveSave({ d20: 10, bonus: 3, dc: 13, penalty: -2 }).success).toBe(false));
});

describe("saveBonusFromStatBlock", () => {
  const block = { str: 10, dex: 14, con: 8, int: 10, wis: 10, cha: 10 };
  it("uses listed bonus", () => {
    expect(saveBonusFromStatBlock({ ...block, saving_throws: "Dex +6, Con +9, Wis +5, Cha +8" }, "con")).toBe(9);
  });
  it("falls back to modifier", () => {
    expect(saveBonusFromStatBlock({ ...block, saving_throws: "Con +5" }, "dex")).toBe(2);
    expect(saveBonusFromStatBlock(block, "con")).toBe(-1);
  });
  it("rounds the modifier of an odd score below 10 down, so 9 is -1", () => {
    expect(saveBonusFromStatBlock({ ...block, con: 9 }, "con")).toBe(-1);
  });
});

describe("listedSaveBonus", () => {
  it("returns the printed bonus, even when it equals the plain modifier", () => {
    expect(listedSaveBonus({ saving_throws: "Con +2, Wis +3" }, "con")).toBe(2);
  });
  it("is null for an ability the stat block does not list", () => {
    expect(listedSaveBonus({ saving_throws: "Con +2" }, "dex")).toBeNull();
    expect(listedSaveBonus({}, "dex")).toBeNull();
  });
});
