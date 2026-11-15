/**
 * The handler against an in-memory store with the database's own version rule:
 * `saveFight` writes only when the version still matches, and bumps it by one.
 * Every expected value is worked out from the rules in the comment above it.
 */
import { describe, expect, it } from "vitest";
import type { EncounterEvent } from "../../../src/types/encounter.types";
import type { PartyIngestRow } from "../../../src/rules/fight/partyIngest";
import { broadcastEvent, combatant, pc } from "../../../src/rules/fight/fightTestKit";
import {
  ALL_REDUCER_COMMANDS_LISTED,
  FightCommandError,
  runBatch,
  validateRequest,
  type BatchDeps,
  type CommandRequest,
  type FightRow,
  type FightWrite,
  type LoadedFight,
} from "./handler";

function row(over: Partial<FightRow> = {}): FightRow {
  return {
    id: "row-1",
    version: 7,
    combatants_live: [combatant("brug", { hp: 30, max_hp: 30, initiative: 10 }), combatant("goblin", { hp: 10, max_hp: 10, initiative: 5 })],
    current_round: 1,
    active_combatant_index: 0,
    events_fired: [],
    lair_fired_rounds: [],
    applied_command_ids: [],
    ...over,
  };
}

interface Harness {
  deps: BatchDeps;
  store: { row: FightRow };
  log: string[];
  saves: number;
  loads: number;
  persisted: Array<{ id: string; patch: unknown }>;
  broadcasts: string[];
  /** Runs once, between a load and its save: another writer got in. */
  rival: { run: (() => void) | null; always: boolean };
}

function harness(
  initial: FightRow,
  options: { events?: EncounterEvent[]; party?: PartyIngestRow[]; d6?: number; d20?: number } = {},
): Harness {
  const h: Harness = {
    store: { row: structuredClone(initial) },
    log: [],
    saves: 0,
    loads: 0,
    persisted: [],
    broadcasts: [],
    rival: { run: null, always: false },
    deps: undefined as unknown as BatchDeps,
  };
  h.deps = {
    async loadFight() {
      h.loads += 1;
      const loaded: LoadedFight = {
        row: structuredClone(h.store.row),
        events: options.events ?? [],
        lairEnabled: false,
        lairOwnerDefId: null,
        ruleset: "2014",
        randomizeInitiativeEachRound: false,
        monsters: [],
        npcs: [],
      };
      return loaded;
    },
    async loadPartyRows() {
      return structuredClone(options.party ?? []);
    },
    async saveFight(_id: string, expected: number, next: FightWrite) {
      h.saves += 1;
      if (h.rival.run) {
        const run = h.rival.run;
        if (!h.rival.always) h.rival.run = null;
        run();
      }
      if (h.store.row.version !== expected) return null;
      h.store.row = { ...h.store.row, ...structuredClone(next), version: expected + 1 };
      h.log.push("save");
      return { version: h.store.row.version };
    },
    async persistPartyMember(id, patch) {
      h.log.push("persist");
      h.persisted.push({ id, patch });
    },
    async postBroadcast(message) {
      h.log.push("broadcast");
      h.broadcasts.push(message);
    },
    rollD20: () => 13,
    rollD6: () => options.d6 ?? 3,
    now: () => 1000,
  };
  return h;
}

/** Another writer's committed change: edits the stored row and raises the version, as the database trigger does. */
function rivalEdit(h: Harness, edit: (r: FightRow) => void): () => void {
  return () => {
    edit(h.store.row);
    h.store.row.version += 1;
  };
}

const batch = (id: string, ...commands: CommandRequest["commands"]): CommandRequest => ({ encounterId: "enc-1", batchId: id, commands });
const hpOf = (r: { combatants_live: { instance_id: string; hp: number }[] }, id: string) => r.combatants_live.find((c) => c.instance_id === id)?.hp;

describe("runBatch", () => {
  it("applies a command, saves it and returns the new version", async () => {
    const h = harness(row());
    // brug has 30 HP; 4 damage leaves 26. The row was at version 7, the save raises it to 8.
    const result = await runBatch(batch("b1", { type: "adjust_hp", instanceId: "brug", delta: -4 }), h.deps);
    expect(result.applied).toBe(true);
    expect(result.version).toBe(8);
    expect(hpOf(result.state, "brug")).toBe(26);
    expect(hpOf(h.store.row, "brug")).toBe(26);
    expect(h.store.row.applied_command_ids).toEqual(["b1"]);
  });

  it("retries a lost race on the fresh state, so the command lands on top of the other writer's change", async () => {
    const h = harness(row());
    // Between our load and our save another writer takes the goblin from 10 to 7 HP.
    h.rival.run = rivalEdit(h, (r) => {
      r.combatants_live = r.combatants_live.map((c) => (c.instance_id === "goblin" ? { ...c, hp: 7 } : c));
    });
    const result = await runBatch(batch("b1", { type: "adjust_hp", instanceId: "brug", delta: -4 }), h.deps);
    // Two loads, two save attempts. Brug 30 - 4 = 26 and the goblin keeps the rival's 7: neither change replaced the other.
    expect(h.loads).toBe(2);
    expect(h.saves).toBe(2);
    expect(hpOf(h.store.row, "brug")).toBe(26);
    expect(hpOf(h.store.row, "goblin")).toBe(7);
    // The rival's update raised 7 to 8; ours then raised it to 9.
    expect(result.version).toBe(9);
  });

  it("fails after four lost races and performs no effects", async () => {
    // A player takes 3 damage: the engine asks for a player_persist, which must never be performed.
    const h = harness(row({ combatants_live: [pc("nessa", { hp: 12, max_hp: 20, initiative: 15 })] }));
    h.rival.always = true;
    h.rival.run = rivalEdit(h, () => {});
    await expect(runBatch(batch("b1", { type: "adjust_hp", instanceId: "nessa", delta: -3 }), h.deps)).rejects.toMatchObject({ status: 409 });
    expect(h.saves).toBe(4);
    expect(h.persisted).toEqual([]);
    expect(h.broadcasts).toEqual([]);
  });

  it("does not apply a batch id that was already applied, and performs no effects (the reply-lost retry)", async () => {
    const h = harness(row({ applied_command_ids: ["b1"], combatants_live: [pc("nessa", { hp: 12, max_hp: 20 })] }));
    const result = await runBatch(batch("b1", { type: "adjust_hp", instanceId: "nessa", delta: -3 }), h.deps);
    expect(result.applied).toBe(false);
    expect(result.version).toBe(7);
    expect(hpOf(result.state, "nessa")).toBe(12);
    expect(h.saves).toBe(0);
    expect(h.persisted).toEqual([]);
  });

  it("keeps only the newest 64 applied ids", async () => {
    const old = Array.from({ length: 64 }, (_, i) => `old-${i}`);
    const h = harness(row({ applied_command_ids: old }));
    await runBatch(batch("fresh", { type: "next_turn" }), h.deps);
    // 64 kept + 1 new = 65, so the oldest ("old-0") goes and the new one is last.
    expect(h.store.row.applied_command_ids).toHaveLength(64);
    expect(h.store.row.applied_command_ids[0]).toBe("old-1");
    expect(h.store.row.applied_command_ids.at(-1)).toBe("fresh");
  });

  it("performs effects only after the save, and once even when a race was lost first", async () => {
    const h = harness(row({ combatants_live: [pc("nessa", { hp: 12, max_hp: 20, initiative: 15 })] }));
    h.rival.run = rivalEdit(h, () => {});
    await runBatch(batch("b1", { type: "adjust_hp", instanceId: "nessa", delta: -3 }), h.deps);
    // The first attempt lost and wrote nothing; the party member is written once, after the winning save.
    expect(h.log).toEqual(["save", "persist"]);
    expect(h.persisted).toHaveLength(1);
    // 12 - 3 = 9 HP.
    expect(h.persisted[0]).toMatchObject({ id: "pm-nessa", patch: { current_hp: 9 } });
  });

  it("ingests the party rows before the commands (a player healed on their own sheet, then damaged)", async () => {
    const nessaRow: PartyIngestRow = {
      id: "pm-nessa",
      current_hp: 20,
      temp_hp: 0,
      current_initiative: 15,
      conditions: [],
      concentration: null,
      wildshape_state: null,
      death_save_successes: 0,
      death_save_failures: 0,
    };
    const h = harness(row({ combatants_live: [pc("nessa", { hp: 12, max_hp: 20, initiative: 15 })] }), { party: [nessaRow] });
    // The sheet says 20 HP (healed there); the fight still held 12. 20 - 5 = 15. Without the ingest it would be 12 - 5 = 7.
    const result = await runBatch(batch("b1", { type: "adjust_hp", instanceId: "nessa", delta: -5 }), h.deps);
    expect(hpOf(result.state, "nessa")).toBe(15);
  });

  it("tries a character-row write again when it fails once (a lost write lets the next ingest undo the damage)", async () => {
    const h = harness(row({ combatants_live: [pc("nessa", { hp: 12, max_hp: 20, initiative: 15 })] }));
    let calls = 0;
    const write = h.deps.persistPartyMember;
    h.deps.persistPartyMember = async (id, patch) => {
      calls += 1;
      if (calls === 1) throw new Error("connection reset");
      await write(id, patch);
    };
    const result = await runBatch(batch("b1", { type: "adjust_hp", instanceId: "nessa", delta: -5 }), h.deps);
    // 12 - 5 = 7 reaches the character's row on the second try, and nothing is reported as failed.
    expect(h.persisted).toHaveLength(1);
    expect(result.effectFailures).toEqual([]);
  });

  it("reports a character-row write that keeps failing, with the fight still saved", async () => {
    const h = harness(row({ combatants_live: [pc("nessa", { hp: 12, max_hp: 20, initiative: 15 })] }));
    let calls = 0;
    h.deps.persistPartyMember = async () => {
      calls += 1;
      throw new Error("connection reset");
    };
    const result = await runBatch(batch("b1", { type: "adjust_hp", instanceId: "nessa", delta: -5 }), h.deps);
    expect(calls).toBe(3);
    expect(result.effectFailures).toEqual(["player_persist: connection reset"]);
    expect(hpOf(result.state, "nessa")).toBe(7);
  });

  it("fires a round-triggered event through next_turn and posts its broadcast", async () => {
    const event = broadcastEvent("r2", { type: "round_start", round: 2 }, "Round two begins.");
    // Brug (10) then the goblin (5); the goblin is up. Ending its turn wraps the order into round 2.
    const h = harness(row({ active_combatant_index: 1 }), { events: [event] });
    const result = await runBatch(batch("b1", { type: "next_turn" }), h.deps);
    expect(result.state.current_round).toBe(2);
    expect(result.state.events_fired).toEqual(["r2"]);
    expect(h.broadcasts).toEqual(["Round two begins."]);
    expect(h.log).toEqual(["save", "broadcast"]);
  });

  it("takes the reducer's dice from the injected dice (a fixed d6 decides a recharge)", async () => {
    const dragon = combatant("dragon", { initiative: 10, action_uses: { "Fire Breath": { used: 1, recharge: { min: 5, max: 6 } } } });
    const start = () => row({ combatants_live: [dragon, combatant("imp", { initiative: 5 })], active_combatant_index: 1 });
    // The wrap into round 2 starts the dragon's turn, and its spent Recharge 5-6 rolls a d6: a 6 brings it back.
    const back = harness(start(), { d6: 6 });
    await runBatch(batch("b1", { type: "next_turn" }), back.deps);
    expect(back.store.row.combatants_live[0].action_uses?.["Fire Breath"].used).toBe(0);
    // A 2 is outside 5-6, so it stays spent.
    const spent = harness(start(), { d6: 2 });
    await runBatch(batch("b1", { type: "next_turn" }), spent.deps);
    expect(spent.store.row.combatants_live[0].action_uses?.["Fire Breath"].used).toBe(1);
  });

  it("fires an event alone, with fire_event", async () => {
    const h = harness(row(), { events: [broadcastEvent("alarm", { type: "manual" }, "The bell rings.")] });
    const result = await runBatch(batch("b1", { type: "fire_event", eventId: "alarm" }), h.deps);
    expect(result.state.events_fired).toEqual(["alarm"]);
    expect(h.broadcasts).toEqual(["The bell rings."]);
  });

  it("only ingests the party rows for sync_party", async () => {
    const nessaRow: PartyIngestRow = {
      id: "pm-nessa", current_hp: 18, temp_hp: 0, current_initiative: 15, conditions: [], concentration: null,
      wildshape_state: null, death_save_successes: 0, death_save_failures: 0,
    };
    const h = harness(row({ combatants_live: [pc("nessa", { hp: 12, max_hp: 20, initiative: 15 })] }), { party: [nessaRow] });
    const result = await runBatch(batch("b1", { type: "sync_party" }), h.deps);
    expect(result.applied).toBe(true);
    expect(hpOf(h.store.row, "nessa")).toBe(18);
    // Adopting a row is never written back to it.
    expect(h.persisted).toEqual([]);
  });

  it("answers a missing fight with a 404", async () => {
    const h = harness(row());
    h.deps.loadFight = async () => null;
    await expect(runBatch(batch("b1", { type: "next_turn" }), h.deps)).rejects.toMatchObject({ status: 404 });
  });
});

describe("validateRequest", () => {
  const ok = { encounterId: "e", batchId: "b", commands: [{ type: "next_turn" }] };

  it("accepts a well-formed batch", () => {
    expect(validateRequest(ok).commands).toHaveLength(1);
    expect(ALL_REDUCER_COMMANDS_LISTED).toBe(true);
  });

  it("refuses an unknown command type", () => {
    expect(() => validateRequest({ ...ok, commands: [{ type: "delete_everything" }] })).toThrow(FightCommandError);
  });

  it("refuses 51 commands and an empty batch", () => {
    expect(() => validateRequest({ ...ok, commands: Array.from({ length: 51 }, () => ({ type: "next_turn" })) })).toThrow(FightCommandError);
    expect(() => validateRequest({ ...ok, commands: [] })).toThrow(FightCommandError);
    expect(validateRequest({ ...ok, commands: Array.from({ length: 50 }, () => ({ type: "next_turn" })) }).commands).toHaveLength(50);
  });

  it("refuses a missing or oversized batch id", () => {
    expect(() => validateRequest({ ...ok, batchId: "" })).toThrow(FightCommandError);
    expect(() => validateRequest({ encounterId: "e", commands: ok.commands })).toThrow(FightCommandError);
    expect(() => validateRequest({ ...ok, batchId: "x".repeat(81) })).toThrow(FightCommandError);
  });

  it("refuses a body over 200,000 characters", () => {
    expect(() => validateRequest({ ...ok, commands: [{ type: "next_turn", pad: "x".repeat(200_000) }] })).toThrow(FightCommandError);
  });

  it("takes fire_event and sync_party only alone", () => {
    expect(validateRequest({ ...ok, commands: [{ type: "fire_event", eventId: "a" }] }).commands).toHaveLength(1);
    expect(validateRequest({ ...ok, commands: [{ type: "sync_party" }] }).commands).toHaveLength(1);
    expect(() => validateRequest({ ...ok, commands: [{ type: "sync_party" }, { type: "next_turn" }] })).toThrow(FightCommandError);
    expect(() => validateRequest({ ...ok, commands: [{ type: "fire_event" }] })).toThrow(FightCommandError);
  });
});
