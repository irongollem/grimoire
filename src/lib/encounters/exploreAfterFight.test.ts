import { describe, expect, it } from "vitest";
import { partyAfterFight } from "@/lib/encounters/exploreAfterFight";
import type { RunCombatant } from "@/types/encounter.types";

function hero(party_member_id: string, position?: { x: number; y: number }): RunCombatant {
  return {
    instance_id: `p-${party_member_id}`, type: "player", name: party_member_id, faction_id: "f", initiative: 10, hp: 5, max_hp: 5,
    ac: "10", conditions: [], curses: [], death_saves: { successes: 0, failures: 0 }, dex_mod: 0, party_member_id, position,
  };
}
const goblin = { ...hero("x", { x: 9, y: 9 }), type: "monster" as const, party_member_id: undefined };

describe("partyAfterFight (#1133 decision 7)", () => {
  it("stands each character where their token ended and keeps a member who was not in the fight", () => {
    const explore = { site_id: "s1", positions: { a: { x: 0, y: 0 }, away: { x: 7, y: 7 } } };
    expect(partyAfterFight([hero("a", { x: 3, y: 4 }), goblin], explore, "s1")).toEqual({
      site_id: "s1",
      positions: { a: { x: 3, y: 4 }, away: { x: 7, y: 7 } },
    });
  });

  it("does not carry another site's squares into this one", () => {
    const explore = { site_id: "other", positions: { away: { x: 7, y: 7 } } };
    expect(partyAfterFight([hero("a", { x: 1, y: 1 })], explore, "s1")).toEqual({ site_id: "s1", positions: { a: { x: 1, y: 1 } } });
  });

  it("writes nothing for a fight on no site, or when no player token has a square", () => {
    expect(partyAfterFight([hero("a", { x: 1, y: 1 })], null, null)).toBeNull();
    expect(partyAfterFight([hero("a"), goblin], null, "s1")).toBeNull();
  });
});
