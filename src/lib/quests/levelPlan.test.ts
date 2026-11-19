import { describe, expect, it } from "vitest";
import { fightFlags, flagText, levelStations, questWorths } from "./levelPlan";
import type { DifficultyLookups } from "@/lib/encounters/difficulty";
import type { CombatantDef } from "@/types/encounter.types";

const m = (level: number, reached = false) => ({ id: `m${level}`, level, reachedAt: reached ? "2026-11-19T00:00:00Z" : null });

describe("levelStations", () => {
  it("shows the last level reached, the next two, and the first level nobody has set", () => {
    const s = levelStations([m(5), m(2, true), m(4), m(3, true)], 3);
    expect(s.reached?.level).toBe(3);
    expect(s.upcoming.map((x) => x.level)).toEqual([4, 5]);
    expect(s.open).toBe(6);
  });

  it("asks for the level after the party's own when nothing is set yet", () => {
    expect(levelStations([], 3)).toEqual({ reached: null, upcoming: [], open: 4 });
    expect(levelStations([], null).open).toBe(2);
  });

  // CodeRabbit on #1227: the DM set the party to 6 by hand; an unreached level-4 milestone is behind them, not next.
  it("does not call a milestone at or below the party level 'next'", () => {
    expect(levelStations([m(4), m(5), m(7)], 6).upcoming.map((x) => x.level)).toEqual([7]);
  });

  it("has no level to ask for past 20", () => {
    expect(levelStations([m(20)], 19).open).toBeNull();
  });
});

// An ogre (CR 2, 450 XP) alone: DMG 2014 "Encounter Difficulty" thresholds for four characters.
// At level 1 the party's Deadly threshold is 4 x 100 = 400, so 450 is Deadly; at level 4 Easy is 4 x 125 = 500,
// so 450 is under Easy: Trivial. At level 2 (Medium 4 x 100 = 400, Hard 4 x 150 = 600) it is Medium: no flag.
describe("fightFlags", () => {
  const ogre: CombatantDef = { id: "o", monster_id: "ogre", npc_id: null, faction_id: "enemy", count: 1, custom_name: null };
  const encounter = (over: Partial<{ id: string; party_member_ids: string[]; is_finished: boolean }> = {}) => ({
    id: "e1", name: "The Drowned Shrine", combatants: [ogre], factions: [], party_member_ids: [] as string[],
    companion_ids: [], trap_ids: [], library_trap_ids: [], is_finished: false, ...over,
  });
  const lookups: DifficultyLookups = {
    monsterCr: (id) => (id === "ogre" ? "2" : null), npcCr: () => null, memberLevel: () => 9, companionCr: () => undefined, trapCr: () => null,
  };
  const flags = (level: number, over = {}) =>
    fightFlags({
      questIds: new Set(["q1"]), links: [{ encounterId: "e1", questId: "q1" }], encounters: [encounter(over)],
      partyIds: ["a", "b", "c", "d"], level, lookups,
    });

  it("rates the fight at the milestone's level, not the party's level today", () => {
    expect(flags(1)).toEqual([{ encounterId: "e1", name: "The Drowned Shrine", label: "Deadly", partySize: 4 }]);
    expect(flags(4)).toEqual([{ encounterId: "e1", name: "The Drowned Shrine", label: "Trivial", partySize: 4 }]);
  });

  it("stays quiet about a fight that is merely Medium or Hard", () => {
    expect(flags(2)).toEqual([]);
  });

  it("ignores a fight of another quest, and one already fought", () => {
    expect(fightFlags({ questIds: new Set(["q2"]), links: [{ encounterId: "e1", questId: "q1" }], encounters: [encounter()], partyIds: ["a"], level: 1, lookups })).toEqual([]);
    expect(flags(1, { is_finished: true })).toEqual([]);
  });

  it("judges a fight with no party of its own against the whole party", () => {
    // One character at level 1: Deadly threshold 100; with the whole party of four it is 400. 450 is Deadly either
    // way, so use level 2 where four characters make it Medium (quiet) but one alone makes it Legendary.
    // And says so: rated for the one character the encounter names, not the four of the campaign (CodeRabbit on #1227).
    expect(flags(2, { party_member_ids: ["a"] }).map((f) => [f.label, f.partySize])).toEqual([["Legendary", 1]]);
    expect(flags(2)).toEqual([]);
  });

  it("says it in words", () => {
    expect(flagText({ encounterId: "e1", name: "x", label: "Deadly", partySize: 4 }, 4)).toBe("Deadly for a level-4 party of four");
    expect(flagText({ encounterId: "e1", name: "x", label: "Legendary", partySize: 1 }, 4)).toBe("Far beyond Deadly for a level-4 party of one");
  });
});

describe("questWorths", () => {
  // PHB 2014 advancement: level 4 at 2,700 XP. 1,800 between four is 450 each.
  const party = [{ level: 3, experience_points: 2250 }, { level: 3, experience_points: 2300 }, { level: 3, experience_points: 2400 }, { level: 3, experience_points: 2600 }];

  it("gives each character's share, rounded down, and the level it lifts everyone to", () => {
    expect(questWorths([{ id: "q", title: "Before the Count", xp_reward: 1800 }], party)[0]).toMatchObject({ each: 450, bringsAllTo: 4 });
  });

  it("does not claim it lifts everyone when one character falls short", () => {
    const behind = [...party.slice(0, 3), { level: 3, experience_points: 900 }];
    expect(questWorths([{ id: "q", title: "x", xp_reward: 1800 }], behind)[0]).toMatchObject({ each: 450, bringsAllTo: null });
  });

  it("says a quest with no worth has none, rather than zero", () => {
    expect(questWorths([{ id: "q", title: "x", xp_reward: null }], party)[0]).toMatchObject({ xp: null, each: null });
  });

  it("drops the fraction as the database does: 1,001 between four is 250", () => {
    expect(questWorths([{ id: "q", title: "x", xp_reward: 1001 }], party)[0]?.each).toBe(250);
  });
});
