import { describe, it, expect } from "vitest";
import {
  availableWildShapeForms,
  druidProfile,
  forgetKnownForm,
  knownFormIds,
  learnKnownForm,
  replaceKnownForm,
  wildShapeCandidateCost,
  wildShapeFormCost,
  wildShapeRules,
  wildShapeRulesFor,
  wildshapeCrDisplay,
  wildshapeStateFor,
} from "@/rules/wildshape";
import type { Monster } from "@/types/monster.types";

function beast(overrides: Partial<Monster["stat_block"]> & { monster_type?: Monster["monster_type"] } = {}, name = "Test Beast"): Monster {
  const { monster_type = "beast", ...statOverrides } = overrides;
  return {
    id: "m1",
    user_id: "u1",
    campaign_id: null,
    name,
    monster_type,
    size: "medium",
    alignment: "unaligned",
    habitat: null,
    source: null,
    tags: [],
    stat_block: {
      armor_class: 12,
      hit_points: "2d8",
      speed: "40 ft.",
      str: 10, dex: 10, con: 10, int: 2, wis: 12, cha: 6,
      challenge_rating: "1/4",
      ...statOverrides,
    },
    notes: null,
    image_url: null,
    cutout_url: null,
    created_at: "",
    updated_at: "",
  };
}

function rulesFor(edition: "2014" | "2024", druidLevel: number, isCircleOfMoon = false, wisMod = 0) {
  return wildShapeRules({ edition, druidLevel, isCircleOfMoon, wisMod });
}

describe("wildShapeRules 2014", () => {
  it("uses: none below 2, two from 2, unlimited at 20", () => {
    expect(rulesFor("2014", 1).maxUses).toBe(0);
    expect(rulesFor("2014", 2).maxUses).toBe(2);
    expect(rulesFor("2014", 19).maxUses).toBe(2);
    expect(rulesFor("2014", 20).maxUses).toBeNull();
    expect(rulesFor("2014", 2).shortRestRegain).toBe("all");
  });

  it("CR cap 1/4, 1/2, 1 with movement limits lifting at 4 (swim) and 8 (fly)", () => {
    expect(rulesFor("2014", 2).maxCr).toBe(0.25);
    expect(rulesFor("2014", 4).maxCr).toBe(0.5);
    expect(rulesFor("2014", 8).maxCr).toBe(1);
    expect(rulesFor("2014", 2)).toMatchObject({ flyAllowed: false, swimAllowed: false });
    expect(rulesFor("2014", 4)).toMatchObject({ flyAllowed: false, swimAllowed: true });
    expect(rulesFor("2014", 8)).toMatchObject({ flyAllowed: true, swimAllowed: true });
  });

  it("Circle of the Moon: CR 1 from level 2, level/3 from 6, same movement limits", () => {
    expect(rulesFor("2014", 2, true).maxCr).toBe(1);
    expect(rulesFor("2014", 6, true).maxCr).toBe(2);
    expect(rulesFor("2014", 9, true).maxCr).toBe(3);
    expect(rulesFor("2014", 2, true)).toMatchObject({ flyAllowed: false, swimAllowed: false });
  });

  it("takes the beast's HP, no temp HP, no AC floor; Moon gets bonus action, slot healing, elementals at 10", () => {
    const base = rulesFor("2014", 10);
    expect(base).toMatchObject({ hpModel: "beast", tempHpOnShape: 0, acFloor: null, knownForms: null, bonusAction: false });
    expect(base).toMatchObject({ slotHealing: false, elementalForms: false, wildResurgence: false, evergreen: false });
    const moon = rulesFor("2014", 10, true);
    expect(moon).toMatchObject({ bonusAction: true, slotHealing: true, elementalForms: true });
    expect(rulesFor("2014", 9, true).elementalForms).toBe(false);
  });

  it("lasts half the druid level in hours", () => {
    expect(rulesFor("2014", 5).durationHours).toBe(2);
    expect(rulesFor("2014", 8).durationHours).toBe(4);
  });
});

describe("wildShapeRules 2024", () => {
  it("uses: 2 at 2, 3 at 6, 4 at 17; a short rest gives one back", () => {
    expect(rulesFor("2024", 1).maxUses).toBe(0);
    expect(rulesFor("2024", 5).maxUses).toBe(2);
    expect(rulesFor("2024", 6).maxUses).toBe(3);
    expect(rulesFor("2024", 16).maxUses).toBe(3);
    expect(rulesFor("2024", 17).maxUses).toBe(4);
    expect(rulesFor("2024", 20).maxUses).toBe(4);
    expect(rulesFor("2024", 2).shortRestRegain).toBe(1);
  });

  it("swimming is always allowed, flying from 8", () => {
    expect(rulesFor("2024", 2)).toMatchObject({ flyAllowed: false, swimAllowed: true });
    expect(rulesFor("2024", 8).flyAllowed).toBe(true);
  });

  it("Known Forms: 0, 4, 6, 8", () => {
    expect(rulesFor("2024", 1).knownForms).toBe(0);
    expect(rulesFor("2024", 2).knownForms).toBe(4);
    expect(rulesFor("2024", 4).knownForms).toBe(6);
    expect(rulesFor("2024", 8).knownForms).toBe(8);
  });

  it("keeps own HP and gains temp HP equal to druid level", () => {
    expect(rulesFor("2024", 1).tempHpOnShape).toBe(0);
    expect(rulesFor("2024", 5)).toMatchObject({ hpModel: "own", tempHpOnShape: 5, acFloor: null, bonusAction: true });
  });

  it("Moon from level 3: CR level/3, temp HP 3x level, AC floor 13 + WIS", () => {
    const moon = rulesFor("2024", 6, true, 3);
    expect(moon).toMatchObject({ maxCr: 2, tempHpOnShape: 18, acFloor: 16 });
    // Level 2 is not yet a Moon druid.
    expect(rulesFor("2024", 2, true, 3)).toMatchObject({ maxCr: 0.25, tempHpOnShape: 2, acFloor: null });
  });

  it("Wild Resurgence from 5, Evergreen at 20, no slot healing or elementals", () => {
    expect(rulesFor("2024", 4).wildResurgence).toBe(false);
    expect(rulesFor("2024", 5).wildResurgence).toBe(true);
    expect(rulesFor("2024", 19).evergreen).toBe(false);
    expect(rulesFor("2024", 20).evergreen).toBe(true);
    expect(rulesFor("2024", 12, true)).toMatchObject({ slotHealing: false, elementalForms: false });
  });
});

describe("wildshapeCrDisplay", () => {
  it("renders fractional CRs as fractions and integers as-is", () => {
    expect(wildshapeCrDisplay(0.125)).toBe("1/8");
    expect(wildshapeCrDisplay(0.25)).toBe("1/4");
    expect(wildshapeCrDisplay(0.5)).toBe("1/2");
    expect(wildshapeCrDisplay(3)).toBe("3");
  });
});

describe("wildShapeFormCost", () => {
  const r2014 = rulesFor("2014", 8);
  const named = (name: string, cr = "5") => beast({ challenge_rating: cr, monster_type: "elemental" as Monster["monster_type"] }, name);

  it("costs 1 for a beast within the CR cap", () => {
    expect(wildShapeFormCost(beast({ challenge_rating: "1/4" }), r2014)).toBe(1);
  });

  it("rejects non-beasts and beasts above the cap", () => {
    expect(wildShapeFormCost(beast({ monster_type: "dragon" }), r2014)).toBeNull();
    expect(wildShapeFormCost(beast({ challenge_rating: "2" }), r2014)).toBeNull();
  });

  it("rejects swim and fly speeds the level does not allow", () => {
    expect(wildShapeFormCost(beast({ speed: "10 ft., fly 60 ft." }), rulesFor("2014", 4))).toBeNull();
    expect(wildShapeFormCost(beast({ speed: "0 ft., swim 40 ft." }), rulesFor("2014", 2))).toBeNull();
    expect(wildShapeFormCost(beast({ speed: "10 ft., fly 60 ft." }), r2014)).toBe(1);
  });

  it("allows swimming at any level under 2024", () => {
    expect(wildShapeFormCost(beast({ speed: "0 ft., swim 40 ft." }), rulesFor("2024", 2))).toBe(1);
  });

  it("charges two uses for the four elementals under 2014 Elemental Wild Shape only", () => {
    const moon10 = rulesFor("2014", 10, true);
    expect(wildShapeFormCost(named("Fire Elemental"), moon10)).toBe(2);
    expect(wildShapeFormCost(named("water elemental"), moon10)).toBe(2);
    expect(wildShapeFormCost(named("Dust Mephit"), moon10)).toBeNull();
    expect(wildShapeFormCost(named("Fire Elemental"), rulesFor("2014", 10, false))).toBeNull();
    expect(wildShapeFormCost(named("Fire Elemental"), rulesFor("2024", 12, true))).toBeNull();
  });
});

describe("wildshapeStateFor", () => {
  const wolf = { ...beast({ armor_class: 13, hit_points: "2d8+2" }), id: "wolf", name: "Wolf" };

  it("2014: takes the beast's HP pool and AC", () => {
    const out = wildshapeStateFor(wolf, rulesFor("2014", 4));
    expect(out?.usesCost).toBe(1);
    expect(out?.tempHp).toBe(0);
    expect(out?.form.beast_hp).toBe(out?.form.beast_max_hp);
    expect(out?.form.beast_hp).not.toBeNull();
    expect(out?.form.beast_ac).toBe("13");
  });

  it("2024: no beast pool, temp HP from the rules", () => {
    const out = wildshapeStateFor(wolf, rulesFor("2024", 5));
    expect(out?.form).toMatchObject({ beast_hp: null, beast_max_hp: null, beast_ac: "13" });
    expect(out?.tempHp).toBe(5);
  });

  it("2024 Moon: AC floor replaces a lower beast AC but never a higher one", () => {
    const moon = rulesFor("2024", 6, true, 4); // floor 17
    expect(wildshapeStateFor(wolf, moon)?.form.beast_ac).toBe("17");
    const armoured = { ...wolf, stat_block: { ...wolf.stat_block, armor_class: 18 } };
    expect(wildshapeStateFor(armoured, moon)?.form.beast_ac).toBe("18");
  });

  it("is null without a stat block or for an illegal form", () => {
    expect(wildshapeStateFor({ ...wolf, stat_block: null as unknown as Monster["stat_block"] }, rulesFor("2014", 4))).toBeNull();
    expect(wildshapeStateFor({ ...wolf, monster_type: "dragon" }, rulesFor("2014", 4))).toBeNull();
  });
});

describe("knownFormIds", () => {
  it("reads the stored ids and ignores anything else", () => {
    expect(knownFormIds({ wild_shape_known_forms: ["a", "b", 3] })).toEqual(["a", "b"]);
    expect(knownFormIds({ wild_shape_known_forms: "nope" })).toEqual([]);
    expect(knownFormIds(null)).toEqual([]);
  });
});

describe("availableWildShapeForms", () => {
  const mk = (id: string, cr: string) => ({ ...beast({ challenge_rating: cr }), id });
  const monsters = [mk("bear", "1/2"), mk("wolf", "1/4"), mk("rat", "0")];
  const none = new Set<string>();

  it("2014: discovered or pinned, sorted by CR", () => {
    const out = availableWildShapeForms({
      monsters,
      rules: rulesFor("2014", 4),
      discoveredIds: new Set(["bear"]),
      pinnedIds: new Set(["wolf"]),
      knownIds: new Set(["rat"]),
    });
    expect(out.map((f) => f.monster.id)).toEqual(["wolf", "bear"]);
  });

  it("2024: known or pinned, discovery alone is not enough", () => {
    const out = availableWildShapeForms({
      monsters,
      rules: rulesFor("2024", 4),
      discoveredIds: new Set(["bear"]),
      pinnedIds: new Set(["wolf"]),
      knownIds: new Set(["rat"]),
    });
    expect(out.map((f) => f.monster.id)).toEqual(["rat", "wolf"]);
  });

  it("drops forms that are not legal at this level", () => {
    const out = availableWildShapeForms({
      monsters,
      rules: rulesFor("2014", 2),
      discoveredIds: new Set(["bear", "wolf"]),
      pinnedIds: none,
      knownIds: none,
    });
    expect(out.map((f) => f.monster.id)).toEqual(["wolf"]);
  });
});

describe("druidProfile", () => {
  it("reads a single-class druid from its class row", () => {
    expect(
      druidProfile([{ class_name: "Druid", subclass_name: "Circle of the Moon", levels: 4 }]),
    ).toEqual({ isDruid: true, druidLevel: 4, isCircleOfMoon: true });
  });

  it("finds Druid taken as a second class, and uses its class level rather than the total", () => {
    expect(
      druidProfile([
        { class_name: "Fighter", subclass_name: "Champion", levels: 6 },
        { class_name: "Druid", subclass_name: "Circle of the Land", levels: 2 },
      ]),
    ).toEqual({ isDruid: true, druidLevel: 2, isCircleOfMoon: false });
  });

  it("is not a druid for any other class, or with no class at all", () => {
    expect(druidProfile([{ class_name: "Rogue", subclass_name: null, levels: 4 }])).toEqual({
      isDruid: false,
      druidLevel: 0,
      isCircleOfMoon: false,
    });
    expect(druidProfile([])).toEqual({ isDruid: false, druidLevel: 0, isCircleOfMoon: false });
  });
});

describe("Known Forms roster helpers", () => {
  it("learns a form until the roster is full, and never twice", () => {
    expect(learnKnownForm(["a"], "b", 4)).toEqual(["a", "b"]);
    expect(learnKnownForm(["a"], "a", 4)).toEqual(["a"]);
    expect(learnKnownForm(["a", "b"], "c", 2)).toEqual(["a", "b"]);
  });

  it("replaces a form in place, and refuses a missing or duplicate target", () => {
    expect(replaceKnownForm(["a", "b"], "a", "c")).toEqual(["c", "b"]);
    expect(replaceKnownForm(["a", "b"], "x", "c")).toEqual(["a", "b"]);
    expect(replaceKnownForm(["a", "b"], "a", "b")).toEqual(["a", "b"]);
  });

  it("forgets a form", () => {
    expect(forgetKnownForm(["a", "b"], "a")).toEqual(["b"]);
  });
});

describe("wildShapeRulesFor", () => {
  it("reads the druid level from the class rows and the Wisdom modifier from the row", () => {
    const rules = wildShapeRulesFor(
      { wis: 16 },
      [
        { class_name: "Fighter", subclass_name: null, levels: 6 },
        { class_name: "Druid", subclass_name: "Circle of the Moon", levels: 3 },
      ],
      "2024",
    );
    // Druid 3, Moon: CR 1, 3 x 3 temp HP, AC at least 13 + 3.
    expect(rules).toMatchObject({ maxCr: 1, tempHpOnShape: 9, acFloor: 16, maxUses: 2 });
  });
});

describe("wildShapeCandidateCost", () => {
  const candidate = (over: Partial<Parameters<typeof wildShapeCandidateCost>[0]> = {}) => ({
    name: "Wolf", monster_type: "beast", challenge_rating: "1/4", speed: "40 ft.", ...over,
  });

  it("judges a beast from the lifted index fields exactly as the stat-block form does", () => {
    const r2014 = rulesFor("2014", 8);
    expect(wildShapeCandidateCost(candidate(), r2014)).toBe(1);
    expect(wildShapeCandidateCost(candidate({ challenge_rating: "2" }), r2014)).toBeNull();
    expect(wildShapeCandidateCost(candidate({ speed: "10 ft., fly 60 ft." }), rulesFor("2014", 4))).toBeNull();
    expect(wildShapeCandidateCost(candidate({ speed: "0 ft., swim 40 ft." }), rulesFor("2014", 2))).toBeNull();
    expect(wildShapeCandidateCost(candidate({ monster_type: "dragon" }), r2014)).toBeNull();
  });

  it("treats a missing rating or speed as 0 and no speed limit", () => {
    expect(wildShapeCandidateCost(candidate({ challenge_rating: null, speed: null }), rulesFor("2014", 2))).toBe(1);
  });

  it("prices an elemental at 2 only under Elemental Wild Shape", () => {
    const moon10 = rulesFor("2014", 10, true);
    expect(wildShapeCandidateCost(candidate({ name: "Fire Elemental", monster_type: "elemental" }), moon10)).toBe(2);
  });
});
