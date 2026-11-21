import { describe, expect, it } from "vitest";
import { NO_SITE, SITE_LINES_MAX, siteSection } from "./site";

describe("siteSection", () => {
  it("tells what is marked on the place, its rooms and its doors, by name", () => {
    expect(
      siteSection({
        places: [{ name: "Crypt", facts: ["explored"] }, { name: "Ossuary", facts: ["cleared", "looted"] }],
        doors: [{ label: "iron door", facts: ["unlocked"] }],
      }),
    ).toBe("## Site state\n\nHere: the Crypt is explored; the Ossuary is cleared and looted; the iron door is unlocked.");
  });

  it("is absent when nothing is marked", () => {
    expect(siteSection(NO_SITE)).toBe("");
    expect(siteSection({ places: [{ name: "Crypt", facts: [] }], doors: [{ label: "gate", facts: [] }] })).toBe("");
  });

  // Bug caught: a door fact was dropped, so a door the party opened an hour ago was described as locked.
  it("names a door fact, found and unlocked in a fixed order, and a door with no name as a door", () => {
    expect(siteSection({ places: [], doors: [{ label: "grille", facts: ["unlocked", "found"] }] })).toContain("the grille is found and unlocked");
    expect(siteSection({ places: [], doors: [{ label: " ", facts: ["found"] }] })).toContain("a door is found");
  });

  it("does not say 'the The' for a name that begins with the article", () => {
    expect(siteSection({ places: [{ name: "The Drowned Bell", facts: ["looted"] }], doors: [] })).toContain("the Drowned Bell is looted");
  });

  it("does not depend on the order the log answered in", () => {
    const a = siteSection({ places: [{ name: "Cellar", facts: ["looted", "explored", "cleared"] }], doors: [] });
    expect(a).toContain("the Cellar is explored, cleared and looted");
  });

  // Bug caught: a site with dozens of marks filled every turn's state.
  it("tells at most SITE_LINES_MAX things and says how many more", () => {
    const places = Array.from({ length: SITE_LINES_MAX + 2 }, (_, i) => ({ name: `Room${i}`, facts: ["explored" as const] }));
    const text = siteSection({ places, doors: [] });
    expect(text).toContain(`Room${SITE_LINES_MAX - 1} is`);
    expect(text).not.toContain(`Room${SITE_LINES_MAX} is`);
    expect(text).toContain("And 2 more things are marked.");
  });
});
