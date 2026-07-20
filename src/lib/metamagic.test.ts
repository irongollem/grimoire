import { describe, expect, it } from "vitest";
import { metamagicCostLabel, toMetamagicOption, type MetamagicOptionRow } from "./metamagic";

const row = (overrides: Partial<MetamagicOptionRow> = {}): MetamagicOptionRow => ({
  ruleset: "2014",
  name: "Subtle Spell",
  sp_cost: 1,
  cost_scaling: "fixed",
  post_roll: false,
  description: "Cast without components.",
  sort_order: 1,
  ...overrides,
});

describe("metamagic option mapping", () => {
  it("renders fixed costs as plain numbers", () => {
    expect(metamagicCostLabel(row({ sp_cost: 3 }))).toBe("3");
  });

  it("renders spell-level scaling costs with the minimum", () => {
    expect(metamagicCostLabel(row({ sp_cost: 1, cost_scaling: "spell_level" }))).toBe("1+ (spell level)");
  });

  it("preserves identity and post-roll classification", () => {
    const option = toMetamagicOption(row({ name: "Seeking Spell", sp_cost: 2, post_roll: true }));
    expect(option).toEqual({
      name: "Seeking Spell",
      sp_cost: "2",
      description: "Cast without components.",
      post_roll: true,
    });
  });
});
