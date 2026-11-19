import { describe, expect, it } from "vitest";
import { DEFAULT_FACTIONS } from "../../types/encounter.types";
import { areHostile, isHostileTo } from "./sides";

// App convention: an encounter's factions say whom each attacks (`FactionDef.hostile_to`).
describe("areHostile", () => {
  it("has an Ally fight beside the Players and against the Enemy", () => {
    expect(areHostile(DEFAULT_FACTIONS, "ally", "players")).toBe(false);
    expect(areHostile(DEFAULT_FACTIONS, "ally", "enemy")).toBe(true);
    expect(areHostile(DEFAULT_FACTIONS, "players", "enemy")).toBe(true); // positive control
  });

  it("makes a Neutral nobody's foe", () => {
    expect(areHostile(DEFAULT_FACTIONS, "neutral", "players")).toBe(false);
    expect(areHostile(DEFAULT_FACTIONS, "neutral", "enemy")).toBe(false);
  });

  it("reads a one-sided declaration in both directions, and never sets a faction against itself", () => {
    const factions = [{ id: "cult", hostile_to: ["watch"] }, { id: "watch", hostile_to: [] }];
    expect(areHostile(factions, "watch", "cult")).toBe(true);
    expect(areHostile(factions, "cult", "cult")).toBe(false);
  });

  it("falls to 'a different faction' only for a fight that declares neither faction", () => {
    expect(areHostile([], "a", "b")).toBe(true);
    // One of the two is declared and says nothing of the other: declared is what counts.
    expect(areHostile([{ id: "a", hostile_to: [] }], "a", "b")).toBe(false);
  });

  it("isHostileTo asks by the combatants' factions", () => {
    expect(isHostileTo({ faction_id: "ally" }, { faction_id: "players" }, DEFAULT_FACTIONS)).toBe(false);
  });

  // Bug caught: a bystander nobody could attack (the maintainer: "she may be harmless, but she's not safe"), or
  // one her own party's movement treats as a foe. She stands in the party's faction, so its foes are hers.
  it("counts a bystander by the faction she stands in", () => {
    const honeycomb = { faction_id: "players", bystander: true as const };
    expect(isHostileTo({ faction_id: "enemy" }, honeycomb, DEFAULT_FACTIONS)).toBe(true);
    expect(isHostileTo({ faction_id: "players" }, honeycomb, DEFAULT_FACTIONS)).toBe(false);
  });
});
