import { describe, it, expect } from "vitest";
import { parseBackgroundSkills } from "@/lib/backgroundSkills";

describe("parseBackgroundSkills", () => {
  it("returns empty for null/empty input", () => {
    expect(parseBackgroundSkills(null)).toEqual({ fixed: [], choices: [] });
    expect(parseBackgroundSkills([])).toEqual({ fixed: [], choices: [] });
  });

  it("treats a clean fixed pair as all-fixed, no choice", () => {
    // Con Artist
    expect(parseBackgroundSkills(["Deception", "Sleight of Hand"])).toEqual({
      fixed: ["deception", "sleight_of_hand"],
      choices: [],
    });
  });

  it("parses the garbled 'X, and either A, B, or C' shape into fixed + one choice", () => {
    // Charlatan — note "Culture" is not a modelled skill, so it drops from options
    expect(
      parseBackgroundSkills(["Deception", "and either Culture", "Insight", "or Sleight of Hand."]),
    ).toEqual({
      fixed: ["deception"],
      choices: [{ count: 1, options: ["insight", "sleight_of_hand"] }],
    });
  });

  it("parses a two-option 'and either A or B' choice", () => {
    // Urchin
    expect(parseBackgroundSkills(["Sleight of Hand", "and either Deception or Stealth."])).toEqual({
      fixed: ["sleight_of_hand"],
      choices: [{ count: 1, options: ["deception", "stealth"] }],
    });
  });

  it("parses 'plus your choice of one between A or B'", () => {
    // Crime Syndicate Member
    expect(
      parseBackgroundSkills(["Deception", "plus your choice of one between Sleight of Hand or Stealth."]),
    ).toEqual({
      fixed: ["deception"],
      choices: [{ count: 1, options: ["sleight_of_hand", "stealth"] }],
    });
  });

  it("parses 'X plus one of your choice from among A or B'", () => {
    // Innkeeper (note: no comma split here — single string)
    expect(
      parseBackgroundSkills(["Insight plus one of your choice from among Intimidation or Persuasion"]),
    ).toEqual({
      fixed: ["insight"],
      choices: [{ count: 1, options: ["intimidation", "persuasion"] }],
    });
  });

  it("parses 'Two of your choice' as a count-2 any-skill choice", () => {
    // Guildmember
    expect(parseBackgroundSkills(["Two of your choice."])).toEqual({
      fixed: [],
      choices: [{ count: 2, options: [] }],
    });
  });

  it("parses 'Your choice of two from among A, B, and C'", () => {
    // Lyceum Student
    expect(
      parseBackgroundSkills(["Your choice of two from among Arcana", "History", "and Persuasion."]),
    ).toEqual({
      fixed: [],
      choices: [{ count: 2, options: ["arcana", "history", "persuasion"] }],
    });
  });

  it("does not double-count a fixed skill that also appears in the choice region", () => {
    const result = parseBackgroundSkills(["Survival", "and either History or Performance."]);
    expect(result.fixed).toEqual(["survival"]);
    expect(result.choices[0].options).not.toContain("survival");
  });

  it("matches multi-word skills as whole tokens", () => {
    expect(parseBackgroundSkills(["Animal Handling", "Survival"])).toEqual({
      fixed: ["animal_handling", "survival"],
      choices: [],
    });
  });
});
