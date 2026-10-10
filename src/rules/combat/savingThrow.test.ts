import { describe, expect, it } from "vitest";
import { autoFailsSave, listedSaveBonus, resolveSave, saveBonusFromStatBlock, saveRollMode } from "./savingThrow.ts";

describe("autoFailsSave", () => {
  it.each([
    [["Stunned"], "dex", true],
    [["Paralyzed"], "str", true],
    [["Petrified"], "dex", true],
    [["Unconscious"], "str", true],
    [["Stunned"], "wis", false],
    [["Prone"], "dex", false],
  ] as const)("%j %s", (c, a, e) => expect(autoFailsSave([...c], a)).toBe(e));
});

describe("saveRollMode", () => {
  it("Restrained disadvantages Dex only", () => {
    expect(saveRollMode({ conditions: ["Restrained"], ability: "dex", ruleset: "2014" }).mode).toBe("disadvantage");
    expect(saveRollMode({ conditions: ["Restrained"], ability: "wis", ruleset: "2014" }).mode).toBe("normal");
  });
  it("2014 exhaustion 3 vs 2024", () => {
    expect(saveRollMode({ conditions: ["Exhausted 3"], ability: "con", ruleset: "2014" }).mode).toBe("disadvantage");
    expect(saveRollMode({ conditions: ["Exhausted 3"], ability: "con", ruleset: "2024" }).mode).toBe("normal");
  });
  it("DM advantage cancels", () => {
    expect(saveRollMode({ conditions: ["Restrained"], ability: "dex", ruleset: "2014", dmMode: "advantage" }).mode).toBe("normal");
  });
});

describe("saveRollMode stacking", () => {
  it("any advantage with any disadvantage is straight, whatever the order", () => {
    // Restrained on a Dex save (dis) + DM advantage -> straight; a further source must not flip it.
    expect(saveRollMode({ conditions: ["Restrained", "Exhausted 3"], ability: "dex", ruleset: "2014", dmMode: "advantage" }).mode).toBe("normal");
    expect(saveRollMode({ conditions: ["Restrained"], ability: "dex", ruleset: "2014", dmMode: "disadvantage" }).mode).toBe("disadvantage");
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
    ["Intelligence +7", "int", 7],
    ["Charisma+2", "cha", 2],
  ] as const)("%s -> %s %i", (text, ability, bonus) => {
    expect(listedSaveBonus({ saving_throws: text }, ability)).toBe(bonus);
  });
  it("falls through to the modifier for an ability not listed", () => {
    const block = { str: 10, dex: 14, con: 10, int: 10, wis: 10, cha: 10, saving_throws: "Constitution +6, Wisdom +4" };
    expect(saveBonusFromStatBlock(block, "con")).toBe(6);
    expect(saveBonusFromStatBlock(block, "dex")).toBe(2);
  });
});

describe("resolveSave", () => {
  it("meets DC", () => expect(resolveSave({ d20: 8, bonus: 5, dc: 13 }).success).toBe(true));
  it("below DC", () => expect(resolveSave({ d20: 7, bonus: 5, dc: 13 }).success).toBe(false));
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
  it("handles negative listed bonus", () => {
    expect(saveBonusFromStatBlock({ ...block, saving_throws: "Str -1" }, "str")).toBe(-1);
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
