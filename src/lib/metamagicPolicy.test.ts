import { describe, expect, it } from "vitest";
import { getMetamagicMap } from "@/data/metamagic";
import type { Spell } from "@/types/spell.types";
import { isMetamagicEligible, metamagicReminders, metamagicTargetBonus } from "./metamagicPolicy";

const spell = (overrides: Partial<Spell> = {}) => ({
  name: "Test Spell", range: "60 ft.", duration: "1 minute", casting_time: "Action",
  attack_type: "save", damage_rolls: [{ dice: "2d6", type: "fire" }],
  target_description: "1 creature", higher_levels: "target one additional creature",
  ...overrides,
} as Spell);

describe.each(["2014", "2024"] as const)("%s Metamagic eligibility", (ruleset) => {
  const options = getMetamagicMap(ruleset);
  it("checks save, attack, damage, duration, range, and action requirements", () => {
    expect(isMetamagicEligible(options.get("Careful Spell")!, spell(), ruleset)).toBe(true);
    expect(isMetamagicEligible(options.get("Heightened Spell")!, spell({ attack_type: "automatic" }), ruleset)).toBe(false);
    expect(isMetamagicEligible(options.get("Seeking Spell")!, spell({ attack_type: "ranged_spell" }), ruleset)).toBe(true);
    expect(isMetamagicEligible(options.get("Seeking Spell")!, spell(), ruleset)).toBe(false);
    expect(isMetamagicEligible(options.get("Empowered Spell")!, spell({ damage_rolls: null }), ruleset)).toBe(false);
    expect(isMetamagicEligible(options.get("Transmuted Spell")!, spell(), ruleset)).toBe(true);
    expect(isMetamagicEligible(options.get("Transmuted Spell")!, spell({ damage_rolls: [{ dice: "2d6", type: "radiant" }] }), ruleset)).toBe(false);
    expect(isMetamagicEligible(options.get("Extended Spell")!, spell({ duration: "1 Round" }), ruleset)).toBe(false);
    expect(isMetamagicEligible(options.get("Distant Spell")!, spell({ range: "Self" }), ruleset)).toBe(false);
    expect(isMetamagicEligible(options.get("Quickened Spell")!, spell({ casting_time: "Reaction" }), ruleset)).toBe(false);
  });
});

describe("edition-specific Metamagic effects", () => {
  it("uses the original and revised Twinned eligibility rules", () => {
    const original = getMetamagicMap("2014").get("Twinned Spell")!;
    const revised = getMetamagicMap("2024").get("Twinned Spell")!;
    expect(isMetamagicEligible(original, spell({ higher_levels: null }), "2014")).toBe(true);
    expect(isMetamagicEligible(revised, spell({ higher_levels: null }), "2024")).toBe(false);
    expect(metamagicTargetBonus(["Twinned Spell"])).toBe(1);
  });

  it("describes the rules-relevant Careful, Heightened, Quickened, Subtle, and Extended effects", () => {
    expect(metamagicReminders(["Careful Spell", "Heightened Spell", "Quickened Spell", "Subtle Spell", "Extended Spell"], "2024")).toEqual(expect.arrayContaining([
      expect.stringContaining("no damage"), expect.stringContaining("all saves"), expect.stringContaining("Bonus Action"),
      expect.stringContaining("material components"), expect.stringContaining("Concentration"),
    ]));
    expect(metamagicReminders(["Careful Spell", "Heightened Spell", "Subtle Spell"], "2014").join(" ")).not.toContain("no damage");
  });
});
