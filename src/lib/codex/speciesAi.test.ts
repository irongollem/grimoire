import { describe, expect, it } from "vitest";
import { sanitizeAbilityIncreases, sanitizeSpeed, speciesInsertFromAi } from "./speciesAi";

const raw = {
  name: "  Ashkin ",
  description: "Born of cinders.\n\nThey run warm.",
  size: "Medium",
  avg_height: "5 ft",
  avg_weight: "150 lb",
  speed: { walk: 33, fly: 400, swim: -10, bogus: 5, climb: "fast" },
  ability_score_increases: { Dexterity: 2, con: 1, luck: 5, wis: 9 },
  traits: [
    { name: "Ember Sight", description: "You see in dim light." },
    { name: "", description: "nameless" },
    { name: "Empty", description: "" },
  ],
  languages: ["Common", "common", "Ignan", ""],
  subraces: [{ name: "Cinder", description: "Ash.", traits: [{ name: "Soot", description: "Dark." }], ability_score_increases: { int: 1 } }],
  natural_armor_ac: 13,
  is_shapeshifter: true,
  tags: ["Fire", "fire", "Planar"],
};
const ctx = { ruleset: "2014" as const, campaignId: "c1" };

describe("speciesInsertFromAi", () => {
  it("keeps ASI and subraces for 2014 and validates the rest", () => {
    const s = speciesInsertFromAi(raw, ctx);
    expect(s.name).toBe("Ashkin");
    expect(s.size).toBe("medium");
    expect(s.speed).toEqual({ walk: 35, fly: 120, swim: 0 });
    expect(s.ability_score_increases).toEqual({ dex: 2, con: 1 });
    expect(s.subraces).toHaveLength(1);
    expect(s.subraces?.[0].ability_score_increases).toEqual({ int: 1 });
    expect(s.traits).toHaveLength(1);
    expect(s.languages).toEqual(["Common", "Ignan"]);
    expect(s.tags).toEqual(["fire", "planar"]);
    expect(s.natural_armor_ac).toBe(13);
    expect(s.is_shapeshifter).toBe(true);
    expect(s.source).toBe("Grimoire:AI");
    expect(s.ruleset).toBe("2014");
    expect(s.campaign_id).toBe("c1");
    expect(s.granted_spells).toEqual([]);
  });

  it("nulls ASI and subraces for 2024", () => {
    const s = speciesInsertFromAi(raw, { ruleset: "2024", campaignId: null });
    expect(s.ability_score_increases).toBeNull();
    expect(s.subraces).toBeNull();
    expect(s.ruleset).toBe("2024");
    expect(s.traits).toHaveLength(1);
  });

  it("defaults unknown enums and junk to null", () => {
    const s = speciesInsertFromAi({ name: "X", size: "gargantuan", speed: "fast", natural_armor_ac: 99 }, ctx);
    expect(s.size).toBeNull();
    expect(s.speed).toBeNull();
    expect(s.natural_armor_ac).toBeNull();
    expect(s.description).toBeNull();
    expect(s.traits).toBeNull();
  });

  it("carries provenance and the image", () => {
    const prov = { generatorType: "species_generation", provider: "p", model: "m", generatedAt: "t", edited: false };
    const s = speciesInsertFromAi({ name: "X", ai_provenance: prov }, { ...ctx, imageUrl: "u" });
    expect(s.ai_provenance).toBe(prov);
    expect(s.image_url).toBe("u");
  });
});

describe("sanitizers", () => {
  it("rounds speeds to multiples of five", () => {
    expect(sanitizeSpeed({ walk: 32 })).toEqual({ walk: 30 });
    expect(sanitizeSpeed(null)).toBeNull();
  });
  it("folds numeric bonuses into the text when a rider is present, so the editor keeps them", () => {
    expect(sanitizeAbilityIncreases({ cha: 2, description: " +1 to two others " })).toEqual({
      description: "+2 CHA, +1 to two others",
    });
    expect(sanitizeAbilityIncreases({ description: "+1 to two others" })).toEqual({ description: "+1 to two others" });
    expect(sanitizeAbilityIncreases({ dex: 2, wis: 1 })).toEqual({ dex: 2, wis: 1 });
    expect(sanitizeAbilityIncreases({})).toBeNull();
  });
});
