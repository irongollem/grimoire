import { describe, it, expect } from "vitest";
import { DEFAULT_FACTIONS } from "@/types/encounter.types";
import type { CombatantDef } from "@/types/encounter.types";
import type { Monster } from "@/types/monster.types";
import type { Npc } from "@/types/npc.types";
import type { PartyMember } from "@/types/party.types";
import type { CharacterClass } from "@/types/multiclass.types";
import type { Companion } from "@/types/companion.types";
import type { Trap } from "@/types/trap.types";
import { difficultyLookups, encounterDifficulty, type DifficultySource } from "./difficulty";

function monster(id: string, cr: string): Monster {
  return { id, name: id, stat_block: { challenge_rating: cr } } as unknown as Monster;
}
function member(id: string, level: number): PartyMember {
  return { id, name: id, level } as unknown as PartyMember;
}
function combatant(over: Partial<CombatantDef> & { id: string }): CombatantDef {
  return { monster_id: null, npc_id: null, count: 1, faction_id: "enemy", custom_name: null, ...over } as CombatantDef;
}

const rows = {
  monsters: [monster("knight", "3"), monster("wolf", "1/4")],
  npcs: [{ id: "villain", name: "Villain", stat_block: { challenge_rating: "5" } } as unknown as Npc],
  party: ["a", "b", "c", "d"].map((id) => member(id, 6)),
  characterClasses: [] as CharacterClass[],
  companions: [] as Companion[],
  traps: [] as Trap[],
};

function source(over: Partial<DifficultySource>): DifficultySource {
  return { combatants: [], factions: DEFAULT_FACTIONS, party_member_ids: [], companion_ids: [], trap_ids: [], ...over };
}

describe("encounterDifficulty", () => {
  // The bug: the list judged every encounter against level-3 players.
  it("judges against the party's real levels", () => {
    const fight = source({
      combatants: [combatant({ id: "c1", monster_id: "knight", count: 2 })],
      party_member_ids: ["a", "b", "c", "d"],
    });
    const atLevelSix = encounterDifficulty(fight, difficultyLookups(rows));
    const atLevelThree = encounterDifficulty(fight, difficultyLookups({ ...rows, party: rows.party.map((m) => member(m.id, 3)) }));

    expect(atLevelSix.partyThresholds.deadly).toBe(4 * 1400);
    expect(atLevelSix.label).toBe("Easy");
    expect(atLevelThree.label).toBe("Deadly");
  });

  it("counts a multiclassed member by the sum of their classes", () => {
    const classes = [
      { party_member_id: "a", levels: 4 },
      { party_member_id: "a", levels: 2 },
    ] as unknown as CharacterClass[];
    const lookups = difficultyLookups({ ...rows, party: [member("a", 1)], characterClasses: classes });
    expect(lookups.memberLevel("a")).toBe(6);
  });

  it("counts NPC enemies, not just monsters", () => {
    const withNpc = source({
      combatants: [combatant({ id: "c1", npc_id: "villain" })],
      party_member_ids: ["a"],
    });
    expect(encounterDifficulty(withNpc, difficultyLookups(rows)).rawXp).toBe(1800);
  });

  it("subtracts allies and adds traps", () => {
    const trap = { id: "t1", cr: "1" } as unknown as Trap;
    const fight = source({
      combatants: [
        combatant({ id: "c1", monster_id: "knight" }),
        combatant({ id: "c2", monster_id: "wolf", faction_id: "ally" }),
      ],
      trap_ids: ["t1"],
      party_member_ids: ["a"],
    });
    const result = encounterDifficulty(fight, difficultyLookups({ ...rows, traps: [trap] }));
    expect(result.allyAdjustedXp).toBe(50);
    expect(result.hazardXp).toBe(200);
  });

  it("judges an encounter with no party against one level-3 hero", () => {
    const fight = source({ combatants: [combatant({ id: "c1", monster_id: "wolf" })] });
    expect(encounterDifficulty(fight, difficultyLookups(rows)).partyThresholds.easy).toBe(75);
  });
});
