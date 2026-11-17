import { describe, expect, it } from "vitest";
import { dispatchLootArgs, lootBatchLabel, lootBatchNeedsChoice } from "./lootChoice";

describe("lootBatchNeedsChoice", () => {
  it.each([
    ["an item among coins", [{ kind: "currency", label: "Purse" }, { kind: "item", label: "Key" }], true],
    ["only coins", [{ kind: "currency", label: "Purse" }], false],
    ["a chest and coins", [{ kind: "loot_chest", label: "Chest" }, { kind: "currency", label: "Purse" }], false],
    ["nothing", [], false],
  ] as const)("%s (fails if a coin- or chest-only batch asks, or an item is missed)", (_name, entries, expected) => {
    expect(lootBatchNeedsChoice([...entries])).toBe(expected);
  });
});

describe("lootBatchLabel", () => {
  it("names every entry so the DM sees what the answer covers (fails if only the first is named)", () => {
    expect(lootBatchLabel([{ kind: "item", label: "Moon key" }, { kind: "currency", label: "Hoard purse" }])).toBe("Moon key, Hoard purse");
  });
});

describe("dispatchLootArgs", () => {
  it.each([
    ["no choice", undefined, { p_roll_mode: "roll", p_give_to: null }],
    ["free", { mode: "free" } as const, { p_roll_mode: "free", p_give_to: null }],
    ["give", { mode: "give", partyMemberId: "pm-1" } as const, { p_roll_mode: "give", p_give_to: "pm-1" }],
  ])("%s (fails if the mode or the recipient is not sent)", (_name, choice, expected) => {
    expect(dispatchLootArgs(["a"], choice)).toEqual({ p_entry_ids: ["a"], ...expected });
  });
});
