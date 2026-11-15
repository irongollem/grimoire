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
  ALL_FIGHT_COMMANDS_LISTED,
  ALL_REDUCER_COMMANDS_LISTED,
  FightCommandError,
  runBatch,
  validateRequest,
  type BatchDeps,
  type CommandRequest,
  type FightRow,
  type FightWrite,
  type FightLifecycleWrite,
  type LoadedFight,
} from "./handler";
import type { ExploreParty } from "../../../src/types/exploreParty.types";

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
    is_running: false,
    ended_at: null,
    ...over,
  };
}

interface Harness {
  deps: BatchDeps;
  /** The encounter's fight row; null before `open` has made one. */
  store: { row: FightRow | null };
  /** Other fights of the campaign: encounter id to whether it is running. */
  others: Record<string, boolean>;
  companions: Array<{ id: string; patch: unknown }>;
  explore: { before: ExploreParty | null; written: ExploreParty[] };
  /** What `loadEndContext` treats as this campaign's places. */
  sites: string[];
  /** The fight's batch writes, as `saveFight` received them (lifecycle fields included). */
  saved: Array<FightWrite & Partial<FightLifecycleWrite>>;
  log: string[];
  saves: number;
  loads: number;
  persisted: Array<{ id: string; patch: unknown }>;
  broadcasts: string[];
  /** Runs once, between a load and its save: another writer got in. */
  rival: { run: (() => void) | null; always: boolean };
}

function harness(
  initial: FightRow | null,
  options: { events?: EncounterEvent[]; party?: PartyIngestRow[]; d6?: number; d20?: number } = {},
): Harness {
  const h: Harness = {
    store: { row: initial ? structuredClone(initial) : null },
    others: {},
    companions: [],
    explore: { before: null, written: [] },
    sites: [],
    saved: [],
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
        row: h.store.row ? structuredClone(h.store.row) : null,
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
    async createFight(_encounterId, first) {
      if (h.store.row) return null;
      h.store.row = { id: "row-new", version: 1, ...structuredClone(first) };
      h.log.push("create");
      return { id: "row-new", version: 1 };
    },
    async saveFight(_id, expected, next) {
      h.saves += 1;
      h.saved.push(structuredClone(next));
      if (h.rival.run) {
        const run = h.rival.run;
        if (!h.rival.always) h.rival.run = null;
        run();
      }
      if (!h.store.row || h.store.row.version !== expected) return null;
      // Only the columns the database has: the lifecycle's started_at and session_id are not on the fixture row.
      const { started_at: _s, session_id: _i, magical_darkness: _m, ...columns } = structuredClone(next);
      h.store.row = { ...h.store.row, ...columns, version: expected + 1 };
      h.log.push("save");
      return { version: h.store.row.version };
    },
    async persistPartyMember(id, patch) {
      h.log.push("persist");
      h.persisted.push({ id, patch });
    },
    async persistCompanion(id, patch) {
      h.log.push("companion");
      h.companions.push({ id, patch });
    },
    async stopOtherRunningFights() {
      h.log.push("stop_others");
      for (const key of Object.keys(h.others)) h.others[key] = false;
    },
    async loadEndContext(siteId) {
      return { exploreParty: h.explore.before, siteId: siteId !== null && h.sites.includes(siteId) ? siteId : null };
    },
    async setExploreParty(party) {
      h.log.push("explore_party");
      h.explore.written.push(party);
    },
    nowIso: () => "2026-11-15T20:00:00.000Z",
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
    edit(h.store.row!);
    h.store.row!.version += 1;
  };
}

const batch = (id: string, ...commands: CommandRequest["commands"]): CommandRequest => ({ encounterId: "enc-1", batchId: id, commands });
const stored = (h: Harness): FightRow => h.store.row!;
const hpOf = (r: { combatants_live: { instance_id: string; hp: number }[] }, id: string) => r.combatants_live.find((c) => c.instance_id === id)?.hp;

describe("runBatch", () => {
  it("applies a command, saves it and returns the new version", async () => {
    const h = harness(row());
    // brug has 30 HP; 4 damage leaves 26. The row was at version 7, the save raises it to 8.
    const result = await runBatch(batch("b1", { type: "adjust_hp", instanceId: "brug", delta: -4 }), h.deps);
    expect(result.applied).toBe(true);
    expect(result.version).toBe(8);
    expect(hpOf(result.state, "brug")).toBe(26);
    expect(hpOf(stored(h), "brug")).toBe(26);
    expect(stored(h).applied_command_ids).toEqual(["b1"]);
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
    expect(hpOf(stored(h), "brug")).toBe(26);
    expect(hpOf(stored(h), "goblin")).toBe(7);
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
    expect(stored(h).applied_command_ids).toHaveLength(64);
    expect(stored(h).applied_command_ids[0]).toBe("old-1");
    expect(stored(h).applied_command_ids.at(-1)).toBe("fresh");
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

  it("fails if a player's roll in the lobby is not ingested, or a stale roll is ingested before the lobby is open", async () => {
    const lobby = (is_running: boolean) => row({ is_running, current_round: 0, combatants_live: [pc("nessa", { hp: 20, max_hp: 20, initiative: null as unknown as number })] });
    const rolled: PartyIngestRow = {
      id: "pm-nessa", current_hp: 20, temp_hp: 0, current_initiative: 17, conditions: [], concentration: null,
      wildshape_state: null, death_save_successes: 0, death_save_failures: 0,
    };
    const shown = await runBatch(batch("l1", { type: "sync_party" }), harness(lobby(true), { party: [rolled] }).deps);
    expect(shown.state.combatants_live[0].initiative).toBe(17);
    const hidden = await runBatch(batch("l2", { type: "sync_party" }), harness(lobby(false), { party: [rolled] }).deps);
    expect(hidden.state.combatants_live[0].initiative).toBeNull();
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
    expect(stored(back).combatants_live[0].action_uses?.["Fire Breath"].used).toBe(0);
    // A 2 is outside 5-6, so it stays spent.
    const spent = harness(start(), { d6: 2 });
    await runBatch(batch("b1", { type: "next_turn" }), spent.deps);
    expect(stored(spent).combatants_live[0].action_uses?.["Fire Breath"].used).toBe(1);
  });

  it("fires an event alone, with fire_event", async () => {
    const h = harness(row(), { events: [broadcastEvent("alarm", { type: "manual" }, "The bell rings.")] });
    const result = await runBatch(batch("b1", { type: "fire_event", eventId: "alarm" }), h.deps);
    expect(result.state.events_fired).toEqual(["alarm"]);
    expect(h.broadcasts).toEqual(["The bell rings."]);
  });

  it("fails if a reducer command and a fight command in one batch do not both land", async () => {
    const h = harness(row());
    // brug 30 HP takes 4: 26. The goblin takes the curse "hex". One save, so version 7 becomes 8.
    const result = await runBatch(
      batch("b1", { type: "adjust_hp", instanceId: "brug", delta: -4 }, { type: "add_curse", instanceId: "goblin", curse: "hex" }),
      h.deps,
    );
    expect(result.version).toBe(8);
    expect(hpOf(stored(h), "brug")).toBe(26);
    expect(stored(h).combatants_live.find((c) => c.instance_id === "goblin")?.curses).toEqual(["hex"]);
  });

  it("fails if add_combatants mid-fight hands the turn to a newcomer who sorts in ahead of the acting combatant", async () => {
    const h = harness(row());
    // Order is brug 10, goblin 5 and brug (index 0) is acting. A bat at 15 sorts first: bat, brug, goblin.
    // The turn stays with brug, who is now index 1.
    const bat = combatant("bat", { hp: 4, max_hp: 4, initiative: 15 });
    const result = await runBatch(batch("b1", { type: "add_combatants", combatants: [bat] }), h.deps);
    expect(result.state.combatants_live.map((c) => c.instance_id)).toEqual(["brug", "goblin", "bat"]);
    expect(result.state.active_combatant_index).toBe(1);
  });

  it("fails if add_combatants takes a second combatant with an instance id already in the fight", async () => {
    const h = harness(row());
    // "goblin" is there already: only "bat" joins, and a batch of nothing but the duplicate changes nothing.
    const first = await runBatch(
      batch("b1", { type: "add_combatants", combatants: [combatant("goblin", { hp: 99, max_hp: 99 }), combatant("bat", { initiative: 1 })] }),
      h.deps,
    );
    expect(first.state.combatants_live.map((c) => c.instance_id)).toEqual(["brug", "goblin", "bat"]);
    expect(hpOf(first.state, "goblin")).toBe(10);
    const second = await runBatch(batch("b2", { type: "add_combatants", combatants: [combatant("bat")] }), h.deps);
    expect(second.state.combatants_live).toHaveLength(3);
  });

  it("only ingests the party rows for sync_party", async () => {
    const nessaRow: PartyIngestRow = {
      id: "pm-nessa", current_hp: 18, temp_hp: 0, current_initiative: 15, conditions: [], concentration: null,
      wildshape_state: null, death_save_successes: 0, death_save_failures: 0,
    };
    const h = harness(row({ combatants_live: [pc("nessa", { hp: 12, max_hp: 20, initiative: 15 })] }), { party: [nessaRow] });
    const result = await runBatch(batch("b1", { type: "sync_party" }), h.deps);
    expect(result.applied).toBe(true);
    expect(hpOf(stored(h), "nessa")).toBe(18);
    // Adopting a row is never written back to it.
    expect(h.persisted).toEqual([]);
  });

  it("does not save a party sync that finds the sheets as the fight has them (a write and a ring to every screen for nothing)", async () => {
    const nessaRow: PartyIngestRow = {
      id: "pm-nessa", current_hp: 12, temp_hp: 0, current_initiative: 15, conditions: [], concentration: null,
      wildshape_state: null, death_save_successes: 0, death_save_failures: 0,
    };
    const h = harness(row({ combatants_live: [pc("nessa", { hp: 12, max_hp: 20, initiative: 15 })] }), { party: [nessaRow] });
    const before = h.store.row?.version;
    const result = await runBatch(batch("b1", { type: "sync_party" }), h.deps);
    expect(result.applied).toBe(false);
    expect(h.saves).toBe(0);
    expect(result.version).toBe(before);
  });

  it("answers a party sync on an ended fight instead of refusing it (ending a fight rings the sheets it wrote)", async () => {
    const h = harness(row({ ended_at: "2026-11-15T12:00:00Z", combatants_live: [pc("nessa", { hp: 12, max_hp: 20, initiative: 15 })] }));
    const result = await runBatch(batch("b1", { type: "sync_party" }), h.deps);
    expect(result.applied).toBe(false);
    expect(h.saves).toBe(0);
    // A real command on the ended fight is still refused.
    await expect(runBatch(batch("b2", { type: "next_turn" }), h.deps)).rejects.toMatchObject({ status: 409 });
  });

  it("answers a missing fight with a 404", async () => {
    const h = harness(null);
    await expect(runBatch(batch("b1", { type: "next_turn" }), h.deps)).rejects.toMatchObject({ status: 404 });
  });
});

const opened = (over: Partial<FightRow> = {}) => row({ current_round: 0, is_running: false, ...over });
const roster = () => [pc("nessa", { hp: 20, max_hp: 20, initiative: null as unknown as number }), combatant("goblin", { hp: 7, max_hp: 7 })];

describe("fight lifecycle", () => {
  it("fails if open on an encounter with no row does not create the fight unstarted and hidden from players", async () => {
    const h = harness(null);
    const result = await runBatch(batch("o1", { type: "open", combatants: roster() }), h.deps);
    // A new fight is round 0, turn 0, saved but not shown to players, with this batch remembered.
    expect(stored(h)).toMatchObject({ current_round: 0, active_combatant_index: 0, is_running: false, ended_at: null, applied_command_ids: ["o1"] });
    expect(stored(h).combatants_live.map((c) => c.instance_id)).toEqual(["nessa", "goblin"]);
    expect(result).toMatchObject({ applied: true, version: 1, is_running: false, ended_at: null });
  });

  it("fails if open primes no legendary pool when caps are given", async () => {
    const h = harness(null);
    await runBatch(batch("o1", { type: "open", combatants: roster(), legendaryCaps: { goblin: 3 } }), h.deps);
    expect(stored(h).combatants_live.find((c) => c.instance_id === "goblin")).toMatchObject({ legendary_action_cap: 3, legendary_actions_remaining: 3 });
  });

  it("fails if a second open resets a fight that is under way (a reload must not wipe the damage)", async () => {
    const h = harness(null);
    await runBatch(batch("o1", { type: "open", combatants: roster() }), h.deps);
    await runBatch(batch("d1", { type: "adjust_hp", instanceId: "goblin", delta: -3 }), h.deps);
    const before = structuredClone(stored(h));
    const again = await runBatch(batch("o2", { type: "open", combatants: roster() }), h.deps);
    // The goblin took 3 of its 7 and still has 4; nothing was written, so the version and the id list stand.
    expect(hpOf(again.state, "goblin")).toBe(4);
    expect(again.applied).toBe(false);
    expect(stored(h)).toEqual(before);
  });

  it("fails if open on an ended fight carries anything of the old one over", async () => {
    const old = row({
      ended_at: "2026-11-14T10:00:00.000Z", current_round: 4, active_combatant_index: 1, events_fired: ["r2"], lair_fired_rounds: [20],
      applied_command_ids: ["old-1"], combatants_live: [combatant("ogre", { hp: 0, max_hp: 59 })],
    });
    const h = harness(old);
    const result = await runBatch(batch("o9", { type: "open", combatants: roster() }), h.deps);
    // Round 0, turn 0, no fired events, no lair rounds, only this batch's id, the new roster, not ended, not shown.
    expect(stored(h)).toMatchObject({
      current_round: 0, active_combatant_index: 0, events_fired: [], lair_fired_rounds: [], applied_command_ids: ["o9"], ended_at: null, is_running: false,
    });
    expect(stored(h).combatants_live.map((c) => c.instance_id)).toEqual(["nessa", "goblin"]);
    expect(result.applied).toBe(true);
    // Session and start time go with the old fight, and so do its spheres of darkness.
    expect(h.saved[0]).toMatchObject({ started_at: null, session_id: null, magical_darkness: [] });
  });

  it("fails if go_live does not show the fight, does not stop the campaign's other live fight, or clears no rolls before combat", async () => {
    const h = harness(opened({ combatants_live: [pc("nessa", { hp: 20, max_hp: 20, initiative: 15 }), combatant("goblin", { initiative: 5 })] }));
    h.others = { "enc-other": true, "enc-idle": false };
    const result = await runBatch(batch("g1", { type: "go_live", sessionId: "sess-1" }), h.deps);
    expect(result).toMatchObject({ is_running: true, ended_at: null });
    expect(h.saved[0]).toMatchObject({ is_running: true, session_id: "sess-1", started_at: "2026-11-15T20:00:00.000Z" });
    expect(h.others).toEqual({ "enc-other": false, "enc-idle": false });
    // Round 0: the player's roll from the last session is blanked, on the fight and on their sheet; the goblin's stays.
    expect(stored(h).combatants_live.map((c) => c.initiative)).toEqual([null, 5]);
    expect(h.persisted).toEqual([{ id: "pm-nessa", patch: { current_initiative: null } }]);
    // The fight's own row first, the other tables after.
    expect(h.log).toEqual(["save", "persist", "stop_others"]);
  });

  it("fails if go_live in round 2 wipes the rolls that are the turn order", async () => {
    const h = harness(row({ current_round: 2, combatants_live: [pc("nessa", { hp: 20, max_hp: 20, initiative: 15 })] }));
    await runBatch(batch("g1", { type: "go_live", sessionId: null }), h.deps);
    expect(stored(h).combatants_live[0].initiative).toBe(15);
    expect(h.persisted).toEqual([]);
    expect(stored(h).is_running).toBe(true);
  });

  it("fails if end_combat does not write each player's hit points, conditions without due flags, the companion and the party's standing", async () => {
    const poisoned = { name: "Poisoned", due: { save: true } };
    const h = harness(row({
      is_running: true,
      combatants_live: [
        pc("nessa", { hp: 9, max_hp: 20, conditions: [poisoned], curses: ["hex"], death_saves: { successes: 1, failures: 2 }, position: { x: 3, y: 4 } }),
        combatant("wolf", { type: "player", companion_id: "comp-1", hp: 5, max_hp: 11, conditions: [{ name: "Prone" }] }),
        combatant("goblin", { hp: 0, max_hp: 7 }),
      ],
    }));
    h.sites = ["site-1"];
    const result = await runBatch(batch("e1", { type: "end_combat", siteId: "site-1" }), h.deps);
    // Nessa: 9 hp, Poisoned with its due flag removed, the hex, 1/2 death saves, and her initiative blank.
    expect(h.persisted).toEqual([{
      id: "pm-nessa",
      patch: { current_hp: 9, conditions: [{ name: "Poisoned" }], curses: ["hex"], current_initiative: null, death_save_successes: 1, death_save_failures: 2 },
    }]);
    // The wolf walks into the next fight at the 5 hit points combat left it.
    expect(h.companions).toEqual([{ id: "comp-1", patch: { current_hp: 5, conditions: [{ name: "Prone" }] } }]);
    // The party stands where Nessa's token is; the wolf has no token and the goblin is no player.
    expect(h.explore.written).toEqual([{ site_id: "site-1", positions: { "pm-nessa": { x: 3, y: 4 } } }]);
    expect(result).toMatchObject({ is_running: false, ended_at: "2026-11-15T20:00:00.000Z" });
    expect(stored(h)).toMatchObject({ is_running: false, ended_at: "2026-11-15T20:00:00.000Z" });
    expect(h.log[0]).toBe("save");
  });

  it("fails if end_combat writes a site position for a place that is not this campaign's", async () => {
    const h = harness(row({ combatants_live: [pc("nessa", { hp: 9, max_hp: 20, position: { x: 3, y: 4 } })] }));
    await runBatch(batch("e1", { type: "end_combat", siteId: "someone-elses" }), h.deps);
    expect(h.explore.written).toEqual([]);
  });

  it("fails if end_combat writes back stale hit points over what a player changed on their own sheet", async () => {
    const sheet: PartyIngestRow = {
      id: "pm-nessa", current_hp: 20, temp_hp: 0, current_initiative: 15, conditions: [], concentration: null,
      wildshape_state: null, death_save_successes: 0, death_save_failures: 0,
    };
    const h = harness(row({ combatants_live: [pc("nessa", { hp: 9, max_hp: 20, initiative: 15 })] }), { party: [sheet] });
    await runBatch(batch("e1", { type: "end_combat" }), h.deps);
    // The sheet says 20 (healed there); writing the fight's 9 would undo it.
    expect(h.persisted).toMatchObject([{ id: "pm-nessa", patch: { current_hp: 20 } }]);
  });

  it("fails if abandon writes hit points, or leaves the fight open", async () => {
    const h = harness(row({ is_running: true, combatants_live: [pc("nessa", { hp: 9, max_hp: 20, initiative: 15 })] }));
    const result = await runBatch(batch("a1", { type: "abandon" }), h.deps);
    expect(result).toMatchObject({ is_running: false, ended_at: "2026-11-15T20:00:00.000Z" });
    // Only the roll is cleared: nothing about hit points, conditions or curses reaches the sheet.
    expect(h.persisted).toEqual([{ id: "pm-nessa", patch: { current_initiative: null } }]);
    expect(h.companions).toEqual([]);
    expect(h.explore.written).toEqual([]);
    // The fight keeps the 9 hit points it had.
    expect(hpOf(stored(h), "nessa")).toBe(9);
  });

  it("fails if go_private ends the fight, clears the rolls, or leaves it shown to the players", async () => {
    const h = harness(row({ is_running: true, current_round: 2, combatants_live: [pc("nessa", { hp: 9, max_hp: 20, initiative: 15 })] }));
    const result = await runBatch(batch("p1", { type: "go_private" }), h.deps);
    expect(result).toMatchObject({ applied: true, is_running: false, ended_at: null });
    // The fight goes on exactly as it was: same round, same rolls, no write to any character.
    expect(stored(h)).toMatchObject({ is_running: false, ended_at: null, current_round: 2 });
    expect(stored(h).combatants_live[0]).toMatchObject({ hp: 9, initiative: 15 });
    expect(h.persisted).toEqual([]);
    expect(h.companions).toEqual([]);
    // A retry of the same batch is answered, not applied again.
    const again = await runBatch(batch("p1", { type: "go_private" }), h.deps);
    expect(again.applied).toBe(false);
    expect(h.saves).toBe(1);
  });

  it("fails if go_private is accepted on an ended fight or with no fight, or mixed with another command", async () => {
    const ended = harness(row({ ended_at: "2026-11-14T10:00:00.000Z" }));
    await expect(runBatch(batch("p2", { type: "go_private" }), ended.deps)).rejects.toMatchObject({ status: 409 });
    const none = harness(null);
    await expect(runBatch(batch("p3", { type: "go_private" }), none.deps)).rejects.toMatchObject({ status: 404 });
    expect(() => validateRequest({ encounterId: "e", batchId: "b", commands: [{ type: "go_private" }, { type: "next_turn" }] })).toThrow(FightCommandError);
  });

  it("fails if a fight command or go_live is accepted on an ended fight", async () => {
    const ended = row({ ended_at: "2026-11-14T10:00:00.000Z" });
    const h = harness(ended);
    await expect(runBatch(batch("b1", { type: "next_turn" }), h.deps)).rejects.toMatchObject({ status: 409 });
    await expect(runBatch(batch("b2", { type: "go_live", sessionId: null }), h.deps)).rejects.toMatchObject({ status: 409 });
    await expect(runBatch(batch("b3", { type: "end_combat" }), h.deps)).rejects.toMatchObject({ status: 409 });
    await expect(runBatch(batch("b4", { type: "abandon" }), h.deps)).rejects.toMatchObject({ status: 409 });
    expect(h.saves).toBe(0);
  });

  it("fails if a lifecycle command without a fight is anything but a 404", async () => {
    const h = harness(null);
    await expect(runBatch(batch("g1", { type: "go_live", sessionId: null }), h.deps)).rejects.toMatchObject({ status: 404 });
  });

  it("fails if a lifecycle batch sent twice is applied twice", async () => {
    const h = harness(row({ combatants_live: [pc("nessa", { hp: 9, max_hp: 20, initiative: 15 })] }));
    const first = await runBatch(batch("e1", { type: "end_combat" }), h.deps);
    const second = await runBatch(batch("e1", { type: "end_combat" }), h.deps);
    // The retry is answered with the ended fight, not refused for it, and the sheet was written once.
    expect(first.applied).toBe(true);
    expect(second).toMatchObject({ applied: false, ended_at: "2026-11-15T20:00:00.000Z" });
    expect(h.persisted).toHaveLength(1);
    expect(h.saves).toBe(1);
  });

  it("fails if a write after the fight's save that keeps failing is thrown instead of reported", async () => {
    const h = harness(row({ combatants_live: [pc("nessa", { hp: 9, max_hp: 20 })] }));
    let calls = 0;
    h.deps.persistPartyMember = async () => {
      calls += 1;
      throw new Error("down");
    };
    const result = await runBatch(batch("e1", { type: "end_combat" }), h.deps);
    expect(calls).toBe(3);
    expect(result.effectFailures).toEqual(["player_persist: down"]);
    expect(result.ended_at).not.toBeNull();
  });

  it("refuses a lifecycle command mixed with another, and open with no or too many combatants", () => {
    const send = (commands: unknown[]) => () => validateRequest({ encounterId: "e", batchId: "b", commands });
    const one = { instance_id: "a", type: "monster", name: "A", hp: 1, max_hp: 1 };
    expect(send([{ type: "abandon" }, { type: "next_turn" }])).toThrow(FightCommandError);
    expect(send([{ type: "next_turn" }, { type: "end_combat" }])).toThrow(FightCommandError);
    expect(send([{ type: "go_live", sessionId: null }, { type: "go_live", sessionId: null }])).toThrow(FightCommandError);
    expect(send([{ type: "go_live" }])).toThrow(FightCommandError);
    expect(send([{ type: "open", combatants: [] }])).toThrow(FightCommandError);
    expect(send([{ type: "open", combatants: Array.from({ length: 61 }, () => one) }])).toThrow(FightCommandError);
    expect(send([{ type: "open", combatants: Array.from({ length: 60 }, () => one) }])).not.toThrow();
    expect(send([{ type: "end_combat", siteId: 4 }])).toThrow(FightCommandError);
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

  it("takes sync_party only alone, and fire_event in a mixed batch", () => {
    expect(validateRequest({ ...ok, commands: [{ type: "sync_party" }] }).commands).toHaveLength(1);
    expect(() => validateRequest({ ...ok, commands: [{ type: "sync_party" }, { type: "next_turn" }] })).toThrow(FightCommandError);
    expect(validateRequest({ ...ok, commands: [{ type: "next_turn" }, { type: "fire_event", eventId: "a" }] }).commands).toHaveLength(2);
    expect(() => validateRequest({ ...ok, commands: [{ type: "fire_event" }] })).toThrow(FightCommandError);
    expect(ALL_FIGHT_COMMANDS_LISTED).toBe(true);
  });

  it("fails if an add_combatants entry that a crash would follow gets through", () => {
    const good = { instance_id: "a", type: "monster", name: "A", hp: 1, max_hp: 1 };
    const send = (combatants: unknown) => () => validateRequest({ ...ok, commands: [{ type: "add_combatants", combatants }] });
    expect(send([good])).not.toThrow();
    expect(send([])).toThrow(FightCommandError);
    expect(send(Array.from({ length: 31 }, () => good))).toThrow(FightCommandError);
    expect(send([{ ...good, instance_id: "" }])).toThrow(FightCommandError);
    expect(send([{ ...good, type: "npc" }])).toThrow(FightCommandError);
    expect(send([{ ...good, hp: "1" }])).toThrow(FightCommandError);
    expect(send("a")).toThrow(FightCommandError);
  });

  it("fails if a curse that is not a string reaches the engine", () => {
    expect(() => validateRequest({ ...ok, commands: [{ type: "add_curse", instanceId: "a", curse: 3 }] })).toThrow(FightCommandError);
    expect(() => validateRequest({ ...ok, commands: [{ type: "set_reveal_state", instanceId: "a", revealState: "gone" }] })).toThrow(FightCommandError);
  });
});
