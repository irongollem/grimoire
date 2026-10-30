import { describe, expect, it } from "vitest";
import { sameLiveRoster } from "./liveRoster";
import type { RunCombatant } from "@/types/encounter.types";

const goblin = { instance_id: "g1", name: "Goblin", type: "monster", hp: 7, max_hp: 7, initiative: 12, conditions: [] } as unknown as RunCombatant;
const runner = { round: 2, activeIndex: 1, combatants: [goblin], eventsFired: ["e1"] };
const row = { current_round: 2, active_combatant_index: 1, combatants_live: [goblin], events_fired: ["e1"] };

describe("sameLiveRoster", () => {
  // The runner re-hydrates whenever this says false; a false on its own echo
  // made every push hydrate, push again and ring again, forever.
  it("matches the row a push wrote back, whatever order its keys came back in and wherever the tokens stand", () => {
    const echoed = JSON.parse(JSON.stringify({ position: { x: 3, y: 4 }, conditions: [], initiative: 12, max_hp: 7, hp: 7, type: "monster", name: "Goblin", instance_id: "g1" }));
    expect(sameLiveRoster({ ...runner, combatants: [{ ...goblin, temp_hp: undefined } as RunCombatant] }, { ...row, combatants_live: [echoed] })).toBe(true);
  });

  // A change from another device must be adopted: that is the only way a second runner sees it.
  it.each([
    ["the HP", { combatants_live: [{ ...goblin, hp: 3 }] }],
    ["the round", { current_round: 3 }],
    ["the turn", { active_combatant_index: 0 }],
    ["the fired events", { events_fired: ["e1", "e2"] }],
  ])("tells a row whose %s changed elsewhere from the runner's own", (_what, change) => {
    expect(sameLiveRoster(runner, { ...row, ...change })).toBe(false);
  });
});
