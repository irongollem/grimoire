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

describe.each([
  { ruleset: "2014" as const, heightened: "3", seeking: "2", subtleMaterial: false },
  { ruleset: "2024" as const, heightened: "2", seeking: "1", subtleMaterial: true },
])("$ruleset focused Metamagic options", ({ ruleset, heightened, seeking, subtleMaterial }) => {
  const options = getMetamagicMap(ruleset);

  it("Twinned enforces the edition-specific target rule", () => {
    const eligible = ruleset === "2014"
      ? spell({ range: "60 ft.", target_description: "1 creature", higher_levels: null })
      : spell({ higher_levels: "target one additional creature" });
    const ineligible = ruleset === "2014"
      ? spell({ range: "Self", target_description: "1 creature" })
      : spell({ higher_levels: "damage increases by 1d6" });
    expect(isMetamagicEligible(options.get("Twinned Spell")!, eligible, ruleset)).toBe(true);
    expect(isMetamagicEligible(options.get("Twinned Spell")!, ineligible, ruleset)).toBe(false);
  });

  it("Quickened requires an Action and costs 2 SP", () => {
    expect(options.get("Quickened Spell")?.sp_cost).toBe("2");
    expect(isMetamagicEligible(options.get("Quickened Spell")!, spell(), ruleset)).toBe(true);
    expect(isMetamagicEligible(options.get("Quickened Spell")!, spell({ casting_time: "Bonus Action" }), ruleset)).toBe(false);
  });

  it("Subtle retains the edition-correct component exception", () => {
    const reminder = metamagicReminders(["Subtle Spell"], ruleset).join(" ");
    expect(options.get("Subtle Spell")?.sp_cost).toBe("1");
    expect(reminder.includes("material components")).toBe(subtleMaterial);
  });

  it("Heightened uses the correct cost and save duration", () => {
    expect(options.get("Heightened Spell")?.sp_cost).toBe(heightened);
    expect(isMetamagicEligible(options.get("Heightened Spell")!, spell(), ruleset)).toBe(true);
    expect(metamagicReminders(["Heightened Spell"], ruleset).join(" "))
      .toContain(ruleset === "2024" ? "all saves" : "first save");
  });

  it("Empowered is damage-only and remains a post-roll exception", () => {
    expect(options.get("Empowered Spell")?.sp_cost).toBe("1");
    expect(isMetamagicEligible(options.get("Empowered Spell")!, spell(), ruleset)).toBe(true);
    expect(isMetamagicEligible(options.get("Empowered Spell")!, spell({ damage_rolls: null }), ruleset)).toBe(false);
    expect(options.get("Empowered Spell")?.description).toContain("already used a different Metamagic");
  });

  it("Seeking is attack-only, post-roll, and edition-priced", () => {
    expect(options.get("Seeking Spell")?.sp_cost).toBe(seeking);
    expect(isMetamagicEligible(options.get("Seeking Spell")!, spell({ attack_type: "ranged_spell" }), ruleset)).toBe(true);
    expect(isMetamagicEligible(options.get("Seeking Spell")!, spell({ attack_type: "save" }), ruleset)).toBe(false);
    expect(options.get("Seeking Spell")?.description).toContain("miss");
  });

  it("Transmuted accepts only the six elemental damage types", () => {
    expect(options.get("Transmuted Spell")?.sp_cost).toBe("1");
    expect(isMetamagicEligible(options.get("Transmuted Spell")!, spell({
      damage_rolls: [{ dice: "2d6", type: "lightning" }],
    }), ruleset)).toBe(true);
    expect(isMetamagicEligible(options.get("Transmuted Spell")!, spell({
      damage_rolls: [{ dice: "2d6", type: "force" }],
    }), ruleset)).toBe(false);
  });
});
