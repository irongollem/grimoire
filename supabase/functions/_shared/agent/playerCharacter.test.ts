import { describe, expect, it } from "vitest";
import { ABOUT_MAX, isPlayerName, playerCharacterSection, type PlayerCharacter } from "./playerCharacter";

const wren: PlayerCharacter = {
  id: "w", name: "Wren Ashfield", pronouns: "she/her", species: "Wood Elf", className: "Ranger", subclass: "Gloom Stalker",
  level: 3, hitPoints: { current: 12, max: 20 },
};

describe("playerCharacterSection", () => {
  it("names who is played, with pronouns, kind and hit points, or the narrator keeps saying 'the player'", () => {
    const text = playerCharacterSection(wren);
    expect(text).toContain("Wren Ashfield (she/her)");
    expect(text).toContain("level 3 Wood Elf Ranger (Gloom Stalker); hit points 12 of 20");
  });

  it("says to describe what they perceive and never decide what they say or do", () => {
    expect(playerCharacterSection(wren)).toMatch(/Never decide what they say or do/);
  });

  it("leaves out what the sheet does not have instead of printing empty brackets or 'null'", () => {
    const text = playerCharacterSection({ ...wren, pronouns: null, species: null, className: null, subclass: null, level: null, hitPoints: null });
    expect(text).not.toMatch(/null|\(\)|undefined/);
    expect(text).toContain("Wren Ashfield\n\nThis is who");
  });

  it("stays under 600 characters however long the typed fields are, since it is paid for every turn", () => {
    const long = "x".repeat(500);
    const text = playerCharacterSection({ ...wren, name: long, pronouns: long, species: long, className: long, subclass: long });
    expect(text.length).toBeLessThan(600);
    expect(text).not.toContain("x".repeat(61));
  });
});

describe("isPlayerName", () => {
  it.each([["Wren Ashfield"], ["wren ashfield."], ["Wren"], ["WREN,"]])("takes %s for the player", (raw) => {
    expect(isPlayerName(raw, "Wren Ashfield")).toBe(true);
  });
  it.each([["Ashfield"], ["Wrenfield"], ["Wren Ashfield the Younger"], [""], ["everyone"]])(
    "does not take %s for the player: only the whole name or its first word ends an exchange", (raw) => {
      expect(isPlayerName(raw, "Wren Ashfield")).toBe(false);
    },
  );
});

describe("what the player wrote about the character", () => {
  const base = { id: "m1", name: "Rosie", pronouns: null, species: "Sugarspun", className: "Fighter", subclass: null, level: 6, hitPoints: null };

  // Bug caught live (17 Nov 2026): asked "what do I remember from my first days?", the narrator knew the character
  // only as a name, a level and a class, and had nothing of the player's own account to build a memory on.
  it("is given to the narrator as the player's own account", () => {
    const text = playerCharacterSection({ ...base, about: "Bonds: Sold as a child on the Old Buy-Floor." });
    expect(text).toContain("What the player wrote about them");
    expect(text).toContain("Sold as a child on the Old Buy-Floor.");
  });

  it("is left out when the sheet says nothing", () => {
    expect(playerCharacterSection({ ...base, about: "   " })).not.toContain("What the player wrote");
    expect(playerCharacterSection(base)).not.toContain("What the player wrote");
  });

  // Bug caught: a ten-page backstory sent with every turn.
  it("is cut at its ceiling", () => {
    const text = playerCharacterSection({ ...base, about: "x".repeat(ABOUT_MAX + 500) });
    expect(text).not.toContain("x".repeat(ABOUT_MAX + 1));
    expect(text).toContain("…");
  });
});

