import { describe, expect, it } from "vitest";
import { sortCombatantsByInitiative } from "../combatantSort.ts";
import { joinFight } from "./fightSpawn.ts";
import { combatant, deepFreeze } from "./fightTestKit.ts";

// Who the pointer names, the way the runner reads it.
const acting = (f: { combatants: Parameters<typeof sortCombatantsByInitiative>[0]; activeIndex: number }) =>
  sortCombatantsByInitiative(f.combatants)[f.activeIndex]?.instance_id;

describe("joinFight", () => {
  // Order by initiative: ogre 20, bandit 10. The bandit is acting, so the pointer is 1.
  const running = deepFreeze({
    combatants: [combatant("ogre", { initiative: 20 }), combatant("bandit", { initiative: 10 })],
    activeIndex: 1,
    started: true,
  });

  it("keeps the turn with the bandit when a goblin joins ahead of it (the newcomer taking the turn, and the bandit acting twice)", () => {
    // A goblin on 15 sorts between them: ogre 20, goblin 15, bandit 10. Position 1 is now the goblin.
    const joined = joinFight(running, [combatant("goblin", { initiative: 15 })]);
    expect(acting(joined)).toBe("bandit");
    expect(joined.activeIndex).toBe(2);
  });

  it("leaves the pointer alone when the newcomer sorts in after whoever is acting", () => {
    const joined = joinFight(running, [combatant("rat", { initiative: 3 })]);
    expect(joined.activeIndex).toBe(1);
    expect(acting(joined)).toBe("bandit");
  });

  it("moves nothing in the lobby, where there is no turn yet and initiative is still being rolled", () => {
    const lobby = { ...running, started: false, activeIndex: 0 };
    expect(joinFight(lobby, [combatant("goblin", { initiative: 30 })]).activeIndex).toBe(0);
  });

  it("adds the newcomers to the roster without touching the one it was given", () => {
    const joined = joinFight(running, [combatant("goblin", { initiative: 15 })]);
    expect(joined.combatants.map((c) => c.instance_id)).toEqual(["ogre", "bandit", "goblin"]);
    expect(running.combatants).toHaveLength(2);
  });
});
