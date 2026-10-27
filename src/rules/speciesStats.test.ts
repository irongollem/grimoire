import { describe, expect, it } from "vitest";
import {
  darkvisionFeet,
  effectiveLanguages,
  effectiveSize,
  effectiveSpeed,
  findSubrace,
  setSpeedMode,
  speciesHasWalkSpeed,
  speciesSizeFromSubrace,
  speedLabels,
  subraceStatPills,
  withWalkSpeed,
  walkSpeedFromSubrace,
} from "@/rules/speciesStats";
import type { SpeciesStatsSource } from "@/rules/speciesStats";

const darakhul: SpeciesStatsSource = {
  size: null,
  speed: null,
  languages: ["Common", "Darakhul"],
  subraces: [
    { name: "Dwarf Heritage", description: "", traits: [], size: "medium", speed: { walk: 25 }, languages: ["Dwarvish"] },
    { name: "Halfling Heritage", description: "", traits: [], size: "small", speed: { walk: 25 }, languages: ["Halfling"] },
  ],
};

const minotaur: SpeciesStatsSource = {
  size: "medium",
  speed: { walk: 30 },
  languages: ["Common", "Minotaur"],
  subraces: [
    { name: "Bhain Kwai", description: "", traits: [], speed: { swim: 25 } },
    { name: "Boghaid", description: "", traits: [] },
  ],
};

describe("findSubrace", () => {
  it("finds by name and treats no name as no subrace", () => {
    expect(findSubrace(minotaur, "Boghaid")?.name).toBe("Boghaid");
    expect(findSubrace(minotaur, "")).toBeNull();
    expect(findSubrace(minotaur, null)).toBeNull();
    expect(findSubrace(minotaur, "Unknown")).toBeNull();
  });
});

describe("effective stats", () => {
  it("takes a deferred size and speed from the subrace", () => {
    expect(effectiveSize(darakhul, "Halfling Heritage")).toBe("small");
    expect(effectiveSpeed(darakhul, "Dwarf Heritage")).toEqual({ walk: 25 });
  });

  it("is the parent's when no subrace is chosen", () => {
    expect(effectiveSize(darakhul)).toBeNull();
    expect(effectiveSpeed(darakhul)).toBeNull();
    expect(effectiveSize(minotaur, "Boghaid")).toBe("medium");
  });

  it("adds a subrace's speed mode to the parent's", () => {
    expect(effectiveSpeed(minotaur, "Bhain Kwai")).toEqual({ walk: 30, swim: 25 });
  });

  it("adds a subrace's languages after the parent's, each once", () => {
    expect(effectiveLanguages(darakhul, "Dwarf Heritage")).toEqual(["Common", "Darakhul", "Dwarvish"]);
    expect(effectiveLanguages({ ...minotaur, subraces: [{ name: "X", description: "", traits: [], languages: ["Common"] }] }, "X")).toEqual([
      "Common",
      "Minotaur",
    ]);
  });
});

describe("speciesHasWalkSpeed", () => {
  it("holds for a species with its own walk speed", () => {
    expect(speciesHasWalkSpeed(minotaur)).toBe(true);
    expect(walkSpeedFromSubrace(minotaur)).toBe(false);
  });

  it("holds when every subrace states one", () => {
    expect(speciesHasWalkSpeed(darakhul)).toBe(true);
    expect(walkSpeedFromSubrace(darakhul)).toBe(true);
  });

  it("fails when one subrace leaves it unstated, or there are no subraces", () => {
    const gap = { ...darakhul, subraces: [...(darakhul.subraces ?? []), { name: "Ravenfolk", description: "", traits: [] }] };
    expect(speciesHasWalkSpeed(gap)).toBe(false);
    expect(speciesHasWalkSpeed({ speed: null, subraces: [] })).toBe(false);
    expect(speciesHasWalkSpeed({ speed: { fly: 30 }, subraces: null })).toBe(false);
  });
});

describe("a species with null languages", () => {
  it("grants none of its own, and still adds its subrace's", () => {
    const noLanguages: SpeciesStatsSource = { ...minotaur, languages: null };
    expect(effectiveLanguages(noLanguages, "")).toEqual([]);
    expect(effectiveLanguages({ ...noLanguages, subraces: [{ name: "S", description: "", traits: [], languages: ["Elvish"] }] }, "S")).toEqual(["Elvish"]);
  });
});

describe("withWalkSpeed", () => {
  const walking = { name: "A", description: "", traits: [], ability_score_increases: null, speed: { walk: 30 } };
  const swimming = { ...walking, speed: { swim: 20 } };

  it("leaves a species with a walking speed alone", () => {
    const fields = { speed: { walk: 25 } };
    expect(withWalkSpeed(fields, null)).toBe(fields);
  });

  it("leaves a species whose every subrace walks alone", () => {
    const fields = { speed: null };
    expect(withWalkSpeed(fields, [walking, walking])).toBe(fields);
  });

  it("adds walk 30 and keeps other modes otherwise", () => {
    expect(withWalkSpeed({ speed: { swim: 25 } }, null).speed).toEqual({ swim: 25, walk: 30 });
    expect(withWalkSpeed({ speed: null }, [walking, swimming]).speed).toEqual({ walk: 30 });
  });
});

describe("subrace display helpers", () => {
  it("reads a size left to the subraces", () => {
    expect(speciesSizeFromSubrace(darakhul)).toBe(true);
    expect(speciesSizeFromSubrace(minotaur)).toBe(false);
  });

  it("labels speeds, leaving out zero and absent modes", () => {
    expect(speedLabels({ walk: 30, fly: 0, swim: 20 })).toEqual(["Walk 30ft", "Swim 20ft"]);
    expect(speedLabels(null)).toEqual([]);
  });

  it("lists a subrace's size (capitalised), speeds and languages", () => {
    expect(subraceStatPills({ name: "H", description: "", traits: [], size: "small", speed: { walk: 25, fly: 0 }, languages: ["Halfling"] }))
      .toEqual(["Small", "Walk 25ft", "Lang: Halfling"]);
    expect(subraceStatPills({ name: "B", description: "", traits: [] })).toEqual([]);
  });
});

describe("setSpeedMode", () => {
  it("sets a mode without touching the others or the input", () => {
    const speed = { walk: 30 };
    expect(setSpeedMode(speed, "fly", "40")).toEqual({ walk: 30, fly: 40 });
    expect(speed).toEqual({ walk: 30 });
  });

  it("removes the mode for an empty, non-numeric, null or negative entry", () => {
    for (const raw of ["", "abc", null, "-5", -5, "-1", -1]) {
      expect(setSpeedMode({ walk: 30, fly: 40 }, "fly", raw)).toEqual({ walk: 30 });
    }
  });

  it("accepts a number as well as text", () => {
    expect(setSpeedMode({}, "swim", 25)).toEqual({ swim: 25 });
  });
});

describe("darkvisionFeet", () => {
  const trait = (name: string, description: string) => ({ name, description });
  const tiptap = JSON.stringify({
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text: "You have Darkvision with a range of 60 feet." }] }],
  });

  it("reads the range from the 2014 phrasing", () => {
    const species = {
      subraces: null,
      traits: [trait("Darkvision", "You can see in dim light within 60 feet of you as if it were bright light, and in darkness as if it were dim light.")],
    };
    expect(darkvisionFeet(species)).toBe(60);
  });

  it("reads the range from the 2024 phrasing and from a Tiptap document string", () => {
    expect(darkvisionFeet({ subraces: null, traits: [trait("Darkvision", "You have Darkvision with a range of 120 feet.")] })).toBe(120);
    expect(darkvisionFeet({ subraces: null, traits: [trait("Darkvision", tiptap)] })).toBe(60);
  });

  it("reads a range whose number carries a mark of its own", () => {
    const bold = JSON.stringify({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "You can see within " },
            { type: "text", text: "60", marks: [{ type: "bold" }] },
            { type: "text", text: " feet of you." },
          ],
        },
      ],
    });
    expect(darkvisionFeet({ subraces: null, traits: [trait("Darkvision", bold)] })).toBe(60);
  });

  it("lets a subrace's darkvision replace its parent's", () => {
    const species = {
      traits: [trait("Darkvision", "within 60 feet")],
      subraces: [
        { name: "Drow", description: "", traits: [trait("Superior Darkvision", "Your darkvision has a radius of 120 feet.")] },
        { name: "Plain", description: "", traits: [] },
      ],
    };
    expect(darkvisionFeet(species, "Drow")).toBe(120);
    expect(darkvisionFeet(species, "Plain")).toBe(60);
    expect(darkvisionFeet(species, null)).toBe(60);
  });

  it("is zero without a darkvision trait", () => {
    expect(darkvisionFeet({ subraces: null, traits: [trait("Lucky", "reroll a 1")] })).toBe(0);
    expect(darkvisionFeet({ subraces: null, traits: null })).toBe(0);
  });
});
