import { describe, expect, it } from "vitest";
import { applyFightCommand } from "./fightCommands.ts";
import { broadcastEvent, combatant, deepFreeze, deps, fight, pc } from "./fightTestKit.ts";

describe("applyFightCommand", () => {
  it("fails if damage that kills a boss does not run the event check that follows", () => {
    const event = broadcastEvent("boss-down", { type: "combatant_dies", combatant_def_id: "boss" }, "The boss falls.");
    const state = fight([combatant("b", { def_id: "boss", hp: 10, max_hp: 10 }), pc("p")], [event]);
    const result = applyFightCommand(deepFreeze(state), { type: "adjust_hp", instanceId: "b", delta: -10 }, deps());
    expect(result.state.combatants[0].hp).toBe(0);
    expect(result.state.eventsFired).toEqual(["boss-down"]);
    // The reducer's own events come first, then what the check raised.
    expect(result.effects.map((e) => e.type)).toEqual(["check_events", "broadcast"]);
  });

  it("fails if a command that never asked for an event check runs one anyway", () => {
    // A round-1 trigger is true for the whole fight, so any check at all would fire it.
    const event = broadcastEvent("r1", { type: "round_start", round: 1 }, "Round one");
    const result = applyFightCommand(fight([combatant("a")], [event]), { type: "set_initiative", instanceId: "a", value: 12 }, deps());
    expect(result.state.combatants[0].initiative).toBe(12);
    expect(result.state.eventsFired).toEqual([]);
    expect(result.effects).toEqual([]);
  });

  it("fails if wrapping into round 2 does not fire the round-2 event", () => {
    // Two combatants, the second one's turn ends: the order wraps and round 1 becomes round 2.
    const event = broadcastEvent("r2", { type: "round_start", round: 2 }, "Round two");
    const state = fight([combatant("a", { initiative: 15 }), combatant("b", { initiative: 10 })], [event], { activeIndex: 1 });
    const result = applyFightCommand(state, { type: "next_turn" }, deps());
    expect(result.state.round).toBe(2);
    expect(result.state.activeIndex).toBe(0);
    expect(result.state.eventsFired).toEqual(["r2"]);
  });

  it("fails if the events and what has fired are lost on the way through the reducer", () => {
    const event = broadcastEvent("r5", { type: "round_start", round: 5 }, "x");
    const state = fight([combatant("a")], [event], { eventsFired: ["old"] });
    const result = applyFightCommand(state, { type: "next_turn" }, deps());
    expect(result.state.events).toBe(state.events);
    expect(result.state.eventsFired).toEqual(["old"]);
  });
});
