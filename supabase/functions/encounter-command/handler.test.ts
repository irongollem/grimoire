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
import type { GearWrite, ThrownDrop } from "../../../src/rules/fight/pcAttacks/gear";
import type { FightMap } from "../../../src/rules/fight/terrain/battleMap";
import { occluders } from "../../../src/lib/battlemap/occlusion";
import type { Item } from "../../../src/types/item.types";
import type { PartyInventoryItem } from "../../../src/types/inventory.types";
import { broadcastEvent, combatant, GOBLIN, pc } from "../../../src/rules/fight/fightTestKit";
import type { FightXpAward } from "../../../src/rules/fight/fightXp";
import type { JudgeRequest, JudgeResult } from "../_shared/typesafe";
import {
  ALL_FIGHT_COMMANDS_LISTED,
  ALL_REDUCER_COMMANDS_LISTED,
  ALL_RESOLVING_COMMANDS_LISTED,
  APPLIED_IDS_KEPT,
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
import { blackTentacles, charmMonster, fear, fireBolt, fireball, holdPerson, holdPersonEffect, mageBlock, mageWithCharm, mageWithFear, mageWithHold, mageWithTentacles } from "../../../src/rules/fight/spells/spellTestKit";
import type { SpellRecord } from "../../../src/rules/fight/spells/spellChoice";
import type { AppliedCondition } from "../../../src/types/condition.types";
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
    started_at: null,
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
  /** The weapons allies threw onto the ground, and the inventory writes their attacks led to, in the order they were made. */
  drops: Array<{ drop: ThrownDrop; memberId: string; speaker: string }>;
  gearWrites: GearWrite[][];
  /** How many times the server threw a die. */
  dieCalls: number;
  /** The party member ids of each `loadPlayerSheets` call. */
  playerLoads: string[][];
  /** How many times the fight's map was read. */
  mapLoads: number;
  /** The spell names the server asked the library for. */
  spellReads: string[];
  /** The name lists of each `loadSpellsListed` call (a creature's whole turn reads its spells together). */
  spellListedReads: string[][];
  /** Runs once, between a load and its save: another writer got in. */
  rival: { run: (() => void) | null; always: boolean };
  /** Every note judgment the server asked for: the request, and the count it said it had already made this batch. */
  noteAsks: Array<{ request: JudgeRequest; already: number }>;
  /** The input tokens of each note cost row written, with how many saves had happened when it was written. */
  noteCosts: Array<{ inputTokens: number; savesBefore: number }>;
  /** Every fight XP award the server asked the database for. */
  xpAwards: FightXpAward[];
}

function harness(
  initial: FightRow | null,
  options: {
    /** The encounter's factions; none means a fight that declares none, where a different faction is a foe. */
    factions?: { id: string; hostile_to: string[] }[];
    events?: EncounterEvent[];
    /** The campaign's edition; 2014 when left out. */
    ruleset?: "2014" | "2024";
    party?: PartyIngestRow[];
    d6?: number;
    d20?: number;
    sources?: StatBlockSources;
    /** What the server reads of the fight's player characters. */
    players?: PlayerSheets;
    /** A drop of a thrown weapon that fails (the chat could not be written to). */
    dropFails?: boolean;
    /** The faces the server's die shows, one per throw in order; a throw past the end fails the test. */
    dieFaces?: number[];
    /** The fight's battle map; absent or null is a fight with no map the rules can use. */
    map?: FightMap | null;
    /** What a note judgment answers; absent is "not allowed" (AI off, no key, over the cap, or a failed call). */
    judge?: (request: JudgeRequest) => JudgeResult | null;
    /** The spell records the library and the campaign hold. */
    spells?: SpellRecord[];
    /** The campaign's own session ids; absent means just "sess-1". */
    sessions?: string[];
    /** The campaign uses the Experience Points rule. */
    xpLevelling?: boolean;
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
    drops: [],
    gearWrites: [],
    dieCalls: 0,
    playerLoads: [],
    mapLoads: 0,
    spellReads: [],
    spellListedReads: [],
    rival: { run: null, always: false },
    noteAsks: [],
    noteCosts: [],
    xpAwards: [],
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
        factions: options.factions ?? [],
        ruleset: options.ruleset ?? "2014",
        randomizeInitiativeEachRound: false,
        xpLevelling: options.xpLevelling ?? false,
        monsters: [],
        npcs: [],
      };
      return loaded;
    },
    async loadPartyRows() {
      return structuredClone(options.party ?? []);
    },
    async isCampaignSession(sessionId) {
      return (options.sessions ?? ["sess-1"]).includes(sessionId);
    },
    async createFight(_encounterId, first) {
      if (h.store.row) return null;
      h.store.row = { id: "row-new", version: 1, started_at: null, ...structuredClone(first) };
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
    async awardFightXp(award) {
      h.log.push("fight_xp");
      h.xpAwards.push(structuredClone(award));
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
    async loadSpells(name) {
      h.spellReads.push(name);
      return structuredClone(options.spells ?? []);
    },
    async loadSpellsListed(names) {
      h.spellListedReads.push(names);
      return structuredClone(options.spells ?? []);
    },
    async postRoll(roll) {
      h.log.push("roll");
      h.posted.push(structuredClone(roll));
    },
    async dropThrown(drop, memberId, speaker) {
      if (options.dropFails) throw new Error("chat is down");
      h.log.push("drop");
      h.drops.push({ drop: structuredClone(drop), memberId, speaker });
    },
    async writeGear(writes) {
      h.log.push("gear");
      h.gearWrites.push(structuredClone(writes));
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

  it("keeps only the newest applied ids, enough that a retry across a long outage is still recognised", async () => {
    const old = Array.from({ length: APPLIED_IDS_KEPT }, (_, i) => `old-${i}`);
    const h = harness(row({ applied_command_ids: old }));
    await runBatch(batch("fresh", { type: "next_turn" }), h.deps);
    // The kept count + 1 new, so the oldest ("old-0") goes and the new one is last.
    expect(stored(h).applied_command_ids).toHaveLength(APPLIED_IDS_KEPT);
    expect(stored(h).applied_command_ids[0]).toBe("old-1");
    expect(stored(h).applied_command_ids.at(-1)).toBe("fresh");
  });

  // A second device applies 200 batches while the first device's reply was lost: its retry (more than the old 64 back) is
  // answered as already applied, not applied a second time (Nessa 12 -> 9 once, not 6).
  it("fails if a retry of a batch with 200 newer applied batches after it is applied a second time", async () => {
    const h = harness(row({ combatants_live: [pc("nessa", { hp: 12, max_hp: 20, initiative: 15 })] }));
    const hit = batch("retry-me", { type: "adjust_hp", instanceId: "nessa", delta: -3 });
    await runBatch(hit, h.deps);
    for (let i = 0; i < 200; i++) await runBatch(batch(`other-${i}`, { type: "set_reaction_used", instanceId: "nessa", used: i % 2 === 0 }), h.deps);
    const again = await runBatch(hit, h.deps);
    expect(again.applied).toBe(false);
    expect(hpOf(stored(h), "nessa")).toBe(9);
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

  // Every other command finds a creature by its instance id, so a newcomer that reuses one would be unreachable.
  it("fails if add_combatants takes a combatant whose instance id is already in the fight, or applies part of the batch", async () => {
    const h = harness(row());
    // "goblin" is there already: the whole batch is refused, so "bat" does not join either and nothing is saved.
    await expect(runBatch(
      batch("b1", { type: "add_combatants", combatants: [combatant("goblin", { hp: 99, max_hp: 99 }), combatant("bat", { initiative: 1 })] }),
      h.deps,
    )).rejects.toMatchObject({ status: 400, message: expect.stringMatching(/goblin is already in this fight/) });
    expect(h.saves).toBe(0);
    // A new id joins; adding it again in a later batch is refused the same way.
    await runBatch(batch("b2", { type: "add_combatants", combatants: [combatant("bat", { initiative: 1 })] }), h.deps);
    expect(stored(h).combatants_live.map((c) => c.instance_id)).toEqual(["brug", "goblin", "bat"]);
    await expect(runBatch(batch("b3", { type: "add_combatants", combatants: [combatant("bat")] }), h.deps)).rejects.toMatchObject({ status: 400 });
    expect(stored(h).combatants_live).toHaveLength(3);
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
    // The fight has read this row before (it remembers 12 and 0), so a sync that finds the same has nothing to note.
    const h = harness(row({ combatants_live: [pc("nessa", { hp: 12, max_hp: 20, initiative: 15, sheet_hp: 12, sheet_temp_hp: 0, sheet_death_saves: { successes: 0, failures: 0 }, sheet_conditions: [], sheet_wildshape: null, sheet_initiative: 15 })] }), { party: [nessaRow] });
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

  describe("XP for a won fight (#1021 row 27)", () => {
    // Two goblins (CR 1/4, 50 XP each, DMG "Experience Points") brought down by two characters: 50 each.
    const won = () => row({
      is_running: true,
      combatants_live: [
        pc("nessa", { faction_id: "players" }),
        pc("bram", { faction_id: "players", hp: 0 }),
        combatant("g1", { faction_id: "enemy", monster_id: "m-goblin", hp: 0 }),
        combatant("g2", { faction_id: "enemy", monster_id: "m-goblin", hp: 0 }),
      ],
    });
    const goblins = { monsters: [GOBLIN], npcs: [], companions: [] } as StatBlockSources;

    it("fails if ending a won fight in an Experience campaign gives no XP, or reads a foe's challenge rating wrong", async () => {
      const h = harness(won(), { xpLevelling: true, sources: goblins });
      await runBatch(batch("e1", { type: "end_combat" }), h.deps);
      expect(h.xpAwards).toEqual([{ total: 100, each: 50, memberIds: ["pm-nessa", "pm-bram"] }]);
      // Given after the fight is saved as ended: the database gives it only for an ended fight.
      expect(h.log.indexOf("save")).toBeLessThan(h.log.indexOf("fight_xp"));
    });

    it("fails if a campaign that levels by milestone is given XP", async () => {
      const h = harness(won(), { xpLevelling: false, sources: goblins });
      await runBatch(batch("e1", { type: "end_combat" }), h.deps);
      expect(h.xpAwards).toEqual([]);
    });

    it("fails if abandoning a fight gives its XP", async () => {
      const h = harness(won(), { xpLevelling: true, sources: goblins });
      await runBatch(batch("a1", { type: "abandon" }), h.deps);
      expect(h.xpAwards).toEqual([]);
    });

    it("fails if a retried End combat does not ask for the award again (the first may have died before giving it)", async () => {
      const h = harness(won(), { xpLevelling: true, sources: goblins });
      await runBatch(batch("e1", { type: "end_combat" }), h.deps);
      await runBatch(batch("e1", { type: "end_combat" }), h.deps);
      // Asked twice; `award_fight_xp` gives it once (supabase/tests/fight_xp.test.sql).
      expect(h.xpAwards).toHaveLength(2);
    });

    it("fails if a stat-block read that fails keeps the fight from ending, rather than being reported", async () => {
      const h = harness(won(), { xpLevelling: true, sources: goblins });
      h.deps.loadStatBlocks = async () => {
        throw new Error("down");
      };
      const result = await runBatch(batch("e1", { type: "end_combat" }), h.deps);
      expect(stored(h)).toMatchObject({ ended_at: "2026-11-15T20:00:00.000Z" });
      expect(result.effectFailures).toEqual(["fight_xp: down"]);
      expect(h.xpAwards).toEqual([]);
    });

    it("fails if fighting an encounter again keeps the last fight's award mark, so the new fight would give nothing", async () => {
      const h = harness(row({ ended_at: "2026-11-14T10:00:00.000Z" }), { xpLevelling: true });
      await runBatch(batch("o1", { type: "open", combatants: [pc("nessa")] }), h.deps);
      expect(h.saved.at(-1)).toMatchObject({ xp_awarded_at: null, ended_at: null });
    });
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
    // The retry is answered with the ended fight, not refused for it, and the fight is saved once. The write-back runs again
    // on the retry (it sets values, so the sheet ends the same): the first one may not have landed.
    expect(first.applied).toBe(true);
    expect(second).toMatchObject({ applied: false, ended_at: "2026-11-15T20:00:00.000Z" });
    expect(h.persisted).toHaveLength(2);
    expect(h.persisted[1]).toEqual(h.persisted[0]);
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
    const one = { instance_id: "a", type: "monster", name: "A", hp: 1, max_hp: 1, conditions: [], curses: [], death_saves: { successes: 0, failures: 0 } };
    expect(send([{ type: "abandon" }, { type: "next_turn" }])).toThrow(FightCommandError);
    expect(send([{ type: "next_turn" }, { type: "end_combat" }])).toThrow(FightCommandError);
    expect(send([{ type: "go_live", sessionId: null }, { type: "go_live", sessionId: null }])).toThrow(FightCommandError);
    expect(send([{ type: "go_live" }])).toThrow(FightCommandError);
    expect(send([{ type: "open", combatants: [] }])).toThrow(FightCommandError);
    const many = (n: number) => Array.from({ length: n }, (_, i) => ({ ...one, instance_id: `a${i}` }));
    expect(send([{ type: "open", combatants: many(61) }])).toThrow(FightCommandError);
    expect(send([{ type: "open", combatants: many(60) }])).not.toThrow();
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
    const good = { instance_id: "a", type: "monster", name: "A", hp: 1, max_hp: 1, conditions: [], curses: [], death_saves: { successes: 0, failures: 0 } };
    const send = (combatants: unknown) => () => validateRequest({ ...ok, commands: [{ type: "add_combatants", combatants }] });
    expect(send([good])).not.toThrow();
    expect(send([])).toThrow(FightCommandError);
    expect(send(Array.from({ length: 31 }, (_, i) => ({ ...good, instance_id: `a${i}` })))).toThrow(FightCommandError);
    expect(send([{ ...good, instance_id: "" }])).toThrow(FightCommandError);
    expect(send([{ ...good, type: "npc" }])).toThrow(FightCommandError);
    expect(send([{ ...good, hp: "1" }])).toThrow(FightCommandError);
    expect(send("a")).toThrow(FightCommandError);
  });

  it("fails if a curse that is not a string reaches the engine", () => {
    expect(() => validateRequest({ ...ok, commands: [{ type: "add_curse", instanceId: "a", curse: 3 }] })).toThrow(FightCommandError);
    expect(() => validateRequest({ ...ok, commands: [{ type: "set_reveal_state", instanceId: "a", revealState: "gone" }] })).toThrow(FightCommandError);
  });

  // Bug caught: a client sends a negative deed and wipes what the fight has seen, or one with a key nothing reads.
  it("fails if a deed that is negative, unknown or not an object reaches the engine", () => {
    const send = (deed: unknown) => () => validateRequest({ ...ok, commands: [{ type: "show_deed", instanceId: "a", deed }] });
    expect(send({ dealt: 4, cast: 1 })).not.toThrow();
    expect(send({ dealt: -4 })).toThrow(FightCommandError);
    expect(send({ lore: 1 })).toThrow(FightCommandError);
    expect(send("4")).toThrow(FightCommandError);
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
const SHIELD = { id: "shield", user_id: "u1", name: "Shield", item_type: "shield", rarity: "mundane", armor_class: "2", tags: [], properties: [], description: "", conceptual_key: "shield" } as unknown as Item;
const wornRow = (itemId: string, slot: string) =>
  ({ id: `inv-${itemId}`, item_id: itemId, library_item_id: null, carried_by: "pm-nessa", location: "equipped", slot, is_attuned: false, quality: "standard" }) as unknown as PartyInventoryItem;

/** Nessa: a fighter with Dex 14, Con 14 (proficient save), proficiency +2, in chain mail and with a shield. */
const NESSA_IN_PLATE: PlayerSheets = {
  members: [{
    id: "pm-nessa", ruleset: "2014", class: "Fighter", subclass: null, ac_formula: null, class_choices: {},
    str: 10, dex: 14, con: 14, int: 10, wis: 10, cha: 10, proficiency_bonus: 2, saving_throw_proficiencies: ["con"], wildshape_state: null, speed: 30, level: 1, custom_attacks: [],
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
  // PHB 2014 ch. 9 "Ranged Attacks in Close Combat": a ranged attack has disadvantage when a hostile that is not
  // incapacitated is within 5 feet of the ATTACKER. The archer (+4, shortbow 80/320) shoots a victim 8 squares off
  // (40 ft, normal range). With a foe beside the archer the d20 is rolled twice, 15 and 6, and the 6 is kept:
  // 6 + 4 = 10 misses AC 13. Alone, one d20 of 15 makes 19, a hit: 1d6+2 with a 5 is 7, and 40 leaves 33.
  it("fails if a ranged attack with a foe beside the archer is rolled without disadvantage", async () => {
    const shortbow: StatBlockEntry = {
      name: "Shortbow", description: "",
      structured: { kind: "attack", source: "manual", attack: { delivery: "ranged", bonus: 4, range: { normal: 80, long: 320 }, hit: [{ dice: "1d6+2", type: "piercing" }] } },
    };
    const sources: StatBlockSources = { monsters: [monster("m-archer", { actions: [shortbow] }), monster("m-ox")], npcs: [], companions: [] };
    const field = (guardAt: { x: number; y: number } | null) =>
      row({
        combatants_live: [
          combatant("archer", { monster_id: "m-archer", faction_id: "m", hp: 11, max_hp: 11, initiative: 12, position: { x: 1, y: 1 } }),
          combatant("victim", { monster_id: "m-ox", faction_id: "p", hp: 40, max_hp: 40, ac: "13", initiative: 5, position: { x: 9, y: 1 } }),
          ...(guardAt ? [combatant("guard", { monster_id: "m-ox", faction_id: "p", hp: 40, max_hp: 40, ac: "13", initiative: 4, position: guardAt })] : []),
        ],
      });
    const shoot = { type: "resolve_attack", attackerId: "archer", list: "actions", action: "Shortbow", targetId: "victim" } as CommandRequest["commands"][number];

    const pressed = harness(field({ x: 2, y: 1 }), { sources, map: mapOf(), dieFaces: [15, 6] });
    await runBatch(batch("b1", shoot), pressed.deps);
    expect(hpOf(stored(pressed), "victim")).toBe(40);
    expect(pressed.dieCalls).toBe(2);

    const alone = harness(field(null), { sources, map: mapOf(), dieFaces: [15, 5] }); // positive control
    await runBatch(batch("b1", shoot), alone.deps);
    expect(hpOf(stored(alone), "victim")).toBe(33);
  });

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

  // The runner shows the spell's name and the save reads its level, so a sender cannot leave them out or stretch them.
  it("refuses a concentration mark with no spell name or an impossible level", () => {
    const ok = (command: unknown) => () => validateRequest(batch("b", command as CommandRequest["commands"][number]));
    expect(ok({ type: "start_concentration", instanceId: "a", spell: "Moonbeam", castLevel: 2 })).not.toThrow();
    expect(ok({ type: "start_concentration", instanceId: "a", spell: " ", castLevel: 2 })).toThrow(FightCommandError);
    expect(ok({ type: "start_concentration", instanceId: "a", spell: "Moonbeam", castLevel: 10 })).toThrow(FightCommandError);
    expect(ok({ type: "start_concentration", instanceId: "a", spell: "Moonbeam" })).toThrow(FightCommandError);
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

  // App convention (`src/rules/fight/sides.ts`): the encounter's factions say who fights whom. Bug caught: the server
  // taking "a different faction" for a foe, so a wolf fighting on the Ally side bit the party it stands with.
  it("fails if a creature on the Ally side attacks the Players instead of the Enemy", async () => {
    const SIDES = [
      { id: "players", hostile_to: ["enemy"] },
      { id: "enemy", hostile_to: ["players", "ally"] },
      { id: "ally", hostile_to: ["enemy"] },
    ];
    const fight = duel({
      wolf: { faction_id: "ally" },
      victim: { faction_id: "players" },
      extra: [combatant("raider", { monster_id: "m-ox", faction_id: "enemy", hp: 40, max_hp: 40, ac: "13", initiative: 3, position: { x: 0, y: 4 } })],
    });
    const h = harness(fight, { sources: SOURCES, map: mapOf(), dieFaces: [9, 5], factions: SIDES });
    await runBatch(batch("b1", takeTurn()), h.deps);
    expect(hpOf(stored(h), "victim")).toBe(40);
    expect(hpOf(stored(h), "raider")).toBe(33);
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
    // PHB 2014 "Dodge": the stance is recorded on the creature, until its next turn starts.
    expect(wolf.conditions).toMatchObject([{ name: "Dodging", ends: { kind: "turn", at: "start", of: "self" } }]);
    expect(result.effects[0]).toMatchObject({ type: "turn_taken", turn: { optionId: "dodge", kind: "dodge", picked: "caller" } });
  });

  // #1021 row 24. Bug caught: the reply never saying a creature can speak (so no foe at the AI table ever says a
  // line), or saying it of a beast (so the table pays for a wolf's taunt).
  it("fails if the reply does not say a creature with a mind and a tongue can speak, or says it of a beast", async () => {
    const talker: StatBlockSources = { monsters: [monster("m-wolf", { int: 10, languages: "Common, Goblin" }), monster("m-ox")], npcs: [], companions: [] };
    const spoken = await runBatch(batch("b", takeTurn()), harness(duel(), { sources: talker, map: mapOf(), dieFaces: [9, 5] }).deps);
    expect(spoken.effects[0]).toMatchObject({ type: "turn_taken", turn: { speaks: true } });
    const beast: StatBlockSources = { monsters: [monster("m-wolf", { int: 3, languages: "—" }), monster("m-ox")], npcs: [], companions: [] };
    const silent = await runBatch(batch("b", takeTurn()), harness(duel(), { sources: beast, map: mapOf(), dieFaces: [9, 5] }).deps);
    expect(silent.effects[0]).toMatchObject({ type: "turn_taken" });
    expect((silent.effects[0] as { turn: { speaks?: true } }).turn.speaks).toBeUndefined();
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

  // The ox has used its Reaction, so leaving its reach costs the wolf nothing (opportunity attacks are tested below).
  // A creature at 2 of 11 hit points is at 18%, under the quarter at which a creature breaks (APP CONVENTION), and flees
  // rather than attacking the ox beside it: no die is thrown.
  it("fails if a broken creature attacks instead of falling back", async () => {
    const fight = duel({ wolf: { hp: 2, position: { x: 1, y: 0 } }, victim: { position: { x: 2, y: 0 }, reactionUsed: true } });
    const h = harness(fight, { sources: SOURCES, map: mapOf(), dieFaces: [] });
    const result = await runBatch(batch("b1", takeTurn()), h.deps);
    expect(result.effects[0]).toMatchObject({ type: "turn_taken", turn: { kind: "flee", picked: "rules" } });
    expect(h.dieCalls).toBe(0);
    expect(combatantOf(stored(h), "wolf").action_used).toBe(true);
    expect(hpOf(stored(h), "victim")).toBe(40);
  });

  // The wolf (2 of 11 hit points, so it breaks) at (1,0) beside the ox at (2,0). The West gate is (-2,0): 3 steps, 15 ft.
  it("fails if a broken creature that flees to a way off stays in the fight, or the reply does not say it left and by where", async () => {
    const fight = duel({ wolf: { hp: 2, position: { x: 1, y: 0 } }, victim: { position: { x: 2, y: 0 }, reactionUsed: true } });
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

  // SRD 5.1 night hag "Etherealness": the hag enters the Ethereal Plane, so she is out of the fight. She is not slain
  // and she did not leave by a way off the map, so only `escapedWith` says what happened.
  it("fails if a broken creature with Etherealness runs instead, or is not removed, or is told as a flee off the map", async () => {
    const ether: StatBlockEntry = { name: "Etherealness", description: "The hag magically enters the Ethereal Plane.", structured: { kind: "other", source: "manual", review: "unreadable" } };
    const sources: StatBlockSources = { monsters: [monster("m-wolf", { actions: [bite, ether] }), monster("m-ox")], npcs: [], companions: [] };
    const fight = duel({ wolf: { hp: 2, position: { x: 1, y: 0 } }, victim: { position: { x: 2, y: 0 } } });
    const h = harness(fight, { sources, map: mapOf(), dieFaces: [] });
    const result = await runBatch(batch("b1", takeTurn()), h.deps);
    expect(stored(h).combatants_live.map((c) => c.instance_id)).toEqual(["victim"]);
    expect(result.effects[0]).toMatchObject({
      type: "turn_taken",
      turn: { kind: "escape", escapedWith: "Etherealness", escapeEffect: "leaves", reason: "Gets away: at 2 of 11 hit points it breaks and uses Etherealness to leave the fight." },
    });
    expect(result.effects[0]).not.toMatchObject({ turn: { leftTheMap: true } });
    expect(h.dieCalls).toBe(0);
  });

  // SRD 5.1 green hag "Invisible Passage": she turns Invisible and stays on the map; the Action is used.
  it("fails if Invisible Passage removes the creature, or does not make it Invisible and use the Action", async () => {
    const passage: StatBlockEntry = { name: "Invisible Passage", description: "The hag magically turns Invisible until she attacks.", structured: { kind: "other", source: "manual", review: "unreadable" } };
    const sources: StatBlockSources = { monsters: [monster("m-wolf", { actions: [bite, passage] }), monster("m-ox")], npcs: [], companions: [] };
    const fight = duel({ wolf: { hp: 2, position: { x: 1, y: 0 } }, victim: { position: { x: 2, y: 0 } } });
    const h = harness(fight, { sources, map: mapOf(), dieFaces: [] });
    const result = await runBatch(batch("b1", takeTurn()), h.deps);
    const wolf = combatantOf(stored(h), "wolf");
    expect(wolf.conditions.map((c) => c.name)).toEqual(["Invisible"]);
    expect(wolf.action_used).toBe(true);
    expect(result.effects[0]).toMatchObject({ type: "turn_taken", turn: { kind: "escape", escapedWith: "Invisible Passage", escapeEffect: "unseen" } });
  });

  it("fails if a creature that flees on a map with no way off is taken out of the fight", async () => {
    const fight = duel({ wolf: { hp: 2, position: { x: 1, y: 0 } }, victim: { position: { x: 2, y: 0 }, reactionUsed: true } });
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
    const flee = () => duel({ wolf: { hp: 2, position: { x: 1, y: 0 } }, victim: { position: { x: 2, y: 0 }, reactionUsed: true } });
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

// ── opportunity attacks (#1021) ───────────────────────────────────────────────────
// PHB 2014 ch. 9 "Opportunity Attacks": a hostile creature that moves out of your reach can be struck with your Reaction.
// Nessa (AC 18: chain mail 16 + shield 2, 20 HP) stands at (0,0); the wolf (faction m) at (1,0) reaches 5 ft, so walking
// west to (-1,0) leaves its reach from the square she is standing on (step 0). The wolf's Bite is +4 for 1d6+2:
// d20 14 + 4 = 18 meets AC 18; a 5 on the d6 deals 7, so 20 HP become 13.

const WEST = [{ x: 0, y: 0 }, { x: -1, y: 0 }, { x: -2, y: 0 }];
const provoke = (over: Record<string, unknown> = {}) => ({ type: "provoke", moverId: "nessa", path: WEST, ...over }) as CommandRequest["commands"][number];
const nessa = (over: Partial<RunCombatant> = {}) => pc("nessa", { faction_id: "p", hp: 20, max_hp: 20, initiative: 8, position: { x: 0, y: 0 }, ...over });
const wolfAt = (id: string, x: number, y: number, over: Partial<RunCombatant> = {}) =>
  combatant(id, { monster_id: "m-wolf", faction_id: "m", hp: 11, max_hp: 11, initiative: 12, position: { x, y }, ...over });
const walk = (combatants: RunCombatant[], dieFaces: number[]) =>
  harness(row({ combatants_live: combatants }), { sources: SOURCES, players: NESSA_IN_PLATE, map: mapOf(), dieFaces });

describe("provoke", () => {
  // Bug caught: a creature never strikes (the whole feature missing), strikes twice, or keeps its Reaction.
  it("fails if the creature a player walks away from does not strike once, or a second walk the same turn strikes again", async () => {
    const h = walk([nessa(), wolfAt("wolf", 1, 0)], [14, 5]);
    const result = await runBatch(batch("b1", provoke()), h.deps);
    expect(hpOf(stored(h), "nessa")).toBe(13);
    expect(result.effects.find((e) => e.type === "opportunity")).toEqual({ type: "opportunity", attackerId: "wolf", targetId: "nessa", step: 0 });
    expect(result.effects.filter((e) => e.type === "resolved")).toHaveLength(1);
    expect(combatantOf(stored(h), "wolf").reactionUsed).toBe(true);
    // It moves nothing: the browser moves the token.
    expect(combatantOf(stored(h), "nessa").position).toEqual({ x: 0, y: 0 });
    const again = await runBatch(batch("b2", provoke()), h.deps);
    expect(again.effects).toEqual([]);
    expect(h.dieCalls).toBe(2);
  });

  // PHB 2014 ch. 9 "Disengage": no opportunity attacks. Bug caught: `disengaged` not passed to opportunityAttacks.
  it("fails if a mover with the Disengaged condition provokes", async () => {
    const h = walk([nessa({ conditions: [{ name: "Disengaged" }] }), wolfAt("wolf", 1, 0)], []);
    const result = await runBatch(batch("b1", provoke()), h.deps);
    expect(result.effects).toEqual([]);
    expect(h.dieCalls).toBe(0);
  });

  // Bug caught: the Reaction is not read, so a creature strikes twice a round.
  it("fails if a creature whose Reaction is already used strikes", async () => {
    const h = walk([nessa(), wolfAt("wolf", 1, 0, { reactionUsed: true })], []);
    expect((await runBatch(batch("b1", provoke()), h.deps)).effects).toEqual([]);
    expect(h.dieCalls).toBe(0);
  });

  // PHB 2014 ch. 9 "Surprise": a surprised creature cannot take a reaction until its first turn ends. SRD 5.2 only costs it
  // the Initiative roll, so under 2024 the surprised wolf strikes: d20 14 + 4 = 18 meets AC 18, d6 5 + 2 = 7, 20 - 7 = 13.
  it("fails if a surprised creature takes an opportunity attack under 2014, or is stopped from it under 2024", async () => {
    const two014 = harness(row({ combatants_live: [nessa(), wolfAt("wolf", 1, 0, { surprised: true })] }), { sources: SOURCES, players: NESSA_IN_PLATE, map: mapOf(), dieFaces: [] });
    expect((await runBatch(batch("b1", provoke()), two014.deps)).effects).toEqual([]);
    expect(two014.dieCalls).toBe(0);
    const two024 = harness(row({ combatants_live: [nessa(), wolfAt("wolf", 1, 0, { surprised: true })] }), { sources: SOURCES, players: NESSA_IN_PLATE, map: mapOf(), dieFaces: [14, 5], ruleset: "2024" });
    await runBatch(batch("b2", provoke()), two024.deps);
    expect(hpOf(stored(two024), "nessa")).toBe(13);
  });

  // The wolf is at (1,0): (0,1) is diagonal, still 5 ft. Nothing leaves its reach, so nothing is provoked.
  it("fails if walking around inside a creature's reach provokes it", async () => {
    const h = walk([nessa(), wolfAt("wolf", 1, 0)], []);
    const result = await runBatch(batch("b1", provoke({ path: [{ x: 0, y: 0 }, { x: 0, y: 1 }] })), h.deps);
    expect(result.effects).toEqual([]);
    expect(combatantOf(stored(h), "wolf").reactionUsed).not.toBe(true);
  });

  // Bug caught: a helper with the party's enemies' faction, or a creature with no stat block, is played by the server.
  it("fails if a bystander or a creature with no stat block strikes, or spends its Reaction", async () => {
    const h = walk([nessa(), wolfAt("helper", 1, 0, { bystander: true }), combatant("ghost", { faction_id: "m", position: { x: 0, y: 1 } })], []);
    const result = await runBatch(batch("b1", provoke()), h.deps);
    expect(result.effects).toEqual([]);
    expect(h.dieCalls).toBe(0);
    expect(combatantOf(stored(h), "helper").reactionUsed).not.toBe(true);
  });

  // Nessa has 5 HP: the first blow (7) drops her, and a dead creature is not struck again (the second wolf keeps its Reaction).
  it("fails if a mover dropped to 0 hit points is struck by the next creature too", async () => {
    const h = walk([nessa({ hp: 5 }), wolfAt("w1", 1, 0), wolfAt("w2", 0, 1)], [14, 5, 14, 5]);
    const result = await runBatch(batch("b1", provoke()), h.deps);
    expect(hpOf(stored(h), "nessa")).toBe(0);
    expect(result.effects.filter((e) => e.type === "opportunity")).toHaveLength(1);
    expect(h.dieCalls).toBe(2);
    expect(combatantOf(stored(h), "w2").reactionUsed).not.toBe(true);
  });

  // A player at 0 hit points lies where they fell and walks nowhere; nobody strikes them for it.
  it("fails if a mover already at 0 hit points is struck for leaving", async () => {
    const h = walk([nessa({ hp: 0 }), wolfAt("wolf", 1, 0)], []);
    expect((await runBatch(batch("b1", provoke()), h.deps)).effects).toEqual([]);
    expect(h.dieCalls).toBe(0);
  });

  it("fails if a mover who provokes nobody is refused, or an unknown mover is not", async () => {
    const h = walk([nessa(), wolfAt("wolf", 8, 8)], []);
    await expect(runBatch(batch("b1", provoke()), h.deps)).resolves.toMatchObject({ effects: [] });
    await expect(runBatch(batch("b2", provoke({ moverId: "ghost" })), h.deps)).rejects.toMatchObject({ status: 400 });
  });

  // Bug caught: a malformed path reaches the geometry, or a provoke rides in a batch with other commands.
  it("fails if a malformed path or a batch beside other commands is accepted", () => {
    expect(() => validateRequest(batch("b", provoke()))).not.toThrow();
    const bad = (path: unknown) => expect(() => validateRequest(batch("b", provoke({ path })))).toThrow(FightCommandError);
    bad([{ x: 0, y: 0 }]);
    bad(Array.from({ length: 61 }, (_, i) => ({ x: i, y: 0 })));
    bad([{ x: 0, y: 0 }, { x: 0.5, y: 0 }]);
    bad([{ x: 0, y: 0 }, { x: "1", y: 0 }]);
    bad("0,0 1,0");
    expect(() => validateRequest(batch("b", provoke({ moverId: "" })))).toThrow(FightCommandError);
    expect(() => validateRequest(batch("b", { type: "next_turn" }, provoke()))).toThrow(FightCommandError);
  });
});

describe("take_turn and opportunity attacks", () => {
  // The wolf (2 of 11 HP, so it breaks and flees) stands at (1,0) beside the ox at (2,0); the ox strikes as it leaves:
  // d20 9 + 4 = 13 meets the wolf's AC 12 and 1d6+2 with a 5 deals 7, more than the 2 it has. It is down, so it does not walk.
  it("fails if a creature dropped by an opportunity attack still completes its move, or the strike is missing", async () => {
    const fight = duel({ wolf: { hp: 2, position: { x: 1, y: 0 } }, victim: { position: { x: 2, y: 0 } } });
    const h = harness(fight, { sources: SOURCES, map: mapOf(), dieFaces: [9, 5] });
    const result = await runBatch(batch("b1", takeTurn()), h.deps);
    expect(result.effects.find((e) => e.type === "opportunity")).toMatchObject({ attackerId: "victim", targetId: "wolf" });
    const wolf = combatantOf(stored(h), "wolf");
    expect(wolf.hp).toBe(0);
    expect(wolf.position).toEqual({ x: 1, y: 0 });
    expect(wolf.movement_used ?? 0).toBe(0);
    expect(wolf.action_used).not.toBe(true);
  });

  // A player rolls their own dice: the server reports that she may strike, throws no die, and does not spend her Reaction.
  it("fails if a player's opportunity attack is rolled by the server, her Reaction spent, or the move stopped", async () => {
    const fight = duel({ wolf: { hp: 2, position: { x: 1, y: 0 } }, victim: { position: { x: 30, y: 30 } }, extra: [nessa({ position: { x: 1, y: 1 } })] });
    const h = harness(fight, { sources: SOURCES, players: NESSA_IN_PLATE, map: mapOf(), dieFaces: [] });
    const result = await runBatch(batch("b1", takeTurn()), h.deps);
    expect(result.effects.find((e) => e.type === "provoked_player")).toMatchObject({ moverId: "wolf", playerId: "nessa", step: 0 });
    expect(h.dieCalls).toBe(0);
    expect(combatantOf(stored(h), "nessa").reactionUsed).not.toBe(true);
    expect(combatantOf(stored(h), "wolf").movement_used).toBeGreaterThan(0);
  });

  // #1021: only the played character's Reaction is the player's own. With `playedMemberId` naming someone else, Nessa (a party member
  // with a sheet) strikes like a monster: Unarmed Strike, Dex 14 and proficiency 2 is +2 (Str 10, so +0 + 2); d20 11 + 2 = 13 meets
  // the wolf's AC 13. Her Reaction is spent and nobody is reported. Bug caught: an ally watching a foe walk away, never striking.
  it("fails if an ally with a sheet does not strike a foe that leaves her reach when someone else is the played character", async () => {
    const fight = duel({ wolf: { hp: 2, position: { x: 1, y: 0 } }, victim: { position: { x: 30, y: 30 } }, extra: [nessa({ position: { x: 1, y: 1 } })] });
    const h = harness(fight, { sources: SOURCES, players: NESSA_IN_PLATE, map: mapOf(), dieFaces: [11] });
    const result = await runBatch(batch("b1", takeTurn({ playedMemberId: "pm-someone-else" })), h.deps);
    expect(result.effects.some((e) => e.type === "provoked_player")).toBe(false);
    expect(result.effects.find((e) => e.type === "opportunity")).toMatchObject({ attackerId: "nessa", targetId: "wolf" });
    expect(combatantOf(stored(h), "nessa").reactionUsed).toBe(true);
  });

  // The played character keeps the choice: named as played, Nessa is reported and the server throws no die for her.
  it("fails if the played character's own opportunity attack is rolled by the server", async () => {
    const fight = duel({ wolf: { hp: 2, position: { x: 1, y: 0 } }, victim: { position: { x: 30, y: 30 } }, extra: [nessa({ position: { x: 1, y: 1 } })] });
    const h = harness(fight, { sources: SOURCES, players: NESSA_IN_PLATE, map: mapOf(), dieFaces: [] });
    const result = await runBatch(batch("b1", takeTurn({ playedMemberId: "pm-nessa" })), h.deps);
    expect(result.effects.find((e) => e.type === "provoked_player")).toMatchObject({ playerId: "nessa" });
    expect(result.effects.some((e) => e.type === "opportunity")).toBe(false);
    expect(h.dieCalls).toBe(0);
  });

  it("refuses a playedMemberId that is not a non-empty string", () => {
    for (const playedMemberId of ["", 7, "x".repeat(101)]) {
      expect(() => validateRequest(batch("b", takeTurn({ playedMemberId })))).toThrow(FightCommandError);
    }
    expect(() => validateRequest(batch("b", takeTurn({ playedMemberId: "pm-1" })))).not.toThrow();
  });

  // PHB 2014 "Disengage": the stance step comes first in the turn, so the walk after it provokes nobody.
  it("fails if a creature that took Disengage this turn still provokes", async () => {
    const fight = duel({ wolf: { position: { x: 1, y: 0 } }, victim: { position: { x: 2, y: 0 } } });
    const h = harness(fight, { sources: SOURCES, map: mapOf(), dieFaces: [] });
    const result = await runBatch(batch("b0", takeTurn({ optionId: "disengage" })), h.deps);
    expect(combatantOf(stored(h), "wolf").position).not.toEqual({ x: 1, y: 0 });
    expect(result.effects.some((e) => e.type === "opportunity")).toBe(false);
    expect(h.dieCalls).toBe(0);
  });
});

describe("cast_spell", () => {
  const MAGE_SOURCES: StatBlockSources = {
    monsters: [{ id: "m-mage", name: "Mage", stat_block: mageBlock() } as unknown as Monster, monster("m-ox")],
    npcs: [],
    companions: [],
  };
  /** A mage and three oxen (40 HP, Dex +0, AC 13) side by side. */
  const field = (mage: Partial<RunCombatant> = {}) =>
    row({
      combatants_live: [
        combatant("mage", { monster_id: "m-mage", hp: 40, max_hp: 40, initiative: 12, position: { x: 1, y: 1 }, ...mage }),
        ...["t1", "t2", "t3"].map((id, i) => combatant(id, { monster_id: "m-ox", hp: 40, max_hp: 40, ac: "13", initiative: 5 - i, position: { x: 4 + i, y: 1 } })),
      ],
    });
  const cast = (over: Record<string, unknown> = {}): CommandRequest["commands"][number] =>
    ({ type: "cast_spell", casterId: "mage", spell: "fireball", targetIds: ["t1", "t2", "t3"], ...over }) as CommandRequest["commands"][number];
  const by = (r: FightRow, id: string) => r.combatants_live.find((c) => c.instance_id === id)!;

  // SRD 5.1 "Fireball": 8d6 fire, a Dexterity save for half. The saves come first: t1 rolls 5 and t3 rolls 3 (both fail DC 14 with
  // Dex +0), t2 rolls 20 and saves. 8d6 faces 1+2+3+4+5+6+1+2 = 24, rolled once: failures take 24 (40 -> 16), t2 takes half, 12 (40 -> 28).
  // One 3rd-level slot is spent (4 of the mage's three-slot level remain as 2) and the Action is used.
  it("fails if a fireball is rolled per target, or does not spend exactly one 3rd-level slot and the Action", async () => {
    const h = harness(field(), { sources: MAGE_SOURCES, spells: [fireball()], dieFaces: [5, 20, 3, 1, 2, 3, 4, 5, 6, 1, 2] });
    const result = await runBatch(batch("b", cast()), h.deps);
    const after = stored(h);
    expect(["t1", "t2", "t3"].map((id) => hpOf(after, id))).toEqual([16, 28, 16]);
    expect(by(after, "mage").action_uses).toEqual({ "slots/3": { used: 1, per_day: 3 } });
    expect(by(after, "mage").action_used).toBe(true);
    expect(h.posted.filter((p) => p.result.isDamage)).toHaveLength(1);
    expect(h.dieCalls).toBe(11);
    expect(result.effects.find((e) => e.type === "resolved")).toMatchObject({ resolved: { kind: "save", action: "Fireball", ability: "dex", dc: 14 } });
  });

  // SRD 5.1 "Fireball" cast with a 4th-level slot is 9d6: the mage's "4th level (3 slots)" are spent, not its 3rd-level ones.
  it("fails if an upcast spends the spell's own level of slot, or rolls the base dice", async () => {
    const h = harness(field(), { sources: MAGE_SOURCES, spells: [fireball()], dieFaces: [20, 20, 20, 1, 1, 1, 1, 1, 1, 1, 1, 1] });
    await runBatch(batch("b", cast({ castLevel: 4 })), h.deps);
    // 9d6 with all ones = 9; every target saved, half rounded down is 4 (40 -> 36).
    expect(["t1", "t2", "t3"].map((id) => hpOf(stored(h), id))).toEqual([36, 36, 36]);
    expect(by(stored(h), "mage").action_uses).toEqual({ "slots/4": { used: 1, per_day: 3 } });
    expect(h.dieCalls).toBe(12);
  });

  // PHB 2014 ch. 10 "Spell Slots": Fireball is 3rd level, so a 2nd-level slot cannot cast it. The mage does hold three 2nd-level
  // slots (for hold person), so without the guard the cast would spend one of them. Nothing is saved, rolled or posted.
  it("fails if a 3rd-level spell is cast with a 2nd-level slot the caster does have", async () => {
    const h = harness(field(), { sources: MAGE_SOURCES, spells: [fireball()], dieFaces: [] });
    await expect(runBatch(batch("b", cast({ castLevel: 2 })), h.deps)).rejects.toMatchObject({ status: 400, message: expect.stringMatching(/cannot be cast with a level 2 slot/) });
    expect(h.saves).toBe(0);
    expect(h.dieCalls).toBe(0);
  });

  // The mage has three 3rd-level slots and has spent them. A fourth cast is refused and nothing is saved, rolled or posted.
  it("fails if a fourth cast of a three-slot level goes through, or changes anything", async () => {
    const spent = field({ action_uses: { "slots/3": { used: 3, per_day: 3 } } });
    const h = harness(spent, { sources: MAGE_SOURCES, spells: [fireball()], dieFaces: [] });
    await expect(runBatch(batch("b", cast()), h.deps)).rejects.toMatchObject({ status: 400, message: expect.stringMatching(/no level 3 spell slots left/) });
    expect(h.saves).toBe(0);
    expect(h.dieCalls).toBe(0);
    expect(h.posted).toEqual([]);
  });

  it("fails if a creature casts a spell its stat block does not list", async () => {
    const h = harness(field(), { sources: MAGE_SOURCES, spells: [fireball({ name: "Disintegrate" })] });
    await expect(runBatch(batch("b", cast({ spell: "disintegrate" })), h.deps)).rejects.toMatchObject({ status: 400, message: expect.stringMatching(/does not list disintegrate/) });
    expect(h.saves).toBe(0);
    expect(h.spellReads).toEqual([]);
  });

  it("fails if a caster with no stat block the server can read casts", async () => {
    const h = harness(field({ monster_id: undefined }), { sources: MAGE_SOURCES, spells: [fireball()] });
    await expect(runBatch(batch("b", cast()), h.deps)).rejects.toMatchObject({ status: 400, message: expect.stringMatching(/no stat block/) });
  });

  // The record is not reviewed (like the library's wotc-srd rows): nothing proves its numbers, so the slot and the Action are
  // spent and the outcome is the table's. No die is thrown and nobody is hurt.
  it("fails if an unreviewed record is rolled, or casts for free", async () => {
    // Complete numbers, but nobody has proved them: a record that would roll if it were reviewed must still not roll.
    const bare = fireball({ mechanics_reviewed: false });
    const h = harness(field(), { sources: MAGE_SOURCES, spells: [bare], dieFaces: [] });
    const result = await runBatch(batch("b", cast()), h.deps);
    expect(["t1", "t2", "t3"].map((id) => hpOf(stored(h), id))).toEqual([40, 40, 40]);
    expect(h.dieCalls).toBe(0);
    expect(by(stored(h), "mage").action_uses).toEqual({ "slots/3": { used: 1, per_day: 3 } });
    expect(by(stored(h), "mage").action_used).toBe(true);
    expect(result.effects.find((e) => e.type === "resolved")).toMatchObject({ resolved: { kind: "cast", spell: "Fireball", castLevel: 3, targetIds: ["t1", "t2", "t3"] } });
  });

  it("fails if a spell the library does not hold is refused with no message, or spends the slot", async () => {
    const h = harness(field(), { sources: MAGE_SOURCES, spells: [] });
    await expect(runBatch(batch("b", cast()), h.deps)).rejects.toMatchObject({ status: 400, message: expect.stringMatching(/No spell named "fireball"/) });
    expect(h.saves).toBe(0);
  });

  // SRD 5.1 "Fire Bolt": a ranged spell attack at +6 from the mage's own header, 1d10 fire, 2d10 for a 9th-level caster. d20 9 + 6 = 15
  // meets AC 13; 4 + 5 = 9 damage (40 -> 31). A cantrip is at will: no slot, no tally.
  it("fails if an attack spell does not use the caster's bonus, or a cantrip is tallied", async () => {
    const h = harness(field(), { sources: MAGE_SOURCES, spells: [fireBolt()], dieFaces: [9, 4, 5] });
    const result = await runBatch(batch("b", cast({ spell: "fire bolt", targetIds: ["t1"], withinFiveFeet: false })), h.deps);
    expect(hpOf(stored(h), "t1")).toBe(31);
    expect(by(stored(h), "mage").action_uses).toBeUndefined();
    expect(by(stored(h), "mage").action_used).toBe(true);
    expect(result.effects.find((e) => e.type === "resolved")).toMatchObject({ resolved: { kind: "attack", action: "Fire Bolt", natural: 9, total: 15, hit: true, damageTotal: 9 } });
  });

  it("fails if a spell is looked up once per target or again for a second cast in the batch", async () => {
    const h = harness(field(), { sources: MAGE_SOURCES, spells: [fireBolt()], dieFaces: [9, 4, 5, 9, 4, 5] });
    await runBatch(batch("b", cast({ spell: "fire bolt", targetIds: ["t1"], withinFiveFeet: false }), cast({ spell: "Fire  Bolt", targetIds: ["t2"], withinFiveFeet: false })), h.deps);
    expect(h.spellReads).toHaveLength(1);
  });

  // A batch with no cast never reads a spell.
  it("fails if a batch that casts nothing reads the spell library", async () => {
    const h = harness(field(), { sources: MAGE_SOURCES, spells: [fireball()] });
    await runBatch(batch("b", { type: "adjust_hp", instanceId: "t1", delta: -1 }), h.deps);
    expect(h.spellReads).toEqual([]);
  });

  // A concentration spell ends the caster's earlier one (PHB 2014 ch. 10): the condition sourced from the mage's concentration goes.
  it("fails if casting a concentration spell leaves the caster's earlier concentration in place", async () => {
    const fight = field();
    fight.combatants_live[1] = { ...by(fight, "t1"), conditions: [{ name: "Paralyzed", source: { id: "mage", spell: "Hold Person", concentration: true } }] };
    const holdy = fireball({ concentration: true });
    const h = harness(fight, { sources: MAGE_SOURCES, spells: [holdy], dieFaces: [20, 20, 20, 1, 1, 1, 1, 1, 1, 1, 1] });
    await runBatch(batch("b", cast()), h.deps);
    expect(by(stored(h), "t1").conditions).toEqual([]);
  });

  // PHB 2014 ch. 10 "Concentration": the spell is held whether or not it left a condition on anyone, so a damage-only
  // one marks its caster, and a spell that needs no concentration (the plain Fireball) marks nobody.
  it("fails if a damage-only concentration spell leaves its caster holding nothing, or a plain spell marks it", async () => {
    const held = harness(field(), { sources: MAGE_SOURCES, spells: [fireball({ concentration: true })], dieFaces: [20, 20, 20, 1, 1, 1, 1, 1, 1, 1, 1] });
    await runBatch(batch("b", cast()), held.deps);
    expect(by(stored(held), "mage").concentration).toMatchObject({ spellName: "Fireball", castAtLevel: 3 });
    const plain = harness(field(), { sources: MAGE_SOURCES, spells: [fireball()], dieFaces: [20, 20, 20, 1, 1, 1, 1, 1, 1, 1, 1] });
    await runBatch(batch("b", cast()), plain.deps);
    expect(by(stored(plain), "mage").concentration == null).toBe(true);
  });

  describe("a charm that ends when the caster's side harms it (Charm Monster)", () => {
    const CHARM_SOURCES: StatBlockSources = {
      monsters: [{ id: "m-mage", name: "Mage", stat_block: mageWithCharm() } as unknown as Monster, monster("m-ox")],
      npcs: [],
      companions: [],
    };
    // The mage and t2 stand together; t1 (the goblin-like target) and t3 are the other side.
    const sides = () => {
      const f = field();
      for (const c of f.combatants_live) c.faction_id = c.instance_id === "mage" || c.instance_id === "t2" ? "m" : "p";
      return f;
    };
    const charmAt = () => cast({ spell: "charm monster", targetIds: ["t1"] });
    const strike = (attackerId: string) => attack({ attackerId, targetId: "t1" });
    // SRD 5.2.1 "Charm Monster": "...until the spell ends or until you or your allies damage it." t1 rolls 5 against DC 14 and is
    // Charmed; then the ally t2 hits it (d20 9 + 4 = 13 meets AC 13, 1d6+2 with a 5 is 7). Bug caught: the ending never reaches the
    // saved fight, or an ally of the caster is not counted on the caster's side on the server.
    it("fails if the caster's ally damaging the charmed target leaves it Charmed in the saved fight", async () => {
      const h = harness(sides(), { sources: CHARM_SOURCES, spells: [charmMonster()], dieFaces: [5, 9, 5] });
      await runBatch(batch("b1", charmAt()), h.deps);
      expect(by(stored(h), "t1").conditions).toEqual([{ name: "Charmed", source: { id: "mage", spell: "Charm Monster", endsWhenHarmed: "source_side" } }]);
      await runBatch(batch("b2", strike("t2")), h.deps);
      expect(hpOf(stored(h), "t1")).toBe(33);
      expect(by(stored(h), "t1").conditions).toEqual([]);
    });

    // Bug caught: any damage breaks a source-side charm, including its own side's strike, which the rules do not ask for.
    it("fails if a creature of the target's own side breaks the charm by hitting it", async () => {
      const h = harness(sides(), { sources: CHARM_SOURCES, spells: [charmMonster()], dieFaces: [5, 9, 5] });
      await runBatch(batch("b1", charmAt()), h.deps);
      await runBatch(batch("b2", strike("t3")), h.deps);
      expect(hpOf(stored(h), "t1")).toBe(33);
      expect(by(stored(h), "t1").conditions.map((c) => c.name)).toEqual(["Charmed"]);
    });
  });

  describe("a cast that imposes a condition (Hold Person)", () => {
    const HOLD_SOURCES: StatBlockSources = {
      monsters: [{ id: "m-mage", name: "Mage", stat_block: mageWithHold() } as unknown as Monster, monster("m-ox")],
      npcs: [],
      companions: [],
    };
    const hold = (over: Record<string, unknown> = {}) => cast({ spell: "hold person", targetIds: ["t1"], ...over });
    // SRD 5.1 "Hold Person": WIS save or paralyzed for up to 1 minute. t1 (an ox, WIS +0) rolls 5 against the mage's DC 14 and fails.
    const heldFight = async () => {
      const h = harness(field(), { sources: HOLD_SOURCES, spells: [holdPerson()], dieFaces: [5] });
      await runBatch(batch("b", hold()), h.deps);
      return h;
    };

    // Bug caught: a no-damage spell refused as "no damage in its data" or resolved without spending the 2nd-level slot and the Action.
    it("fails if a failed save does not leave the target Paralyzed by the mage's concentration, or the cast is free", async () => {
      const h = await heldFight();
      const t1 = by(stored(h), "t1");
      expect(t1.conditions).toEqual([
        { name: "Paralyzed", source: { id: "mage", spell: "Hold Person", concentration: true }, ends: { kind: "save", ability: "wis", dc: 14, at: "end", remaining: 10 } },
      ]);
      expect(hpOf(stored(h), "t1")).toBe(40);
      expect(by(stored(h), "mage").action_uses).toEqual({ "slots/2": { used: 1, per_day: 3 } });
      expect(by(stored(h), "mage").action_used).toBe(true);
    });

    // A save that succeeds imposes nothing (SRD 5.1 "Saving Throws"): d20 15 + 0 meets DC 14. The slot is still spent.
    it("fails if a successful save still paralyzes the target", async () => {
      const h = harness(field(), { sources: HOLD_SOURCES, spells: [holdPerson()], dieFaces: [15] });
      await runBatch(batch("b", hold()), h.deps);
      expect(by(stored(h), "t1").conditions).toEqual([]);
      expect(by(stored(h), "mage").action_uses).toEqual({ "slots/2": { used: 1, per_day: 3 } });
    });

    // SRD 5.1 "Hold Person": the target repeats the save at the end of each of its turns; success ends it. The turn hooks mark it due.
    it("fails if the repeat save at the end of the bearer's turn does not end the condition on a success at the caster's DC", async () => {
      const first = await heldFight();
      const fight = stored(first);
      fight.combatants_live = fight.combatants_live.map((c) => (c.instance_id === "t1" ? { ...c, conditions: c.conditions.map((x) => ({ ...x, due: { save: true } })) } : c));
      const again = harness(fight, { sources: HOLD_SOURCES, spells: [holdPerson()], dieFaces: [14] });
      await runBatch(batch("b2", { type: "roll_condition_save", instanceId: "t1", name: "Paralyzed" }), again.deps);
      expect(by(stored(again), "t1").conditions).toEqual([]);
    });

    // PHB 2014 ch. 10 "Concentration": a creature that loses its concentration ends the spell. The mage takes 24 damage (DC 12) and rolls 3.
    it("fails if the mage losing concentration leaves the target Paralyzed", async () => {
      const fight = stored(await heldFight());
      const again = harness(fight, { sources: HOLD_SOURCES, spells: [holdPerson()], dieFaces: [3] });
      await runBatch(batch("b2", { type: "resolve_concentration", instanceId: "mage", damage: 24 }), again.deps);
      expect(by(stored(again), "t1").conditions).toEqual([]);
    });

    // Bug caught: the concentration flag leaking onto a spell that is not concentration (the condition would then end with a concentration it never had).
    it("fails if a spell that is not concentration marks its conditions as held by concentration", async () => {
      const h = harness(field(), { sources: HOLD_SOURCES, spells: [holdPerson({ concentration: false, condition_effect: holdPersonEffect({ duration: { unit: "minute", amount: 1, concentration: false } }) })], dieFaces: [5] });
      await runBatch(batch("b", hold()), h.deps);
      expect(by(stored(h), "t1").conditions[0].source).toEqual({ id: "mage", spell: "Hold Person" });
    });

    // The real Hold Person: humanoids only (SRD 5.1 "Hold Person": "Choose a humanoid that you can see within range").
    describe("limited to a kind of creature", () => {
      const humanoidHold = holdPerson({ condition_effect: holdPersonEffect({ only_kinds: ["humanoid"] }) });
      const typed = (id: string, monster_type: string) => ({ id, name: id, monster_type, stat_block: monster(id).stat_block }) as unknown as Monster;
      const KIND_SOURCES: StatBlockSources = {
        monsters: [{ id: "m-mage", name: "Mage", stat_block: mageWithHold() } as unknown as Monster, typed("m-bandit", "humanoid"), typed("m-wolf", "beast")],
        npcs: [{ id: "n-elf", name: "Elf", race: "elf", stat_block: monster("n-elf").stat_block } as never],
        companions: [],
      };
      const fightWith = (target: Partial<RunCombatant>) =>
        row({ combatants_live: [combatant("mage", { monster_id: "m-mage", hp: 40, max_hp: 40, initiative: 12, position: { x: 1, y: 1 } }), combatant("t1", { hp: 40, max_hp: 40, ac: "13", initiative: 5, position: { x: 4, y: 1 }, ...target })] });
      const holdAt = () => cast({ spell: "hold person", targetIds: ["t1"] });

      // Bug caught: `kindsChecked` not passed on the server, so Hold Person on a humanoid still imposes nothing.
      it("fails if a humanoid that fails its save is not left Paralyzed, or the slot is not spent", async () => {
        const h = harness(fightWith({ monster_id: "m-bandit" }), { sources: KIND_SOURCES, spells: [humanoidHold], dieFaces: [5] });
        await runBatch(batch("b", holdAt()), h.deps);
        expect(by(stored(h), "t1").conditions.map((c) => c.name)).toEqual(["Paralyzed"]);
        expect(by(stored(h), "mage").action_uses).toEqual({ "slots/2": { used: 1, per_day: 3 } });
      });

      // Bug caught: Hold Person paralysing a wolf, or the refusal still spending the slot, the Action or a die.
      it("fails if a beast is paralysed, or a refused cast spends anything", async () => {
        const h = harness(fightWith({ monster_id: "m-wolf", name: "Wolf" }), { sources: KIND_SOURCES, spells: [humanoidHold], dieFaces: [5] });
        await expect(runBatch(batch("b", holdAt()), h.deps)).rejects.toMatchObject({ status: 400, message: "Hold Person works only on a humanoid, and Wolf is a beast." });
        expect(h.saves).toBe(0);
        expect(h.dieCalls).toBe(0);
        expect(h.posted).toEqual([]);
      });

      // Bug caught: a creature whose kind nobody knows is paralysed (or refused) as if it were known; it must cost the slot and go to the table with a reason.
      it("fails if an unknown kind is rolled or refused instead of spent and left to the table", async () => {
        const h = harness(fightWith({ monster_id: undefined, npc_id: "n-elf" }), { sources: KIND_SOURCES, spells: [humanoidHold], dieFaces: [] });
        const result = await runBatch(batch("b", holdAt()), h.deps);
        expect(by(stored(h), "t1").conditions).toEqual([]);
        expect(h.dieCalls).toBe(0);
        expect(by(stored(h), "mage").action_uses).toEqual({ "slots/2": { used: 1, per_day: 3 } });
        expect(result.effects.find((e) => e.type === "resolved")).toMatchObject({ resolved: { kind: "cast", spell: "Hold Person", why: expect.stringMatching(/cannot tell what kind of creature t1 is/) } });
      });

      // Bug caught: a player character left to the table (or refused) instead of treated as the humanoid every playable species is.
      it("fails if a player character is not held like a humanoid", async () => {
        const h = harness(fightWith({ type: "player", monster_id: undefined, party_member_id: "pm-nessa" }), { sources: KIND_SOURCES, players: NESSA_IN_PLATE, spells: [humanoidHold], dieFaces: [5] });
        await runBatch(batch("b", holdAt()), h.deps);
        expect(by(stored(h), "t1").conditions.map((c) => c.name)).toEqual(["Paralyzed"]);
      });
    });
  });

  it("refuses a malformed cast before the fight is read: a repeated target, too many targets, a bad slot level, bad faces", () => {
    const bad = (over: Record<string, unknown>) => () => validateRequest(batch("b", cast(over)));
    expect(bad({ targetIds: ["t1", "t1"] })).toThrow(FightCommandError);
    expect(bad({ targetIds: Array.from({ length: 31 }, (_, i) => `t${i}`) })).toThrow(FightCommandError);
    expect(bad({ castLevel: 10 })).toThrow(FightCommandError);
    expect(bad({ spell: "" })).toThrow(FightCommandError);
    expect(bad({ faces: { attacks: [{ damage: [[3]] }] } })).toThrow(FightCommandError);
    expect(bad({ faces: { save: { saves: [[5], [5], [5], [5]] } } })).toThrow(FightCommandError);
    expect(bad({ targetIds: [], faces: { attacks: [null] } })).toThrow(FightCommandError);
    expect(bad({})).not.toThrow();
  });
});

describe("take_turn casts a spell", () => {
  const MAGE_SOURCES: StatBlockSources = {
    monsters: [{ id: "m-mage", name: "Mage", stat_block: mageBlock({ actions: [] }) } as unknown as Monster, monster("m-ox")],
    npcs: [],
    companions: [],
  };
  const by = (r: FightRow, id: string) => r.combatants_live.find((c) => c.instance_id === id)!;
  /** A mage (hostile to the party) at (1,1) and three party oxen (40 HP, Dex +0, AC 13) in a row within 20 feet of each other. */
  const bunched = (mage: Partial<RunCombatant> = {}) =>
    row({
      combatants_live: [
        combatant("mage", { monster_id: "m-mage", faction_id: "m", hp: 40, max_hp: 40, initiative: 12, position: { x: 1, y: 1 }, ...mage }),
        ...["t1", "t2", "t3"].map((id, i) => combatant(id, { monster_id: "m-ox", faction_id: "p", hp: 40, max_hp: 40, ac: "13", initiative: 5 - i, position: { x: 4 + i, y: 1 } })),
      ],
    });

  // SRD 5.1 "Fireball": 8d6 fire, DEX save for half, DC 14. Three oxen at DEX +0 fail 65% each, so the cast is worth
  // 3 * (0.65*28 + 0.35*14) = 69.3, against a Fire Bolt at +6 versus AC 13 (0.70 to hit, 2d10 at 9th level averages 11: 0.7*11 + 0.05*11 = 8.25):
  // the rules pick Fireball and all three are its targets.
  // Dice in order: three saves (5 fails, 20 saves, 3 fails), then 8d6 once (1+2+3+4+5+6+1+2 = 24): failures take 24, the saver 12.
  // Bug caught: a creature that lists spells never casts, or casts at one target, or rolls the damage once per target, or spends no slot.
  it("fails if a mage with three bunched enemies does not cast Fireball at all three with one damage roll, one slot and one save each", async () => {
    const h = harness(bunched(), { sources: MAGE_SOURCES, map: mapOf(), spells: [fireball(), fireBolt()], dieFaces: [5, 20, 3, 1, 2, 3, 4, 5, 6, 1, 2] });
    const result = await runBatch(batch("b", takeTurn({ instanceId: "mage" })), h.deps);
    const after = stored(h);
    expect(result.effects[0]).toMatchObject({ type: "turn_taken", turn: { kind: "spell", picked: "rules", reason: expect.stringMatching(/^Casts Fireball \(level 3\) at t1, t2 and t3/) } });
    expect(["t1", "t2", "t3"].map((id) => hpOf(after, id))).toEqual([16, 28, 16]);
    expect(by(after, "mage").action_uses).toEqual({ "slots/3": { used: 1, per_day: 3 } });
    expect(by(after, "mage").action_used).toBe(true);
    expect(h.posted.filter((p) => p.result.isDamage)).toHaveLength(1);
    expect(h.dieCalls).toBe(11);
    expect(h.spellListedReads).toHaveLength(1);
  });

  // Bug caught: the server reads a creature's spells once per name (or per option), or reads for a creature with none.
  it("fails if a creature with no Spellcasting entry reads any spell, or a mage reads them name by name", async () => {
    const wolf = harness(duel(), { sources: SOURCES, map: mapOf(), dieFaces: [9, 5] });
    await runBatch(batch("b1", takeTurn()), wolf.deps);
    expect(wolf.spellListedReads).toEqual([]);
    expect(wolf.spellReads).toEqual([]);
    const mage = harness(bunched(), { sources: MAGE_SOURCES, map: mapOf(), spells: [fireball(), fireBolt()], dieFaces: [5, 20, 3, 1, 2, 3, 4, 5, 6, 1, 2] });
    await runBatch(batch("b", takeTurn({ instanceId: "mage" })), mage.deps);
    // `cast_spell` asks for the one name it casts (cached per attempt), and the turn asked for the whole list once.
    expect(mage.spellListedReads).toHaveLength(1);
    expect(mage.spellListedReads[0]).toEqual(expect.arrayContaining(["fireball", "fire bolt"]));
  });
});

// SRD 5.1 Fear: "While frightened by this spell, a creature must take the Dash action and move away from you by the safest
// available route on each of its turns, unless there is nowhere to move." RULE flee-by-spell (app convention).
describe("a spell that makes a creature run", () => {
  const sources: StatBlockSources = { monsters: [{ id: "m-mage", name: "Mage", stat_block: mageWithFear() } as unknown as Monster, monster("m-ox")], npcs: [], companions: [] };
  const fight = () =>
    row({
      combatants_live: [
        combatant("mage", { monster_id: "m-mage", faction_id: "m", hp: 40, max_hp: 40, initiative: 12, position: { x: 1, y: 1 } }),
        combatant("t1", { monster_id: "m-ox", faction_id: "p", hp: 40, max_hp: 40, ac: "13", initiative: 5, position: { x: 4, y: 1 } }),
      ],
    });
  const cast = { type: "cast_spell", casterId: "mage", spell: "fear", targetIds: ["t1"] } as CommandRequest["commands"][number];

  // The ox fails its WIS save (5 against DC 14), is Frightened by the mage's Fear, and on its own turn goes away from the mage
  // (to the east, since the mage stands to its west) instead of closing in to attack. Bug caught: the flag is lost between the cast
  // and the creature's turn, so the frightened ox walks up to the mage as if nothing had happened.
  it("moves a creature that failed its save away from the caster on its next take_turn", async () => {
    const h = harness(fight(), { sources, map: mapOf(), spells: [fear()], dieFaces: [5] });
    await runBatch(batch("b1", cast), h.deps);
    expect(combatantOf(stored(h), "t1").conditions).toEqual([
      { name: "Frightened", source: { id: "mage", spell: "Fear", concentration: true, mustFlee: true }, ends: { kind: "rounds", remaining: 10 } },
    ]);
    const result = await runBatch(batch("b2", takeTurn({ instanceId: "t1" })), h.deps);
    expect(result.effects[0]).toMatchObject({ type: "turn_taken", turn: { instanceId: "t1", kind: "flee", reason: expect.stringMatching(/get away from mage/) } });
    expect(combatantOf(stored(h), "t1").position!.x).toBeGreaterThan(4);
  });

  // "unless there is nowhere to move": the ox stands in the far corner of a small map, so no square is farther from the mage. Nothing
  // forces it to run, and it does not turn on the mage it fears either: it Dodges. Bug caught: the server's gate is given no
  // combatants, so the creature that cannot flee gets its attacks back.
  it("does not attack the caster when there is nowhere to run", async () => {
    const corner: FightMap = { ...mapOf(), bounds: { minX: 0, minY: 0, maxX: 5, maxY: 5 } };
    const cornered = row({
      combatants_live: [
        combatant("mage", { monster_id: "m-mage", faction_id: "m", hp: 40, max_hp: 40, initiative: 12, position: { x: 1, y: 1 } }),
        combatant("t1", { monster_id: "m-ox", faction_id: "p", hp: 40, max_hp: 40, ac: "13", initiative: 5, position: { x: 5, y: 5 } }),
      ],
    });
    const h = harness(cornered, { sources, map: corner, spells: [fear()], dieFaces: [5] });
    await runBatch(batch("b1", cast), h.deps);
    const result = await runBatch(batch("b2", takeTurn({ instanceId: "t1" })), h.deps);
    expect(result.effects[0]).toMatchObject({ type: "turn_taken", turn: { instanceId: "t1", kind: "dodge" } });
  });

  // Bug caught: the gate is given no combatants, so a caller (or a note) can still send the frightened creature at the mage.
  it("refuses an attack on offer by name from a frightened creature, which the gate has dropped", async () => {
    const h = harness(fight(), { sources, map: mapOf(), spells: [fear()], dieFaces: [5] });
    await runBatch(batch("b1", cast), h.deps);
    await expect(runBatch(batch("b2", takeTurn({ instanceId: "t1", optionId: "attack:actions:Bite:mage" })), h.deps)).rejects.toMatchObject({ status: 400, message: expect.stringMatching(/not on offer/) });
  });

  // Bug caught: the same ox, with no Fear on it, flees too (the rule forces every creature) instead of closing in on the mage.
  it("does not move a creature that is not afraid away", async () => {
    const h = harness(fight(), { sources, map: mapOf(), spells: [fear()], dieFaces: [9, 5] });
    const result = await runBatch(batch("b1", takeTurn({ instanceId: "t1" })), h.deps);
    expect(result.effects[0]).toMatchObject({ type: "turn_taken", turn: { instanceId: "t1" } });
    expect(result.effects[0]).not.toMatchObject({ turn: { kind: "flee" } });
  });
});

describe("what a resisted blow teaches the next creature (#1021)", () => {
  const SCORCH: StatBlockEntry = { name: "Scorch", description: "", structured: { kind: "attack", source: "manual", attack: { delivery: "melee", bonus: 4, hit: [{ dice: "1d8+2", type: "fire" }] } } };
  const BITE: StatBlockEntry = { name: "Bite", description: "", structured: { kind: "attack", source: "manual", attack: { delivery: "melee", bonus: 4, hit: [{ dice: "1d6+2", type: "piercing" }] } } };
  // The ox really resists fire on its sheet; nothing has shown it yet.
  const FIRE_SOURCES: StatBlockSources = {
    monsters: [
      monster("m-wolf", { actions: [BITE, SCORCH] }),
      monster("m-ox", { defenses: { ...emptyDefenses(), resistances: [{ types: ["fire"] }] } }),
    ],
    npcs: [],
    companions: [],
  };
  const pair = () =>
    duel({ extra: [combatant("wolf2", { monster_id: "m-wolf", faction_id: "m", hp: 11, max_hp: 11, initiative: 8, position: { x: 0, y: 2 } })] });

  // Scorch averages 6.5 against Bite's 5.5 at the same chance to hit, so a creature that has seen nothing picks Scorch.
  // Bug caught: the choosing reads the ox's sheet (fire resisted, Scorch worth 3.25) before any blow has shown it.
  it("fails if a creature that has been shown nothing weighs the target's real resistance", async () => {
    const h = harness(pair(), { sources: FIRE_SOURCES, map: mapOf(), dieFaces: [9, 5] });
    const result = await runBatch(batch("b1", takeTurn({ instanceId: "wolf2" })), h.deps);
    expect(result.effects[0]).toMatchObject({ type: "turn_taken", turn: { instanceId: "wolf2", optionId: expect.stringContaining("Scorch") } });
  });

  // d20 9 + 4 = 13 meets AC 13; 1d8+2 with a 4 is 6, resisted floor(6/2) = 3, the ox keeps 37 and the fight now shows fire resisted.
  // Then wolf2's turn: Scorch 3.25 against Bite 5.5, so it bites. Dice for wolf2: d20 9, damage 5.
  // Bug caught: the resisted blow is applied but not remembered, or remembered and not weighed by the next creature.
  it("fails if a resisted blow is not saved as shown and weighed by the next creature of that side", async () => {
    const h = harness(pair(), { sources: FIRE_SOURCES, map: mapOf(), dieFaces: [9, 4, 9, 5] });
    await runBatch(batch("b1", attack({ action: "Scorch" })), h.deps);
    expect(hpOf(stored(h), "victim")).toBe(37);
    expect(combatantOf(stored(h), "victim").shown_defenses).toEqual({ fire: "resistant" });
    const result = await runBatch(batch("b2", takeTurn({ instanceId: "wolf2" })), h.deps);
    expect(result.effects[0]).toMatchObject({ type: "turn_taken", turn: { instanceId: "wolf2", optionId: expect.stringContaining("Bite") } });
  });
});

// ── a creature spends its Action on a check to get free of a spell's hold (#1021 row 5b) ──────────────────────
// SRD 5.1 Black Tentacles: "A creature restrained by the tentacles can use its action to make a Strength or Dexterity check
// (its choice) against your spell save DC. On a success, it frees itself."
describe("break_free", () => {
  const HELD: AppliedCondition = { name: "Restrained", source: { id: "mage", spell: "Black Tentacles" }, breakFree: { abilities: ["str", "dex"], dc: 14 } };
  const free = (over: Record<string, unknown> = {}) => ({ type: "break_free", instanceId: "wolf", name: "Restrained", ...over }) as CommandRequest["commands"][number];
  // Strength 16 (+3) and Dexterity 10 (+0): a creature with the better Strength.
  const STRONG: StatBlockSources = { monsters: [monster("m-wolf", { str: 16, dex: 10 }), monster("m-ox")], npcs: [], companions: [] };
  const heldWolf = (over: Partial<RunCombatant> = {}, extra: RunCombatant[] = []) =>
    row({ combatants_live: [combatant("wolf", { monster_id: "m-wolf", faction_id: "m", hp: 11, max_hp: 11, initiative: 12, conditions: [HELD], ...over }), ...extra] });
  const heldOf = (h: Harness) => combatantOf(stored(h), "wolf");

  // d20 11 + 3 (Strength 16, the better ability, none named) = 14 meets DC 14: the condition goes. The Action is spent.
  // Bug caught: the higher modifier is not the one used (Dex +0 would total 11), or a total that meets the DC does not free it.
  it("fails if a creature with Strength 16 and Dexterity 10 does not check with Strength, or a total that meets the DC does not free it", async () => {
    const h = harness(heldWolf(), { sources: STRONG, dieFaces: [11] });
    const result = await runBatch(batch("b", free()), h.deps);
    expect(heldOf(h).conditions).toEqual([]);
    expect(heldOf(h).action_used).toBe(true);
    expect(result.effects.find((e) => e.type === "resolved")).toMatchObject({ resolved: { kind: "break_free", instanceId: "wolf", name: "Restrained", ability: "str", natural: 11, total: 14, dc: 14, success: true } });
    expect(h.posted).toHaveLength(1);
  });

  // d20 10 + 3 = 13 is one short of DC 14: still held, and the Action is gone all the same (trying costs the Action).
  // Bug caught: a total one short frees the creature, or a failed try is free.
  it("fails if a total one short of the DC frees the creature, or a failed try leaves the Action unspent", async () => {
    const h = harness(heldWolf(), { sources: STRONG, dieFaces: [10] });
    await runBatch(batch("b", free()), h.deps);
    expect(heldOf(h).conditions.map((c) => c.name)).toEqual(["Restrained"]);
    expect(heldOf(h).action_used).toBe(true);
  });

  // Bug caught: a second try in the same turn is free, so a creature rolls again and again until it frees itself.
  it("fails if a creature whose Action is spent may try again in the same turn", async () => {
    const h = harness(heldWolf({ action_used: true }), { sources: STRONG, dieFaces: [] });
    await expect(runBatch(batch("b", free()), h.deps)).rejects.toMatchObject({ status: 400, message: expect.stringMatching(/already used its Action/) });
    expect(h.saves).toBe(0);
    expect(h.dieCalls).toBe(0);
  });

  // "a Strength or Dexterity check (its choice)": naming Dexterity uses Dexterity (+0): d20 13 + 0 = 13 fails, where Strength would have freed it.
  // Naming Constitution is not the spell's choice at all. Bug caught: the named ability is ignored, or any ability is accepted.
  it("fails if a named ability is ignored, or one the spell does not allow is accepted", async () => {
    const dex = harness(heldWolf(), { sources: STRONG, dieFaces: [13] });
    await runBatch(batch("b", free({ ability: "DEX" })), dex.deps);
    expect(heldOf(dex).conditions).toHaveLength(1);
    expect(dex.posted[0].result.total).toBe(13);

    const con = harness(heldWolf(), { sources: STRONG, dieFaces: [] });
    await expect(runBatch(batch("b", free({ ability: "con" })), con.deps)).rejects.toMatchObject({ status: 400, message: expect.stringMatching(/STR or DEX, not con/) });
    expect(con.saves).toBe(0);
  });

  // Bug caught: a creature with no such hold is rolled for, or a hold the spell gives no way out of is broken by a check.
  it("fails if a creature that bears no such condition, or one with no way out, is allowed to try", async () => {
    const none = harness(heldWolf({ conditions: [] }), { sources: STRONG, dieFaces: [] });
    await expect(runBatch(batch("b", free()), none.deps)).rejects.toMatchObject({ status: 400, message: expect.stringMatching(/not held by Restrained/) });
    const plain = harness(heldWolf({ conditions: [{ name: "Restrained" }] }), { sources: STRONG, dieFaces: [] });
    await expect(runBatch(batch("b", free()), plain.deps)).rejects.toMatchObject({ status: 400 });
    expect(none.saves + plain.saves).toBe(0);
  });

  // Bug caught: a creature at 0 hit points acts.
  it("fails if a creature at 0 hit points tries", async () => {
    const h = harness(heldWolf({ hp: 0 }), { sources: STRONG, dieFaces: [] });
    await expect(runBatch(batch("b", free()), h.deps)).rejects.toMatchObject({ status: 400, message: expect.stringMatching(/cannot act/) });
  });

  // 2024 Black Tentacles: "a Strength (Athletics) check". The block lists Athletics +7 (proficiency already in it): d20 7 + 7 = 14
  // frees. Modifier plus proficiency would be +3 +2 = 12 and fail; a listed bonus added to the modifier would be 17.
  // Bug caught: the listed skill bonus is ignored, or added on top of the ability modifier.
  it("fails if a listed skill bonus is not used instead of the modifier and proficiency", async () => {
    const sources: StatBlockSources = { monsters: [monster("m-wolf", { str: 16, dex: 10, skills: { athletics: "+7" } })], npcs: [], companions: [] };
    const named: AppliedCondition = { ...HELD, breakFree: { abilities: ["str"], skill: "athletics", dc: 14 } };
    const h = harness(heldWolf({ conditions: [named] }), { sources, dieFaces: [7] });
    const result = await runBatch(batch("b", free()), h.deps);
    expect(heldOf(h).conditions).toEqual([]);
    expect(result.effects.find((e) => e.type === "resolved")).toMatchObject({ resolved: { total: 14 } });
  });

  describe("a player character", () => {
    const nessa = (conditions: unknown[]) => row({ combatants_live: [pc("nessa", { hp: 20, max_hp: 20, conditions: conditions as RunCombatant["conditions"] })] });
    const nessaFree = () => ({ type: "break_free", instanceId: "nessa", name: "Restrained" }) as CommandRequest["commands"][number];

    // Bug caught: a modifier the server can read is refused, or one it cannot is guessed. Nessa's Strength is 10 (+0) and her
    // Dexterity 14 (+2): with none named she uses Dexterity, d20 12 + 2 = 14 frees her.
    it("uses the modifier of the sheet the server reads, and the better ability", async () => {
      const h = harness(nessa([HELD]), { sources: STRONG, players: NESSA_IN_PLATE, dieFaces: [12] });
      const result = await runBatch(batch("b", nessaFree()), h.deps);
      expect(combatantOf(stored(h), "nessa").conditions).toEqual([]);
      expect(result.effects.find((e) => e.type === "resolved")).toMatchObject({ resolved: { ability: "dex", total: 14 } });
    });

    // Bug caught: a player whose sheet the server could not read is rolled for with a guessed modifier.
    it("is refused with a message that the check is the player's own when the sheet cannot be read", async () => {
      const h = harness(nessa([HELD]), { sources: STRONG, dieFaces: [] });
      await expect(runBatch(batch("b", nessaFree()), h.deps)).rejects.toMatchObject({ status: 400, message: expect.stringMatching(/player's own to roll; the Dungeon Master can remove the condition on a success/) });
      expect(h.dieCalls).toBe(0);
    });

    // Bug caught: a named skill is rolled for a player without their proficiency, which the sheet the server reads does not hold.
    it("is refused when the spell names a skill, whose proficiency the server cannot read", async () => {
      const named: AppliedCondition = { ...HELD, breakFree: { abilities: ["str"], skill: "athletics", dc: 14 } };
      const h = harness(nessa([named]), { sources: STRONG, players: NESSA_IN_PLATE, dieFaces: [] });
      await expect(runBatch(batch("b", nessaFree()), h.deps)).rejects.toMatchObject({ status: 400, message: expect.stringMatching(/player's own to roll/) });
    });
  });

  // The server plays a held creature whose enemy is out of reach: the only turn worth taking is the check. Its Strength is 16, d20 11 + 3
  // = 14 frees it. Bug caught: take_turn never offers the check, so a held creature stands there (or is walked into a wall) all fight.
  it("fails if take_turn for a held creature with no target in reach does not roll the check and use the Action", async () => {
    const fight = heldWolf({ position: { x: 0, y: 0 } }, [combatant("victim", { monster_id: "m-ox", faction_id: "p", hp: 40, max_hp: 40, ac: "13", initiative: 5, position: { x: 8, y: 0 } })]);
    const h = harness(fight, { sources: STRONG, map: mapOf(), dieFaces: [11] });
    const result = await runBatch(batch("b", takeTurn()), h.deps);
    expect(result.effects[0]).toMatchObject({ type: "turn_taken", turn: { instanceId: "wolf", kind: "break_free", reason: expect.stringMatching(/break free of Restrained/) } });
    expect(heldOf(h).conditions).toEqual([]);
    expect(heldOf(h).action_used).toBe(true);
    expect(h.posted.map((p) => p.result.total)).toEqual([14]);
  });

  // Black Tentacles end to end: the mage casts, the ox fails its DEX save (5 against DC 14) and is Restrained with the way out and the DC.
  // Bug caught: the DC or the way out is lost between the spell and the saved fight, so nothing can ever be checked against it.
  it("is carried onto the target by a cast, with the caster's save DC", async () => {
    const sources: StatBlockSources = { monsters: [{ id: "m-mage", name: "Mage", stat_block: mageWithTentacles() } as unknown as Monster, monster("m-ox")], npcs: [], companions: [] };
    const fight = row({
      combatants_live: [
        combatant("mage", { monster_id: "m-mage", faction_id: "m", hp: 40, max_hp: 40, initiative: 12 }),
        combatant("t1", { monster_id: "m-ox", faction_id: "p", hp: 40, max_hp: 40, initiative: 5 }),
      ],
    });
    const h = harness(fight, { sources, spells: [blackTentacles()], dieFaces: [5] });
    await runBatch(batch("b", { type: "cast_spell", casterId: "mage", spell: "black tentacles", targetIds: ["t1"] } as CommandRequest["commands"][number]), h.deps);
    expect(combatantOf(stored(h), "t1").conditions).toEqual([
      { name: "Restrained", source: { id: "mage", spell: "Black Tentacles", concentration: true }, ends: { kind: "rounds", remaining: 10 }, breakFree: { abilities: ["str", "dex"], dc: 14 } },
    ]);
  });
});

describe("what the fight has seen a creature do (#1021)", () => {
  // d20 9 + 4 = 13 meets AC 13 and hits; 1d6+2 with a 5 deals 7.
  // Bug caught: the deed is applied in the resolution but never reaches the saved fight (a command lost between the server context
  // and the store), so the next creature to choose knows nothing.
  it("fails if a resolved attack does not leave the attacker's deeds in the saved fight", async () => {
    const h = harness(arena(), { sources: SOURCES, dieFaces: [9, 5] });
    await runBatch(batch("b1", attack()), h.deps);
    expect(combatantOf(stored(h), "wolf").shown_deeds).toEqual({ dealt: 7, turns: 0, cast: 0, ranged: 0, melee: 1 });
    expect(combatantOf(stored(h), "victim").shown_deeds).toBeUndefined();
  });

  // The mage lists Hold Person and carries a dagger (+5, 1d4+2). Its foe, an ox of WIS +0 against DC 14 (fails 0.65), has been
  // seen to deal 12 a turn (24 over 2): Hold Person is worth 12 * 2.8187 * 0.65 = 21.99, the dagger about 2.8. Dice: the save, 5, fails.
  const STAB: StatBlockEntry = { name: "Dagger", description: "", structured: { kind: "attack", source: "manual", attack: { delivery: "melee", bonus: 5, hit: [{ dice: "1d4+2", type: "piercing" }] } } };
  const SOURCES_WITH_HOLD: StatBlockSources = {
    monsters: [{ id: "m-mage", name: "Mage", stat_block: { ...mageWithHold(), actions: [STAB] } } as unknown as Monster, monster("m-ox")],
    npcs: [],
    companions: [],
  };
  const standoff = (seen: RunCombatant["shown_deeds"]) =>
    row({
      combatants_live: [
        combatant("mage", { monster_id: "m-mage", faction_id: "m", hp: 40, max_hp: 40, initiative: 12, position: { x: 1, y: 1 } }),
        combatant("t1", { monster_id: "m-ox", faction_id: "p", hp: 40, max_hp: 40, ac: "13", initiative: 5, position: { x: 2, y: 1 }, shown_deeds: seen }),
      ],
    });

  // Bug caught: the server's turn ignores what a condition is worth, so the mage stabs a fighter it has seen hit hard.
  it("fails if a tactical caster that has seen a foe hit hard does not end its turn casting Hold Person at it", async () => {
    const h = harness(standoff({ dealt: 24, turns: 2, cast: 0, ranged: 0, melee: 2 }), { sources: SOURCES_WITH_HOLD, map: mapOf(), spells: [holdPerson()], dieFaces: [5] });
    const result = await runBatch(batch("b", takeTurn({ instanceId: "mage" })), h.deps);
    expect(result.effects[0]).toMatchObject({ type: "turn_taken", turn: { kind: "spell", picked: "rules", reason: expect.stringMatching(/^Casts Hold Person \(level 2\) at t1, who has been dealing about 12 damage a turn/) } });
    expect(combatantOf(stored(h), "t1").conditions.map((c) => c.name)).toEqual(["Paralyzed"]);
    // Casting is itself seen: one spell on the mage's record.
    expect(combatantOf(stored(h), "mage").shown_deeds).toMatchObject({ cast: 1 });
  });

  // Bug caught: a foe seen to do nothing is held like one seen to hurt (the worth falls back on the mover's own damage
  // instead of what was seen), so this is the control that the worth follows the shown deeds.
  it("fails if a foe that has been seen to deal nothing is held", async () => {
    const h = harness(standoff({ dealt: 0, turns: 2, cast: 0, ranged: 0, melee: 0 }), { sources: SOURCES_WITH_HOLD, map: mapOf(), spells: [holdPerson()], dieFaces: [9, 3] });
    const result = await runBatch(batch("b", takeTurn({ instanceId: "mage" })), h.deps);
    expect(result.effects[0]).toMatchObject({ type: "turn_taken", turn: { kind: "attack" } });
    expect(combatantOf(stored(h), "t1").conditions).toEqual([]);
  });
});

describe("a batch that must be refused before anything is saved", () => {
  const ok = { encounterId: "e", batchId: "b" };
  const good = { instance_id: "a", type: "monster", name: "A", hp: 1, max_hp: 1, conditions: [], curses: [], death_saves: { successes: 0, failures: 0 } };
  const send = (commands: unknown[]) => () => validateRequest({ ...ok, commands });
  const add = (c: unknown) => send([{ type: "add_combatants", combatants: [c] }]);

  // Bug: a combatant saved without these three makes every later command on the fight throw (the reducer reads them all the time).
  it("fails if a combatant without conditions, curses or well-formed death_saves is accepted", () => {
    expect(add(good)).not.toThrow();
    const { conditions: _c, ...noConditions } = good;
    const { curses: _u, ...noCurses } = good;
    const { death_saves: _d, ...noSaves } = good;
    expect(add(noConditions)).toThrow(FightCommandError);
    expect(add(noCurses)).toThrow(FightCommandError);
    expect(add(noSaves)).toThrow(FightCommandError);
    expect(add({ ...good, conditions: "none" })).toThrow(FightCommandError);
    expect(add({ ...good, death_saves: { successes: "0", failures: 0 } })).toThrow(FightCommandError);
  });

  // Bug: hp that is NaN, fractional or a negative maximum is saved and poisons the arithmetic of every later hit.
  it("fails if a combatant's hp or max_hp is not a whole number, or max_hp is negative", () => {
    expect(add({ ...good, hp: 1.5 })).toThrow(FightCommandError);
    expect(add({ ...good, hp: null })).toThrow(FightCommandError);
    expect(add({ ...good, max_hp: -1 })).toThrow(FightCommandError);
    // JSON turns NaN into null, but a caller inside the function can still hand one over.
    expect(add({ ...good, max_hp: Number.NaN })).toThrow(FightCommandError);
    expect(add({ ...good, hp: 0, max_hp: 0 })).not.toThrow();
  });

  // Bug: two combatants with one instance id: every command acts on the first match, and the second can never be reached or removed.
  it("fails if two combatants of one request share an instance id", () => {
    expect(send([{ type: "add_combatants", combatants: [good, { ...good, name: "B" }] }])).toThrow(FightCommandError);
    expect(send([{ type: "open", combatants: [good, good] }])).toThrow(FightCommandError);
  });

  // Each case is a value the reducer would write into the fight as it is: NaN hit points, a condition that has no name, feet that subtract.
  it("fails if a reducer command with a number, flag or list of the wrong shape is accepted", () => {
    const bad: Array<[string, Record<string, unknown>]> = [
      ["adjust_hp with a fractional delta", { type: "adjust_hp", instanceId: "a", delta: 2.5 }],
      ["adjust_hp with a string delta", { type: "adjust_hp", instanceId: "a", delta: "-3" }],
      ["adjust_hp with a non-boolean critical", { type: "adjust_hp", instanceId: "a", delta: -3, critical: "yes" }],
      ["adjust_hp with no instanceId", { type: "adjust_hp", delta: -3 }],
      ["adjust_hp with an empty instanceId", { type: "adjust_hp", instanceId: "", delta: -3 }],
      ["set_hp negative", { type: "set_hp", instanceId: "a", value: -1 }],
      ["set_hp missing", { type: "set_hp", instanceId: "a" }],
      ["set_max_hp fractional", { type: "set_max_hp", instanceId: "a", value: 10.5 }],
      ["set_temp_hp a string", { type: "set_temp_hp", instanceId: "a", value: "5" }],
      ["set_initiative undefined", { type: "set_initiative", instanceId: "a" }],
      ["set_initiative a string", { type: "set_initiative", instanceId: "a", value: "12" }],
      ["record_move negative feet", { type: "record_move", instanceId: "a", feet: -5 }],
      ["record_move fractional feet", { type: "record_move", instanceId: "a", feet: 2.5 }],
      ["undo_move with no feet", { type: "undo_move", instanceId: "a" }],
      ["spend_legendary_actions with a string cost", { type: "spend_legendary_actions", instanceId: "a", cost: "1" }],
      ["use_action with no limit", { type: "use_action", instanceId: "a", action: "Breath" }],
      ["use_action with a fractional per_day", { type: "use_action", instanceId: "a", action: "Breath", limit: { per_day: 1.5 } }],
      ["use_action with a recharge missing max", { type: "use_action", instanceId: "a", action: "Breath", limit: { recharge: { min: 5 } } }],
      ["restore_action with no action", { type: "restore_action", instanceId: "a" }],
      ["set_conditions as a string", { type: "set_conditions", instanceId: "a", conditions: "Prone" }],
      ["set_conditions with a nameless entry", { type: "set_conditions", instanceId: "a", conditions: [{ name: "Prone" }, {}] }],
      ["apply_condition with no condition", { type: "apply_condition", instanceId: "a" }],
      ["apply_condition with a nameless condition", { type: "apply_condition", instanceId: "a", condition: { level: 2 } }],
      ["remove_condition with no name", { type: "remove_condition", instanceId: "a" }],
      ["set_action_used with a string", { type: "set_action_used", instanceId: "a", used: "true" }],
      ["remove_combatant with no instanceId", { type: "remove_combatant" }],
      ["set_boss_mechanics with a string flag", { type: "set_boss_mechanics", lairEnabled: "yes", lairOwnerInstanceId: null }],
      ["prime_legendary_actions with a string cap", { type: "prime_legendary_actions", caps: { a: "3" } }],
    ];
    for (const [what, command] of bad) {
      expect(send([command]), what).toThrow(FightCommandError);
    }
  });

  it("accepts the well-formed form of each of those commands", () => {
    const fine: Record<string, unknown>[] = [
      { type: "adjust_hp", instanceId: "a", delta: -4, critical: true },
      { type: "set_hp", instanceId: "a", value: 0 },
      { type: "set_initiative", instanceId: "a", value: null },
      { type: "set_initiative", instanceId: "a", value: 17 },
      { type: "record_move", instanceId: "a", feet: 15 },
      { type: "use_action", instanceId: "a", action: "Breath", limit: { recharge: { min: 5, max: 6 } } },
      { type: "use_action", instanceId: "a", action: "Spell", limit: { per_day: 3 } },
      { type: "set_conditions", instanceId: "a", conditions: [{ name: "Prone" }] },
      { type: "apply_condition", instanceId: "a", condition: { name: "Exhaustion", level: 2 } },
      { type: "set_boss_mechanics", lairEnabled: true, lairOwnerInstanceId: null },
      { type: "toggle_reaction", instanceId: "a" },
    ];
    for (const command of fine) expect(send([command]), String(command.type)).not.toThrow();
  });
});

describe("the fight's own memory across writers and retries", () => {
  const nessaRow: PartyIngestRow = {
    id: "pm-nessa", current_hp: 20, temp_hp: 0, current_initiative: null, conditions: [], concentration: null,
    wildshape_state: null, death_save_successes: 0, death_save_failures: 0,
  };

  // Batch A takes Nessa from 20 to 10 and saves; its write to her row has not landed (the harness's row still says 20).
  // Batch B, a second device, loads the fight, reads the row (20) and runs a harmless command. The row is what the fight
  // last read (20), so it is not news: the fight keeps 10. Without the memory B would put her back to 20.
  it("fails if a second batch reads a character's row that has not caught up and puts back the hit points a hit took", async () => {
    const h = harness(row({ combatants_live: [pc("nessa", { hp: 20, max_hp: 20, initiative: 15 })] }), { party: [nessaRow] });
    await runBatch(batch("a", { type: "adjust_hp", instanceId: "nessa", delta: -10 }), h.deps);
    expect(hpOf(stored(h), "nessa")).toBe(10);
    expect(h.persisted).toMatchObject([{ id: "pm-nessa", patch: { current_hp: 10 } }]);
    await runBatch(batch("b", { type: "set_reaction_used", instanceId: "nessa", used: true }), h.deps);
    expect(hpOf(stored(h), "nessa")).toBe(10);
  });

  // Batch A records a failed death save for Nessa (0 hit points, row 0/0) and saves; the write to her row is held back (the
  // harness's row still says 0 failures). Batch B reads that row, which is what the fight last read (0 failures), so the
  // fight's 1 failure stands. Without the memory B would put the tally back to 0.
  it("fails if a second batch reads a row that has not caught up and puts back a death save the fight recorded", async () => {
    const h = harness(row({ combatants_live: [pc("nessa", { hp: 0, max_hp: 20, initiative: 15 })] }), { party: [{ ...nessaRow, current_hp: 0 }] });
    await runBatch(batch("a", { type: "adjust_hp", instanceId: "nessa", delta: -1 }), h.deps);
    expect(stored(h).combatants_live[0].death_saves).toEqual({ successes: 0, failures: 1 });
    expect(h.persisted).toMatchObject([{ id: "pm-nessa", patch: { death_save_failures: 1 } }]);
    await runBatch(batch("b", { type: "set_reaction_used", instanceId: "nessa", used: true }), h.deps);
    expect(stored(h).combatants_live[0].death_saves).toEqual({ successes: 0, failures: 1 });
  });

  // The same for a condition the DM applied (Prone) while the row write is held back.
  it("fails if a second batch reads a row that has not caught up and puts back a condition the fight applied", async () => {
    const h = harness(row({ combatants_live: [pc("nessa", { hp: 20, max_hp: 20, initiative: 15 })] }), { party: [nessaRow] });
    await runBatch(batch("a", { type: "apply_condition", instanceId: "nessa", condition: { name: "Prone" } }), h.deps);
    expect(stored(h).combatants_live[0].conditions.map((c) => c.name)).toEqual(["Prone"]);
    await runBatch(batch("b", { type: "set_reaction_used", instanceId: "nessa", used: true }), h.deps);
    expect(stored(h).combatants_live[0].conditions.map((c) => c.name)).toEqual(["Prone"]);
  });

  // The same, then A's write lands (row 10) and Nessa heals herself to 15 on her sheet: 15 is not what the fight last read, so it is hers.
  it("fails if a player's own change on their sheet after a hit is ignored", async () => {
    const party = [{ ...nessaRow }];
    const h = harness(row({ combatants_live: [pc("nessa", { hp: 20, max_hp: 20, initiative: 15 })] }), { party });
    await runBatch(batch("a", { type: "adjust_hp", instanceId: "nessa", delta: -10 }), h.deps);
    // The hit lands on the row, then the player heals on their sheet. The harness re-reads `options.party` each load.
    party[0].current_hp = 15;
    await runBatch(batch("b", { type: "set_reaction_used", instanceId: "nessa", used: true }), h.deps);
    expect(hpOf(stored(h), "nessa")).toBe(15);
  });

  // Nothing is remembered yet (the fight held 7): the row's 20 is adopted, and remembered, as the first read always did.
  it("fails if the first read of a row does not remember what it said", async () => {
    const h = harness(row({ combatants_live: [pc("nessa", { hp: 7, max_hp: 20, initiative: 15 })] }), { party: [nessaRow] });
    await runBatch(batch("a", { type: "set_reaction_used", instanceId: "nessa", used: true }), h.deps);
    // The row said 20, so the fight takes 20 and remembers it.
    expect(stored(h).combatants_live[0]).toMatchObject({ hp: 20, sheet_hp: 20 });
  });

  // App convention: the stat blocks are read once, so a monster added after the first action of a batch was never read, and its
  // own attack in the same batch was refused as "no stat block". The wolf attacks first (that read happens), then the newcomer joins
  // and attacks: each hit is d20 9 + 4 = 13 against AC 13, 1d6+2 with a 5 is 7, so 40 - 7 - 7 = 26.
  it("fails if a monster added after the batch's first attack cannot attack in the same batch", async () => {
    const pool = [monster("m-wolf"), monster("m-ox"), monster("m-new")];
    const h = harness(arena(), { dieFaces: [9, 5, 9, 5] });
    const asked: string[][] = [];
    h.deps.loadStatBlocks = async (ids) => {
      asked.push(ids.monsterIds);
      return { monsters: structuredClone(pool.filter((m) => ids.monsterIds.includes(m.id))), npcs: [], companions: [] };
    };
    const newcomer = combatant("newwolf", { monster_id: "m-new", hp: 11, max_hp: 11, initiative: 3, position: { x: 2, y: 2 } });
    await runBatch(batch("b1", attack(), { type: "add_combatants", combatants: [newcomer] }, attack({ attackerId: "newwolf" })), h.deps);
    expect(hpOf(stored(h), "victim")).toBe(26);
    // The second read asks only for what is new.
    expect(asked[1]).toEqual(["m-new"]);
  });

  // Bug: going live again restarted the window the note-judgment cap counts from.
  it("fails if going live again moves the start time of the fight", async () => {
    const h = harness(row({ started_at: "2026-11-15T19:00:00.000Z" }));
    await runBatch(batch("g1", { type: "go_live", sessionId: null }), h.deps);
    expect(h.saved[0].started_at).toBe("2026-11-15T19:00:00.000Z");
    const fresh = harness(row());
    await runBatch(batch("g1", { type: "go_live", sessionId: null }), fresh.deps);
    expect(fresh.saved[0].started_at).toBe("2026-11-15T20:00:00.000Z");
  });

  // Bug: a session id of another campaign (or none at all) was stored on the fight.
  it("fails if go_live stores a session that is not this campaign's", async () => {
    const h = harness(row(), { sessions: ["sess-1"] });
    await expect(runBatch(batch("g1", { type: "go_live", sessionId: "sess-of-another-campaign" }), h.deps)).rejects.toMatchObject({ status: 400 });
    expect(h.saves).toBe(0);
    await runBatch(batch("g2", { type: "go_live", sessionId: "sess-1" }), h.deps);
    expect(h.saved[0].session_id).toBe("sess-1");
  });

  // Bug: End combat saved the fight and then its write to the character failed; the retry with the same batch id was
  // answered "already applied" and the character never got the hit points, while a new End combat is refused (409).
  it("fails if a retried End combat does not write back to the characters the first one could not reach", async () => {
    const h = harness(row({ combatants_live: [pc("nessa", { hp: 9, max_hp: 20 })] }));
    const working = h.deps.persistPartyMember;
    h.deps.persistPartyMember = async () => {
      throw new Error("down");
    };
    const first = await runBatch(batch("e1", { type: "end_combat" }), h.deps);
    expect(first.effectFailures).toEqual(["player_persist: down"]);
    expect(h.persisted).toEqual([]);
    h.deps.persistPartyMember = working;
    const retry = await runBatch(batch("e1", { type: "end_combat" }), h.deps);
    expect(retry).toMatchObject({ applied: false, effectFailures: [] });
    expect(h.persisted).toMatchObject([{ id: "pm-nessa", patch: { current_hp: 9 } }]);
    expect(h.saves).toBe(1);
  });

  it("fails if a retried Abandon does not clear the rolls the first one could not reach", async () => {
    const h = harness(row({ combatants_live: [pc("nessa", { hp: 9, max_hp: 20, initiative: 15 })] }));
    const working = h.deps.persistPartyMember;
    h.deps.persistPartyMember = async () => {
      throw new Error("down");
    };
    await runBatch(batch("a1", { type: "abandon" }), h.deps);
    h.deps.persistPartyMember = working;
    await runBatch(batch("a1", { type: "abandon" }), h.deps);
    expect(h.persisted).toEqual([{ id: "pm-nessa", patch: { current_initiative: null } }]);
  });

  // An ordinary batch asked twice still applies once and writes nothing the second time.
  it("fails if a retry of an ordinary batch writes to a character again", async () => {
    const h = harness(row({ combatants_live: [pc("nessa", { hp: 20, max_hp: 20, initiative: 15 })] }));
    await runBatch(batch("a", { type: "adjust_hp", instanceId: "nessa", delta: -3 }), h.deps);
    await runBatch(batch("a", { type: "adjust_hp", instanceId: "nessa", delta: -3 }), h.deps);
    expect(h.persisted).toHaveLength(1);
    expect(hpOf(stored(h), "nessa")).toBe(17);
  });
});

// ── the server plays a party member the AI plays: an ally (#1021) ───────────────────

const LONGSWORD = {
  id: "sword", name: "Longsword", item_type: "weapon", properties: [], tags: [], subtype: null, charges: null, weapon_range: null,
  damage_rolls: [{ dice: "1d8", type: "slashing" }],
} as unknown as Item;
const heldSword = { id: "inv-sword", item_id: "sword", library_item_id: null, name: "Longsword", quantity: 1, carried_by: "pm-tam", slot: "main_hand" } as unknown as PartyInventoryItem;

const BEAR_CLAWS: StatBlockEntry = {
  name: "Claws", description: "",
  structured: { kind: "attack", source: "manual", attack: { delivery: "melee", bonus: 6, hit: [{ dice: "1d8+4", type: "slashing" }] } },
};
const SHORTBOW = {
  id: "bow", name: "Shortbow", item_type: "weapon", properties: ["ammunition", "two-handed"], tags: [], subtype: "Shortbow", charges: null, weapon_range: "80/320",
  damage_rolls: [{ dice: "1d6", type: "piercing" }],
} as unknown as Item;
const DAGGER = {
  id: "dagger", name: "Dagger", item_type: "weapon", properties: ["finesse", "light", "thrown"], tags: [], subtype: null, charges: null, weapon_range: "20/60",
  damage_rolls: [{ dice: "1d4", type: "piercing" }], rarity: "mundane", image_url: null, description: "A plain dagger.",
} as unknown as Item;
const SHORTBOW_HELD = { id: "inv-bow", item_id: "bow", library_item_id: null, name: "Shortbow", quantity: 1, carried_by: "pm-tam", slot: "main_hand", location: "equipped" } as unknown as PartyInventoryItem;
const arrows = (quantity: number) => ({ id: "inv-arrows", item_id: null, library_item_id: null, name: "Arrows", quantity, carried_by: "pm-tam", slot: null, location: "belt", is_container: false, current_charges: null }) as unknown as PartyInventoryItem;
const ARROWS_ON_BELT = arrows(20);
const daggers = (quantity: number) => ({ id: "inv-dagger", item_id: "dagger", library_item_id: null, name: "Dagger", quantity, carried_by: "pm-tam", slot: "main_hand", location: "equipped", quality: "standard" }) as unknown as PartyInventoryItem;

/** Tam: Strength 16 (+3), Dexterity 10, proficiency +2, nothing worn, 30 ft. of speed; with a longsword in hand unless `bare`. */
function tamSheets(over: { bare?: boolean; wildshape?: boolean; bear?: boolean; gear?: PartyInventoryItem[]; items?: Item[] } = {}): PlayerSheets {
  return {
    members: [{
      id: "pm-tam", ruleset: "2014", class: "Fighter", subclass: null, ac_formula: null, class_choices: {},
      str: 16, dex: 10, con: 12, int: 10, wis: 10, cha: 10, proficiency_bonus: 2, saving_throw_proficiencies: [], speed: 30, level: 1, custom_attacks: [],
      wildshape_state: over.wildshape ? { monster_id: "m-bear", beast_name: "Brown Bear", beast_image_url: null, beast_hp: 34, beast_max_hp: 34, beast_ac: "11", beast_dex: 10 } : null,
    }],
    inventory: over.gear ?? (over.bare ? [] : [heldSword]),
    items: over.items ?? (over.bare ? [] : [LONGSWORD]),
    beasts: over.bear ? [{ id: "m-bear", stat_block: { str: 19, dex: 10, con: 16, speed: "40 ft.", actions: [BEAR_CLAWS] } }] : [],
  };
}

/** Tam (party side) at (1,1) with `over`, and the 40-HP, AC 13 ox (the enemy) beside them at (2,1). */
function allyFight(over: Partial<RunCombatant> = {}) {
  return row({
    combatants_live: [
      pc("tam", { faction_id: "p", hp: 20, max_hp: 20, initiative: 12, position: { x: 1, y: 1 }, ...over }),
      combatant("victim", { monster_id: "m-ox", faction_id: "m", hp: 40, max_hp: 40, ac: "13", initiative: 5, position: { x: 2, y: 1 } }),
    ],
  });
}
const tamTurn = (over: Record<string, unknown> = {}) => takeTurn({ instanceId: "tam", ...over });

describe("take_turn plays an ally", () => {
  // SRD 5.1 "Making an Attack": attack bonus = ability modifier + proficiency bonus (Strength 16 is +3, proficiency +2, so +5);
  // damage is the weapon's die plus the same modifier (1d8+3). d20 8 + 5 = 13 meets the ox's AC 13; a 4 on the d8 deals 7 (40 -> 33).
  // Bug caught: an ally refused for having no stat block, or built with no weapon so it only punched.
  it("fails if an ally holding a longsword does not attack by its sheet's bonus and weapon", async () => {
    const h = harness(allyFight(), { sources: SOURCES, players: tamSheets(), map: mapOf(), dieFaces: [8, 4] });
    const result = await runBatch(batch("b", tamTurn()), h.deps);
    expect(result.effects[0]).toMatchObject({ type: "turn_taken", turn: { instanceId: "tam", optionId: "attack:actions:Longsword:victim", kind: "attack" } });
    expect(h.posted.map((p) => p.result.total)).toEqual([13, 7]);
    expect(hpOf(stored(h), "victim")).toBe(33);
    expect(combatantOf(stored(h), "tam").action_used).toBe(true);
  });

  // Bug caught: an ally with nothing in hand being offered no attack at all. Unarmed Strike: Strength 3 + proficiency 2 = +5, and
  // 1 + Strength modifier = 4 damage (SRD 5.1 "Unarmed Strike"). d20 8 + 5 = 13 hits AC 13: 40 -> 36.
  it("fails if an ally with no weapon does not make an Unarmed Strike", async () => {
    const h = harness(allyFight(), { sources: SOURCES, players: tamSheets({ bare: true }), map: mapOf(), dieFaces: [8] });
    const result = await runBatch(batch("b", tamTurn()), h.deps);
    expect(result.effects[0]).toMatchObject({ turn: { optionId: "attack:actions:Unarmed Strike:victim" } });
    expect(hpOf(stored(h), "victim")).toBe(36);
  });

  // Bug caught: the improvised-weapon row (no proficiency, any object) offered as a swing the character never holds.
  it("fails if an ally is offered an Improvised Weapon attack", async () => {
    const h = harness(allyFight(), { sources: SOURCES, players: tamSheets(), map: mapOf(), dieFaces: [] });
    await expect(runBatch(batch("b", tamTurn({ optionId: "attack:actions:Improvised Weapon:victim" })), h.deps)).rejects.toMatchObject({ message: "That option is not on offer." });
  });

  // App convention: allies never flee. Bug caught: the foes' flee option (a Dash away, off the map) offered to a party member.
  it("fails if an ally can be made to flee", async () => {
    const h = harness(allyFight(), { sources: SOURCES, players: tamSheets(), map: mapOf(), dieFaces: [] });
    await expect(runBatch(batch("b", tamTurn({ optionId: "flee" })), h.deps)).rejects.toMatchObject({ status: 400, message: "That option is not on offer." });
  });

  // App convention: a foe at a quarter of its hit points breaks and retreats; an ally never does. Tam is at 1 of 20 and still swings.
  // d20 8 + 5 = 13 hits; a 4 deals 7. Bug caught: the temper rules (morale) applied to a party member, who then dodged instead of fighting.
  it("fails if a badly hurt ally retreats instead of fighting on", async () => {
    const h = harness(allyFight({ hp: 1 }), { sources: SOURCES, players: tamSheets(), map: mapOf(), dieFaces: [8, 4] });
    const result = await runBatch(batch("b", tamTurn()), h.deps);
    expect(result.effects[0]).toMatchObject({ turn: { kind: "attack" } });
    expect(hpOf(stored(h), "victim")).toBe(33);
  });

  // Bug caught: a Wild Shaped character whose form's block was not read played as if in their own body, swinging a sword the
  // beast cannot hold. With nothing known of the form the server plays nobody.
  it("fails if a Wild Shaped ally whose form was not read is played from its own sheet", async () => {
    const h = harness(allyFight(), { sources: SOURCES, players: tamSheets({ wildshape: true }), map: mapOf(), dieFaces: [] });
    await expect(runBatch(batch("b", tamTurn()), h.deps)).rejects.toMatchObject({ status: 400, message: expect.stringMatching(/no stat block/) });
  });

  // PHB 2014 "Wild Shape": the beast's game statistics replace the character's, so it attacks with the beast's own actions. The bear's
  // Claws are +6 for 1d8+4: d20 8 + 6 = 14 meets AC 13, and a 5 on the d8 deals 9 (40 -> 31). Bug caught: a form refused, or played
  // with the character's own sheet (Tam's Strength 16 and longsword would give +5 and 1d8+3).
  it("fails if a Wild Shaped ally does not attack with the form's own actions", async () => {
    const h = harness(allyFight(), { sources: SOURCES, players: tamSheets({ wildshape: true, bear: true }), map: mapOf(), dieFaces: [8, 5] });
    const result = await runBatch(batch("b", tamTurn()), h.deps);
    expect(result.effects[0]).toMatchObject({ turn: { optionId: "attack:actions:Claws:victim", kind: "attack" } });
    expect(h.posted.map((p) => p.result.total)).toEqual([14, 9]);
    expect(hpOf(stored(h), "victim")).toBe(31);
  });

  // Bug caught: the character's own weapons left on offer in the form, so a bear could be told to swing a longsword.
  it("fails if a Wild Shaped ally is offered the weapons of its own body", async () => {
    const h = harness(allyFight(), { sources: SOURCES, players: tamSheets({ wildshape: true, bear: true }), map: mapOf(), dieFaces: [] });
    await expect(runBatch(batch("b", tamTurn({ optionId: "attack:actions:Longsword:victim" })), h.deps)).rejects.toMatchObject({ message: "That option is not on offer." });
  });

  // Bug caught: a form's attack spending the character's ammunition or throwing their dagger (a beast's attacks use nothing up).
  it("writes nothing to the inventory for a Wild Shaped ally's attack", async () => {
    const h = harness(allyFight(), { sources: SOURCES, players: tamSheets({ wildshape: true, bear: true, gear: [SHORTBOW_HELD, ARROWS_ON_BELT] }), map: mapOf(), dieFaces: [8, 5] });
    await runBatch(batch("b", tamTurn()), h.deps);
    expect(h.gearWrites).toEqual([]);
    expect(h.drops).toEqual([]);
  });

  // SRD 5.1 "Death Saving Throws": 10 or more is a success, below 10 a failure, a natural 1 counts as two failures, a natural 20 puts
  // the character back up at 1 hit point. Three of either ends it (stable, dead). Bug caught: a downed ally refused, or the roll
  // not written to the combatant.
  it.each([
    { d20: 10, saves: { successes: 0, failures: 0 }, after: { successes: 1, failures: 0 }, status: "dying" },
    { d20: 9, saves: { successes: 0, failures: 0 }, after: { successes: 0, failures: 1 }, status: "dying" },
    { d20: 1, saves: { successes: 0, failures: 0 }, after: { successes: 0, failures: 2 }, status: "dying" },
    { d20: 12, saves: { successes: 2, failures: 1 }, after: { successes: 3, failures: 1 }, status: "stable" },
    { d20: 5, saves: { successes: 0, failures: 2 }, after: { successes: 0, failures: 3 }, status: "dead" },
  ])("rolls a death save of $d20 for a downed ally: $status", async ({ d20, saves, after, status }) => {
    const h = harness(allyFight({ hp: 0, death_saves: saves, conditions: [{ name: "Unconscious" }] }), { sources: SOURCES, players: tamSheets(), map: mapOf(), dieFaces: [d20] });
    const result = await runBatch(batch("b", tamTurn()), h.deps);
    expect(result.effects).toEqual([expect.objectContaining({ type: "turn_taken", turn: expect.objectContaining({ kind: "death_save", deathSave: expect.objectContaining({ d20, status }) }) })]);
    const tam = combatantOf(stored(h), "tam");
    expect(tam.death_saves).toEqual(after);
    expect(tam.hp).toBe(0);
    expect(tam.conditions).toEqual([{ name: "Unconscious" }]);
    expect(hpOf(stored(h), "victim")).toBe(40);
  });

  it("puts an ally back up at 1 hit point, no longer Unconscious, on a natural 20", async () => {
    const h = harness(allyFight({ hp: 0, death_saves: { successes: 1, failures: 2 }, conditions: [{ name: "Unconscious" }] }), { sources: SOURCES, players: tamSheets(), map: mapOf(), dieFaces: [20] });
    const result = await runBatch(batch("b", tamTurn()), h.deps);
    expect(result.effects[0]).toMatchObject({ turn: { kind: "death_save", deathSave: { d20: 20, status: "up" } } });
    const tam = combatantOf(stored(h), "tam");
    expect(tam).toMatchObject({ hp: 1, death_saves: { successes: 0, failures: 0 }, conditions: [] });
  });

  // Bug caught: a stable or dead character rolling again (a stable one has no turn; neither does a dead one).
  it.each([{ successes: 3, failures: 0 }, { successes: 0, failures: 3 }])("refuses the turn of an ally who is already %j", async (saves) => {
    const h = harness(allyFight({ hp: 0, death_saves: saves }), { sources: SOURCES, players: tamSheets(), map: mapOf(), dieFaces: [15] });
    await expect(runBatch(batch("b", tamTurn()), h.deps)).rejects.toMatchObject({ status: 400, message: "tam is at 0 hit points and cannot take a turn." });
    expect(h.dieCalls).toBe(0);
    expect(h.saves).toBe(0);
  });

  // A death save is a roll like any other the server throws: it reaches the campaign log, stamped as the server's. Bug caught:
  // the roll thrown and applied but never posted, so the table's log shows nothing for it.
  it("posts a downed ally's death save to the log, stamped server-rolled", async () => {
    const h = harness(allyFight({ hp: 0 }), { sources: SOURCES, players: tamSheets(), map: mapOf(), dieFaces: [14] });
    await runBatch(batch("b", tamTurn()), h.deps);
    expect(h.posted).toHaveLength(1);
    expect(h.posted[0]).toMatchObject({ speaker: "tam", serverRolled: true, result: { total: 14, label: expect.stringMatching(/Death save/) } });
    expect(h.dieCalls).toBe(1);
  });

  // Bug caught: death saves handed to a monster at 0 hit points (only a party member dies by the death-save rules).
  it("still refuses the turn of a monster at 0 hit points", async () => {
    const h = harness(duel({ wolf: { hp: 0 } }), { sources: SOURCES, map: mapOf(), dieFaces: [15] });
    await expect(runBatch(batch("b", takeTurn()), h.deps)).rejects.toMatchObject({ status: 400, message: "wolf is at 0 hit points and cannot take a turn." });
    expect(h.dieCalls).toBe(0);
  });
});

// ── what an ally's ranged attacks use up (#1021) ────────────────────────────────────

/** Tam at (1,1) and the victim 25 feet off at (6,1): far enough that a ranged attack has no foe beside the archer and is in normal range. */
function archerFight() {
  return row({
    combatants_live: [
      pc("tam", { faction_id: "p", hp: 20, max_hp: 20, initiative: 12, position: { x: 1, y: 1 } }),
      combatant("victim", { monster_id: "m-ox", faction_id: "m", hp: 40, max_hp: 40, ac: "13", initiative: 5, position: { x: 6, y: 1 } }),
    ],
  });
}
const SHOOT = "attack:actions:Shortbow:victim";
const THROW = "attack:actions:Dagger (thrown):victim";

describe("take_turn: an ally's ammunition and thrown weapons", () => {
  // PHB 2014 "Ammunition": each shot uses up a piece of ammunition. Twenty arrows on the belt, one shot: nineteen, written after the
  // fight is saved. Dexterity 10 gives +0, proficiency +2: d20 15 + 2 = 17 hits AC 13. Bug caught: a shot that costs nothing.
  it("fails if a shot does not use up one arrow, written after the save", async () => {
    const h = harness(archerFight(), { sources: SOURCES, players: tamSheets({ gear: [SHORTBOW_HELD, ARROWS_ON_BELT], items: [SHORTBOW] }), map: mapOf(), dieFaces: [15, 4] });
    const result = await runBatch(batch("b", tamTurn({ optionId: SHOOT })), h.deps);
    expect(result.effectFailures).toEqual([]);
    expect(hpOf(stored(h), "victim")).toBe(36);
    expect(h.gearWrites).toEqual([[{ kind: "quantity", inventoryId: "inv-arrows", quantity: 19 }]]);
    expect(h.log.indexOf("save")).toBeLessThan(h.log.indexOf("gear"));
  });

  // Bug caught: a miss costing nothing (the arrow flies either way).
  it("uses up the arrow on a miss too", async () => {
    const h = harness(archerFight(), { sources: SOURCES, players: tamSheets({ gear: [SHORTBOW_HELD, ARROWS_ON_BELT], items: [SHORTBOW] }), map: mapOf(), dieFaces: [3] });
    await runBatch(batch("b", tamTurn({ optionId: SHOOT })), h.deps);
    expect(hpOf(stored(h), "victim")).toBe(40);
    expect(h.gearWrites).toEqual([[{ kind: "quantity", inventoryId: "inv-arrows", quantity: 19 }]]);
  });

  // Bug caught: the last arrow leaving a row of nothing in the pack instead of taking the row away (the browser removes it).
  it("removes the stack when its last arrow is shot", async () => {
    const h = harness(archerFight(), { sources: SOURCES, players: tamSheets({ gear: [SHORTBOW_HELD, arrows(1)], items: [SHORTBOW] }), map: mapOf(), dieFaces: [3] });
    await runBatch(batch("b", tamTurn({ optionId: SHOOT })), h.deps);
    expect(h.gearWrites).toEqual([[{ kind: "remove", inventoryId: "inv-arrows" }]]);
  });

  // Bug caught: an archer with an empty quiver still offered the shot (and so shooting arrows it does not have).
  it("fails if an ally with no arrows is offered the shot", async () => {
    const h = harness(archerFight(), { sources: SOURCES, players: tamSheets({ gear: [SHORTBOW_HELD], items: [SHORTBOW] }), map: mapOf(), dieFaces: [] });
    await expect(runBatch(batch("b", tamTurn({ optionId: SHOOT })), h.deps)).rejects.toMatchObject({ message: "That option is not on offer." });
    expect(h.gearWrites).toEqual([]);
  });

  // Bug caught: a melee swing spending ammunition (only an attack with an ammunition weapon uses it up).
  it("writes nothing for a melee attack by an ally who carries a bow", async () => {
    const h = harness(allyFight(), { sources: SOURCES, players: tamSheets({ gear: [SHORTBOW_HELD, ARROWS_ON_BELT], items: [SHORTBOW] }), map: mapOf(), dieFaces: [8] });
    await runBatch(batch("b", tamTurn({ optionId: "attack:actions:Unarmed Strike:victim" })), h.deps);
    expect(h.gearWrites).toEqual([]);
  });

  // PHB 2014 "Thrown": the weapon leaves the hand. Two daggers: one stack row of two becomes one, and one lies on the ground, posted as the
  // thrower's chat drop. Bug caught: a throw that leaves the dagger in hand, or one that never reaches the ground.
  it("fails if a thrown dagger does not leave the stack and lie on the ground", async () => {
    const h = harness(archerFight(), { sources: SOURCES, players: tamSheets({ gear: [daggers(2)], items: [DAGGER] }), map: mapOf(), dieFaces: [15, 2] });
    const result = await runBatch(batch("b", tamTurn({ optionId: THROW })), h.deps);
    expect(result.effectFailures).toEqual([]);
    expect(h.drops).toEqual([{ drop: expect.objectContaining({ name: "Dagger", itemRef: "dagger", rarity: "mundane" }), memberId: "pm-tam", speaker: "tam" }]);
    expect(h.gearWrites).toEqual([[{ kind: "quantity", inventoryId: "inv-dagger", quantity: 1 }]]);
    expect(h.log.indexOf("drop")).toBeLessThan(h.log.indexOf("gear"));
  });

  // Bug caught: the last dagger thrown leaving an empty row the next turn would offer a stab with.
  it("removes the row when the last dagger is thrown", async () => {
    const h = harness(archerFight(), { sources: SOURCES, players: tamSheets({ gear: [daggers(1)], items: [DAGGER] }), map: mapOf(), dieFaces: [3] });
    await runBatch(batch("b", tamTurn({ optionId: THROW })), h.deps);
    expect(h.gearWrites).toEqual([[{ kind: "remove", inventoryId: "inv-dagger" }]]);
  });

  // Bug caught: a weapon lost from the character's hands for a drop that never reached the chat (the browser posts first, spends after).
  it("keeps the dagger in the stack when the drop could not be posted", async () => {
    const h = harness(archerFight(), { sources: SOURCES, players: tamSheets({ gear: [daggers(2)], items: [DAGGER] }), map: mapOf(), dieFaces: [3], dropFails: true });
    const result = await runBatch(batch("b", tamTurn({ optionId: THROW })), h.deps);
    expect(result.effectFailures).toEqual([expect.stringMatching(/^thrown_drop: chat is down/)]);
    expect(h.gearWrites).toEqual([]);
  });

  // Bug caught: a stab with the dagger throwing it (only the thrown attack leaves the hand).
  it("fails if stabbing with a dagger puts it on the ground", async () => {
    const h = harness(allyFight(), { sources: SOURCES, players: tamSheets({ gear: [daggers(1)], items: [DAGGER] }), map: mapOf(), dieFaces: [3] });
    await runBatch(batch("b", tamTurn({ optionId: "attack:actions:Dagger:victim" })), h.deps);
    expect(h.drops).toEqual([]);
    expect(h.gearWrites).toEqual([]);
  });

  // Bug caught: two shots of one request each writing "one fewer than the stack began with" (the second must find what the first left):
  // two arrows, two shots, so the stack goes to one and then away, not to one twice.
  it("fails if two shots in one request are each counted from the full stack", async () => {
    const h = harness(archerFight(), { sources: SOURCES, players: tamSheets({ gear: [SHORTBOW_HELD, arrows(2)], items: [SHORTBOW] }), map: mapOf(), dieFaces: [3, 3] });
    await runBatch(batch("b", tamTurn({ optionId: SHOOT }), { type: "set_action_used", instanceId: "tam", used: false }, tamTurn({ optionId: SHOOT })), h.deps);
    expect(h.gearWrites).toEqual([[{ kind: "quantity", inventoryId: "inv-arrows", quantity: 1 }], [{ kind: "remove", inventoryId: "inv-arrows" }]]);
  });

  // The fight saved after another writer got in is run again; only the attempt that was saved writes. Bug caught: the arrow spent
  // once for the attempt that was thrown away and once for the one that stood.
  it("writes an arrow's cost once when the first attempt was not the one saved", async () => {
    const h = harness(archerFight(), { sources: SOURCES, players: tamSheets({ gear: [SHORTBOW_HELD, ARROWS_ON_BELT], items: [SHORTBOW] }), map: mapOf(), dieFaces: [3, 3] });
    h.rival.run = rivalEdit(h, () => {});
    await runBatch(batch("b", tamTurn({ optionId: SHOOT })), h.deps);
    expect(h.saves).toBe(2);
    expect(h.gearWrites).toHaveLength(1);
  });
});
