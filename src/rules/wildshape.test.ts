import { describe, it, expect } from "vitest";
import { wildshapeMaxCr, wildshapeCrDisplay, isEligibleWildshapeForm } from "@/rules/wildshape";
import type { Monster } from "@/types/monster.types";

function beast(overrides: Partial<Monster["stat_block"]> & { monster_type?: Monster["monster_type"] } = {}): Monster {
  const { monster_type = "beast", ...statOverrides } = overrides;
  return {
    id: "m1",
    user_id: "u1",
    name: "Test Beast",
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
    created_at: "",
    updated_at: "",
  };
}

describe("wildshapeMaxCr", () => {
  it("uses level/2 for base circles, floored to nearest 1/2, min 1/8", () => {
    expect(wildshapeMaxCr(1, false)).toBe(0.125);
    expect(wildshapeMaxCr(2, false)).toBe(0.5);
    expect(wildshapeMaxCr(4, false)).toBe(1);
    expect(wildshapeMaxCr(8, false)).toBe(2);
  });

  it("uses the faster level/3 progression for Circle of the Moon, min 1", () => {
    expect(wildshapeMaxCr(2, true)).toBe(1);
    expect(wildshapeMaxCr(6, true)).toBe(2);
    expect(wildshapeMaxCr(9, true)).toBe(3);
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

describe("isEligibleWildshapeForm", () => {
  it("accepts a beast within the CR cap", () => {
    expect(isEligibleWildshapeForm(beast({ challenge_rating: "1/4" }), 4, 1)).toBe(true);
  });

  it("rejects non-beasts", () => {
    expect(isEligibleWildshapeForm(beast({ monster_type: "dragon" }), 4, 1)).toBe(false);
  });

  it("rejects beasts above the CR cap", () => {
    expect(isEligibleWildshapeForm(beast({ challenge_rating: "2" }), 4, 1)).toBe(false);
  });

  it("rejects fly/swim speeds below level 8", () => {
    expect(isEligibleWildshapeForm(beast({ speed: "10 ft., fly 60 ft." }), 4, 1)).toBe(false);
    expect(isEligibleWildshapeForm(beast({ speed: "0 ft., swim 40 ft." }), 4, 1)).toBe(false);
  });

  it("allows fly/swim speeds at level 8 and above", () => {
    expect(isEligibleWildshapeForm(beast({ speed: "10 ft., fly 60 ft." }), 8, 2)).toBe(true);
  });
});
