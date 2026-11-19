import { describe, expect, it } from "vitest";
import { isAllyOf } from "./allies.ts";

// The app's default factions (`sides.ts`): the Players and the Ally faction oppose Enemy, Neutral opposes nobody.
const factions = [
  { id: "players", hostile_to: ["enemy"] },
  { id: "ally", hostile_to: ["enemy"] },
  { id: "enemy", hostile_to: ["players", "ally"] },
  { id: "neutral", hostile_to: [] },
];
const of = (faction_id: string) => ({ faction_id });

describe("isAllyOf", () => {
  it("is true for the mover's own faction", () => {
    expect(isAllyOf(of("enemy"), of("enemy"), factions)).toBe(true);
  });
  it("is true for a faction that opposes the same enemy", () => {
    expect(isAllyOf(of("players"), of("ally"), factions)).toBe(true);
    expect(isAllyOf(of("ally"), of("players"), factions)).toBe(true);
  });
  // Bug: "everyone not hostile" made a Neutral an ally, so a heal or a buff went to a bystander.
  it("is false for a Neutral, which opposes nobody, from either side", () => {
    expect(isAllyOf(of("players"), of("neutral"), factions)).toBe(false);
    expect(isAllyOf(of("neutral"), of("players"), factions)).toBe(false);
  });
  it("is false for an opponent", () => {
    expect(isAllyOf(of("players"), of("enemy"), factions)).toBe(false);
  });
  it("with no faction table, only the mover's own faction is an ally", () => {
    expect(isAllyOf(of("a"), of("a"), [])).toBe(true);
    expect(isAllyOf(of("a"), of("b"), [])).toBe(false);
  });
  it("is false for two factions that merely share no enemy", () => {
    const loose = [{ id: "a", hostile_to: [] }, { id: "b", hostile_to: [] }];
    expect(isAllyOf(of("a"), of("b"), loose)).toBe(false);
  });
});
