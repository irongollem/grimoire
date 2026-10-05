import { describe, expect, it } from "vitest";
import { subclassDraftFromAi, subclassFeatureLevels, subclassWithFeatureIds } from "./subclassAi";

const f = (level: number, name: string) => ({ level, name, activation: "", description: `${name} text` });

for (const ruleset of ["2014", "2024"] as const) {
  describe(`subclassDraftFromAi (${ruleset})`, () => {
    const ctx = { ruleset, campaignId: "camp", parentClassName: "Gunslinger", subclassLevel: 3 };

    it("keeps features at the parent's subclass levels and links ids", () => {
      const draft = subclassDraftFromAi(
        {
          subclass_name: "Ashblade",
          description: "Warriors of the ash.",
          features: [f(3, "A"), f(6, "B"), f(7, "Off level"), f(10, "C"), f(14, "D")],
          hp_per_level: 1,
        },
        ctx,
      );
      expect(draft.problems).toEqual([]);
      expect(draft.features.map((x) => x.level)).toEqual([3, 6, 10, 14]);
      expect(draft.base).toMatchObject({ class_name: "Gunslinger", ruleset, campaign_id: "camp", hp_per_level: 1, granted_spells: {} });
      const row = subclassWithFeatureIds(draft, ["a", "b", "c", "d"]);
      expect(row.features).toEqual({ "3": ["a"], "6": ["b"], "10": ["c"], "14": ["d"] });
    });

    it("lands a Fighter archetype on the book's levels, not the homebrew rhythm", () => {
      const draft = subclassDraftFromAi(
        {
          subclass_name: "Ashblade",
          features: [f(3, "A"), f(6, "Off level"), f(7, "B"), f(10, "C"), f(15, "D"), f(18, "E")],
        },
        { ...ctx, parentClassName: "Fighter" },
      );
      expect(draft.problems).toEqual([]);
      expect(draft.features.map((x) => x.level)).toEqual([3, 7, 10, 15, 18]);
    });

    it("reports a missing name or an empty grant level", () => {
      const draft = subclassDraftFromAi({ subclass_name: "", features: [f(6, "B")] }, ctx);
      expect(draft.problems).toHaveLength(2);
    });

    it("turns a resource into a feature with uses, on a level the archetype grants", () => {
      const draft = subclassDraftFromAi(
        {
          subclass_name: "Ashblade",
          features: [f(3, "A"), f(7, "B")],
          resources: [{ label: "Ash Charges", rest: "short", scaling: "fixed", fixed_value: 2 }],
        },
        ctx,
      );
      expect(draft.problems).toEqual([]);
      const charges = draft.features.find((x) => "insert" in x && x.insert.name === "Ash Charges");
      expect(charges?.level).toBe(3);
      expect(charges && "insert" in charges ? charges.insert.mechanics?.uses : null).toMatchObject({ key: "ash_charges", recharge: "short" });
      expect(draft.base).not.toHaveProperty("resources");
    });

    it("drops an implausible hp_per_level", () => {
      expect(subclassDraftFromAi({ subclass_name: "X", features: [f(3, "A")], hp_per_level: 9 }, ctx).base.hp_per_level).toBeNull();
    });
  });
}

describe("subclassFeatureLevels", () => {
  it("follows the book's levels for a Player's Handbook class, per edition", () => {
    expect(subclassFeatureLevels({ parentClassName: "Fighter", subclassLevel: 3, ruleset: "2014" }))
      .toEqual([3, 7, 10, 15, 18]);
    expect(subclassFeatureLevels({ parentClassName: "cleric", subclassLevel: 1, ruleset: "2014" }))
      .toEqual([1, 2, 6, 8, 17]);
    expect(subclassFeatureLevels({ parentClassName: "Cleric", subclassLevel: 3, ruleset: "2024" }))
      .toEqual([3, 6, 17]);
  });

  it("gives a homebrew parent its grant level then 6, 10, 14", () => {
    const homebrew = (subclassLevel: number) =>
      subclassFeatureLevels({ parentClassName: "Gunslinger", subclassLevel, ruleset: "2014" });
    expect(homebrew(3)).toEqual([3, 6, 10, 14]);
    expect(homebrew(1)).toEqual([1, 6, 10, 14]);
    expect(homebrew(6)).toEqual([6, 10, 14]);
  });
});
