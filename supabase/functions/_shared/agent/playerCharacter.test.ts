import { describe, expect, it } from "vitest";
import { isPlayerName, playerCharacterSection, type PlayerCharacter } from "./playerCharacter";

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
