import { afterEach, describe, expect, it, vi } from "vitest";
import { NORMAL_ROLL, rollWithRules } from "@/lib/dice/diceRules";
import { dnd5eDiceRules } from "./rules";

describe("dnd5eDiceRules", () => {
  afterEach(() => vi.restoreAllMocks());

  it("every option it offers is one its rules act on (a renamed key would silently roll normal)", () => {
    for (const option of dnd5eDiceRules.options) {
      expect(dnd5eDiceRules.combine(option.key, NORMAL_ROLL)).toBe(option.key);
      expect(dnd5eDiceRules.facesNeeded(20, 1, option.key)).toBe(2);
      vi.spyOn(Math, "random").mockReturnValueOnce(0.5).mockReturnValueOnce(0.5);
      expect(rollWithRules(dnd5eDiceRules, { 20: 1 }, 0, option.key).breakdown).toHaveLength(2);
    }
  });

  it("tags a prompt label only where the mode takes effect (a sheet pick on 2d20 claimed Adv)", () => {
    expect(dnd5eDiceRules.tagLabel("Check", "advantage", { 20: 1 })).toBe("Check (Adv)");
    expect(dnd5eDiceRules.tagLabel("Check", "advantage", { 20: 2 })).toBe("Check");
  });
});
