import { describe, expect, it } from "vitest";
import { dmLevelsUp, levelUpAction, readyToLevelUp } from "./levelReadiness";

describe("readyToLevelUp", () => {
  // PHB 2014 "Beyond 1st Level": 900 XP is 3rd level, so a 2nd-level character at 900 may level and at 899 may not.
  it.each([
    [899, false],
    [900, true],
  ])("by experience, a 2nd-level character at %i XP is ready: %s", (xp, ready) => {
    expect(readyToLevelUp({ mode: "experience", level: 2, experiencePoints: xp, partyLevel: 9 })).toBe(ready);
  });

  it("by experience, the party level is ignored", () => {
    expect(readyToLevelUp({ mode: "experience", level: 2, experiencePoints: 0, partyLevel: 9 })).toBe(false);
  });

  it.each([
    [3, 4, true],
    [4, 4, false],
    [5, 4, false],
  ])("by milestone, a level-%i character with the party at %i is ready: %s", (level, partyLevel, ready) => {
    expect(readyToLevelUp({ mode: "milestone", level, experiencePoints: 999_999, partyLevel })).toBe(ready);
  });

  it("by milestone, no party level yet means nobody is ready, whatever their XP", () => {
    expect(readyToLevelUp({ mode: "milestone", level: 1, experiencePoints: 999_999, partyLevel: null })).toBe(false);
  });
});

describe("dmLevelsUp", () => {
  it.each([
    [null, true],
    ["dm", true],
    ["player", false],
  ])("owned by %s: the DM presses it: %s", (owner, dm) => {
    expect(dmLevelsUp({ owner_user_id: owner }, "dm")).toBe(dm);
  });

  it("a character the DM offered and a player claimed is the player's (is_dm_managed stays set on it)", () => {
    expect(dmLevelsUp({ owner_user_id: "player", is_dm_managed: true } as { owner_user_id: string }, "dm")).toBe(false);
  });
});

describe("levelUpAction", () => {
  const played = { owner_user_id: "player" };
  const unplayed = { owner_user_id: null };

  it("offers nothing to anyone before the character is ready", () => {
    expect(levelUpAction({ ready: false, viewerIsDm: true, viewerId: "dm", member: unplayed, hidePlayerActions: false })).toBeNull();
    expect(levelUpAction({ ready: false, viewerIsDm: false, viewerId: "player", member: played, hidePlayerActions: false })).toBeNull();
  });

  it("the DM does not level a character a player plays (the player presses it)", () => {
    expect(levelUpAction({ ready: true, viewerIsDm: true, viewerId: "dm", member: played, hidePlayerActions: false })).toBeNull();
  });

  it("the DM levels a character nobody plays", () => {
    expect(levelUpAction({ ready: true, viewerIsDm: true, viewerId: "dm", member: unplayed, hidePlayerActions: false })).toBe("dm");
  });

  it("the player levels their own, unless the sheet hides player actions", () => {
    expect(levelUpAction({ ready: true, viewerIsDm: false, viewerId: "player", member: played, hidePlayerActions: false })).toBe("player");
    expect(levelUpAction({ ready: true, viewerIsDm: false, viewerId: "player", member: played, hidePlayerActions: true })).toBeNull();
  });
});
