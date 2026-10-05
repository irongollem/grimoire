import { describe, expect, it } from "vitest";
import type { ClassFeature } from "@/types/feature.types";
import type { GrantedFeature } from "./characterFeatures";
import { parseMechanics } from "./mechanics";
import type { FeatureMechanics } from "./mechanics.types";
import {
  abilityDeltaFor,
  applyAbilityScoreIncreases,
  applyLevelChoices,
  choicesDue,
  optionsFor,
  revertAbilityScoreIncreases,
  revertLevelChoices,
  swapsOffered,
  type LevelChoiceRecord,
  type OptionContext,
} from "./levelUpChoices";

function feat(id: string, name: string, extra: Partial<ClassFeature> = {}): ClassFeature {
  return { id, name, kind: "feat", mechanics: {}, ruleset: "2024", feat_category: "general", repeatable: false, prerequisites: null, ability_increase: null, ...extra } as unknown as ClassFeature;
}
function granted(id: string, name: string, mechanics: FeatureMechanics, className: string, levelsGained: number[], classLevel: number, key?: string): GrantedFeature {
  const feature = { id, name, kind: "feature", mechanics, conceptual_key: key ?? null } as unknown as ClassFeature;
  return { feature, mechanics: parseMechanics(mechanics).mechanics, grant: { kind: "class", className, subclassName: null, classLevel, levelsGained }, scalingValue: null };
}

const invocations = granted("inv", "Eldritch Invocations", {
  choices: [{ key: "eldritch_invocations", label: "Invocations", pick: { kind: "option", set: "eldritch_invocation" }, count: { kind: "known", values: { "2": 2, "5": 3, "7": 4 } }, replace_on_level_up: true }],
}, "Warlock", [2], 5);
const expertise = (levels: number[], lvl: number) => granted("exp", "Expertise", {
  choices: [{ key: "expertise", label: "Expertise", pick: { kind: "expertise", thieves_tools: true }, count: { kind: "per_grant", amount: 2 }, replace_on_level_up: false }],
}, "Rogue", levels, lvl);
const asi = (levels: number[], lvl: number, className = "Fighter") => granted("asi", "Ability Score Improvement", {
  choices: [{ key: "asi", label: "ASI", pick: { kind: "asi_or_feat" }, count: { kind: "per_grant", amount: 1 }, replace_on_level_up: false }],
}, className, levels, lvl);

const base = { characterLevelAfter: 5, classChoices: {} };

describe("choicesDue", () => {
  it("Warlock 4 to 5 owes one invocation and may replace one", () => {
    const due = choicesDue({ ...base, granted: [invocations], className: "Warlock", fromLevel: 4, toLevel: 5, classChoices: { eldritch_invocations: ["A", "B"] } });
    expect(due).toHaveLength(1);
    expect(due[0]).toMatchObject({ picks: 1, replaceAllowed: true, existing: ["A", "B"] });
  });

  it("offers replace-only when the known total did not change", () => {
    const due = choicesDue({ ...base, granted: [invocations], className: "Warlock", fromLevel: 5, toLevel: 6, classChoices: { eldritch_invocations: ["A", "B", "C"] } });
    expect(due).toMatchObject([{ picks: 0, replaceAllowed: true }]);
  });

  it("Rogue owes 2 expertise at creation and 2 more at 6", () => {
    expect(choicesDue({ ...base, granted: [expertise([1], 1)], className: "Rogue", fromLevel: 0, toLevel: 1, characterLevelAfter: 1 })[0].picks).toBe(2);
    expect(choicesDue({ ...base, granted: [expertise([1, 6], 6)], className: "Rogue", fromLevel: 5, toLevel: 6, characterLevelAfter: 6 })[0].picks).toBe(2);
  });

  it("owes nothing when the class did not level or another class levelled", () => {
    expect(choicesDue({ ...base, granted: [expertise([1], 5)], className: "Rogue", fromLevel: 5, toLevel: 5 })).toEqual([]);
    expect(choicesDue({ ...base, granted: [expertise([1, 6], 6)], className: "Fighter", fromLevel: 5, toLevel: 6 })).toEqual([]);
  });

  it("Fighter 3 to 4 owes one asi_or_feat; 2024 Fighter 18 to 19 owes one epic boon", () => {
    expect(choicesDue({ ...base, granted: [asi([4], 4)], className: "Fighter", fromLevel: 3, toLevel: 4 })[0].picks).toBe(1);
    const boon = granted("boon", "Epic Boon", {
      choices: [{ key: "epic_boon", label: "Epic Boon", pick: { kind: "feat", categories: ["epic_boon"] }, count: { kind: "per_grant", amount: 1 }, replace_on_level_up: false }],
    }, "Fighter", [19], 19);
    const due = choicesDue({ ...base, granted: [boon], className: "Fighter", fromLevel: 18, toLevel: 19, characterLevelAfter: 19 });
    expect(due).toMatchObject([{ picks: 1, choice: { pick: { kind: "feat" } } }]);
  });

  it("asks a feat's own choice the level it is taken, reading a legacy string as a pick", () => {
    const skilled: GrantedFeature = {
      feature: feat("skilled", "Skilled"),
      mechanics: { choices: [{ key: "skilled", label: "Skills", pick: { kind: "skill", from: [] }, count: { kind: "per_grant", amount: 3 }, replace_on_level_up: false }] },
      grant: { kind: "feat", via: "level", atLevel: 4 },
      scalingValue: null,
    };
    const due = choicesDue({ granted: [skilled], className: "Fighter", fromLevel: 3, toLevel: 4, characterLevelAfter: 4, classChoices: { skilled: "stealth" } });
    expect(due).toMatchObject([{ picks: 3, existing: ["stealth"] }]);
    expect(choicesDue({ granted: [skilled], className: "Fighter", fromLevel: 4, toLevel: 5, characterLevelAfter: 5, classChoices: {} })).toEqual([]);
  });
});

const scores = { str: 12, dex: 12, con: 10, int: 10, wis: 10, cha: 10 };
const ctx = (over: Partial<OptionContext> = {}): OptionContext => ({
  ruleset: "2024", className: "Fighter", classLevel: 4, characterLevel: 4, abilityScores: scores, skills: {},
  canCastSpells: false, armorProficiencies: new Set(), hasFightingStyleFeature: false, existing: [], takenFeatIds: [],
  feats: [], metamagic: [], wildShapeForms: [], masteryWeapons: [], ...over,
});

describe("optionsFor", () => {
  it("a Paladin's 2014 fighting styles exclude Archery", () => {
    const names = optionsFor({ kind: "option", set: "fighting_style" }, ctx({ ruleset: "2014", className: "Paladin" })).map((o) => o.value);
    expect(names).toEqual(["Defense", "Dueling", "Great Weapon Fighting", "Protection"]);
  });

  it("Grappler 2024 is unavailable at Str 12 Dex 12 with the book's wording", () => {
    const grappler = feat("g", "Grappler", { prerequisites: { abilities: { any_of: { str: 13, dex: 13 } } } });
    const [o] = optionsFor({ kind: "feat", categories: ["general"] }, ctx({ feats: [grappler] }));
    expect(o.unavailable).toBe("Strength or Dexterity 13");
    const [ok] = optionsFor({ kind: "feat", categories: ["general"] }, ctx({ feats: [grappler], abilityScores: { ...scores, str: 13 } }));
    expect(ok.unavailable).toBeNull();
  });

  it("a non-repeatable feat already taken is unavailable; a repeatable one is not; other editions and categories drop out", () => {
    const feats = [feat("a", "Alert"), feat("t", "Tough", { repeatable: true }), feat("o", "Old", { ruleset: "2014" }), feat("e", "Boon", { feat_category: "epic_boon" })];
    const out = optionsFor({ kind: "feat", categories: ["general"] }, ctx({ feats, takenFeatIds: ["a", "t"] }));
    expect(out.map((o) => [o.value, o.unavailable])).toEqual([["a", "Already taken"], ["t", null]]);
  });

  it("expertise lists proficient, not-yet-expert skills plus Thieves' Tools", () => {
    const out = optionsFor({ kind: "expertise", thieves_tools: true }, ctx({ skills: { stealth: "proficient", arcana: "expertise", history: "none" } }));
    expect(out.map((o) => o.value)).toEqual(["stealth", "thieves_tools"]);
  });

  it("skills exclude proficiencies already held; chosen values are marked", () => {
    const out = optionsFor({ kind: "skill", from: ["stealth", "arcana"] }, ctx({ skills: { arcana: "proficient" } }));
    expect(out.map((o) => o.value)).toEqual(["stealth"]);
    const marked = optionsFor({ kind: "option", set: "favored_terrain" }, ctx({ ruleset: "2014", existing: ["Coast"] }));
    expect(marked.find((o) => o.value === "Coast")?.unavailable).toBe("Already chosen");
  });

  it("invocations respect the class level and a checkable pact", () => {
    const out = optionsFor({ kind: "option", set: "eldritch_invocation" }, ctx({ classLevel: 9, pactBoon: "Pact of the Tome" }));
    const blade = out.find((o) => o.unavailable === "Pact of the Blade");
    expect(blade).toBeDefined();
    expect(out.find((o) => o.value === "Agonizing Blast")?.unavailable).toBeNull();
    expect(out.some((o) => o.unavailable?.startsWith("Level"))).toBe(true);
  });

  it("asi_or_feat is not an option list", () => {
    expect(optionsFor({ kind: "asi_or_feat" }, ctx())).toEqual([]);
  });
});

describe("level records", () => {
  const record: LevelChoiceRecord = {
    choices: { eldritch_invocations: { added: ["D", "E"], removed: ["B"] }, expertise: { added: ["stealth"], removed: [] } },
    abilityIncreases: { str: 2 },
    feats: ["tough"],
    swaps: { primeval_awareness: "natural" },
  };

  it("apply then revert restores class_choices exactly", () => {
    const before = { eldritch_invocations: ["A", "B", "C"], feats: ["alert"], feature_swaps: { other: "x" }, unrelated: 1 };
    const applied = applyLevelChoices(before, record);
    expect(applied.eldritch_invocations).toEqual(["A", "D", "C", "E"]);
    expect(applied.feats).toEqual(["alert", "tough"]);
    expect(applied.feature_swaps).toEqual({ other: "x", primeval_awareness: "natural" });
    expect(before.eldritch_invocations).toEqual(["A", "B", "C"]);
    expect(revertLevelChoices(applied, record)).toEqual(before);
  });

  it("round-trips from empty choices, removing the keys it created", () => {
    const empty = {};
    // From nothing a record can only add (there is no earlier pick to give up), so
    // the round trip uses the additions-only part, applied and reverted alike.
    const additions: LevelChoiceRecord = { ...record, choices: { expertise: record.choices.expertise } };
    expect(revertLevelChoices(applyLevelChoices(empty, additions), additions)).toEqual({});
    const only: LevelChoiceRecord = { choices: {}, abilityIncreases: {}, feats: ["tough"], swaps: { k: "v" } };
    expect(revertLevelChoices(applyLevelChoices(empty, only), only)).toEqual({});
  });

  it("ability increases revert exactly, with the capped delta taken from the feat", () => {
    const f = feat("x", "Boon", { ability_increase: { abilities: ["str", "dex"], amount: 1, split: false, max: 20 } });
    const s = { ...scores, str: 20 };
    expect(abilityDeltaFor(s, f, { primary: "str" })).toEqual({});
    const delta = abilityDeltaFor(s, f, { primary: "dex" });
    expect(delta).toEqual({ dex: 1 });
    expect(revertAbilityScoreIncreases(applyAbilityScoreIncreases(s, delta), delta)).toEqual(s);
  });
});

describe("swapsOffered", () => {
  const natural = { id: "natural", name: "Primal Awareness", kind: "feature", mechanics: { replaces: "primeval_awareness" } } as unknown as ClassFeature;
  const prim = granted("prim", "Primeval Awareness", {}, "Ranger", [3], 3, "primeval_awareness");
  const input = { candidates: [natural], granted: [prim], className: "Ranger", fromLevel: 2, toLevel: 3, classChoices: {}, optionalRuleOn: true };

  it("offers the swap at the level the replaced feature is gained", () => {
    expect(swapsOffered(input)).toMatchObject([{ replacedKey: "primeval_awareness", replacementId: "natural" }]);
  });
  it("offers nothing when the rule is off, already swapped, or the level passed earlier", () => {
    expect(swapsOffered({ ...input, optionalRuleOn: false })).toEqual([]);
    expect(swapsOffered({ ...input, classChoices: { feature_swaps: { primeval_awareness: "natural" } } })).toEqual([]);
    expect(swapsOffered({ ...input, fromLevel: 3, toLevel: 4 })).toEqual([]);
  });
});
