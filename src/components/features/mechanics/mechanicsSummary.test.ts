import { describe, expect, it } from "vitest";
import type { ChoicePick } from "@/rules/features/mechanics.types";
import { describeAbilityIncrease, describeAmount, describePrerequisites, summarizeMechanics } from "./mechanicsSummary";

describe("describeAmount", () => {
  it("reads each kind as a short phrase", () => {
    expect(describeAmount({ kind: "fixed", value: 3 })).toBe("3");
    expect(describeAmount({ kind: "by_level", values: { "9": 4, "1": 2 } })).toBe("2 from level 1, 4 from level 9");
    expect(describeAmount({ kind: "ability_mod", ability: "cha", min: 1 })).toBe("CHA modifier, at least 1");
    expect(describeAmount({ kind: "class_level", multiplier: 5 })).toBe("5 x class level");
    expect(describeAmount({ kind: "unlimited_from", level: 20, below: { kind: "proficiency" } }))
      .toBe("Unlimited from level 20, otherwise Proficiency bonus");
  });
});

describe("summarizeMechanics", () => {
  it("is empty for a passive feature with no mechanics", () => {
    expect(summarizeMechanics({})).toEqual([]);
  });

  it("lists uses, recharge and a level table", () => {
    const groups = summarizeMechanics({
      activation: "bonus_action",
      uses: { key: "rage", label: "Rage", amount: { kind: "fixed", value: 2 }, recharge: "long", short_rest_regain: 1, pool: false },
      scaling: { label: "Rage Damage", values: { "9": "+3", "1": "+2" } },
    });
    expect(groups.map((g) => g.heading)).toEqual(["Takes", "Uses", "Rage Damage"]);
    expect(groups[1]?.lines).toEqual(["Rage: 2", "Comes back on a long rest; a short rest gives back 1"]);
    expect(groups[2]?.lines).toEqual(["Level 1: +2", "Level 9: +3"]);
  });
});

describe("feat summaries", () => {
  it("describes prerequisites and an ability increase", () => {
    expect(describePrerequisites(null)).toEqual([]);
    expect(describePrerequisites({ level: 4, abilities: { any_of: { str: 13, dex: 13 } }, spellcasting: true })).toEqual([
      "Character level 4 or higher",
      "STR 13 or DEX 13 or higher",
      "Can cast at least one spell",
    ]);
    expect(describeAbilityIncrease({ abilities: ["str", "dex"], amount: 1, split: false, max: 20 })).toBe("+1 to one of STR, DEX (maximum 20)");
    expect(describeAbilityIncrease(null)).toBeNull();
  });
});

describe("spell picks and grants", () => {
  const choice = (pick: ChoicePick) => ({ key: "k", label: "Spells", pick, count: { kind: "per_grant", amount: 2 } as const, replace_on_level_up: false });
  it("describes cantrips and a free-cast levelled spell", () => {
    const groups = summarizeMechanics({
      choices: [
        choice({ kind: "spell", lists: ["Wizard"], level: 0, free_cast: false }),
        choice({ kind: "spell", lists: ["Cleric", "Druid", "Wizard"], level: 1, free_cast: true }),
      ],
    });
    expect(groups[0].lines).toEqual([
      "Spells: cantrips from the Wizard list, 2 each time",
      "Spells: 1st-level spells from the Cleric, Druid or Wizard lists, castable once per long rest without a slot, 2 each time",
    ]);
  });
  it("lists fixed grants", () => {
    expect(summarizeMechanics({ grants: { skills: ["arcana"], tools: ["Thieves' Tools"], languages: ["Elvish"] } })).toEqual([
      { heading: "Proficiency", lines: ["Skills: arcana", "Tools: Thieves' Tools", "Languages: Elvish"] },
    ]);
  });
});

describe("describeEffect", () => {
  it("summarises a save with damage by level", () => {
    const groups = summarizeMechanics({
      effect: {
        kind: "save",
        save: { ability: "con", dc_ability: "cha", success: "none" },
        dice: { "10": "2d6", "3": "1d6" },
        damage_type: "thunder",
        add: [{ kind: "proficiency" }],
      },
    });
    expect(groups).toEqual([
      {
        heading: "Rolls",
        lines: [
          "CON saving throw against 8 + proficiency + CHA modifier, no damage on a success",
          "Deals 1d6 from level 3, 2d6 from level 10 thunder, plus proficiency bonus",
        ],
      },
    ]);
  });

  it("summarises an attack with the class's spell bonus, and an effect on a sub-action", () => {
    const groups = summarizeMechanics({
      actions: [
        {
          name: "Force Ballista",
          activation: "action",
          effect: { kind: "attack", attack: { delivery: "ranged", ability: "spell", range: "120 ft" }, dice: { "3": "2d8" }, damage_type: "force", area: "one target" },
        },
      ],
    });
    expect(groups[0].lines).toEqual([
      "Force Ballista (Action)",
      "Force Ballista: Ranged attack (120 ft), the class's spell attack bonus",
      "Force Ballista: Deals 2d8 from level 3 force",
      "Force Ballista: Area: one target",
    ]);
  });

  it("says healing heals", () => {
    expect(summarizeMechanics({ effect: { kind: "heal", dice: { "1": "1d8" }, add: [{ kind: "ability", ability: "wis" }] } })[0].lines)
      .toEqual(["Heals 1d8 from level 1, plus WIS modifier"]);
  });
});

describe("temporary hit points, floors and flat riders", () => {
  it("says temporary hit points and the minimum", () => {
    const lines = summarizeMechanics({ effect: { kind: "temp_hp", dice: { "1": "1d8" }, add: [{ kind: "ability", ability: "int" }], min: 1 } })[0].lines;
    expect(lines.join(" ")).toContain("Grants temporary hit points: 1d8 from level 1, plus INT modifier (minimum 1)");
  });

  it("describes a flat rider from what it adds", () => {
    const groups = summarizeMechanics({
      riders: [{ label: "Aura", dice: { kind: "flat", add: [{ kind: "ability", ability: "cha" }], min: 1 }, applies_to: "weapon", once_per_turn: false }],
    });
    expect(groups.flatMap((g) => g.lines).join(" ")).toContain("Aura: CHA modifier (minimum 1)");
  });
});
