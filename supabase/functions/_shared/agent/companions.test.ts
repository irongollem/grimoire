import { describe, expect, it } from "vitest";
import { companionProfile, companionSpeaks, companionsSection, enoughToSpeak, type Companion } from "./companions";

const sheet = "Traits: Dry, patient, counts everything twice.\nBonds: Owes the mill her life.\nFlaws: Cannot leave a locked door alone.";
const companion = (over: Partial<Companion> = {}): Companion => ({
  id: "00000000-0000-4000-8000-0000000000b2", name: "Folio", pronouns: "she/her", species: "Dwarf", className: "Cleric", subclass: null, level: 3,
  hitPoints: { current: 20, max: 24 }, about: sheet, aiSpeaks: true, ...over,
});

describe("companionSpeaks", () => {
  // The maintainer: "speak if there's enough character data and the player enabled on their sheet". Bug caught: a
  // voice made up for another player's character without their word, or from a sheet that says nothing of them.
  it("gives a companion lines only with the player's word and a sheet that says who they are", () => {
    expect(companionSpeaks(companion())).toBe(true);
    expect(companionSpeaks(companion({ aiSpeaks: false }))).toBe(false);
    expect(companionSpeaks(companion({ about: "Looks: tall." }))).toBe(false);
    expect(companionSpeaks(companion({ about: null }))).toBe(false);
    expect(enoughToSpeak({ about: "x".repeat(79) })).toBe(false);
    expect(enoughToSpeak({ about: "x".repeat(80) })).toBe(true);
  });
});

describe("companionsSection", () => {
  // Bug caught: a companion who only acts handed to the narrator with an id (it then calls speak for them), or
  // one who speaks listed without one (it cannot).
  it("names who speaks, with their id, and who only acts, with none", () => {
    const text = companionsSection([companion(), companion({ id: "00000000-0000-4000-8000-0000000000b3", name: "Glint", aiSpeaks: false })]);
    expect(text).toContain("Folio (id 00000000-0000-4000-8000-0000000000b2)");
    expect(text).toContain("speaks for themselves");
    expect(text).toContain("Glint, level 3 Dwarf Cleric");
    expect(text).toContain("never give Glint a line of speech");
    expect(text).not.toContain("00000000-0000-4000-8000-0000000000b3");
  });

  it("says nothing with nobody else in the party", () => {
    expect(companionsSection([])).toBe("");
  });
});

describe("companionProfile", () => {
  // Bug caught: the character's own call told nothing of who they are (it then speaks as a generic adventurer).
  it("tells the character who they are from their own sheet", () => {
    const profile = companionProfile(companion());
    expect(profile).toContain("You are Folio (she/her), a level 3 Dwarf Cleric");
    expect(profile).toContain("Owes the mill her life.");
  });
});
