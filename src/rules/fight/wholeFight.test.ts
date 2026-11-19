/**
 * A whole fight driven through the pure functions alone: no store, no Vue, no
 * clock, no random. This is the proof that a fight needs no browser, which is
 * what a server function advancing a fight relies on. Every expected value is
 * worked out from the rule or the fixture in the comment above it.
 */
import { describe, expect, it } from "vitest";
import type { EncounterEvent } from "@/types/encounter.types";
import { applyFightCommand } from "./fightCommands.ts";
import { endOfFightPatches } from "./fightEnd.ts";
import { ingestPartyRow, type PartyIngestRow } from "./partyIngest.ts";
import { isTurnEvent, type FightEffect, type FightState } from "./fightState.ts";
import { broadcastEvent, combatant, deepFreeze, deps, fight, pc } from "./fightTestKit.ts";

function step(state: FightState, effects: FightEffect[]) {
  return { state: deepFreeze(state), effects };
}

describe("a whole fight, with no browser", () => {
  it("runs from the lobby to the end-of-fight patches", () => {
    const reinforce: EncounterEvent = {
      id: "reinforce",
      name: "Reinforcements",
      trigger: { type: "round_start", round: 2 },
      fire_once: true,
      actions: [
        { type: "spawn_combatants", spawns: [{ monster_id: "m-goblin", faction_id: "foes", count: 1 }] },
        { type: "broadcast_message", message: "Goblins pour in!" },
      ],
    };
    const manual = broadcastEvent("alarm", { type: "manual" }, "The alarm bell rings.");
    // Nessa: a player character, 12 of 20 HP. Brug: a monster, 30 HP.
    const lobby = deepFreeze(
      fight(
        [pc("p-nessa", { name: "Nessa", hp: 12, max_hp: 20, initiative: null }), combatant("brug", { hp: 30, max_hp: 30, initiative: null })],
        [reinforce, manual],
        { started: false, round: 0 },
      ),
    );
    const d = deps();

    // 1. Initiative set: Nessa 15, Brug 10. Setting a value is not starting.
    let s = step(applyFightCommand(lobby, { type: "set_initiative", instanceId: "p-nessa", value: 15 }, d).state, []);
    s = step(applyFightCommand(s.state, { type: "set_initiative", instanceId: "brug", value: 10 }, d).state, []);
    expect(s.state.started).toBe(false);
    expect(s.state.combatants.map((c) => c.initiative)).toEqual([15, 10]);

    // 2. Combat starts: round 1, the highest initiative (Nessa, 15) is up first.
    let r = applyFightCommand(s.state, { type: "start_combat" }, d);
    s = step(r.state, r.effects);
    expect(s.state).toMatchObject({ started: true, round: 1, activeIndex: 0 });
    expect(s.effects.filter(isTurnEvent).map((e) => e.type)).toEqual(["round_started", "turn_started"]);

    // 3. Nessa's turn ends, Brug's begins (index 1 in the order 15, 10). Round 1 is under the event's round 2: it holds back.
    r = applyFightCommand(s.state, { type: "next_turn" }, d);
    s = step(r.state, r.effects);
    expect(s.state).toMatchObject({ round: 1, activeIndex: 1 });
    expect(s.state.eventsFired).toEqual([]);

    // 4. Brug hits Nessa for 14. She had 12, so she goes to 0 with 2 left over, far under her maximum of 20:
    // she drops (PHB 2014 "Dropping to 0 Hit Points"), is Unconscious, and her death saves start at none.
    r = applyFightCommand(s.state, { type: "adjust_hp", instanceId: "p-nessa", delta: -14 }, d);
    s = step(r.state, r.effects);
    const down = s.state.combatants[0];
    expect(down.hp).toBe(0);
    expect(down.conditions).toEqual([{ name: "Unconscious" }]);
    expect(down.death_saves).toEqual({ successes: 0, failures: 0 });
    expect(s.effects).toContainEqual({ type: "dying_outcome", instanceId: "p-nessa", outcome: "dropped" });
    expect(s.effects).toContainEqual({
      type: "player_persist",
      partyMemberId: "pm-p-nessa",
      patch: { current_hp: 0, temp_hp: 0, wildshape_state: null, conditions: [{ name: "Unconscious" }] },
    });

    // 5. Brug's turn ends: the order wraps into round 2 and the round-2 event fires. The goblin (2d6 = 7 HP on average, DEX 14 = +2)
    // rolls the injected 13 for initiative, 13 + 2 = 15, and joins under the injected clock's id. Nessa, down, still gets her turn
    // (a downed player takes turns for death saves), so the cursor is on her at index 0.
    r = applyFightCommand(s.state, { type: "next_turn" }, d);
    s = step(r.state, r.effects);
    expect(s.state).toMatchObject({ round: 2, activeIndex: 0, eventsFired: ["reinforce"] });
    const goblin = s.state.combatants.find((c) => c.monster_id === "m-goblin");
    expect(goblin).toMatchObject({ instance_id: "spawn-m-goblin-1000-0", initiative: 15, hp: 7, max_hp: 7, faction_id: "foes" });
    expect(s.effects.filter((e) => e.type === "broadcast")).toEqual([{ type: "broadcast", message: "Goblins pour in!" }]);
    expect(s.effects.filter((e) => e.type === "spawned")).toHaveLength(1);
    // The manual event never fires by itself.
    expect(s.state.eventsFired).not.toContain("alarm");

    // 6. Fire-once: Nessa's turn ends, the goblin's begins (order: Nessa 15 (players win a tie), goblin 15, Brug 10, so index 1).
    // Round 2 is still round 2, the event is already fired, so nothing spawns and nothing is announced.
    r = applyFightCommand(s.state, { type: "next_turn" }, d);
    s = step(r.state, r.effects);
    expect(s.state).toMatchObject({ round: 2, activeIndex: 1 });
    expect(s.state.combatants).toHaveLength(3);
    expect(s.effects.filter((e) => e.type === "broadcast")).toEqual([]);

    // 7. Nessa rolls death saves on her own sheet: one success, one failure, still at 0 HP. Her row is ingested, nothing is written back.
    const sheet = (over: Partial<PartyIngestRow>): PartyIngestRow => ({
      id: "pm-p-nessa", current_hp: 0, temp_hp: 0, current_initiative: 15, conditions: [{ name: "Unconscious" }],
      concentration: null, wildshape_state: null, death_save_successes: 1, death_save_failures: 1, ...over,
    });
    let ing = ingestPartyRow(s.state, sheet({}), { live: true, lastConcentration: undefined }, d);
    s = step(ing.state, ing.effects);
    expect(s.state.combatants[0].death_saves).toEqual({ successes: 1, failures: 1 });
    expect(s.state.combatants[0].hp).toBe(0);

    // 8. The cleric heals her for 5. From 0 she is up at 5, no longer Unconscious, and her saves reset (the rule above).
    r = applyFightCommand(s.state, { type: "adjust_hp", instanceId: "p-nessa", delta: 5 }, d);
    s = step(r.state, r.effects);
    expect(s.state.combatants[0]).toMatchObject({ hp: 5, conditions: [], death_saves: { successes: 0, failures: 0 } });
    expect(s.effects).toContainEqual({ type: "dying_outcome", instanceId: "p-nessa", outcome: "revived-by-healing" });

    // 9. Nessa drinks a potion on her own sheet: her row now says 9 HP, 3 temp HP. The fight adopts both verbatim (9 of 20),
    // and the roll she made on her sheet is not rolled again (her initiative is already 15).
    ing = ingestPartyRow(
      s.state,
      sheet({ current_hp: 9, temp_hp: 3, conditions: [], death_save_successes: 0, death_save_failures: 0 }),
      { live: true, lastConcentration: undefined },
      d,
    );
    s = step(ing.state, ing.effects);
    expect(s.state.combatants[0]).toMatchObject({ hp: 9, temp_hp: 3, initiative: 15 });
    expect(ing.matched).toBe(true);

    // 10. The fight ends. Nessa goes back to her row as she stands (9 HP, no conditions, no curses, saves clear, initiative blank).
    // The goblin and Brug are monsters: nothing is written for them. No companions, no site, so no explore party.
    const end = endOfFightPatches({ combatants: s.state.combatants, tokensAtEnd: s.state.combatants, exploreParty: null, siteId: null });
    expect(end).toEqual({
      partyMembers: [
        {
          id: "pm-p-nessa",
          patch: { current_hp: 9, conditions: [], curses: [], current_initiative: null, death_save_successes: 0, death_save_failures: 0 },
        },
      ],
      companions: [],
      exploreParty: null,
    });
  });
});
