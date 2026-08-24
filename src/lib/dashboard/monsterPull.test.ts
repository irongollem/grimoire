import { describe, it, expect } from "vitest";
import type { Monster } from "@/types/monster.types";
import {
  CR_BANDS,
  CR_BAND_OPTIONS,
  MONSTER_PULL_TYPE_OPTIONS,
  crBandContains,
  filterMonstersForPull,
  pickMonster,
  type MonsterPullFilters,
} from "./monsterPull";

function makeMonster(overrides: Partial<Monster> & { id: string; name: string; challenge_rating?: string | null }): Monster {
  const { challenge_rating = "1", ...rest } = overrides;
  return {
    user_id: "",
    campaign_id: null,
    monster_type: "beast",
    size: "medium",
    alignment: "unaligned",
    habitat: null,
    source: null,
    tags: [],
    stat_block: {
      armor_class: 10,
      hit_points: "1d8",
      speed: "30 ft.",
      str: 10,
      dex: 10,
      con: 10,
      int: 10,
      wis: 10,
      cha: 10,
      // Cast lets each fixture set challenge_rating (including null, to model
      // a row missing the jsonb key) without fighting MonsterStatBlock's
      // honestly-wrong `string` type — see monsterDisplay.ts's docstring.
      challenge_rating: challenge_rating as string,
    },
    notes: null,
    image_url: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...rest,
  };
}

describe("CR_BAND_OPTIONS", () => {
  it("leads with 'any', then every band in ascending order", () => {
    expect(CR_BAND_OPTIONS.map((o) => o.id)).toEqual(["any", "0-4", "5-10", "11-16", "17+"]);
  });

  it("has a label for every band", () => {
    expect(CR_BAND_OPTIONS.map((o) => o.label)).toEqual([
      "Any CR", "CR 0–4", "CR 5–10", "CR 11–16", "CR 17+",
    ]);
  });
});

describe("MONSTER_PULL_TYPE_OPTIONS", () => {
  it("leads with 'all', then every monster type", () => {
    expect(MONSTER_PULL_TYPE_OPTIONS[0]).toBe("all");
    expect(MONSTER_PULL_TYPE_OPTIONS).toContain("beast");
    expect(MONSTER_PULL_TYPE_OPTIONS).toContain("undead");
    expect(MONSTER_PULL_TYPE_OPTIONS.length).toBe(1 + 14); // "all" + the 14 5e creature types
  });
});

describe("crBandContains", () => {
  it("matches everything under 'any', including an unrated monster", () => {
    expect(crBandContains("any", "5")).toBe(true);
    expect(crBandContains("any", null)).toBe(true);
    expect(crBandContains("any", undefined)).toBe(true);
    expect(crBandContains("any", "")).toBe(true);
  });

  it("never matches a numbered band for an unrated monster", () => {
    expect(crBandContains("0-4", null)).toBe(false);
    expect(crBandContains("0-4", undefined)).toBe(false);
    expect(crBandContains("0-4", "")).toBe(false);
    expect(crBandContains("0-4", "?")).toBe(false);
  });

  // The off-by-one case the task calls out by name: every band edge, both
  // the value that belongs to the band and its immediate neighbour that
  // must not.
  describe("band boundaries", () => {
    it("CR 4 is the top of 0-4, CR 5 is the bottom of 5-10", () => {
      expect(crBandContains("0-4", "4")).toBe(true);
      expect(crBandContains("5-10", "4")).toBe(false);
      expect(crBandContains("5-10", "5")).toBe(true);
      expect(crBandContains("0-4", "5")).toBe(false);
    });

    it("CR 10 is the top of 5-10, CR 11 is the bottom of 11-16", () => {
      expect(crBandContains("5-10", "10")).toBe(true);
      expect(crBandContains("11-16", "10")).toBe(false);
      expect(crBandContains("11-16", "11")).toBe(true);
      expect(crBandContains("5-10", "11")).toBe(false);
    });

    it("CR 16 is the top of 11-16, CR 17 is the bottom of 17+", () => {
      expect(crBandContains("11-16", "16")).toBe(true);
      expect(crBandContains("17+", "16")).toBe(false);
      expect(crBandContains("17+", "17")).toBe(true);
      expect(crBandContains("11-16", "17")).toBe(false);
    });

    it("CR 0 sits at the bottom of 0-4, not below every band", () => {
      expect(crBandContains("0-4", "0")).toBe(true);
    });

    it("has no top band edge — CR 30 still matches 17+", () => {
      expect(crBandContains("17+", "30")).toBe(true);
    });
  });

  // The stat block stores sub-1 CRs as fractions, not decimals — confirmed
  // against src/types/monster.types.ts:45 and every hand-authored template in
  // src/data/monsterTemplates.ts (e.g. "1/4", "1/2").
  describe("fractional CRs", () => {
    it("1/8, 1/4 and 1/2 all fall in the bottom band", () => {
      expect(crBandContains("0-4", "1/8")).toBe(true);
      expect(crBandContains("0-4", "1/4")).toBe(true);
      expect(crBandContains("0-4", "1/2")).toBe(true);
    });

    it("a fractional CR never leaks into a higher band", () => {
      expect(crBandContains("5-10", "1/2")).toBe(false);
    });
  });
});

describe("filterMonstersForPull", () => {
  it("returns nothing for an empty list", () => {
    expect(filterMonstersForPull([], { crBand: "any", type: "all" })).toEqual([]);
  });

  it("returns nothing when no monster's CR is in the requested band", () => {
    const monsters = [
      makeMonster({ id: "1", name: "Rat", challenge_rating: "0" }),
      makeMonster({ id: "2", name: "Wolf", challenge_rating: "1/4" }),
      makeMonster({ id: "3", name: "Goblin", challenge_rating: "1" }),
    ];
    expect(filterMonstersForPull(monsters, { crBand: "17+", type: "all" })).toEqual([]);
  });

  it("returns exactly the one monster whose CR is in band", () => {
    const owlbear = makeMonster({ id: "2", name: "Owlbear", challenge_rating: "12" });
    const monsters = [
      makeMonster({ id: "1", name: "Rat", challenge_rating: "0" }),
      owlbear,
      makeMonster({ id: "3", name: "Ancient dragon", challenge_rating: "22" }),
    ];
    expect(filterMonstersForPull(monsters, { crBand: "11-16", type: "all" })).toEqual([owlbear]);
  });

  it("narrows by type independently of CR band", () => {
    const monsters = [
      makeMonster({ id: "1", name: "Goblin", monster_type: "humanoid", challenge_rating: "1/4" }),
      makeMonster({ id: "2", name: "Wolf", monster_type: "beast", challenge_rating: "1/4" }),
      makeMonster({ id: "3", name: "Skeleton", monster_type: "undead", challenge_rating: "1/4" }),
    ];
    const filters: MonsterPullFilters = { crBand: "0-4", type: "undead" };
    expect(filterMonstersForPull(monsters, filters).map((m) => m.id)).toEqual(["3"]);
  });

  it("'all' type combined with a band still filters by CR", () => {
    const monsters = [
      makeMonster({ id: "1", name: "Goblin", monster_type: "humanoid", challenge_rating: "1/4" }),
      makeMonster({ id: "2", name: "Ancient dragon", monster_type: "dragon", challenge_rating: "24" }),
    ];
    expect(
      filterMonstersForPull(monsters, { crBand: "0-4", type: "all" }).map((m) => m.id),
    ).toEqual(["1"]);
  });
});

describe("pickMonster", () => {
  it("returns null for an empty pool at any index", () => {
    expect(pickMonster([], 0)).toBeNull();
    expect(pickMonster([], 3)).toBeNull();
  });

  it("returns the monster at the given index, uniformly across the whole pool", () => {
    const pool = [
      makeMonster({ id: "1", name: "Rat" }),
      makeMonster({ id: "2", name: "Goblin" }),
      makeMonster({ id: "3", name: "Owlbear" }),
      makeMonster({ id: "4", name: "Wraith" }),
      makeMonster({ id: "5", name: "Beholder" }),
    ];
    // Every index in range resolves to its own element — none dropped,
    // none duplicated, none defaulting to the first.
    pool.forEach((expected, index) => {
      expect(pickMonster(pool, index)).toBe(expected);
    });
    // The picks above collectively cover the whole pool exactly once — the
    // property that makes the draw uniform rather than biased toward one end.
    const picked = pool.map((_, index) => pickMonster(pool, index));
    expect(new Set(picked).size).toBe(pool.length);
  });
});

describe("CR_BANDS", () => {
  it("has the boundaries the tests above assume, so a drift here fails loudly", () => {
    expect(CR_BANDS.map((b) => `${b.min}-${b.max === Infinity ? "+" : b.max}`)).toEqual([
      "0-4", "5-10", "11-16", "17-+",
    ]);
  });
});
