import { describe, it, expect } from "vitest";
import { queryTerms, scoreEntry, rankEntries, type MatchFields } from "@/lib/audio/soundSearch";

const SOUNDS: (MatchFields & { id: string })[] = [
  { id: "rain", name: "Rain", tags: ["weather", "outdoor"], secondary: null },
  { id: "rain-roof", name: "Rain on a tin roof", tags: ["weather"], secondary: "Vindsvept" },
  { id: "thunder", name: "Thunderclap", tags: ["weather", "storm"], secondary: null },
  { id: "tavern", name: "Busy tavern", tags: ["interior", "crowd"], secondary: "Tabletop Audio" },
  { id: "door", name: "Heavy door creak", tags: ["dungeon"], secondary: null },
];

function fields(entry: MatchFields & { id: string }): MatchFields {
  return entry;
}

describe("queryTerms", () => {
  it("splits on whitespace and normalises", () => {
    expect(queryTerms("  Rain   ROOF ")).toEqual(["rain", "roof"]);
  });

  it("returns nothing for an empty query", () => {
    expect(queryTerms("   ")).toEqual([]);
  });
});

describe("scoreEntry", () => {
  it("matches everything at zero when the query is empty", () => {
    expect(scoreEntry("", { name: "Rain" })).toBe(0);
  });

  it("ranks an exact name above a prefix match", () => {
    const exact = scoreEntry("rain", { name: "Rain" });
    const prefix = scoreEntry("rain", { name: "Rain on a tin roof" });
    expect(exact).not.toBeNull();
    expect(prefix).not.toBeNull();
    expect(exact!).toBeGreaterThan(prefix!);
  });

  it("ranks a shorter prefix match above a longer one", () => {
    const short = scoreEntry("rain", { name: "Rain drops" });
    const long = scoreEntry("rain", { name: "Rain on a tin roof at midnight" });
    expect(short!).toBeGreaterThan(long!);
  });

  it("ranks a name match above a tag match", () => {
    const byName = scoreEntry("storm", { name: "Storm" });
    const byTag = scoreEntry("storm", { name: "Thunderclap", tags: ["storm"] });
    expect(byName!).toBeGreaterThan(byTag!);
  });

  it("ranks a tag match above a secondary-field match", () => {
    const byTag = scoreEntry("vind", { name: "Anything", tags: ["vindsvept"] });
    const bySecondary = scoreEntry("vind", { name: "Anything", secondary: "Vindsvept" });
    expect(byTag!).toBeGreaterThan(bySecondary!);
  });

  it("matches a word in the middle of a name", () => {
    expect(scoreEntry("tavern", { name: "Busy tavern" })).not.toBeNull();
  });

  it("returns null when nothing matches", () => {
    expect(scoreEntry("dragon", { name: "Rain", tags: ["weather"], secondary: "x" })).toBeNull();
  });

  it("requires every term to match somewhere", () => {
    const entry: MatchFields = { name: "Rain on a tin roof", tags: ["weather"] };
    expect(scoreEntry("rain roof", entry)).not.toBeNull();
    expect(scoreEntry("rain dragon", entry)).toBeNull();
  });

  it("lets terms match across different fields", () => {
    const entry: MatchFields = { name: "Rain", tags: ["weather"], secondary: "Vindsvept" };
    expect(scoreEntry("rain weather vindsvept", entry)).not.toBeNull();
  });

  it("ignores case and surrounding whitespace", () => {
    expect(scoreEntry("  RAIN  ", { name: "rain" })).toBe(scoreEntry("rain", { name: "Rain" }));
  });
});

describe("rankEntries", () => {
  it("puts the most specific hit first", () => {
    const ranked = rankEntries("rain", SOUNDS, fields);
    expect(ranked.map((s) => s.id)).toEqual(["rain", "rain-roof"]);
  });

  it("drops entries that do not match", () => {
    const ranked = rankEntries("dragon", SOUNDS, fields);
    expect(ranked).toEqual([]);
  });

  it("keeps input order for the whole set on an empty query", () => {
    const ranked = rankEntries("", SOUNDS, fields);
    expect(ranked.map((s) => s.id)).toEqual(["rain", "rain-roof", "thunder", "tavern", "door"]);
  });

  it("finds by tag when the name has nothing in common", () => {
    const ranked = rankEntries("weather", SOUNDS, fields);
    expect(ranked.map((s) => s.id)).toEqual(["rain", "rain-roof", "thunder"]);
  });

  it("honours the limit", () => {
    expect(rankEntries("weather", SOUNDS, fields, 2)).toHaveLength(2);
  });

  it("breaks ties by input order rather than shuffling", () => {
    const tied = [
      { id: "b", name: "Storm bell" },
      { id: "a", name: "Storm horn" },
    ];
    expect(rankEntries("storm", tied, (e) => e).map((e) => e.id)).toEqual(["b", "a"]);
  });
});
