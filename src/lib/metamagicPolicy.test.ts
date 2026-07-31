import { describe, expect, it } from "vitest";
import type { MetamagicOption } from "@/lib/metamagic";
import type { Spell } from "@/types/spell.types";
import { isMetamagicEligible, metamagicReminders, metamagicTargetBonus } from "@/lib/metamagicPolicy";

// Eligibility only keys on the option's identity; cost/description live in the
// metamagic_options table seed (migration 20260720000043).
const option = (name: string): MetamagicOption => ({ name, sp_cost: "1", description: "", post_roll: false });

const spell = (overrides: Partial<Spell> = {}) => ({
  name: "Test Spell", range: "60 ft.", duration: "1 minute", casting_time: "Action",
  attack_type: "save", damage_rolls: [{ dice: "2d6", type: "fire" }],
  target_description: "1 creature", higher_levels: "target one additional creature",
  ...overrides,
} as Spell);

describe.each(["2014", "2024"] as const)("%s Metamagic eligibility", (ruleset) => {
  it("checks save, attack, damage, duration, range, and action requirements", () => {
    expect(isMetamagicEligible(option("Careful Spell"), spell(), ruleset)).toBe(true);
    expect(isMetamagicEligible(option("Heightened Spell"), spell({ attack_type: "automatic" }), ruleset)).toBe(false);
    expect(isMetamagicEligible(option("Seeking Spell"), spell({ attack_type: "ranged_spell" }), ruleset)).toBe(true);
    expect(isMetamagicEligible(option("Seeking Spell"), spell(), ruleset)).toBe(false);
    expect(isMetamagicEligible(option("Empowered Spell"), spell({ damage_rolls: null }), ruleset)).toBe(false);
    expect(isMetamagicEligible(option("Transmuted Spell"), spell(), ruleset)).toBe(true);
    expect(isMetamagicEligible(option("Transmuted Spell"), spell({ damage_rolls: [{ dice: "2d6", type: "radiant" }] }), ruleset)).toBe(false);
    expect(isMetamagicEligible(option("Extended Spell"), spell({ duration: "1 Round" }), ruleset)).toBe(false);
    expect(isMetamagicEligible(option("Distant Spell"), spell({ range: "Self" }), ruleset)).toBe(false);
    expect(isMetamagicEligible(option("Quickened Spell"), spell({ casting_time: "Reaction" }), ruleset)).toBe(false);
  });

  it("Transmuted accepts only the six elemental damage types", () => {
    expect(isMetamagicEligible(option("Transmuted Spell"), spell({
      damage_rolls: [{ dice: "2d6", type: "lightning" }],
    }), ruleset)).toBe(true);
    expect(isMetamagicEligible(option("Transmuted Spell"), spell({
      damage_rolls: [{ dice: "2d6", type: "force" }],
    }), ruleset)).toBe(false);
  });
});

describe("edition-specific Metamagic effects", () => {
  it("uses the original and revised Twinned eligibility rules", () => {
    expect(isMetamagicEligible(option("Twinned Spell"), spell({ higher_levels: null }), "2014")).toBe(true);
    expect(isMetamagicEligible(option("Twinned Spell"), spell({ higher_levels: null }), "2024")).toBe(false);
    expect(isMetamagicEligible(option("Twinned Spell"), spell({ range: "Self", target_description: "1 creature" }), "2014")).toBe(false);
    expect(isMetamagicEligible(option("Twinned Spell"), spell({ higher_levels: "damage increases by 1d6" }), "2024")).toBe(false);
    expect(metamagicTargetBonus(["Twinned Spell"])).toBe(1);
  });

  it("describes the rules-relevant Careful, Heightened, Quickened, Subtle, and Extended effects", () => {
    expect(metamagicReminders(["Careful Spell", "Heightened Spell", "Quickened Spell", "Subtle Spell", "Extended Spell"], "2024")).toEqual(expect.arrayContaining([
      expect.stringContaining("no damage"), expect.stringContaining("all saves"), expect.stringContaining("Bonus Action"),
      expect.stringContaining("material components"), expect.stringContaining("Concentration"),
    ]));
    expect(metamagicReminders(["Careful Spell", "Heightened Spell", "Subtle Spell"], "2014").join(" ")).not.toContain("no damage");
    expect(metamagicReminders(["Heightened Spell"], "2014").join(" ")).toContain("first save");
    expect(metamagicReminders(["Subtle Spell"], "2014").join(" ")).not.toContain("material components");
  });
});
