import { describe, expect, it } from "vitest";
import type { RunCombatant } from "@/types/encounter.types";
import { combatTurnLine } from "./turnLine";

function c(o: Partial<RunCombatant> & Pick<RunCombatant, "instance_id">): RunCombatant {
  return {
    type: "monster",
    name: o.instance_id,
    faction_id: "f",
    initiative: 10,
    hp: 1,
    max_hp: 1,
    ac: "10",
    conditions: [],
    curses: [],
    death_saves: { successes: 0, failures: 0 },
    dex_mod: 0,
    ...o,
  } as RunCombatant;
}

const base = { is_running: true, current_round: 2, active_combatant_index: 0 };
const me = c({ instance_id: "p-me", type: "player", party_member_id: "me", name: "Me", initiative: 12 });
const goblin = c({ instance_id: "g", name: "Goblin", initiative: 18, reveal_state: "revealed" });
const ally = c({ instance_id: "p-ally", type: "player", party_member_id: "ally", name: "Ally", initiative: 15 });
const secret = c({ instance_id: "s", name: "Secret Assassin", initiative: 14, reveal_state: "hidden" });

describe("combatTurnLine", () => {
  it("is null when not running or no state", () => {
    expect(combatTurnLine(null, "me")).toBeNull();
    expect(combatTurnLine({ ...base, is_running: false, combatants_live: [me] }, "me")).toBeNull();
  });
  it("reports the lobby", () => {
    expect(combatTurnLine({ ...base, current_round: 0, combatants_live: [me] }, "me")).toEqual({
      round: 0,
      status: "lobby",
      afterName: null,
    });
  });
  it("detects my turn by instance id", () => {
    const line = combatTurnLine(
      { ...base, active_combatant_instance_id: "p-me", combatants_live: [goblin, ally, me] },
      "me",
    );
    expect(line).toEqual({ round: 2, status: "your-turn", afterName: "Ally" });
  });
  it("detects up-next and waiting by sorted index", () => {
    const live = [me, goblin, ally]; // sorted: goblin 18, ally 15, me 12
    expect(combatTurnLine({ ...base, active_combatant_index: 1, combatants_live: live }, "me")?.status).toBe(
      "up-next",
    );
    expect(combatTurnLine({ ...base, active_combatant_index: 0, combatants_live: live }, "me")?.status).toBe(
      "waiting",
    );
  });
  it("wraps up-next from the last combatant to the first", () => {
    const line = combatTurnLine({ ...base, active_combatant_index: 2, combatants_live: [goblin, ally, me] }, "ally");
    expect(line?.status).toBe("waiting");
    const line2 = combatTurnLine({ ...base, active_combatant_index: 2, combatants_live: [ally, goblin, me].map((x) => ({ ...x })) }, "me");
    expect(line2?.status).toBe("your-turn");
  });
  it("never names a hidden combatant before me", () => {
    const line = combatTurnLine({ ...base, active_combatant_index: 0, combatants_live: [goblin, secret, me] }, "me");
    expect(line?.afterName).toBeNull();
    expect(JSON.stringify(line)).not.toContain("Assassin");
  });
  it("has no afterName when first in the order", () => {
    const line = combatTurnLine({ ...base, active_combatant_index: 0, combatants_live: [me, ally].map((x) => ({ ...x, initiative: x === me ? 20 : 5 })) }, "me");
    expect(line).toEqual({ round: 2, status: "your-turn", afterName: null });
  });
  it("waits when I am not in the fight", () => {
    expect(combatTurnLine({ ...base, combatants_live: [goblin, ally] }, "me")?.status).toBe("waiting");
    expect(combatTurnLine({ ...base, combatants_live: [goblin, ally] }, null)?.status).toBe("waiting");
  });
});
