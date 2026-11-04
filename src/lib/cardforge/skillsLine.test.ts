import { describe, expect, it } from "vitest";
import { skillsLine } from "./skillsLine";

describe("skillsLine", () => {
  it("prints a multi-word skill by its book name, not its key (the card once read Sleight_of_hand)", () => {
    expect(skillsLine({ stealth: "+6", sleight_of_hand: "+6" })).toBe("Stealth +6, Sleight of Hand +6");
  });

  it("spells out a skill the rules do not know, rather than printing its underscores", () => {
    expect(skillsLine({ candy_appraisal: "+3" })).toBe("Candy appraisal +3");
  });
});
