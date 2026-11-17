import { describe, expect, it } from "vitest";
import { MAX_PEOPLES, peopleNames, peoplesSection } from "./peoples";

describe("peoplesSection", () => {
  // Bug caught live (17 Nov 2026): "this marrow ... never even told me his name" answered as if Marrow were a name.
  it("names the world's peoples and says each is a kind of folk, not a name", () => {
    const section = peoplesSection(["Marrow", "Sugarspun"]);
    expect(section).toContain("Marrow, Sugarspun");
    expect(section).toContain("never somebody's name");
  });

  // Bug caught: a campaign with no peoples of its own told about an empty list, as if that were knowledge.
  it("says nothing for a campaign with none", () => {
    expect(peoplesSection([])).toBe("");
    expect(peoplesSection(["  "])).toBe("");
  });
});

describe("peopleNames", () => {
  it("tells a people once, however it was capitalised or spaced", () => {
    expect(peopleNames(["Marrow", " marrow ", "MARROW", "Sugarspun"])).toEqual(["Marrow", "Sugarspun"]);
  });

  // Bug caught: a campaign with hundreds of imported species filling every character's instructions.
  it("stops at the cap", () => {
    const many = Array.from({ length: MAX_PEOPLES + 5 }, (_, i) => `People ${i}`);
    expect(peopleNames(many)).toHaveLength(MAX_PEOPLES);
  });
});
