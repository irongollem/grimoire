import { describe, expect, it } from "vitest";
import {
  combatantDefenses,
  effectiveArmorClass,
  filterImmuneConditions,
  parseArmorClass,
  targetCandidates,
  withinFiveFeet,
} from "./actionTargeting";
import type { RunCombatant } from "@/types/encounter.types";
import type { Companion } from "@/types/companion.types";
import type { Monster } from "@/types/monster.types";
import type { NpcListRow } from "@/types/npc.types";
import { emptyDefenses, type Defenses } from "@/types/statBlock.types";

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

describe("parseArmorClass", () => {
  it("reads the leading number and tolerates prose", () => {
    expect(parseArmorClass("15")).toBe(15);
    expect(parseArmorClass("15 (natural armor)")).toBe(15);
    expect(parseArmorClass("")).toBeNull();
    expect(parseArmorClass("none")).toBeNull();
  });
});

describe("withinFiveFeet", () => {
  it("is null when either side is unplaced", () => {
    expect(withinFiveFeet(c("a"), c("b", { position: { x: 0, y: 0 } }))).toBeNull();
  });

  it("is true for adjacent and diagonal cells, false with a gap", () => {
    const a = c("a", { position: { x: 3, y: 3 } });
    expect(withinFiveFeet(a, c("b", { position: { x: 4, y: 4 } }))).toBe(true);
    expect(withinFiveFeet(a, c("b", { position: { x: 2, y: 3 } }))).toBe(true);
    expect(withinFiveFeet(a, c("b", { position: { x: 5, y: 3 } }))).toBe(false);
  });

  it("measures between footprints, not anchors", () => {
    const big = c("big", { position: { x: 0, y: 0 }, footprint: 3 });
    expect(withinFiveFeet(big, c("b", { position: { x: 3, y: 1 } }))).toBe(true);
    expect(withinFiveFeet(big, c("b", { position: { x: 4, y: 1 } }))).toBe(false);
    expect(withinFiveFeet(big, c("b", { position: { x: 1, y: 1 } }))).toBe(true);
  });
});

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

describe("combatantDefenses", () => {
  const fire: Defenses = { ...emptyDefenses(), immunities: [{ types: ["fire"] }] };
  const lookup = {
    monsters: [{ id: "m1", stat_block: { defenses: fire } }] as unknown as Monster[],
    npcs: [{ id: "n1", stat_block: { defenses: fire } }, { id: "n2", stat_block: null }] as unknown as NpcListRow[],
    companions: [{ id: "k1", stat_block: { defenses: fire } }] as unknown as Companion[],
  };

  it("reads the block each combatant came from", () => {
    expect(combatantDefenses(c("a", { monster_id: "m1" }), lookup)).toBe(fire);
    expect(combatantDefenses(c("a", { npc_id: "n1" }), lookup)).toBe(fire);
    expect(combatantDefenses(c("a", { companion_id: "k1" }), lookup)).toBe(fire);
  });

  it("is empty for party members, missing sources and blockless NPCs", () => {
    expect(combatantDefenses(c("a", { party_member_id: "pm" }), lookup)).toEqual(emptyDefenses());
    expect(combatantDefenses(c("a", { monster_id: "gone" }), lookup)).toEqual(emptyDefenses());
    expect(combatantDefenses(c("a", { npc_id: "n2" }), lookup)).toEqual(emptyDefenses());
  });
});

describe("filterImmuneConditions", () => {
  it("splits what lands from what the target shrugs off", () => {
    const defenses = { ...emptyDefenses(), condition_immunities: ["Poisoned" as const] };
    expect(filterImmuneConditions(["Poisoned", "Prone"], defenses)).toEqual({ apply: ["Prone"], immune: ["Poisoned"] });
  });
});

describe("effectiveArmorClass", () => {
  it("prefers a party member's sheet, then their beast form", () => {
    const pc = { type: "player", ac: "12" } as RunCombatant;
    expect(effectiveArmorClass(pc, { ac: 17, beastAc: null })).toBe("17");
    expect(effectiveArmorClass(pc, { ac: 17, beastAc: "13" })).toBe("13");
  });
  it("falls back to the combatant's own AC, or its Wild Shape overlay", () => {
    expect(effectiveArmorClass({ type: "monster", ac: "15" } as RunCombatant)).toBe("15");
    expect(effectiveArmorClass({ type: "player", ac: "12", wildshape: { beast_ac: "11" } } as RunCombatant)).toBe("11");
  });
});
