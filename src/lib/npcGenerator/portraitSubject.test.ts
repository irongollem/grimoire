import { describe, expect, it } from "vitest";
import { npcPortraitSubject, speciesPictureFor } from "./portraitSubject";

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

describe("speciesPictureFor", () => {
  const own = [{ name: "Dwarf", image_url: "https://img/our-dwarf.webp" }, { name: "Thornkin", image_url: null }];
  const library = [{ name: "Dwarf", image_url: "https://img/lib-dwarf.webp" }, { name: "Thornkin", image_url: "https://img/lib-thornkin.webp" }, { name: "Elf", image_url: "https://img/elf.webp" }];

  // Bug caught: the library's picture used where the DM drew their own people for this campaign.
  it("prefers the campaign's own picture of the species to the library's", () => {
    expect(speciesPictureFor("Dwarf", own, library)).toBe("https://img/our-dwarf.webp");
  });

  // Bug caught: every human portrait paying for a reference the image model never needed.
  it("sends no picture for a human, however the race is written", () => {
    const humans = [{ name: "Human", image_url: "https://img/human.webp" }];
    expect(speciesPictureFor("Human", [], humans)).toBeNull();
    expect(speciesPictureFor("Human (Variant)", [], humans)).toBeNull();
  });

  it("falls through to the library when the campaign's species has no picture", () => {
    expect(speciesPictureFor("thornkin", own, library)).toBe("https://img/lib-thornkin.webp");
  });

  it("finds the species in a longer race, and nothing for one it does not have", () => {
    expect(speciesPictureFor("Hill Dwarf", [], library)).toBe("https://img/lib-dwarf.webp");
    expect(speciesPictureFor("Half-Orc", own, library)).toBeNull();
    expect(speciesPictureFor(null, own, library)).toBeNull();
  });

  // Bug caught: "Wood Elf" matching a library entry "Elf" is wanted; "Elf" must not match "Dark Elf Cultist" by a word.
  it("matches a one-word species inside the race, never a longer name inside a shorter race", () => {
    expect(speciesPictureFor("Wood Elf", [], library)).toBe("https://img/elf.webp");
    expect(speciesPictureFor("Elf", [], [{ name: "Dark Elf", image_url: "https://img/dark.webp" }])).toBeNull();
  });
});

describe("npcPortraitSubject with a reference", () => {
  it("says what the reference picture is for, and only when there is one", () => {
    expect(npcPortraitSubject("Elf", "A ranger.", true)).toMatch(/^An elf\. A ranger\. The reference picture shows what an elf looks like/);
    expect(npcPortraitSubject("Elf", "A ranger.")).toBe("An elf. A ranger.");
  });
});
