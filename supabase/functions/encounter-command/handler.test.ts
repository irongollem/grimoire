/**
 * The handler against an in-memory store with the database's own version rule:
 * `saveFight` writes only when the version still matches, and bumps it by one.
 * Every expected value is worked out from the rules in the comment above it.
 */
import { describe, expect, it } from "vitest";
import type { EncounterEvent, RunCombatant } from "../../../src/types/encounter.types";
import type { PartyIngestRow } from "../../../src/rules/fight/partyIngest";
import type { Monster } from "../../../src/types/monster.types";
import { emptyDefenses, type StatBlockEntry } from "../../../src/types/statBlock.types";
import type { PlayerSheets } from "../../../src/rules/fight/playerSheet";
import type { FightMap } from "../../../src/rules/fight/terrain/battleMap";
import { occluders } from "../../../src/lib/battlemap/occlusion";
import type { Item } from "../../../src/types/item.types";
import type { PartyInventoryItem } from "../../../src/types/inventory.types";
import { broadcastEvent, combatant, pc } from "../../../src/rules/fight/fightTestKit";
import type { JudgeRequest, JudgeResult } from "../_shared/typesafe";
import {
  ALL_FIGHT_COMMANDS_LISTED,
  ALL_REDUCER_COMMANDS_LISTED,
  ALL_RESOLVING_COMMANDS_LISTED,
  FightCommandError,
  runBatch,
  validateRequest,
  type BatchDeps,
  type CommandRequest,
  type FightRow,
  type FightWrite,
  type FightLifecycleWrite,
  type LoadedFight,
  type PostedRoll,
  type StatBlockSources,
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
  /** The rolls posted to the campaign log, in order, with the stamp each carries. */
  posted: PostedRoll[];
  /** How many times the server threw a die. */
  dieCalls: number;
  /** The party member ids of each `loadPlayerSheets` call. */
  playerLoads: string[][];
  /** How many times the fight's map was read. */
  mapLoads: number;
  /** Runs once, between a load and its save: another writer got in. */
  rival: { run: (() => void) | null; always: boolean };
  /** Every note judgment the server asked for: the request, and the count it said it had already made this batch. */
  noteAsks: Array<{ request: JudgeRequest; already: number }>;
  /** The input tokens of each note cost row written, with how many saves had happened when it was written. */
  noteCosts: Array<{ inputTokens: number; savesBefore: number }>;
}

function harness(
  initial: FightRow | null,
  options: {
    events?: EncounterEvent[];
    party?: PartyIngestRow[];
    d6?: number;
    d20?: number;
    sources?: StatBlockSources;
    /** What the server reads of the fight's player characters. */
    players?: PlayerSheets;
    /** The faces the server's die shows, one per throw in order; a throw past the end fails the test. */
    dieFaces?: number[];
    /** The fight's battle map; absent or null is a fight with no map the rules can use. */
    map?: FightMap | null;
    /** What a note judgment answers; absent is "not allowed" (AI off, no key, over the cap, or a failed call). */
    judge?: (request: JudgeRequest) => JudgeResult | null;
  } = {},
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
    posted: [],
    dieCalls: 0,
    playerLoads: [],
    mapLoads: 0,
    rival: { run: null, always: false },
    noteAsks: [],
    noteCosts: [],
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
    async loadStatBlocks() {
      return structuredClone(options.sources ?? { monsters: [], npcs: [], companions: [] });
    },
    async loadPlayerSheets(ids) {
      h.playerLoads.push(ids);
      return structuredClone(options.players ?? { members: [], inventory: [], items: [], beasts: [] });
    },
    async loadFightMap() {
      h.mapLoads += 1;
      return options.map === undefined ? null : options.map;
    },
    async postRoll(roll) {
      h.log.push("roll");
      h.posted.push(structuredClone(roll));
    },
    rollDie() {
      h.dieCalls += 1;
      const face = options.dieFaces?.shift();
      if (face === undefined) throw new Error("The server threw a die the test did not script");
      return face;
    },
    async judgeNote(request, already) {
      h.noteAsks.push({ request, already });
      return options.judge ? options.judge(request) : null;
    },
    async recordNoteJudgment(inputTokens) {
      h.noteCosts.push({ inputTokens, savesBefore: h.saves });
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


// ── resolving commands (#1201 stage 3) ───────────────────────────────────────────

const bite: StatBlockEntry = {
  name: "Bite",
  description: "",
  structured: { kind: "attack", source: "manual", attack: { delivery: "melee", bonus: 4, hit: [{ dice: "1d6+2", type: "piercing" }] } },
};
const roar: StatBlockEntry = {
  name: "Roar",
  description: "Frightens.",
  structured: { kind: "other", source: "manual", review: "unreadable" },
};
const burst: StatBlockEntry = {
  name: "Burst",
  description: "",
  structured: {
    kind: "save", source: "manual",
    save: { ability: "dex", dc: 14, fail: [{ dice: "2d6", type: "fire" }], success: "half", conditions: [] },
  },
};

function monster(id: string, over: Record<string, unknown> = {}): Monster {
  return {
    id,
    name: id,
    stat_block: {
      armor_class: 13, hit_points: "1d8", speed: "30 ft.", str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10, challenge_rating: "1",
      defenses: emptyDefenses(), actions: [bite, roar, burst], ...over,
    },
  } as unknown as Monster;
}

const CHAIN_MAIL = { id: "chain", user_id: "u1", name: "Chain Mail", item_type: "armor", rarity: "mundane", armor_class: "16", tags: [], description: "", conceptual_key: "chain_mail" } as unknown as Item;
const SHIELD = { id: "shield", user_id: "u1", name: "Shield", item_type: "shield", rarity: "mundane", armor_class: "2", tags: [], description: "", conceptual_key: "shield" } as unknown as Item;
const wornRow = (itemId: string, slot: string) =>
  ({ id: `inv-${itemId}`, item_id: itemId, library_item_id: null, carried_by: "pm-nessa", location: "equipped", slot, is_attuned: false, quality: "standard" }) as unknown as PartyInventoryItem;

/** Nessa: a fighter with Dex 14, Con 14 (proficient save), proficiency +2, in chain mail and with a shield. */
const NESSA_IN_PLATE: PlayerSheets = {
  members: [{
    id: "pm-nessa", ruleset: "2014", class: "Fighter", subclass: null, ac_formula: null, class_choices: {},
    str: 10, dex: 14, con: 14, int: 10, wis: 10, cha: 10, proficiency_bonus: 2, saving_throw_proficiencies: ["con"], wildshape_state: null,
  }],
  inventory: [wornRow("chain", "body"), wornRow("shield", "off_hand")],
  items: [CHAIN_MAIL, SHIELD],
  beasts: [],
};

const SOURCES: StatBlockSources = { monsters: [monster("m-wolf"), monster("m-ox")], npcs: [], companions: [] };

/** A wolf (11 HP) and a victim (40 HP, AC 13) side by side on the map. */
function arena(extra: Partial<FightRow> = {}) {
  return row({
    combatants_live: [
      combatant("wolf", { monster_id: "m-wolf", hp: 11, max_hp: 11, initiative: 12, position: { x: 1, y: 1 } }),
      combatant("victim", { monster_id: "m-ox", hp: 40, max_hp: 40, ac: "13", initiative: 5, position: { x: 2, y: 1 } }),
    ],
    ...extra,
  });
}

const attack = (over: Record<string, unknown> = {}): CommandRequest["commands"][number] =>
  ({ type: "resolve_attack", attackerId: "wolf", list: "actions", action: "Bite", targetId: "victim", ...over }) as CommandRequest["commands"][number];

describe("resolving commands", () => {
  // PHB 2014 "Making an Attack": d20 9 + 4 = 13 meets AC 13 and hits; 1d6+2 with a 5 deals 7. The victim's 40 HP leave 33.
  it("rolls the attack with the server's die, takes the damage off, saves, and says what happened in the reply", async () => {
    const h = harness(arena(), { sources: SOURCES, dieFaces: [9, 5] });
    const result = await runBatch(batch("b1", attack()), h.deps);
    expect(hpOf(stored(h), "victim")).toBe(33);
    const resolved = result.effects.find((e) => e.type === "resolved");
    expect(resolved).toMatchObject({ resolved: { kind: "attack", attackerId: "wolf", targetId: "victim", natural: 9, total: 13, hit: true, damageTotal: 7 } });
    expect(h.dieCalls).toBe(2);
  });

  // The paralyzed target is attacked with advantage and a hit within 5 feet is a critical (PHB 2014 appendix A "Paralyzed"):
  // the d20 takes two faces (4 and 12, keeping 12; 12 + 4 = 16 beats AC 13) and the critical rolls 2d6 (3 + 4) + 2 = 9.
  // If the attack ran before the condition was applied it would be a plain d20 and 1d6, and the scripted dice would not line up.
  it("applies a resolving command and an ordinary one in the order sent", async () => {
    const h = harness(arena(), { sources: SOURCES, dieFaces: [4, 12, 3, 4] });
    const result = await runBatch(
      batch("b1", { type: "apply_condition", instanceId: "victim", condition: { name: "Paralyzed" } }, attack(), { type: "adjust_hp", instanceId: "victim", delta: -1 }),
      h.deps,
    );
    // 40 - 9 (the critical) - 1 (the damage sent after it).
    expect(hpOf(stored(h), "victim")).toBe(30);
    expect(result.effects).toContainEqual(expect.objectContaining({ type: "resolved", resolved: expect.objectContaining({ critical: true, damageTotal: 9 }) }));
  });

  // The second attempt rolls again on the winner's row: d20 15 + 4 = 19 hits; 1d6+2 with a 2 is 4; 40 - 4 = 36. Only that
  // attempt's two rolls are posted, with the totals 19 and 4; the first attempt's 13 and 7 were never written anywhere.
  it("rolls again after a lost race and posts only the rolls of the attempt that was saved", async () => {
    const h = harness(arena(), { sources: SOURCES, dieFaces: [9, 5, 15, 2] });
    h.rival.run = rivalEdit(h, (r) => {
      r.combatants_live = r.combatants_live.map((c) => (c.instance_id === "wolf" ? { ...c, hp: 10 } : c));
    });
    await runBatch(batch("b1", attack()), h.deps);
    expect(h.saves).toBe(2);
    expect(hpOf(stored(h), "victim")).toBe(36);
    expect(h.posted.map((p) => p.result.total)).toEqual([19, 4]);
    expect(h.log.filter((entry) => entry === "roll")).toHaveLength(2);
  });

  // The log rows: dice the server threw carry the stamp; faces a person rolled are scored, never re-rolled, are posted as
  // theirs (`manual`) and carry none. Mixed: the person's d20 (9 + 4 = 13 hits) is unstamped, the server's damage die (5 + 2) is stamped.
  it("stamps a posted roll only when the server threw the dice", async () => {
    const server = harness(arena(), { sources: SOURCES, dieFaces: [9, 5] });
    await runBatch(batch("b1", attack()), server.deps);
    expect(server.posted.map((p) => [p.speaker, p.serverRolled, p.result.manual])).toEqual([["wolf", true, undefined], ["wolf", true, undefined]]);

    const person = harness(arena(), { sources: SOURCES, dieFaces: [] });
    await runBatch(batch("b1", attack({ faces: { attack: [9], damage: [[5]] } })), person.deps);
    expect(person.dieCalls).toBe(0);
    expect(hpOf(stored(person), "victim")).toBe(33);
    expect(person.posted.map((p) => [p.serverRolled, p.result.manual])).toEqual([[false, true], [false, true]]);

    const mixed = harness(arena(), { sources: SOURCES, dieFaces: [5] });
    await runBatch(batch("b1", attack({ faces: { attack: [9] } })), mixed.deps);
    expect(mixed.posted.map((p) => p.serverRolled)).toEqual([false, true]);
    expect(hpOf(stored(mixed), "victim")).toBe(33);
  });

  it("refuses faces a die does not have, too few, and damage faces without the d20 that decides their count", async () => {
    // A d20 never shows 21.
    const h = harness(arena(), { sources: SOURCES });
    await expect(runBatch(batch("b1", attack({ faces: { attack: [21] } })), h.deps)).rejects.toMatchObject({ status: 400, message: expect.stringMatching(/d20 shows 1 to 20/) });
    // A target with advantage on it needs two d20 faces.
    const blind = harness(row({ combatants_live: [arena().combatants_live[0], { ...arena().combatants_live[1], conditions: [{ name: "Blinded" }] }] }), { sources: SOURCES });
    await expect(runBatch(batch("b2", attack({ faces: { attack: [10] } })), blind.deps)).rejects.toMatchObject({ status: 400, message: expect.stringMatching(/expected 2 faces/) });
    // A critical would double the damage dice, so damage faces cannot be accepted before the d20 is known.
    expect(() => validateRequest(batch("b3", attack({ faces: { damage: [[5]] } })))).toThrow(FightCommandError);
    expect(() => validateRequest(batch("b4", attack({ faces: { attack: [0] } })))).toThrow(FightCommandError);
    expect(h.saves + blind.saves).toBe(0);
  });

  it("refuses an action with no structured payload, an unknown action, a dead or unknown attacker, and a target outside the fight, saving nothing", async () => {
    const refuse = async (command: CommandRequest["commands"][number], pattern: RegExp, fight = arena()) => {
      const h = harness(fight, { sources: SOURCES, dieFaces: [9, 5] });
      await expect(runBatch(batch("b", command), h.deps)).rejects.toMatchObject({ status: 400, message: expect.stringMatching(pattern) });
      expect(h.saves).toBe(0);
      expect(h.posted).toEqual([]);
    };
    await refuse(attack({ action: "Roar" }), /no structured attack/);
    await refuse(attack({ action: "Fly" }), /no "Fly" under actions/);
    await refuse(attack({ attackerId: "ghost" }), /No attacker "ghost"/);
    await refuse(attack({ targetId: "ghost" }), /No target "ghost"/);
    const dead = arena();
    dead.combatants_live[0] = { ...dead.combatants_live[0], hp: 0 };
    await refuse(attack(), /0 hit points and cannot act/, dead);
    // A player has no stat block here, so it has no action to resolve.
    const player = arena();
    player.combatants_live[0] = pc("nessa", { hp: 12, max_hp: 12 });
    await refuse(attack({ attackerId: "nessa" }), /no stat block/, player);
  });

  // PHB 2014 "Armor": chain mail 16 (heavy, no Dex) + shield 2 = 18. The wolf's d20 13 + 4 = 17 misses AC 18. Were the gear
  // not read, the unarmoured 10 + Dex 14 (+2) = 12 would be hit and take 1d6+2.
  it("fails if an attack on a player ignores the gear they wear and hits an armour class of 12", async () => {
    const fight = arena();
    fight.combatants_live[1] = pc("nessa", { hp: 40, max_hp: 40, ac: "12", position: { x: 2, y: 1 } });
    const h = harness(fight, { sources: SOURCES, players: NESSA_IN_PLATE, dieFaces: [13] });
    const result = await runBatch(batch("b", attack({ targetId: "nessa" })), h.deps);
    expect(hpOf(stored(h), "nessa")).toBe(40);
    expect(result.effects).toContainEqual(expect.objectContaining({ type: "resolved", resolved: expect.objectContaining({ hit: false, total: 17 }) }));
    expect(h.playerLoads).toEqual([["pm-nessa"]]);
  });

  it("refuses a player whose character the server could not read, rather than rolling against a made-up armour class", async () => {
    const fight = arena();
    fight.combatants_live[1] = pc("nessa", { hp: 40, max_hp: 40 });
    const h = harness(fight, { sources: SOURCES, dieFaces: [13] });
    await expect(runBatch(batch("b", attack({ targetId: "nessa", withinFiveFeet: true })), h.deps)).rejects.toMatchObject({ status: 400, message: expect.stringMatching(/could not be read/) });
    expect(h.saves).toBe(0);
    // The same for a save: a null bonus would leave it to the player, and the server cannot tell that from a creature with no stat block.
    await expect(
      runBatch(batch("b2", { type: "resolve_save", attackerId: "wolf", list: "actions", action: "Burst", targetIds: ["nessa"] }), h.deps),
    ).rejects.toMatchObject({ status: 400, message: expect.stringMatching(/could not be read/) });
    expect(h.saves).toBe(0);
  });

  // The sheets are for a batch that resolves something in a fight with a player in it: no query otherwise, one query however many commands.
  it("reads the player sheets only when a resolving command meets a fight with a player, and once per attempt", async () => {
    const noPlayer = harness(arena(), { sources: SOURCES, dieFaces: [9, 5, 9, 5] });
    await runBatch(batch("b1", attack(), attack()), noPlayer.deps);
    expect(noPlayer.playerLoads).toEqual([]);

    const fight = arena();
    fight.combatants_live.push(pc("nessa", { hp: 40, max_hp: 40 }));
    const plain = harness(fight, { sources: SOURCES, players: NESSA_IN_PLATE });
    await runBatch(batch("b2", { type: "adjust_hp", instanceId: "victim", delta: -1 }), plain.deps);
    expect(plain.playerLoads).toEqual([]);

    const twice = harness(fight, { sources: SOURCES, players: NESSA_IN_PLATE, dieFaces: [9, 5, 9, 5] });
    await runBatch(batch("b3", attack(), attack()), twice.deps);
    expect(twice.playerLoads).toEqual([["pm-nessa"]]);
  });

  it("asks where the creatures stand when neither the command nor the map says how close they are", async () => {
    const fight = arena();
    fight.combatants_live[1] = { ...fight.combatants_live[1], position: undefined };
    const h = harness(fight, { sources: SOURCES, dieFaces: [9, 5] });
    await expect(runBatch(batch("b", attack()), h.deps)).rejects.toMatchObject({ status: 400, message: expect.stringMatching(/within five feet/) });
    // Said outright, the command goes through.
    await runBatch(batch("b2", attack({ withinFiveFeet: true })), h.deps);
    expect(hpOf(stored(h), "victim")).toBe(33);
  });

  // PHB 2014 "Saving Throws": each target rolls its own save, one damage roll serves all. The ox (Dex +0): 5 < DC 14 fails and
  // takes 2d6 = 3 + 4 = 7 (40 -> 33). The victim's person-rolled 15 saves and takes half of 7, rounded down, 3 (40 -> 37).
  it("resolves a save for several targets, a person's own roll standing for the one who made it", async () => {
    const fight = arena();
    fight.combatants_live.push(combatant("other", { monster_id: "m-ox", hp: 40, max_hp: 40, initiative: 3 }));
    const h = harness(fight, { sources: SOURCES, dieFaces: [5, 3, 4] });
    const result = await runBatch(
      batch("b", { type: "resolve_save", attackerId: "wolf", list: "actions", action: "Burst", targetIds: ["victim", "other"], faces: { saves: [null, [15]] } }),
      h.deps,
    );
    expect([hpOf(stored(h), "victim"), hpOf(stored(h), "other")]).toEqual([33, 37]);
    expect(h.posted.map((p) => [p.speaker, p.serverRolled])).toEqual([["victim", true], ["other", false], ["wolf", true]]);
    expect(result.effects).toContainEqual(expect.objectContaining({ type: "resolved", resolved: expect.objectContaining({ kind: "save" }) }));
  });

  // PHB 2014 "Saving Throws": nessa's Dex 14 is +2 and she is not proficient: d20 12 + 2 = 14 meets DC 14 and saves, taking half of
  // 2d6 = 3 + 4 = 7, rounded down, 3 (40 -> 37). With no bonus known the 12 would fail and take 7 (33).
  it("rolls a player's save with the bonus from their sheet", async () => {
    const fight = arena();
    fight.combatants_live[1] = pc("nessa", { hp: 40, max_hp: 40 });
    const h = harness(fight, { sources: SOURCES, players: NESSA_IN_PLATE, dieFaces: [12, 3, 4] });
    await runBatch(batch("b", { type: "resolve_save", attackerId: "wolf", list: "actions", action: "Burst", targetIds: ["nessa"] }), h.deps);
    expect(hpOf(stored(h), "nessa")).toBe(37);
    expect(h.posted[0]).toMatchObject({ speaker: "nessa", serverRolled: true });
  });

  // PHB 2014 "Concentration": 24 damage is DC 12. Nessa's Con 14 is +2 and she is proficient (+2): d20 8 + 4 = 12 holds the spell.
  // Without the proficiency bonus it would be 10 and the spell would end.
  it("fails if a player's concentration save leaves out their proficiency", async () => {
    const fight = arena();
    fight.combatants_live[1] = {
      ...pc("nessa", { hp: 40, max_hp: 40 }),
      concentration: { spellId: null, spellName: "Bless", castAtLevel: 1, startedRound: 1, appliedEffectIds: [] },
    };
    const h = harness(fight, { sources: SOURCES, players: NESSA_IN_PLATE, dieFaces: [8] });
    await runBatch(batch("b", { type: "resolve_concentration", instanceId: "nessa", damage: 24 }), h.deps);
    expect(stored(h).combatants_live.find((c) => c.instance_id === "nessa")?.concentration).not.toBeNull();
  });

  // PHB 2014 "Concentration": DC max(10, half the damage): 24 damage is DC 12. d20 7 + 0 = 7 loses it.
  it("a lost concentration save ends the spell, and only a creature that is concentrating owes one", async () => {
    const fight = arena();
    fight.combatants_live[1] = {
      ...fight.combatants_live[1],
      concentration: { spellId: null, spellName: "Bless", castAtLevel: 1, startedRound: 1, appliedEffectIds: [] },
    };
    const h = harness(fight, { sources: SOURCES, dieFaces: [7] });
    await runBatch(batch("b", { type: "resolve_concentration", instanceId: "victim", damage: 24 }), h.deps);
    expect(stored(h).combatants_live.find((c) => c.instance_id === "victim")?.concentration).toBeNull();
    expect(h.posted[0]).toMatchObject({ speaker: "victim", serverRolled: true });

    const idle = harness(arena(), { sources: SOURCES, dieFaces: [7] });
    await expect(runBatch(batch("b", { type: "resolve_concentration", instanceId: "victim", damage: 24 }), idle.deps)).rejects.toMatchObject({
      status: 400, message: expect.stringMatching(/not concentrating/),
    });
  });

  // A repeat save is owed only when the turn hooks marked it due. d20 13 + 0 = 13 meets DC 13: the condition ends.
  it("rolls a condition's repeat save only while it is due, and settles it", async () => {
    const fight = arena();
    fight.combatants_live[1] = {
      ...fight.combatants_live[1],
      conditions: [{ name: "Frightened", ends: { kind: "save", ability: "wis", dc: 13, at: "end" }, due: { save: true } }],
    };
    const h = harness(fight, { sources: SOURCES, dieFaces: [13] });
    await runBatch(batch("b", { type: "roll_condition_save", instanceId: "victim", name: "Frightened" }), h.deps);
    expect(stored(h).combatants_live.find((c) => c.instance_id === "victim")?.conditions).toEqual([]);

    const notDue = arena();
    notDue.combatants_live[1] = { ...notDue.combatants_live[1], conditions: [{ name: "Frightened", ends: { kind: "save", ability: "wis", dc: 13, at: "end" } }] };
    const idle = harness(notDue, { sources: SOURCES, dieFaces: [13] });
    await expect(runBatch(batch("b", { type: "roll_condition_save", instanceId: "victim", name: "Frightened" }), idle.deps)).rejects.toMatchObject({
      status: 400, message: expect.stringMatching(/owes no repeat save/),
    });
  });

  // Ongoing damage: 1d4 fire with a 3 takes 3 off 40, and the debt is cleared.
  it("rolls ongoing damage that is due, takes it off, and clears what was owed", async () => {
    const fight = arena();
    fight.combatants_live[1] = {
      ...fight.combatants_live[1],
      conditions: [{ name: "Burning", ongoing: { dice: "1d4", type: "fire", at: "start" }, due: { damage: true } }],
    };
    const h = harness(fight, { sources: SOURCES, dieFaces: [3] });
    await runBatch(batch("b", { type: "roll_ongoing_damage", instanceId: "victim", name: "Burning" }), h.deps);
    const victim = stored(h).combatants_live.find((c) => c.instance_id === "victim");
    expect(victim?.hp).toBe(37);
    expect(victim?.conditions[0].due?.damage).toBeFalsy();
  });

  it("validates the shape of a resolving command, mixed with an ordinary one", () => {
    const ok = (command: unknown) => () => validateRequest(batch("b", { type: "next_turn" }, command as CommandRequest["commands"][number]));
    expect(ok(attack())).not.toThrow();
    expect(ok(attack({ targetId: "" }))).toThrow(FightCommandError);
    expect(ok(attack({ list: "powers" }))).toThrow(FightCommandError);
    // A penalty only ever makes the roll harder: a positive one is a bonus the caller has no business adding.
    expect(ok(attack({ penalty: 2 }))).toThrow(FightCommandError);
    expect(ok(attack({ penalty: -5 }))).not.toThrow();
    expect(ok({ type: "resolve_save", attackerId: "a", list: "actions", action: "Burst", targetIds: ["x", "x"] })).toThrow(FightCommandError);
    expect(ok({ type: "resolve_concentration", instanceId: "a", damage: 0 })).toThrow(FightCommandError);
    expect(ALL_RESOLVING_COMMANDS_LISTED).toBe(true);
  });
});

// ── cover (#1202 story 3c) ───────────────────────────────────────────────────────

/** A map of the given walls, each written as its two end points in cell units (x right, y down). */
function mapOf(...walls: [[number, number], [number, number]][]): FightMap {
  return {
    mapLocationId: "loc-1",
    occluders: occluders({ walls: walls.map(([a, b], i) => ({ id: `w${i}`, a, b })), doors: [], solid: [] }),
    difficult: new Set(),
    solid: new Set(),
    calibration: { cells_per_image_width: 20, origin_x_pct: 0, origin_y_pct: 0 },
    // A map far wider than any fight in these tests, so its edge never matters here (reach.test.ts holds the edge).
    bounds: { minX: -50, minY: -50, maxX: 50, maxY: 50 },
    rowsKnown: true,
    exits: [],
  };
}

/** The same open map with ways off it (battle cells). */
function mapWithExits(exits: FightMap["exits"]): FightMap {
  return { ...mapOf(), exits };
}

// A short wall on the target's near edge blocks two of the four lines: half cover (sight.test.ts, same shape one row down).
const HALF_WALL: [[number, number], [number, number]] = [[3, 1], [3, 1.5]];
// Add a wall through the whole square at x=3.5: three of four lines blocked, three-quarters cover.
const THREE_QUARTERS_WALLS: [[number, number], [number, number]][] = [HALF_WALL, [[3.5, 1], [3.5, 2]]];
// A full-height wall between them: every line blocked.
const TOTAL_WALL: [[number, number], [number, number]] = [[2, 1], [2, 2]];

/** The wolf at (0,1) and the victim (AC 13, Dex +0) three squares along the same row; the command says they are within reach. */
function coverArena(extra: RunCombatant[] = [], victimOver: Record<string, unknown> = {}) {
  return row({
    combatants_live: [
      combatant("wolf", { monster_id: "m-wolf", hp: 11, max_hp: 11, initiative: 12, position: { x: 0, y: 1 } }),
      combatant("victim", { monster_id: "m-ox", hp: 40, max_hp: 40, ac: "13", initiative: 5, position: { x: 3, y: 1 }, ...victimOver }),
      ...extra,
    ],
  });
}
const near = (over: Record<string, unknown> = {}) => attack({ withinFiveFeet: true, ...over });
const resolved = (r: { effects: Array<{ type: string }> }) => r.effects.find((e) => e.type === "resolved");

describe("cover on a resolving command", () => {
  // PHB 2014 ch. 9 "Cover": half cover is +2 to AC, so AC 13 is 15. Wolf +4: d20 11 totals 15 and hits (damage 5 + 2 = 7, 40 -> 33);
  // d20 10 totals 14, which would hit AC 13 and misses 15 (40 stays 40).
  it("fails if half cover from a wall does not add 2 to the armour class, on both sides of it", async () => {
    const hit = harness(coverArena(), { sources: SOURCES, map: mapOf(HALF_WALL), dieFaces: [11, 5] });
    const hitResult = await runBatch(batch("b1", near()), hit.deps);
    expect(hpOf(stored(hit), "victim")).toBe(33);
    expect(resolved(hitResult)).toMatchObject({ resolved: { total: 15, targetAc: 15, cover: "half", coverAc: 2, hit: true } });

    const miss = harness(coverArena(), { sources: SOURCES, map: mapOf(HALF_WALL), dieFaces: [10] });
    const missResult = await runBatch(batch("b2", near()), miss.deps);
    expect(hpOf(stored(miss), "victim")).toBe(40);
    expect(resolved(missResult)).toMatchObject({ resolved: { total: 14, targetAc: 15, cover: "half", hit: false } });
  });

  // Three-quarters is +5: AC 18. d20 13 totals 17 and misses (it would hit 13 and 15).
  it("fails if three-quarters cover from walls adds less than 5", async () => {
    const h = harness(coverArena(), { sources: SOURCES, map: mapOf(...THREE_QUARTERS_WALLS), dieFaces: [13] });
    const result = await runBatch(batch("b", near()), h.deps);
    expect(resolved(result)).toMatchObject({ resolved: { total: 17, targetAc: 18, cover: "three_quarters", coverAc: 5, hit: false } });
    expect(hpOf(stored(h), "victim")).toBe(40);
  });

  // PHB 2014 ch. 9: total cover cannot be targeted directly. Refused with a 400 before any die is thrown or anything saved.
  it("fails if an attack on a target behind a full wall rolls, posts or saves anything", async () => {
    const h = harness(coverArena(), { sources: SOURCES, map: mapOf(TOTAL_WALL), dieFaces: [20, 6] });
    await expect(runBatch(batch("b", near()), h.deps)).rejects.toMatchObject({ status: 400, message: expect.stringMatching(/victim has total cover from wolf/) });
    expect(h.dieCalls).toBe(0);
    expect(h.saves).toBe(0);
    expect(h.posted).toEqual([]);
  });

  // The same d20 10 that misses behind half cover (14 against 15) hits AC 13 when no map is known: nothing is guessed.
  it("fails if an attack with no map, or between creatures without a place on it, counts cover", async () => {
    const noMap = harness(coverArena(), { sources: SOURCES, map: null, dieFaces: [10, 5] });
    const noMapResult = await runBatch(batch("b1", near()), noMap.deps);
    expect(resolved(noMapResult)).toMatchObject({ resolved: { targetAc: 13, cover: null, coverAc: 0, hit: true } });

    const unplaced = harness(coverArena([], { position: undefined }), { sources: SOURCES, map: mapOf(TOTAL_WALL), dieFaces: [10, 5] });
    const unplacedResult = await runBatch(batch("b2", near()), unplaced.deps);
    expect(resolved(unplacedResult)).toMatchObject({ resolved: { targetAc: 13, cover: null, hit: true } });
    expect(hpOf(stored(unplaced), "victim")).toBe(33);
  });

  // PHB 2014 ch. 9 "Cover" lists a creature as half cover. A living ox standing between them on an open map (no walls) gives
  // +2: d20 10 totals 14 against 15 and misses. An ox at 0 hit points is dead and takes no square, so the same roll hits AC 13.
  it("fails if a creature in the way is not counted as a screen, or a dead one is", async () => {
    const live = combatant("screen", { monster_id: "m-ox", hp: 40, max_hp: 40, initiative: 3, position: { x: 1.5, y: 1 } });
    const screened = harness(coverArena([live]), { sources: SOURCES, map: mapOf(), dieFaces: [10] });
    const screenedResult = await runBatch(batch("b1", near()), screened.deps);
    expect(resolved(screenedResult)).toMatchObject({ resolved: { targetAc: 15, cover: "half", hit: false } });

    const dead = combatant("screen", { monster_id: "m-ox", hp: 0, max_hp: 40, initiative: 3, position: { x: 1.5, y: 1 } });
    const open = harness(coverArena([dead]), { sources: SOURCES, map: mapOf(), dieFaces: [10, 5] });
    const openResult = await runBatch(batch("b2", near()), open.deps);
    expect(resolved(openResult)).toMatchObject({ resolved: { targetAc: 13, cover: "none", hit: true } });
  });

  const burstOn = (ids: string[]) => ({ type: "resolve_save", attackerId: "wolf", list: "actions", action: "Burst", targetIds: ids }) as CommandRequest["commands"][number];

  // DC 14, Dex +0, half cover +2: d20 12 totals 14 and saves, taking half of 2d6 (3 + 4 = 7) rounded down = 3 (40 -> 37). Without
  // the bonus the 12 fails and takes 7 (33).
  it("fails if a Dexterity save behind half cover gets no bonus", async () => {
    const h = harness(coverArena(), { sources: SOURCES, map: mapOf(HALF_WALL), dieFaces: [12, 3, 4] });
    const result = await runBatch(batch("b", burstOn(["victim"])), h.deps);
    expect(hpOf(stored(h), "victim")).toBe(37);
    const summary = resolved(result) as unknown as { resolved: { targets: Array<Record<string, unknown>> } };
    expect(summary.resolved.targets[0]).toMatchObject({ total: 14, coverBonus: 2, success: true });
  });

  // A save action is not refused at total cover (areas can reach round corners): the target gets the three-quarters bonus.
  // d20 9 + 5 = 14 saves and takes half of 7 = 3 (40 -> 37).
  it("fails if a save action refuses a target at total cover instead of resolving it with the largest bonus", async () => {
    const h = harness(coverArena(), { sources: SOURCES, map: mapOf(TOTAL_WALL), dieFaces: [9, 3, 4] });
    await runBatch(batch("b", burstOn(["victim"])), h.deps);
    expect(hpOf(stored(h), "victim")).toBe(37);
  });

  // The map is read once however many commands there are, and only when something is resolved.
  it("fails if the map is read for a batch that resolves nothing, or once per command", async () => {
    const plain = harness(coverArena(), { sources: SOURCES, map: mapOf() });
    await runBatch(batch("b1", { type: "adjust_hp", instanceId: "victim", delta: -1 }), plain.deps);
    expect(plain.mapLoads).toBe(0);

    const twice = harness(coverArena(), { sources: SOURCES, map: mapOf(), dieFaces: [10, 5, 10, 5] });
    await runBatch(batch("b2", near(), near()), twice.deps);
    expect(twice.mapLoads).toBe(1);
  });
});

// ── the server plays a creature's turn (#1203 story 2b) ──────────────────────────

const takeTurn = (over: Record<string, unknown> = {}) => ({ type: "take_turn", instanceId: "wolf", ...over }) as CommandRequest["commands"][number];
const MULTI = (steps: { action: string; count: number }[]): StatBlockEntry => ({
  name: "Multiattack", description: "", structured: { kind: "multiattack", source: "manual", multiattack: steps },
});
const BREATH: StatBlockEntry = {
  name: "Breath", description: "",
  structured: { kind: "attack", source: "manual", recharge: { min: 5, max: 6 }, attack: { delivery: "melee", bonus: 4, hit: [{ dice: "1d6+2", type: "fire" }] } },
};
const combatantOf = (r: { combatants_live: RunCombatant[] }, id: string) => r.combatants_live.find((c) => c.instance_id === id) as RunCombatant;

/**
 * A wolf (11 HP, Int 10, speed 30 ft: five-foot squares, six of them) at (0,0) on open ground, and an enemy 40-HP ox
 * (AC 13) at (4,0). The squares beside the ox with the fewest steps are x=3, three steps (15 ft); the top row wins a tie.
 */
function duel(over: { wolf?: Partial<RunCombatant>; victim?: Partial<RunCombatant>; extra?: RunCombatant[] } = {}) {
  return row({
    combatants_live: [
      combatant("wolf", { monster_id: "m-wolf", faction_id: "m", hp: 11, max_hp: 11, initiative: 12, position: { x: 0, y: 0 }, ...over.wolf }),
      combatant("victim", { monster_id: "m-ox", faction_id: "p", hp: 40, max_hp: 40, ac: "13", initiative: 5, position: { x: 4, y: 0 }, ...over.victim }),
      ...(over.extra ?? []),
    ],
  });
}

describe("take_turn", () => {
  // Bug caught: a helper (someone with the party the rules cannot play) played as a creature by the rules.
  it("fails if a helper is asked to take a turn by the rules", async () => {
    const h = harness(duel({ extra: [combatant("npc", { bystander: true, faction_id: "neutral", initiative: null, position: { x: 0, y: 3 } })] }), { sources: SOURCES, map: mapOf(), dieFaces: [] });
    await expect(runBatch(batch("b1", takeTurn({ instanceId: "npc" })), h.deps)).rejects.toMatchObject({
      status: 400,
      message: "npc is no fighter the rules can play: their turn is their own.",
    });
    expect(h.saves).toBe(0);
  });

  // The rules-only pick is the Bite (the only attack, the only enemy). It walks to (3,-1), 15 ft, then bites: d20 9 + 4 = 13
  // meets AC 13; 1d6+2 with a 5 deals 7, so the ox has 33. The Action is used. The turn is not advanced.
  it("fails if the picked bite does not move the token, tally the 15 feet, resolve the attack and use the Action, in one saved batch", async () => {
    const h = harness(duel(), { sources: SOURCES, map: mapOf(), dieFaces: [9, 5] });
    const before = stored(h);
    const result = await runBatch(batch("b1", takeTurn()), h.deps);
    const wolf = combatantOf(stored(h), "wolf");
    expect(wolf.position).toEqual({ x: 3, y: -1 });
    expect(wolf.movement_used).toBe(15);
    expect(wolf.action_used).toBe(true);
    expect(hpOf(stored(h), "victim")).toBe(33);
    expect(h.saves).toBe(1);
    expect(h.posted.map((p) => p.result.total)).toEqual([13, 7]);
    expect(result.state.active_combatant_index).toBe(before.active_combatant_index);
    expect(result.state.current_round).toBe(before.current_round);
  });

  it("fails if the reply does not lead with turn_taken saying what was done, why, and that the rules picked", async () => {
    const h = harness(duel(), { sources: SOURCES, map: mapOf(), dieFaces: [9, 5] });
    const result = await runBatch(batch("b1", takeTurn()), h.deps);
    expect(result.effects[0]).toMatchObject({
      type: "turn_taken",
      turn: { instanceId: "wolf", optionId: "attack:actions:Bite:victim", kind: "attack", picked: "rules", reason: expect.stringMatching(/^Attacks victim/) },
    });
    expect(result.effects.findIndex((e) => e.type === "resolved")).toBeGreaterThan(0);
  });

  // The wolf has already bitten this turn (Action used) and the ox stands at (4,0), four squares off. Move is the only turn
  // left on offer; the rules-only picker would take it and walk the wolf away from a target it just attacked.
  it("fails if take_turn with no option walks a creature whose Action is already spent, or if naming the move stops working", async () => {
    const spent = duel({ wolf: { action_used: true } });
    const h = harness(spent, { sources: SOURCES, map: mapOf(), dieFaces: [] });
    await expect(runBatch(batch("b1", takeTurn()), h.deps)).rejects.toMatchObject({
      status: 400,
      message: "wolf has already used its Action this turn; name an option to move it.",
    });
    expect(h.saves).toBe(0);
    expect(combatantOf(stored(h), "wolf").position).toEqual({ x: 0, y: 0 });
    // A caller may still name the option: it walks 15 ft to the square beside the ox (the top row, (3,-1), is on this wide test map).
    await runBatch(batch("b2", takeTurn({ optionId: "move:victim" })), h.deps);
    expect(combatantOf(stored(h), "wolf").position).toEqual({ x: 3, y: -1 });
  });

  // The caller names Dodge: no movement, no dice, the Action used, and the effect says the caller chose.
  it("fails if a named option is taken for the picker's, or Dodge moves or rolls", async () => {
    const h = harness(duel(), { sources: SOURCES, map: mapOf(), dieFaces: [] });
    const result = await runBatch(batch("b1", takeTurn({ optionId: "dodge" })), h.deps);
    const wolf = combatantOf(stored(h), "wolf");
    expect(wolf.position).toEqual({ x: 0, y: 0 });
    expect(wolf.action_used).toBe(true);
    expect(wolf.movement_used ?? 0).toBe(0);
    expect(h.dieCalls).toBe(0);
    expect(result.effects[0]).toMatchObject({ type: "turn_taken", turn: { optionId: "dodge", kind: "dodge", picked: "caller" } });
  });

  // An Int 3 wolf is "instinct" (APP CONVENTION): it is offered attack, dash, move and flee, and Dodge is not on its menu.
  it("fails if an option the profile's gate dropped is accepted from the caller", async () => {
    const dim: StatBlockSources = { monsters: [monster("m-wolf", { int: 3 }), monster("m-ox")], npcs: [], companions: [] };
    const h = harness(duel(), { sources: dim, map: mapOf(), dieFaces: [9, 5] });
    await expect(runBatch(batch("b", takeTurn({ optionId: "dodge" })), h.deps)).rejects.toMatchObject({ status: 400, message: "That option is not on offer." });
    expect(h.saves).toBe(0);
    // The same wolf with Int 10 is offered Dodge (the test above takes it).
  });

  it("fails if an option that was never computed (an enemy not in the fight, a made-up id) is accepted from the caller, or if anything is saved for it", async () => {
    for (const optionId of ["attack:actions:Bite:ghost", "teleport"]) {
      const h = harness(duel(), { sources: SOURCES, map: mapOf(), dieFaces: [9, 5] });
      await expect(runBatch(batch("b", takeTurn({ optionId })), h.deps)).rejects.toMatchObject({ status: 400, message: "That option is not on offer." });
      expect(h.saves).toBe(0);
      expect(h.posted).toEqual([]);
    }
  });

  it("fails if a player character, a downed creature, an Incapacitated one or a stranger is given a turn", async () => {
    const refuse = async (fight: FightRow, command: CommandRequest["commands"][number], pattern: RegExp) => {
      const h = harness(fight, { sources: SOURCES, map: mapOf(), dieFaces: [9, 5] });
      await expect(runBatch(batch("b", command), h.deps)).rejects.toMatchObject({ status: 400, message: expect.stringMatching(pattern) });
      expect(h.saves).toBe(0);
    };
    await refuse(duel({ extra: [pc("nessa", { faction_id: "p", position: { x: 6, y: 0 }, hp: 12, max_hp: 12 })] }), takeTurn({ instanceId: "nessa" }), /no stat block/);
    await refuse(duel({ wolf: { hp: 0 } }), takeTurn(), /0 hit points/);
    await refuse(duel({ wolf: { conditions: [{ name: "Stunned" }] } }), takeTurn(), /Incapacitated/);
    await refuse(duel(), takeTurn({ instanceId: "ghost" }), /No creature "ghost"/);
  });

  // Multiattack: two Bites, 7 each (d20 9 + 4 = 13 meets AC 13; 5 + 2). 40 -> 33 -> 26. Four dice are thrown, four rolls posted.
  it("fails if a Multiattack does not resolve every swing as its own attack", async () => {
    const sources: StatBlockSources = { monsters: [monster("m-wolf", { actions: [MULTI([{ action: "Bite", count: 2 }]), bite] }), monster("m-ox")], npcs: [], companions: [] };
    const fight = duel({ wolf: { position: { x: 1, y: 0 } }, victim: { position: { x: 2, y: 0 } } });
    const h = harness(fight, { sources, map: mapOf(), dieFaces: [9, 5, 9, 5] });
    await runBatch(batch("b1", takeTurn({ optionId: "attack:actions:Multiattack:victim" })), h.deps);
    expect(hpOf(stored(h), "victim")).toBe(26);
    expect(h.dieCalls).toBe(4);
    expect(h.posted).toHaveLength(4);
    expect(combatantOf(stored(h), "wolf").action_used).toBe(true);
  });

  // The ox has 7 HP: the first bite deals 7 and drops it to 0, so the second swing is never made (no die is scripted for it).
  it("fails if a Multiattack keeps swinging at a target that has already dropped", async () => {
    const sources: StatBlockSources = { monsters: [monster("m-wolf", { actions: [MULTI([{ action: "Bite", count: 2 }]), bite] }), monster("m-ox")], npcs: [], companions: [] };
    const fight = duel({ wolf: { position: { x: 1, y: 0 } }, victim: { position: { x: 2, y: 0 }, hp: 7 } });
    const h = harness(fight, { sources, map: mapOf(), dieFaces: [9, 5] });
    await runBatch(batch("b1", takeTurn({ optionId: "attack:actions:Multiattack:victim" })), h.deps);
    expect(hpOf(stored(h), "victim")).toBe(0);
    expect(h.dieCalls).toBe(2);
    expect(combatantOf(stored(h), "wolf").action_used).toBe(true);
  });

  // A Recharge 5-6 breath used once is spent; with the Action freed again it is no longer on offer.
  it("fails if a recharge ability is not spent by the turn that used it", async () => {
    const sources: StatBlockSources = { monsters: [monster("m-wolf", { actions: [bite, BREATH] }), monster("m-ox")], npcs: [], companions: [] };
    const fight = duel({ wolf: { position: { x: 1, y: 0 } }, victim: { position: { x: 2, y: 0 } } });
    const h = harness(fight, { sources, map: mapOf(), dieFaces: [9, 5] });
    await runBatch(batch("b1", takeTurn({ optionId: "attack:actions:Breath:victim" })), h.deps);
    expect(combatantOf(stored(h), "wolf").action_uses?.["actions/Breath"]).toMatchObject({ used: 1, recharge: { min: 5, max: 6 } });
    await runBatch(batch("b2", { type: "set_action_used", instanceId: "wolf", used: false }), h.deps);
    await expect(runBatch(batch("b3", takeTurn({ optionId: "attack:actions:Breath:victim" })), h.deps)).rejects.toMatchObject({ status: 400, message: "That option is not on offer." });
  });

  // A creature at 2 of 11 hit points is at 18%, under the quarter at which a creature breaks (APP CONVENTION), and flees
  // rather than attacking the ox beside it: no die is thrown.
  it("fails if a broken creature attacks instead of falling back", async () => {
    const fight = duel({ wolf: { hp: 2, position: { x: 1, y: 0 } }, victim: { position: { x: 2, y: 0 } } });
    const h = harness(fight, { sources: SOURCES, map: mapOf(), dieFaces: [] });
    const result = await runBatch(batch("b1", takeTurn()), h.deps);
    expect(result.effects[0]).toMatchObject({ type: "turn_taken", turn: { kind: "flee", picked: "rules" } });
    expect(h.dieCalls).toBe(0);
    expect(combatantOf(stored(h), "wolf").action_used).toBe(true);
    expect(hpOf(stored(h), "victim")).toBe(40);
  });

  // The wolf (2 of 11 hit points, so it breaks) at (1,0) beside the ox at (2,0). The West gate is (-2,0): 3 steps, 15 ft.
  it("fails if a broken creature that flees to a way off stays in the fight, or the reply does not say it left and by where", async () => {
    const fight = duel({ wolf: { hp: 2, position: { x: 1, y: 0 } }, victim: { position: { x: 2, y: 0 } } });
    const h = harness(fight, { sources: SOURCES, map: mapWithExits([{ cell: "-2,0", label: "West gate", kind: "entrance" }]), dieFaces: [] });
    const result = await runBatch(batch("b1", takeTurn()), h.deps);
    expect(stored(h).combatants_live.map((c) => c.instance_id)).toEqual(["victim"]);
    expect(result.effects[0]).toMatchObject({
      type: "turn_taken",
      turn: { kind: "flee", leftTheMap: true, reason: 'Falls back: at 2 of 11 hit points it breaks and flees, leaving the map through "West gate".' },
    });
    // Not a kill: nobody is hurt, no die is thrown, and the ox is untouched.
    expect(h.dieCalls).toBe(0);
    expect(hpOf(stored(h), "victim")).toBe(40);
  });

  it("fails if a creature that flees on a map with no way off is taken out of the fight", async () => {
    const fight = duel({ wolf: { hp: 2, position: { x: 1, y: 0 } }, victim: { position: { x: 2, y: 0 } } });
    const h = harness(fight, { sources: SOURCES, map: mapOf(), dieFaces: [] });
    const result = await runBatch(batch("b1", takeTurn()), h.deps);
    expect(stored(h).combatants_live.map((c) => c.instance_id).sort()).toEqual(["victim", "wolf"]);
    expect(result.effects[0]).toMatchObject({ type: "turn_taken", turn: { kind: "flee", reason: "Falls back: at 2 of 11 hit points it breaks and flees." } });
    expect(result.effects[0]).not.toMatchObject({ turn: { leftTheMap: true } });
  });

  // The rules read a picture with nothing drawn on it as an empty floor (the maintainer, 16 Nov 2026, of a room full of
  // tables: "are you respecting that?"). They cannot, so the reply says the move crossed a bare map; one wall drawn
  // anywhere and it no longer does, and a turn with no move never does.
  it("fails if a move across a map with nothing drawn is not flagged, or a drawn map or a turn without a move is", async () => {
    const flee = () => duel({ wolf: { hp: 2, position: { x: 1, y: 0 } }, victim: { position: { x: 2, y: 0 } } });
    const bare = await runBatch(batch("b1", takeTurn()), harness(flee(), { sources: SOURCES, map: mapOf(), dieFaces: [] }).deps);
    expect(bare.effects[0]).toMatchObject({ turn: { kind: "flee", bareMap: true } });
    const drawn = await runBatch(batch("b1", takeTurn()), harness(flee(), { sources: SOURCES, map: mapOf([[30, 30], [31, 30]]), dieFaces: [] }).deps);
    expect(drawn.effects[0]).toMatchObject({ turn: { kind: "flee" } });
    expect(drawn.effects[0]).not.toMatchObject({ turn: { bareMap: true } });
    // Beside its target already: the bite needs no step, so nothing was crossed.
    const still = duel({ wolf: { position: { x: 1, y: 0 } }, victim: { position: { x: 2, y: 0 } } });
    const stood = await runBatch(batch("b1", takeTurn({ optionId: "attack:actions:Bite:victim" })), harness(still, { sources: SOURCES, map: mapOf(), dieFaces: [9, 5] }).deps);
    expect(stood.effects[0]).not.toMatchObject({ turn: { bareMap: true } });
  });

  it("fails if a creature that is not fleeing is removed for ending its turn on a way off", async () => {
    // The wolf (healthy) bites the ox: it walks to a square beside it, and the gate (3,-1) is exactly that square.
    const fight = duel();
    const h = harness(fight, { sources: SOURCES, map: mapWithExits([{ cell: "3,-1", label: "East gate", kind: "entrance" }]), dieFaces: [9, 5] });
    const result = await runBatch(batch("b1", takeTurn({ optionId: "attack:actions:Bite:victim" })), h.deps);
    expect(combatantOf(stored(h), "wolf").position).toEqual({ x: 3, y: -1 });
    expect(stored(h).combatants_live).toHaveLength(2);
    expect(result.effects[0]).not.toMatchObject({ turn: { leftTheMap: true } });
  });

  // The wolf's bite at a character whose sheet the server cannot read refuses after the move step has run in the attempt:
  // nothing of the move, the Action or the roll may be saved.
  it("fails if a step that refuses leaves the move or the used Action behind", async () => {
    const fight = duel({ victim: { monster_id: undefined, type: "player", party_member_id: "pm-gone" } });
    const h = harness(fight, { sources: SOURCES, map: mapOf(), dieFaces: [9, 5] });
    await expect(runBatch(batch("b1", takeTurn({ optionId: "attack:actions:Bite:victim" })), h.deps)).rejects.toMatchObject({ status: 400 });
    expect(h.saves).toBe(0);
    expect(h.posted).toEqual([]);
    expect(combatantOf(stored(h), "wolf").position).toEqual({ x: 0, y: 0 });
  });

  it("fails if take_turn is accepted beside other commands, without a creature, or with an option that is not a string", () => {
    expect(() => validateRequest(batch("b", takeTurn()))).not.toThrow();
    expect(() => validateRequest(batch("b", takeTurn({ optionId: "dodge" })))).not.toThrow();
    expect(() => validateRequest(batch("b", { type: "next_turn" }, takeTurn()))).toThrow(FightCommandError);
    expect(() => validateRequest(batch("b", takeTurn({ instanceId: "" })))).toThrow(FightCommandError);
    expect(() => validateRequest(batch("b", takeTurn({ optionId: 5 })))).toThrow(FightCommandError);
  });
});

// ── the note decides among the turns (#1203) ──────────────────────────────────────

/** An answer to a note request: the probability that each turn goes against the note, by what the turn says it does. */
const noteSays = (probability: (what: string) => number) => (request: JudgeRequest): JudgeResult => ({
  model: "jev-test",
  inputTokens: 321,
  answers: Object.fromEntries(
    Object.entries((request.state as { turns: Record<string, { what: string }> }).turns).map(([key, facts]) => [key, { type: "noul" as const, noul: probability(facts.what) }]),
  ),
});
const NOTED = { tactics: { note: "Never leaves its square." } };
const notedDuel = (note: string | null = NOTED.tactics.note) => ({
  sources: { monsters: [monster("m-wolf", note === null ? {} : { tactics: { note } }), monster("m-ox")], npcs: [], companions: [] } as StatBlockSources,
  map: mapOf(),
});
const leaves = (what: string) => /^(Move|Flee)/.test(what);

describe("take_turn with a note", () => {
  const OX_BITES = "attack:actions:Bite:victim";

  // The turns on offer are Move 15 ft and Bite (the rules' pick), Flee, and Dodge. The note says every turn that leaves
  // the square goes against it, so the rules pick among Dodge alone.
  it("fails if a turn the note rules out is still picked, or the pick is not made among the rest", async () => {
    const h = harness(duel(), { ...notedDuel(), judge: noteSays((w) => (leaves(w) ? 0.9 : 0.1)) });
    const result = await runBatch(batch("b1", takeTurn()), h.deps);
    expect(result.effects[0]).toMatchObject({ type: "turn_taken", turn: { optionId: "dodge", kind: "dodge" } });
    expect(combatantOf(stored(h), "wolf").position).toEqual({ x: 0, y: 0 });
    expect(h.dieCalls).toBe(0);
  });

  it("fails if the reply does not say the note decided it, list what it ruled out, and carry the picker's own sentence", async () => {
    const h = harness(duel(), { ...notedDuel(), judge: noteSays((w) => (leaves(w) ? 0.9 : 0.1)) });
    const result = await runBatch(batch("b1", takeTurn()), h.deps);
    const turn = (result.effects[0] as { turn: { picked: string; reason: string; ruledOutByNote: { optionId: string; summary: string }[] } }).turn;
    expect(turn.picked).toBe("rules_with_note");
    expect(turn.reason).toMatch(/^Its note ruled out 2 other turns, so: /);
    expect(turn.ruledOutByNote.map((t) => t.summary)).toEqual(["Move 15 ft to attack victim with Bite", "Flee: dash 60 ft away, ending 80 ft from the nearest enemy"]);
  });

  // The note rules out every turn: it then decides nothing, and today's pick (the bite) stands, as plain "rules".
  it("fails if a note that rules out every turn changes the pick or claims it decided", async () => {
    const h = harness(duel(), { ...notedDuel(), dieFaces: [9, 5], judge: noteSays(() => 0.95) });
    const result = await runBatch(batch("b1", takeTurn()), h.deps);
    const first = result.effects[0];
    if (first.type !== "turn_taken") throw new Error("the reply does not lead with turn_taken");
    const turn = first.turn;
    expect(turn).toMatchObject({ optionId: OX_BITES, picked: "rules" });
    expect(turn.ruledOutByNote).toBeUndefined();
    expect(turn.reason).not.toMatch(/note/);
  });

  // A real answer that rules nothing out leaves the pick alone, says "rules", and still costs a row: the call happened.
  it("fails if an answer that rules nothing out is reported as the note deciding, or goes unrecorded", async () => {
    const h = harness(duel(), { ...notedDuel(), dieFaces: [9, 5], judge: noteSays(() => 0.1) });
    const result = await runBatch(batch("b1", takeTurn()), h.deps);
    expect(result.effects[0]).toMatchObject({ turn: { optionId: OX_BITES, picked: "rules" } });
    expect(h.noteCosts).toHaveLength(1);
  });

  it("fails if a creature with no note, or a blank one, is ever asked", async () => {
    for (const note of [null, "   "]) {
      const h = harness(duel(), { ...notedDuel(note), dieFaces: [9, 5], judge: noteSays(() => 0.9) });
      await runBatch(batch("b1", takeTurn()), h.deps);
      expect(h.noteAsks).toHaveLength(0);
      expect(h.noteCosts).toHaveLength(0);
    }
  });

  it("fails if a turn the caller named is run through the note", async () => {
    const h = harness(duel(), { ...notedDuel(), dieFaces: [9, 5], judge: noteSays(() => 0.9) });
    const result = await runBatch(batch("b1", takeTurn({ optionId: OX_BITES })), h.deps);
    expect(h.noteAsks).toHaveLength(0);
    expect(result.effects[0]).toMatchObject({ turn: { picked: "caller", optionId: OX_BITES } });
  });

  // Not allowed (AI off, no key, over the cap) and a failed or timed-out call all reach the batch as "no answer".
  it("fails if no answer from the judge changes today's pick, raises an error, or writes a cost row", async () => {
    const h = harness(duel(), { ...notedDuel(), dieFaces: [9, 5] });
    const result = await runBatch(batch("b1", takeTurn()), h.deps);
    expect(h.noteAsks).toHaveLength(1);
    expect(result.effects[0]).toMatchObject({ turn: { optionId: OX_BITES, picked: "rules" } });
    expect(result.effectFailures).toEqual([]);
    expect(h.noteCosts).toEqual([]);
  });

  it("fails if a lost race asks the judge again for the same turns, or bills the one answer twice", async () => {
    const h = harness(duel(), { ...notedDuel(), judge: noteSays((w) => (leaves(w) ? 0.9 : 0.1)) });
    h.rival.run = rivalEdit(h, (r) => {
      r.combatants_live = r.combatants_live.map((c) => (c.instance_id === "victim" ? { ...c, hp: 30 } : c));
    });
    await runBatch(batch("b1", takeTurn()), h.deps);
    expect(h.saves).toBe(2);
    expect(h.noteAsks).toHaveLength(1);
    expect(h.noteCosts).toHaveLength(1);
  });

  // A second enemy arrives between the attempts: the turns on offer are not the same set, so the earlier answer says nothing about them.
  it("fails if an answer is reused for a different set of turns", async () => {
    const h = harness(duel(), { ...notedDuel(), judge: noteSays((w) => (leaves(w) ? 0.9 : 0.1)) });
    h.rival.run = rivalEdit(h, (r) => {
      r.combatants_live = [...r.combatants_live, combatant("second", { monster_id: "m-ox", faction_id: "p", hp: 40, max_hp: 40, ac: "13", initiative: 1, position: { x: 0, y: 1 } })];
    });
    await runBatch(batch("b1", takeTurn()), h.deps);
    expect(h.noteAsks).toHaveLength(2);
    expect(h.noteAsks[1].already).toBe(1);
    expect(h.noteCosts).toHaveLength(2);
  });

  it("fails if the cost row is written before the fight is saved, or for a turn that was refused", async () => {
    const saved = harness(duel(), { ...notedDuel(), judge: noteSays((w) => (leaves(w) ? 0.9 : 0.1)) });
    await runBatch(batch("b1", takeTurn()), saved.deps);
    expect(saved.noteCosts).toEqual([{ inputTokens: 321, savesBefore: 1 }]);

    // The rules pick the bite at a character whose sheet the server cannot read: the step refuses and nothing is saved.
    const refused = harness(duel({ victim: { monster_id: undefined, type: "player", party_member_id: "pm-gone" } }), {
      ...notedDuel(), dieFaces: [9, 5], judge: noteSays(() => 0.1),
    });
    await expect(runBatch(batch("b2", takeTurn()), refused.deps)).rejects.toMatchObject({ status: 400 });
    expect(refused.noteCosts).toEqual([]);
  });
});
