import { describe, expect, it } from "vitest";
import type { EncounterEvent } from "@/types/encounter.types";
import { checkFightEvents, fireFightEvent } from "./fightEvents.ts";
import { broadcastEvent, combatant, deepFreeze, deps, fight } from "./fightTestKit.ts";

const messages = (effects: Array<{ type: string; message?: string }>) =>
  effects.flatMap((e) => (e.type === "broadcast" ? [e.message] : []));

describe("checkFightEvents", () => {
  it("fails if a fire-once event fires again once it is in eventsFired", () => {
    const event = broadcastEvent("e1", { type: "round_start", round: 1 }, "Once only");
    const first = checkFightEvents(deepFreeze(fight([combatant("a")], [event])), deps());
    expect(messages(first.effects)).toEqual(["Once only"]);
    expect(first.state.eventsFired).toEqual(["e1"]);
    const second = checkFightEvents(deepFreeze(first.state), deps());
    expect(second.effects).toEqual([]);
    expect(second.state.eventsFired).toEqual(["e1"]);
  });

  it("fails if an event that is not fire-once stops firing on every check", () => {
    const event = broadcastEvent("e1", { type: "round_start", round: 1 }, "Again", false);
    const first = checkFightEvents(fight([combatant("a")], [event]), deps());
    const second = checkFightEvents(first.state, deps());
    expect(messages(second.effects)).toEqual(["Again"]);
    // Listed once however often it fires.
    expect(second.state.eventsFired).toEqual(["e1"]);
  });

  it("fails if a manual trigger ever fires by itself", () => {
    const event = broadcastEvent("e1", { type: "manual" }, "Only on the DM's press");
    const result = checkFightEvents(fight([combatant("a")], [event]), deps());
    expect(result.effects).toEqual([]);
    expect(result.state.eventsFired).toEqual([]);
  });

  it("fails if events fire before combat has started", () => {
    // A creature already at 0 HP in the lobby would satisfy this trigger, so only the started check holds it back.
    const event = broadcastEvent("e1", { type: "combatant_dies", combatant_def_id: "boss" }, "Too early");
    const result = checkFightEvents(fight([combatant("a", { def_id: "boss", hp: 0 })], [event], { started: false, round: 0 }), deps());
    expect(result.effects).toEqual([]);
  });

  it("fails if a round trigger fires a round early", () => {
    const event = broadcastEvent("e1", { type: "round_start", round: 3 }, "Round three");
    expect(checkFightEvents(fight([combatant("a")], [event], { round: 2 }), deps()).effects).toEqual([]);
    expect(messages(checkFightEvents(fight([combatant("a")], [event], { round: 3 }), deps()).effects)).toEqual(["Round three"]);
  });

  it("fails if a spawn does not join the fight rolled at the spawn's own modifier, in faction, and announced", () => {
    // Goblin: 2d6 averages 7 hit points; DEX 14 is +2; the injected d20 is 13, so initiative 13 + 2 = 15.
    const event: EncounterEvent = {
      id: "reinforce",
      name: "Reinforcements",
      trigger: { type: "round_start", round: 2 },
      fire_once: true,
      actions: [
        { type: "spawn_combatants", spawns: [{ monster_id: "m-goblin", faction_id: "foes", count: 2 }] },
        { type: "broadcast_message", message: "More come." },
      ],
    };
    const result = checkFightEvents(deepFreeze(fight([combatant("a")], [event], { round: 2 })), deps());
    const spawned = result.state.combatants.filter((c) => c.monster_id === "m-goblin");
    expect(spawned.map((c) => c.instance_id)).toEqual(["spawn-m-goblin-1000-0", "spawn-m-goblin-1000-1"]);
    expect(spawned.map((c) => c.name)).toEqual(["Goblin 1", "Goblin 2"]);
    expect(spawned.every((c) => c.initiative === 15 && c.hp === 7 && c.max_hp === 7 && c.ac === "15" && c.faction_id === "foes")).toBe(true);
    expect(result.effects.map((e) => e.type)).toEqual(["spawned", "broadcast"]);
    expect(result.state.combatants).toHaveLength(3);
  });

  it("fails if a spawn during a lobby (not started) is handed an initiative", () => {
    // fireFightEvent works in the lobby; the spawn joins unrolled, like any roster entry.
    const event: EncounterEvent = {
      id: "e1", name: "e1", trigger: { type: "manual" }, fire_once: true,
      actions: [{ type: "spawn_combatants", spawns: [{ monster_id: "m-goblin", faction_id: "foes", count: 1 }] }],
    };
    const result = fireFightEvent(fight([combatant("a")], [event], { started: false, round: 0 }), "e1", deps());
    expect(result.state.combatants[1].initiative).toBeNull();
  });

  it("fails if an environment effect is not announced as 'label: description'", () => {
    const event: EncounterEvent = {
      id: "e1", name: "e1", trigger: { type: "round_start", round: 1 }, fire_once: true,
      actions: [{ type: "environment_effect", label: "Collapsing floor", description: "The flagstones give way." }],
    };
    const result = checkFightEvents(fight([combatant("a")], [event]), deps());
    expect(messages(result.effects)).toEqual(["Collapsing floor: The flagstones give way."]);
  });

  it("fails if a spawn of a monster the sources do not hold throws or loses the fired mark", () => {
    const event: EncounterEvent = {
      id: "e1", name: "e1", trigger: { type: "round_start", round: 1 }, fire_once: true,
      actions: [{ type: "spawn_combatants", spawns: [{ monster_id: "nope", faction_id: "foes", count: 1 }] }],
    };
    const result = checkFightEvents(fight([combatant("a")], [event]), deps());
    expect(result.state.combatants).toHaveLength(1);
    expect(result.state.eventsFired).toEqual(["e1"]);
  });
});

describe("fireFightEvent", () => {
  it("fails if the DM's press on a manual event does nothing", () => {
    const event = broadcastEvent("e1", { type: "manual" }, "Pressed");
    const result = fireFightEvent(deepFreeze(fight([combatant("a")], [event])), "e1", deps());
    expect(messages(result.effects)).toEqual(["Pressed"]);
    expect(result.state.eventsFired).toEqual(["e1"]);
  });

  it("fails if an id that names no event changes the fight", () => {
    const state = fight([combatant("a")], [broadcastEvent("e1", { type: "manual" }, "x")]);
    const result = fireFightEvent(state, "missing", deps());
    expect(result.state).toBe(state);
    expect(result.effects).toEqual([]);
  });
});
