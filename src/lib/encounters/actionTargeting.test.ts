import { describe, expect, it } from "vitest";
import { targetCandidates } from "./actionTargeting";
import type { RunCombatant } from "@/types/encounter.types";

function c(id: string, over: Partial<RunCombatant> = {}): RunCombatant {
  return {
    instance_id: id,
    type: "monster",
    name: id,
    faction_id: "foes",
    initiative: 10,
    hp: 10,
    max_hp: 10,
    ac: "12",
    conditions: [],
    curses: [],
    death_saves: { successes: 0, failures: 0 },
    dex_mod: 0,
    ...over,
  };
}

describe("targetCandidates", () => {
  it("lists the living before the dead, opponents before allies, then initiative", () => {
    const attacker = c("me", { faction_id: "foes" });
    const all = [
      attacker,
      c("ally-low", { faction_id: "foes", initiative: 5 }),
      c("ally-high", { faction_id: "foes", initiative: 15 }),
      c("hero-low", { type: "player", faction_id: "party", initiative: 8 }),
      c("hero-high", { type: "player", faction_id: "party", initiative: 18 }),
      c("dead-hero", { faction_id: "party", hp: 0, initiative: 30 }),
      c("downed-hero", { type: "player", faction_id: "party", hp: 0, initiative: 1 }),
    ];
    expect(targetCandidates(attacker, all).map((x) => x.instance_id)).toEqual([
      "hero-high",
      "hero-low",
      "downed-hero",
      "ally-high",
      "ally-low",
      "dead-hero",
    ]);
  });
});
