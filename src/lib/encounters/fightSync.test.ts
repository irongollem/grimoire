import { describe, expect, it } from "vitest";
import type { EncounterEvent } from "@/types/encounter.types";
import type { FightCommand } from "@/rules/fight/fightCommands";
import type { FightEffect, FightState } from "@/rules/fight/fightState";
import { RAGING, ragingCondition } from "@/rules/fight/allies/features";
import { combatant, deps, fight } from "@/rules/fight/fightTestKit";
import {
  MAX_BATCH_COMMANDS,
  confirmAnswer,
  dropPending,
  observeRow,
  queueCommand,
  replay,
  sealHead,
  startSync,
  unseenEffects,
  waitsForServer,
  type ConfirmedFight,
  type FightFrame,
  type FightSync,
} from "./fightSync";

const frame: FightFrame = { randomizeInitiativeEachRound: false, ruleset: "2014", lairEnabled: false, lairOwnerInstanceId: null, events: [] };

function confirmedWith(hp: number, version: number): ConfirmedFight {
  const state = fight([combatant("ogre", { hp, max_hp: 30, initiative: 10 }), combatant("b", { initiative: 5 })]);
  return {
    combatants: state.combatants,
    round: state.round,
    activeIndex: state.activeIndex,
    eventsFired: state.eventsFired,
    lairFiredRounds: state.lairFiredRounds,
    version,
  };
}

let ids = 0;
const newId = () => `batch-${++ids}`;

const hit = (delta: number): FightCommand => ({ type: "adjust_hp", instanceId: "ogre", delta });
const hpOf = (state: { combatants: { instance_id: string; hp: number }[] }) => state.combatants.find((c) => c.instance_id === "ogre")?.hp;

/** The command as the screen makes it: applied to what is shown, queued behind. */
function make(sync: FightSync, command: FightCommand, extra?: Partial<Parameters<typeof deps>[0]>) {
  const shown = replay(sync, frame, deps(extra));
  return queueCommand(sync, shown, command, deps(extra), newId);
}

describe("showing a command before the server has answered", () => {
  it("fails if a command is not shown the moment it is made (the DM would wait for a round trip)", () => {
    const queued = make(startSync(confirmedWith(20, 5)), hit(-4));
    expect(queued.waitsForServer).toBe(false);
    expect(queued.shown && hpOf(queued.shown)).toBe(16);
    expect(queued.sync.pending).toHaveLength(1);
  });
});

describe("a reply or a read that differs from what was shown", () => {
  // Two DMs, one creature at 20. A deals 4, B deals 3. The server applies them in some order and both
  // screens must end on 20 - 4 - 3 = 13, never 16 (A's own screen) or 17 (B's alone).
  it("fails if a read that holds only the other DM's 3 damage replaces my pending 4 instead of lying under it", () => {
    let a = startSync(confirmedWith(20, 5));
    a = make(a, hit(-4)).sync; // A sees 16, batch sent but not answered
    a = sealHead(a)!.sync;
    // The doorbell: B's 3 landed first (version 6), A's batch is not in it yet.
    a = observeRow(a, { ...confirmedWith(17, 6), appliedIds: [] });
    expect(hpOf(replay(a, frame, deps()))).toBe(13);
    // A's reply: the server applied A's 4 on top of B's 3.
    const answered = confirmAnswer(a, a.pending[0].id, confirmedWith(13, 7));
    expect(hpOf(replay(answered.sync, frame, deps()))).toBe(13);
    expect(answered.sync.pending).toHaveLength(0);
  });

  it("fails if B's screen, whose 3 damage is still pending, does not end on 13 when the row already holds A's 4", () => {
    let b = startSync(confirmedWith(20, 5));
    b = make(b, hit(-3)).sync; // B sees 17
    b = sealHead(b)!.sync;
    b = observeRow(b, { ...confirmedWith(16, 6), appliedIds: [] });
    expect(hpOf(replay(b, frame, deps()))).toBe(13);
    const answered = confirmAnswer(b, b.pending[0].id, confirmedWith(13, 7));
    expect(hpOf(replay(answered.sync, frame, deps()))).toBe(13);
  });

  it("fails if a read that already holds my in-flight batch lays it over a second time (damage shown twice until the reply)", () => {
    let a = startSync(confirmedWith(20, 5));
    const queued = make(a, hit(-4));
    a = sealHead(queued.sync)!.sync;
    const batchId = a.pending[0].id;
    // The server applied my batch (version 6); a read of the row beats the reply to the screen.
    a = observeRow(a, { ...confirmedWith(16, 6), appliedIds: [batchId] });
    expect(hpOf(replay(a, frame, deps()))).toBe(16);
    // The reply then arrives and still tells which batch it answered, so its effects can be shown.
    const answered = confirmAnswer(a, batchId, confirmedWith(16, 6));
    expect(answered.batch?.id).toBe(batchId);
    expect(answered.sync.pending).toHaveLength(0);
  });

  it("fails if a reply that differs from what was shown does not replace it", () => {
    let a = startSync(confirmedWith(20, 5));
    a = sealHead(make(a, hit(-4)).sync)!.sync;
    expect(hpOf(replay(a, frame, deps()))).toBe(16);
    // The server's dice or another writer made it 11.
    const answered = confirmAnswer(a, a.pending[0].id, confirmedWith(11, 6));
    expect(hpOf(replay(answered.sync, frame, deps()))).toBe(11);
  });
});

describe("a ring that re-reads the row", () => {
  it("fails if a read with a newer version does not become the confirmed fight", () => {
    const sync = observeRow(startSync(confirmedWith(20, 5)), { ...confirmedWith(12, 6), appliedIds: [] });
    expect(sync.confirmed.version).toBe(6);
    expect(hpOf(replay(sync, frame, deps()))).toBe(12);
  });

  it("fails if a read with an older or equal version replaces what the server confirmed (a late read would roll the fight back)", () => {
    const sync = startSync(confirmedWith(20, 5));
    expect(observeRow(sync, { ...confirmedWith(99, 5), appliedIds: [] })).toBe(sync);
    expect(observeRow(sync, { ...confirmedWith(99, 4), appliedIds: [] })).toBe(sync);
  });

  it("fails if a reply older than a read already taken rolls the confirmed fight back", () => {
    let sync = startSync(confirmedWith(20, 5));
    sync = sealHead(make(sync, hit(-4)).sync)!.sync;
    const id = sync.pending[0].id;
    sync = observeRow(sync, { ...confirmedWith(10, 8), appliedIds: [id] });
    const answered = confirmAnswer(sync, id, confirmedWith(16, 6));
    expect(answered.sync.confirmed.version).toBe(8);
    expect(hpOf(replay(answered.sync, frame, deps()))).toBe(10);
  });
});

describe("a command that needs dice the browser cannot know", () => {
  it("fails if a reshuffled initiative is shown with the browser's own dice instead of waiting for the server", () => {
    const sync = startSync(confirmedWith(20, 5));
    const queued = queueCommand(sync, replay(sync, frame, deps()), { type: "reshuffle_initiative" }, deps(), newId);
    expect(queued.waitsForServer).toBe(true);
    expect(queued.shown).toBeNull();
    expect(queued.effects).toEqual([]);
    expect(queued.sync.pending[0].kind).toBe("server");
    expect(waitsForServer(queued.sync)).toBe(true);
    // Nothing of it is shown until the server answers.
    expect(replay(queued.sync, frame, deps()).combatants.map((c) => c.initiative)).toEqual([10, 5]);
    const answered = confirmAnswer(sealHead(queued.sync)!.sync, queued.sync.pending[0].id, { ...confirmedWith(20, 6), combatants: confirmedWith(20, 6).combatants.map((c) => ({ ...c, initiative: 17 })) });
    expect(waitsForServer(answered.sync)).toBe(false);
    expect(replay(answered.sync, frame, deps()).combatants.map((c) => c.initiative)).toEqual([17, 17]);
  });

  it("fails if a command that asks for no dice is held back for the server", () => {
    const sync = startSync(confirmedWith(20, 5));
    expect(queueCommand(sync, replay(sync, frame, deps()), { type: "next_turn" }, deps(), newId).waitsForServer).toBe(false);
  });

  it("fails if an event that spawns is shown with ids the server will not give it", () => {
    const event: EncounterEvent = {
      id: "e1", name: "e1", trigger: { type: "manual" }, fire_once: true,
      actions: [{ type: "spawn_combatants", spawns: [{ monster_id: "m-goblin", faction_id: "foes", count: 1 }] }],
    };
    // In the lobby a spawn rolls no initiative, so only its ids give it away.
    const sync = startSync({ ...confirmedWith(20, 5), round: 0 });
    const withEvent: FightFrame = { ...frame, events: [event] };
    const queued = queueCommand(sync, replay(sync, withEvent, deps()), { type: "fire_event", eventId: "e1" }, deps(), newId);
    expect(queued.waitsForServer).toBe(true);
    expect(queued.shown).toBeNull();
  });

  it("fails if a command made while one waits for the server is not shown, or is not sent after it", () => {
    let sync = startSync(confirmedWith(20, 5));
    sync = queueCommand(sync, replay(sync, frame, deps()), { type: "reshuffle_initiative" }, deps(), newId).sync;
    const second = make(sync, hit(-4));
    expect(second.shown && hpOf(second.shown)).toBe(16);
    expect(second.sync.pending.map((b) => b.kind)).toEqual(["server", "optimistic"]);
  });
});

describe("batches on the wire", () => {
  it("fails if a re-send after a network failure gets a new id (a reply lost after the server applied it would apply twice)", () => {
    let sync = make(startSync(confirmedWith(20, 5)), hit(-4)).sync;
    const first = sealHead(sync)!;
    sync = first.sync;
    const again = sealHead(sync)!;
    expect(again.batch.id).toBe(first.batch.id);
    expect(again.batch.commands).toEqual(first.batch.commands);
  });

  it("fails if a command made while a batch is in flight is merged into that batch (a re-send would no longer be the same request)", () => {
    let sync = make(startSync(confirmedWith(20, 5)), hit(-4)).sync;
    sync = sealHead(sync)!.sync;
    const sentCommands = sync.pending[0].commands;
    sync = make(sync, hit(-3)).sync;
    expect(sync.pending).toHaveLength(2);
    expect(sync.pending[0].commands).toBe(sentCommands);
    expect(sync.pending[0].commands).toHaveLength(1);
    expect(sync.pending[1].commands).toEqual([hit(-3)]);
  });

  it("fails if commands not yet sent are not merged into one batch, or one batch can pass 50 commands", () => {
    let sync = startSync(confirmedWith(1000, 5));
    for (let i = 0; i < MAX_BATCH_COMMANDS; i += 1) sync = make(sync, { type: "set_hp", instanceId: "ogre", value: i }).sync;
    expect(sync.pending).toHaveLength(1);
    expect(sync.pending[0].commands).toHaveLength(MAX_BATCH_COMMANDS);
    sync = make(sync, { type: "set_hp", instanceId: "ogre", value: 7 }).sync;
    expect(sync.pending.map((b) => b.commands.length)).toEqual([MAX_BATCH_COMMANDS, 1]);
  });

  it("fails if a 409 'ended' keeps the commands of a fight that is over", () => {
    let sync = make(startSync(confirmedWith(20, 5)), hit(-4)).sync;
    sync = dropPending(make(sync, hit(-1)).sync);
    expect(sync.pending).toEqual([]);
    expect(hpOf(replay(sync, frame, deps()))).toBe(20);
  });
});

describe("effects shown once", () => {
  const check: FightEffect = { type: "concentration_check_due", instanceId: "ogre", damage: 4 };

  it("fails if an optimistic concentration check is raised again by the reply to the same batch", () => {
    const batch = { id: "b", kind: "optimistic" as const, commands: [], sealed: true, folded: false, surfaced: [check] };
    expect(unseenEffects(batch, [check])).toEqual([]);
  });

  it("fails if a command that waited for the server does not show its effects from the reply", () => {
    const batch = { id: "b", kind: "server" as const, commands: [], sealed: true, folded: false, surfaced: [] };
    expect(unseenEffects(batch, [check])).toEqual([check]);
  });

  it("fails if what the server added on its own (a player's sheet ingested first) is swallowed by an optimistic batch's reply", () => {
    const own: FightEffect = { type: "concentration_check_due", instanceId: "nessa", damage: 9 };
    const batch = { id: "b", kind: "optimistic" as const, commands: [], sealed: true, folded: false, surfaced: [check] };
    expect(unseenEffects(batch, [own, check])).toEqual([own]);
  });

  it("fails if two equal effects are both cancelled by one shown", () => {
    const batch = { id: "b", kind: "optimistic" as const, commands: [], sealed: true, folded: false, surfaced: [check] };
    expect(unseenEffects(batch, [check, check])).toEqual([check]);
  });
});

describe("a Rage the server keeps, shown before it answers (#1021)", () => {
  // PHB 2014 "Rage": it ends when the Barbarian's turn ends and it has neither attacked nor taken damage since its last turn. The server
  // judges it on every command; the screen applies the same rule so it does not keep showing a Rage the server has ended.
  const raging = (): ConfirmedFight => {
    const state = fight([
      combatant("tam", { type: "player", party_member_id: "pm-tam", initiative: 15, hp: 30, max_hp: 30, conditions: [ragingCondition("tam", "2014")] }),
      combatant("ogre", { initiative: 5 }),
    ]);
    return { combatants: state.combatants, round: state.round, activeIndex: state.activeIndex, eventsFired: state.eventsFired, lairFiredRounds: state.lairFiredRounds, version: 1 };
  };
  const ragingNow = (state: FightState | null) => state?.combatants.find((c) => c.instance_id === "tam")?.conditions.some((c) => c.name === RAGING);

  // Bug caught: the browser's apply of `next_turn` skips the rule, so a Rage the server ends stays on the DM's screen.
  it("fails if ending a turn with no attack and no damage does not show the Rage gone", () => {
    expect(ragingNow(make(startSync(raging()), { type: "next_turn" }).shown)).toBe(false);
  });

  // Damage taken keeps it going (the same rule's other half), so the screen must not take it off.
  it("fails if a Rage kept going by damage taken is shown gone when the turn ends", () => {
    const hurt = make(startSync(raging()), { type: "adjust_hp", instanceId: "tam", delta: -4 });
    expect(ragingNow(make(hurt.sync, { type: "next_turn" }).shown)).toBe(true);
  });
});
