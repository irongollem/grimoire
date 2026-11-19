import { describe, expect, it } from "vitest";
import { applyFightCommand } from "./fightCommands.ts";
import type { AdoptedStats } from "../encounterCombatLogic.ts";
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

  it("fails if blanking an initiative with set_initiative null changes anything but that one field and where the pointer follows the acting creature", () => {
    const state = fight([combatant("a", { initiative: 12 }), combatant("b", { initiative: 8 })], [], { activeIndex: 1 });
    const result = applyFightCommand(deepFreeze(state), { type: "set_initiative", instanceId: "a", value: null }, deps());
    expect(result.state.combatants.map((c) => c.initiative)).toEqual([null, 8]);
    // Hand-worked: b (8) was acting at index 1. With a blank, the order is [b 8, a blank], so the pointer follows b to 0.
    expect(result.state.activeIndex).toBe(0);
    expect(result.effects).toEqual([]);
  });
});

describe("the fight's own commands", () => {
  it("fails if a curse is added twice, added blank, or added to a combatant that is not there", () => {
    const state = deepFreeze(fight([combatant("a")]));
    const once = applyFightCommand(state, { type: "add_curse", instanceId: "a", curse: " hex " }, deps()).state;
    expect(once.combatants[0].curses).toEqual(["hex"]);
    expect(applyFightCommand(once, { type: "add_curse", instanceId: "a", curse: "hex" }, deps()).state.combatants[0].curses).toEqual(["hex"]);
    expect(applyFightCommand(state, { type: "add_curse", instanceId: "a", curse: "  " }, deps()).state).toBe(state);
    expect(applyFightCommand(state, { type: "add_curse", instanceId: "zz", curse: "hex" }, deps()).state).toBe(state);
  });

  it("fails if removing one curse drops the others", () => {
    const state = deepFreeze(fight([combatant("a", { curses: ["hex", "bane"] })]));
    expect(applyFightCommand(state, { type: "remove_curse", instanceId: "a", curse: "hex" }, deps()).state.combatants[0].curses).toEqual(["bane"]);
  });

  it("fails if set_reveal_state touches another combatant", () => {
    const state = deepFreeze(fight([combatant("a"), combatant("b", { reveal_state: "hidden" })]));
    const next = applyFightCommand(state, { type: "set_reveal_state", instanceId: "a", revealState: "revealed" }, deps()).state;
    expect(next.combatants.map((c) => c.reveal_state)).toEqual(["revealed", "hidden"]);
  });

  it("fails if a newcomer with a higher initiative takes the turn from the acting combatant", () => {
    // Order a 15, b 10, c 5 with b acting (index 1). Newcomer n at 12 sorts to a 15, n 12, b 10, c 5, so b is index 2.
    const state = fight([combatant("a", { initiative: 15 }), combatant("b", { initiative: 10 }), combatant("c", { initiative: 5 })], [], { activeIndex: 1 });
    const result = applyFightCommand(deepFreeze(state), { type: "add_combatants", combatants: [combatant("n", { initiative: 12 })] }, deps());
    expect(result.state.combatants.map((c) => c.instance_id)).toEqual(["a", "b", "c", "n"]);
    expect(result.state.activeIndex).toBe(2);
  });

  it("fails if a newcomer already in the fight is added a second time", () => {
    const state = deepFreeze(fight([combatant("a")]));
    const same = applyFightCommand(state, { type: "add_combatants", combatants: [combatant("a", { hp: 99 })] }, deps()).state;
    expect(same).toBe(state);
    const twice = applyFightCommand(state, { type: "add_combatants", combatants: [combatant("n"), combatant("n")] }, deps()).state;
    expect(twice.combatants.map((c) => c.instance_id)).toEqual(["a", "n"]);
  });

  it("fails if adopting stats forgets the damage already taken, or runs on a combatant with real numbers", () => {
    const stats: AdoptedStats = { max_hp: 20, ac: "15", dex_mod: 2, initiative_bonus: null, legendary: false };
    // Stand-in 7 of 10 is 3 down; on a maximum of 20 that is 17. The marker goes.
    const state = deepFreeze(fight([combatant("a", { hp: 7, max_hp: 10, placeholder_stats: true }), combatant("b", { hp: 5, max_hp: 7 })]));
    const next = applyFightCommand(state, { type: "adopt_stats", instanceId: "a", stats }, deps()).state;
    expect(next.combatants[0]).toMatchObject({ hp: 17, max_hp: 20, ac: "15", dex_mod: 2 });
    expect(next.combatants[0].placeholder_stats).toBeUndefined();
    expect(applyFightCommand(state, { type: "adopt_stats", instanceId: "b", stats }, deps()).state.combatants[1]).toBe(state.combatants[1]);
  });

  it("fails if fire_event does not fire a manual event or check_events fires a manual one", () => {
    const manual = broadcastEvent("m", { type: "manual" }, "Now.");
    const due = broadcastEvent("r1", { type: "round_start", round: 1 }, "Round one");
    const state = deepFreeze(fight([combatant("a")], [manual, due]));
    expect(applyFightCommand(state, { type: "fire_event", eventId: "m" }, deps()).state.eventsFired).toEqual(["m"]);
    // The check fires the due round trigger and leaves the manual one waiting.
    const checked = applyFightCommand(state, { type: "check_events" }, deps());
    expect(checked.state.eventsFired).toEqual(["r1"]);
    expect(checked.effects).toEqual([{ type: "broadcast", message: "Round one" }]);
  });
});

describe("show_defense (#1021)", () => {
  const show = (state: ReturnType<typeof fight>, instanceId: string, damageType: string, defense: "resistant" | "immune" | "vulnerable") =>
    applyFightCommand(deepFreeze(state), { type: "show_defense", instanceId, damageType, defense }, deps());

  // Bug caught: the command is accepted but nothing is written, or it is written on the wrong creature.
  it("remembers a defense on the creature that showed it and no other", () => {
    const state = fight([combatant("a"), combatant("b")]);
    const next = show(state, "a", "fire", "resistant").state;
    expect(next.combatants[0].shown_defenses).toEqual({ fire: "resistant" });
    expect(next.combatants[1].shown_defenses).toBeUndefined();
  });

  // Bug caught: showing the same thing again makes a new version of the fight (a save and a broadcast for nothing).
  it("returns the very same state when the defense is already shown", () => {
    const once = show(fight([combatant("a")]), "a", "fire", "resistant").state;
    expect(show(once, "a", "fire", "resistant").state).toBe(once);
  });

  // Bug caught: a second type replaces the first instead of adding to it, or a changed defense is not updated.
  it("keeps what it already knew and takes a changed defense for the same type", () => {
    const first = show(fight([combatant("a")]), "a", "fire", "resistant").state;
    const second = show(first, "a", "slashing", "vulnerable").state;
    expect(second.combatants[0].shown_defenses).toEqual({ fire: "resistant", slashing: "vulnerable" });
    expect(show(second, "a", "fire", "immune").state.combatants[0].shown_defenses).toEqual({ fire: "immune", slashing: "vulnerable" });
  });

  it("leaves the fight alone for a creature that is not in it", () => {
    const state = fight([combatant("a")]);
    expect(show(state, "ghost", "fire", "immune").state).toBe(state);
  });
});

describe("show_deed (#1021)", () => {
  const deed = (state: ReturnType<typeof fight>, instanceId: string, d: Extract<Parameters<typeof applyFightCommand>[1], { type: "show_deed" }>["deed"]) =>
    applyFightCommand(deepFreeze(state), { type: "show_deed", instanceId, deed: d }, deps());

  // Bug caught: the second deed replaces the first instead of adding to it, so damage per turn is only the last blow.
  it("adds each deed to what the fight has seen of that creature and no other", () => {
    const first = deed(fight([combatant("a"), combatant("b")]), "a", { dealt: 6, melee: 1 }).state;
    const second = deed(first, "a", { dealt: 4, ranged: 1, cast: 1 }).state;
    expect(second.combatants[0].shown_deeds).toEqual({ dealt: 10, turns: 0, cast: 1, ranged: 1, melee: 1 });
    expect(second.combatants[1].shown_deeds).toBeUndefined();
  });

  // Bug caught: a deed of nothing makes a new version of the fight (a save and a broadcast for nothing).
  it("returns the very same state for a deed of zero everything", () => {
    const state = fight([combatant("a")]);
    expect(deed(state, "a", {}).state).toBe(state);
    expect(deed(state, "a", { dealt: 0, cast: 0, ranged: 0, melee: 0 }).state).toBe(state);
  });

  it("leaves the fight alone for a creature that is not in it", () => {
    const state = fight([combatant("a")]);
    expect(deed(state, "ghost", { dealt: 3 }).state).toBe(state);
  });
});
