import { describe, expect, it } from "vitest";
import { npcPortraitSubject } from "./portraitSubject";

describe("npcPortraitSubject", () => {
  // Bug caught: a halfling ferryman painted as a tall old human, because the image model never heard "halfling".
  it("leads with a halfling's build, so the figure is small and not a human", () => {
    const subject = npcPortraitSubject("Halfling", "A weathered old ferryman with a white beard and a lantern.");
    expect(subject).toMatch(/^A halfling, one of the small folk: about three feet tall/);
    expect(subject).toMatch(/A weathered old ferryman/);
  });

  it("finds the build in a subrace written either way round", () => {
    expect(npcPortraitSubject("Halfling (Lightfoot)", "x")).toMatch(/^A halfling/);
    expect(npcPortraitSubject("Lightfoot halfling", "x")).toMatch(/^A halfling/);
    expect(npcPortraitSubject("Hill Dwarf", "x")).toMatch(/^A dwarf: about four and a half feet tall/);
  });

  // Bug caught: an elf or a tiefling painted as a human for want of the word.
  it("names any other species as the subject's first words", () => {
    expect(npcPortraitSubject("Elf", "A ranger.")).toBe("An elf. A ranger.");
    expect(npcPortraitSubject("Tiefling", "A bard.")).toBe("A tiefling. A bard.");
  });

  it("leaves the description alone when the record has no species", () => {
    expect(npcPortraitSubject(null, "A bard.")).toBe("A bard.");
    expect(npcPortraitSubject("  ", "A bard.")).toBe("A bard.");
  });
});
