import { describe, expect, it } from "vitest";
import { memorialLineage } from "./lineage";

describe("memorialLineage", () => {
  it("joins species, lower-cased class and ordinal level", () => {
    expect(memorialLineage({ species_name: "Brewling", class_name: "Cleric", level: 6 })).toBe(
      "Brewling cleric of the sixth level",
    );
  });
  it("capitalises the class when species is missing", () => {
    expect(memorialLineage({ species_name: null, class_name: "cleric", level: 6 })).toBe(
      "Cleric of the sixth level",
    );
  });
  it("omits the class when missing", () => {
    expect(memorialLineage({ species_name: "Brewling", class_name: null, level: 6 })).toBe(
      "Brewling of the sixth level",
    );
  });
  it("is null with no class and no level", () => {
    expect(memorialLineage({ species_name: "Brewling", class_name: null, level: null })).toBeNull();
  });
  it("falls back to digits above twentieth", () => {
    expect(memorialLineage({ species_name: null, class_name: "Wizard", level: 21 })).toBe("Wizard level 21");
  });
  it("works without a level", () => {
    expect(memorialLineage({ species_name: "Elf", class_name: "Rogue", level: null })).toBe("Elf rogue");
  });
});
