import { describe, expect, it } from "vitest";
import { combatantSpeed } from "./combatantSpeed";
import type { RunCombatant } from "@/types/encounter.types";

function c(over: Partial<RunCombatant>): RunCombatant {
  return {
    instance_id: "x", type: "monster", name: "x", faction_id: "f", initiative: 1, hp: 1, max_hp: 1, ac: "10",
    conditions: [], curses: [], death_saves: { successes: 0, failures: 0 }, dex_mod: 0, ...over,
  };
}
const sources = {
  monsters: [
    { id: "wolf", stat_block: { speed: "40 ft." } },
    { id: "ogre", stat_block: { speed: "40 ft., climb 20 ft." } },
    { id: "blank", stat_block: null },
  ],
  npcs: [{ id: "n1", stat_block: { speed: "25 ft." } }],
  members: [{ id: "pm1", speed: 30 }],
} as unknown as Parameters<typeof combatantSpeed>[1];

describe("a combatant's walking speed", () => {
  it("a monster walks at its stat block's walking speed, not its climb", () => {
    expect(combatantSpeed(c({ monster_id: "ogre" }), sources)).toBe(40);
  });
  it("a character walks at the sheet's speed", () => {
    expect(combatantSpeed(c({ type: "player", party_member_id: "pm1" }), sources)).toBe(30);
  });
  it("an NPC walks at its stat block's speed", () => {
    expect(combatantSpeed(c({ npc_id: "n1" }), sources)).toBe(25);
  });
  it("a wild-shaped druid walks at the beast's speed, not their own", () => {
    const druid = c({
      type: "player", party_member_id: "pm1",
      wildshape: { monster_id: "wolf", beast_name: "Wolf", beast_image_url: null, beast_hp: 11, beast_max_hp: 11, beast_ac: "13", beast_dex: 10 },
    });
    expect(combatantSpeed(druid, sources)).toBe(40);
  });
  it("says nothing when nothing on the board names a speed", () => {
    expect(combatantSpeed(c({ monster_id: "blank" }), sources)).toBeNull();
    expect(combatantSpeed(c({}), sources)).toBeNull();
  });
});
