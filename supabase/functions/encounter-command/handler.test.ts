/**
 * The handler against an in-memory store with the database's own version rule:
 * `saveFight` writes only when the version still matches, and bumps it by one.
 * Every expected value is worked out from the rules in the comment above it.
 */
import { describe, expect, it } from "vitest";
import type { EncounterEvent, RunCombatant } from "../../../src/types/encounter.types";
import type { PartyIngestRow } from "../../../src/rules/fight/partyIngest";
import type { Monster, MonsterStatBlock } from "../../../src/types/monster.types";
import { emptyDefenses, type StatBlockEntry } from "../../../src/types/statBlock.types";
import { NO_CASTING, type PlayerSheets } from "../../../src/rules/fight/playerSheet";
import type { GearWrite, ThrownDrop } from "../../../src/rules/fight/pcAttacks/gear";
import type { FightMap } from "../../../src/rules/fight/terrain/battleMap";
import { occluders } from "../../../src/lib/battlemap/occlusion";
import type { Item } from "../../../src/types/item.types";
import type { PartyInventoryItem } from "../../../src/types/inventory.types";
import type { SpellSlotEntry } from "../../../src/types/party.types";
import type { StoredClassResources } from "../../../src/rules/features/characterFeatures";
import type { CharacterClass } from "../../../src/types/multiclass.types";
import type { AllySpellRow } from "../../../src/rules/fight/playerSheet";
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
import { blackTentacles, charmMonster, clericBlock, cureWounds, fear, fireBolt, fireball, holdPerson, holdPersonEffect, mageBlock, mageWithCharm, mageWithFear, mageWithHold, mageWithTentacles, healingWord, massHealingWord, heal, massHeal, powerWordHeal, bless, shieldOfFaith, shield, counterspell } from "../../../src/rules/fight/spells/spellTestKit";
import type { SpellRecord } from "../../../src/rules/fight/spells/spellChoice";
import { ownRecord } from "../_shared/fightSpells";
import type { AppliedCondition } from "../../../src/types/condition.types";
import type { ExploreParty } from "../../../src/types/exploreParty.types";
import { hiddenCondition } from "../../../src/rules/fight/stances";

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
  /** The spell slot lists written to allies' sheets after their casts, in order. */
  slotWrites: Array<{ memberId: string; slots: SpellSlotEntry[] }>;
  /** The uses left written to allies' innate spell rows after their casts, in order. */
  innateWrites: Array<{ memberId: string; spellRowId: string; remaining: number }>;
  /** The `class_resources` written to allies' sheets after their class features were used, in order. */
  resourceWrites: Array<{ memberId: string; resources: StoredClassResources }>;
  /** How many times the server threw a die. */
  dieCalls: number;
  /** The size of each die it threw, in order (20 for a d20). */
  dieSides: number[];
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
  /** The `playedMemberId` of each roster the server built (null for the DM's own fight): only a fresh open builds one. */
  rosterAsks: Array<string | null>;
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
    /** The party members the AI may play in the DM's own fight (consented and switched on). */
    standIns?: string[];
    /** A drop of a thrown weapon that fails (the chat could not be written to). */
    dropFails?: boolean;
    /** A write of an ally's spell slots that fails. */
    slotsFail?: boolean;
    /** A write of an ally's innate spell uses that fails. */
    innateFail?: boolean;
    /** A write of an ally's class resources that fails. */
    resourcesFail?: boolean;
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
    /** The roster `buildRoster` answers with; the standard one when absent. */
    roster?: { combatants: RunCombatant[]; legendaryCaps?: Record<string, number> };
    /** The party members `buildRoster` accepts as the played one; any when absent. */
    activeMembers?: string[];
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
    slotWrites: [],
    resourceWrites: [],
    innateWrites: [],
    dieCalls: 0,
    dieSides: [],
    playerLoads: [],
    mapLoads: 0,
    spellReads: [],
    spellListedReads: [],
    rival: { run: null, always: false },
    noteAsks: [],
    noteCosts: [],
    xpAwards: [],
    rosterAsks: [],
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
    async buildRoster(playedMemberId) {
      // The loader's own refusal of a character who is not an active member of the campaign's party.
      if (playedMemberId !== null && options.activeMembers !== undefined && !options.activeMembers.includes(playedMemberId)) {
        throw new FightCommandError(400, "open: playedMemberId is not an active member of this campaign's party.");
      }
      h.rosterAsks.push(playedMemberId);
      const built = options.roster ?? { combatants: roster() };
      return structuredClone({ combatants: built.combatants, legendaryCaps: built.legendaryCaps ?? {} });
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
      return structuredClone(options.players ?? { members: [], inventory: [], items: [], beasts: [], casting: NO_CASTING });
    },
    async loadStandIns() {
      // Unless a test names the stand-ins, every character whose sheet it supplies is one the AI may play: most tests are about what the AI does.
      return new Set(options.standIns ?? (options.players?.members ?? []).map((m) => m.id));
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
    async writeClassResources(memberId, resources) {
      if (options.resourcesFail) throw new Error("sheet is down");
      h.log.push("resources");
      h.resourceWrites.push({ memberId, resources: structuredClone(resources) });
    },
    async writeInnateUses(memberId, spellRowId, remaining) {
      if (options.innateFail) throw new Error("sheet is down");
      h.log.push("innate");
      h.innateWrites.push({ memberId, spellRowId, remaining });
    },
    async writeSpellSlots(memberId, slots) {
      if (options.slotsFail) throw new Error("sheet is down");
      h.log.push("slots");
      h.slotWrites.push({ memberId, slots: structuredClone(slots) });
    },
    rollDie(sides: number) {
      h.dieCalls += 1;
      h.dieSides.push(sides);
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
    const result = await runBatch(batch("o1", { type: "open" }), h.deps);
    // A new fight is round 0, turn 0, saved but not shown to players, with this batch remembered.
    expect(stored(h)).toMatchObject({ current_round: 0, active_combatant_index: 0, is_running: false, ended_at: null, applied_command_ids: ["o1"] });
    expect(stored(h).combatants_live.map((c) => c.instance_id)).toEqual(["nessa", "goblin"]);
    expect(result).toMatchObject({ applied: true, version: 1, is_running: false, ended_at: null });
  });

  it("fails if open primes no legendary pool when caps are given", async () => {
    const h = harness(null, { roster: { combatants: roster(), legendaryCaps: { goblin: 3 } } });
    await runBatch(batch("o1", { type: "open" }), h.deps);
    expect(stored(h).combatants_live.find((c) => c.instance_id === "goblin")).toMatchObject({ legendary_action_cap: 3, legendary_actions_remaining: 3 });
  });

  it("fails if a second open resets a fight that is under way (a reload must not wipe the damage)", async () => {
    const h = harness(null);
    await runBatch(batch("o1", { type: "open" }), h.deps);
    await runBatch(batch("d1", { type: "adjust_hp", instanceId: "goblin", delta: -3 }), h.deps);
    const before = structuredClone(stored(h));
    const again = await runBatch(batch("o2", { type: "open" }), h.deps);
    // The goblin took 3 of its 7 and still has 4; nothing was written, so the version and the id list stand.
    expect(hpOf(again.state, "goblin")).toBe(4);
    expect(again.applied).toBe(false);
    expect(stored(h)).toEqual(before);
  });

  // Bug: a resume (a reload, a second device) building the roster again: a database read per reload, and a roster nobody asked for.
  it("fails if opening a fight that is under way builds a roster", async () => {
    const h = harness(opened({ combatants_live: [pc("nessa")] }));
    const result = await runBatch(batch("o2", { type: "open", playedMemberId: "nessa" }), h.deps);
    expect(result.applied).toBe(false);
    expect(h.rosterAsks).toEqual([]);
  });

  // Bug: the played member dropped on the way, so the AI table's fight is fielded as the DM's own (everyone's sheet, no bystanders).
  it("fails if a fresh open does not ask for the roster of the played member", async () => {
    const h = harness(null, { activeMembers: ["nessa"] });
    await runBatch(batch("o1", { type: "open", playedMemberId: "nessa" }), h.deps);
    expect(h.rosterAsks).toEqual(["nessa"]);
    const dm = harness(null);
    await runBatch(batch("o4", { type: "open" }), dm.deps);
    expect(dm.rosterAsks).toEqual([null]);
  });

  // Bug: an open for a character who is not in this party creating a fight anyway.
  it("fails if an open naming a character outside the party writes a fight", async () => {
    const h = harness(null, { activeMembers: ["nessa"] });
    await expect(runBatch(batch("o1", { type: "open", playedMemberId: "stranger" }), h.deps)).rejects.toMatchObject({ status: 400 });
    expect(h.store.row).toBeNull();
    expect(h.saves).toBe(0);
  });

  // Bug: the 60-combatant ceiling lost when the roster stopped coming from the caller: a built roster of any size was saved.
  it("fails if a built roster of 61 combatants, or of none, is saved", async () => {
    const many = Array.from({ length: 61 }, (_, i) => combatant(`g${i}`, { hp: 1, max_hp: 1 }));
    for (const combatants of [many, []]) {
      const h = harness(null, { roster: { combatants } });
      await expect(runBatch(batch("o1", { type: "open" }), h.deps)).rejects.toMatchObject({ status: 400 });
      expect(h.store.row).toBeNull();
    }
    const sixty = harness(null, { roster: { combatants: many.slice(0, 60) } });
    await runBatch(batch("o1", { type: "open" }), sixty.deps);
    expect(stored(sixty).combatants_live).toHaveLength(60);
  });

  it("fails if open on an ended fight carries anything of the old one over", async () => {
    const old = row({
      ended_at: "2026-11-14T10:00:00.000Z", current_round: 4, active_combatant_index: 1, events_fired: ["r2"], lair_fired_rounds: [20],
      applied_command_ids: ["old-1"], combatants_live: [combatant("ogre", { hp: 0, max_hp: 59 })],
    });
    const h = harness(old);
    const result = await runBatch(batch("o9", { type: "open" }), h.deps);
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
      const h = harness(row({ ended_at: "2026-11-14T10:00:00.000Z" }), { xpLevelling: true, roster: { combatants: [pc("nessa")] } });
      await runBatch(batch("o1", { type: "open" }), h.deps);
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

  it("refuses a lifecycle command mixed with another, and an open naming a malformed played member", () => {
    const send = (commands: unknown[]) => () => validateRequest({ encounterId: "e", batchId: "b", commands });
    expect(send([{ type: "abandon" }, { type: "next_turn" }])).toThrow(FightCommandError);
    expect(send([{ type: "next_turn" }, { type: "end_combat" }])).toThrow(FightCommandError);
    expect(send([{ type: "go_live", sessionId: null }, { type: "go_live", sessionId: null }])).toThrow(FightCommandError);
    expect(send([{ type: "go_live" }])).toThrow(FightCommandError);
    expect(send([{ type: "open", playedMemberId: "" }])).toThrow(FightCommandError);
    expect(send([{ type: "open", playedMemberId: 7 }])).toThrow(FightCommandError);
    expect(send([{ type: "open", playedMemberId: "x".repeat(101) }])).toThrow(FightCommandError);
    expect(send([{ type: "open", playedMemberId: "x".repeat(100) }])).not.toThrow();
    expect(send([{ type: "open" }])).not.toThrow();
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
    str: 10, dex: 14, con: 14, int: 10, wis: 10, cha: 10, proficiency_bonus: 2, saving_throw_proficiencies: ["con"], wildshape_state: null, speed: 30, level: 1, custom_attacks: [], spell_slots: [],
  }],
  inventory: [wornRow("chain", "body"), wornRow("shield", "off_hand")],
  items: [CHAIN_MAIL, SHIELD],
  beasts: [], casting: NO_CASTING,
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

  // PHB "Bless": the d4 is the Blessed creature's own die, rolled after the d20. A person who rolled the save gave the d20 only, so the
  // server rolls the d4: 11 (theirs) + 1 (the server's) = 12 < DC 14 fails, and the other takes the full 7 (40 -> 33). Bug caught: the
  // person's 11 read again as the d4's face, 11 + 11 = 22, a save that should have failed.
  it("fails if a person's save face is read as a Blessed creature's d4", async () => {
    const fight = arena();
    fight.combatants_live.push(combatant("other", { monster_id: "m-ox", hp: 40, max_hp: 40, initiative: 3, conditions: [{ name: "Bless", grants: { attack: "1d4", save: "1d4" } }] }));
    const h = harness(fight, { sources: SOURCES, dieFaces: [5, 1, 3, 4] });
    await runBatch(
      batch("b", { type: "resolve_save", attackerId: "wolf", list: "actions", action: "Burst", targetIds: ["victim", "other"], faces: { saves: [null, [11]] } }),
      h.deps,
    );
    expect(hpOf(stored(h), "other")).toBe(33);
    expect(h.posted.map((p) => [p.speaker, p.serverRolled])).toEqual([["victim", true], ["other", false], ["other", true], ["wolf", true]]);
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
      // Every player here is a stand-in, so the refusal tested is the one about the sheet, not about consent.
      const h = harness(fight, { sources: SOURCES, map: mapOf(), dieFaces: [9, 5], standIns: ["pm-nessa"] });
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
    const h = harness(fight, { sources: SOURCES, players: NESSA_IN_PLATE, map: mapOf(), dieFaces: [], standIns: [] });
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

  // #1021 row 26: in a DM's fight a stand-in strikes a foe leaving her reach by the rules (same numbers as the AI table's ally: d20 11 + 2
  // meets the wolf's AC 13), and a human player in the same fight is only reported. Bug caught: the stand-in watching the foe walk away,
  // or a person's Reaction taken for them.
  it("fails if a stand-in does not strike a leaving foe in a DM's fight, or a human player is struck for", async () => {
    const fight = () => duel({ wolf: { hp: 2, position: { x: 1, y: 0 } }, victim: { position: { x: 30, y: 30 } }, extra: [nessa({ position: { x: 1, y: 1 } })] });
    const stand = harness(fight(), { sources: SOURCES, players: NESSA_IN_PLATE, map: mapOf(), dieFaces: [11], standIns: ["pm-nessa"] });
    const struck = await runBatch(batch("b1", takeTurn()), stand.deps);
    expect(struck.effects.some((e) => e.type === "provoked_player")).toBe(false);
    expect(struck.effects.find((e) => e.type === "opportunity")).toMatchObject({ attackerId: "nessa", targetId: "wolf" });
    expect(combatantOf(stored(stand), "nessa").reactionUsed).toBe(true);
    const person = harness(fight(), { sources: SOURCES, players: NESSA_IN_PLATE, map: mapOf(), dieFaces: [], standIns: [] });
    const reported = await runBatch(batch("b2", takeTurn()), person.deps);
    expect(reported.effects.find((e) => e.type === "provoked_player")).toMatchObject({ playerId: "nessa" });
    expect(person.dieCalls).toBe(0);
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

  // Rule 11, moving for a better cast. The mage (speed 30 ft) is at (1,1) and the ox at (12,1): 10 squares of gap, 55 ft, outside a 30 ft Fire Bolt (gap 5 squares at most).
  // It must stand at x >= 6 (12 - 6 - 1 = 5): a 25 ft walk, within its 30 ft. Every square of column 6 with |y - 1| <= 5 costs 25 ft (diagonals are 5 ft) and is 30 ft
  // from the ox; the straight walk, nearest its start as the crow flies, is (6,1). The cast is made from there: the bolt hits (15 + 6 = 21 against AC 13) and the mage's position is the destination.
  // Bug caught: the walk is chosen but the saved position stays where the mage was (the cast is then rolled from the old square), or no walk is offered and the mage does nothing.
  it("fails if a mage out of range does not walk, then cast, and end the turn on the square it walked to", async () => {
    const fight = row({
      combatants_live: [
        combatant("mage", { monster_id: "m-mage", faction_id: "m", hp: 40, max_hp: 40, initiative: 12, position: { x: 1, y: 1 } }),
        combatant("t1", { monster_id: "m-ox", faction_id: "p", hp: 40, max_hp: 40, ac: "13", initiative: 5, position: { x: 12, y: 1 } }),
      ],
    });
    const h = harness(fight, { sources: MAGE_SOURCES, map: mapOf(), spells: [fireBolt({ range: "30 feet" })], dieFaces: [15, 3, 4, 1, 1, 1, 1] });
    const result = await runBatch(batch("b", takeTurn({ instanceId: "mage" })), h.deps);
    const after = stored(h);
    expect(result.effects[0]).toMatchObject({ type: "turn_taken", turn: { kind: "spell", picked: "rules", summary: "Walk 25 ft and cast Fire Bolt at t1" } });
    expect(by(after, "mage").position).toEqual({ x: 6, y: 1 });
    expect(hpOf(after, "t1")).toBeLessThan(40);
    expect(by(after, "mage").action_used).toBe(true);
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
      str: 16, dex: 10, con: 12, int: 10, wis: 10, cha: 10, proficiency_bonus: 2, saving_throw_proficiencies: [], speed: 30, level: 1, custom_attacks: [], spell_slots: [],
      wildshape_state: over.wildshape ? { monster_id: "m-bear", beast_name: "Brown Bear", beast_image_url: null, beast_hp: 34, beast_max_hp: 34, beast_ac: "11", beast_dex: 10 } : null,
    }],
    inventory: over.gear ?? (over.bare ? [] : [heldSword]),
    items: over.items ?? (over.bare ? [] : [LONGSWORD]),
    beasts: over.bear ? [{ id: "m-bear", stat_block: { str: 19, dex: 10, con: 16, speed: "40 ft.", actions: [BEAR_CLAWS] } }] : [], casting: NO_CASTING,
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

  // #1021 row 26: in a DM's own fight the AI plays only a character whose player consented and whose DM switched it on. Tam's turn
  // (Longsword +5 vs AC 13, d20 8 = 13 hits, d8 4 + 3 = 7: 40 -> 33) is played for a stand-in. Bug caught: a stand-in left unplayed.
  it("plays a stand-in's turn in a DM's fight by its sheet", async () => {
    const h = harness(allyFight(), { sources: SOURCES, players: tamSheets(), map: mapOf(), dieFaces: [8, 4], standIns: ["pm-tam"] });
    await runBatch(batch("b", tamTurn()), h.deps);
    expect(hpOf(stored(h), "victim")).toBe(33);
  });

  // Bug caught: a DM's take_turn playing a person whose player never let the AI (or whose DM did not switch it on), and writing the fight.
  it("refuses a player who is not a stand-in, naming them, and writes nothing", async () => {
    const h = harness(allyFight(), { sources: SOURCES, players: tamSheets(), map: mapOf(), dieFaces: [8, 4], standIns: [] });
    await expect(runBatch(batch("b", tamTurn()), h.deps)).rejects.toMatchObject({ status: 400, message: "tam's player has not let the AI play them." });
    expect(h.saves).toBe(0);
    expect(h.dieCalls).toBe(0);
  });

  // Bug caught: the consent check skipped for a downed player, so a DM's take_turn rolls a death save for a person.
  it("refuses a downed player who is not a stand-in, and rolls their death save when they are one", async () => {
    const downed = () => allyFight({ hp: 0, death_saves: { successes: 0, failures: 0 }, conditions: [{ name: "Unconscious" }] });
    const person = harness(downed(), { sources: SOURCES, players: tamSheets(), map: mapOf(), dieFaces: [10], standIns: [] });
    await expect(runBatch(batch("b", tamTurn()), person.deps)).rejects.toMatchObject({ status: 400 });
    expect(person.dieCalls).toBe(0);
    const stand = harness(downed(), { sources: SOURCES, players: tamSheets(), map: mapOf(), dieFaces: [10], standIns: ["pm-tam"] });
    await runBatch(batch("b", tamTurn()), stand.deps);
    expect(combatantOf(stored(stand), "tam").death_saves).toEqual({ successes: 1, failures: 0 });
  });

  // Bug caught: the AI table's rule changed by the new one: with a playedMemberId named, the played character is still refused nothing
  // here and the stand-in set is not consulted (Tam is no stand-in, yet she plays as an ally of the person who plays someone else).
  it("leaves the AI table alone: a named played member makes every other member the rules' whatever the stand-ins say", async () => {
    const h = harness(allyFight(), { sources: SOURCES, players: tamSheets(), map: mapOf(), dieFaces: [8, 4], standIns: [] });
    await runBatch(batch("b", tamTurn({ playedMemberId: "pm-someone-else" })), h.deps);
    expect(hpOf(stored(h), "victim")).toBe(33);
  });

  // PHB "Bless": a death saving throw is a saving throw. A Blessed Tam rolls 8 and then the d4's 2: 10, a success, and the d4 is
  // posted beside the d20. Bug caught: the boon left off a death save, so the 8 fails.
  it("fails if a Blessed ally's death save does not add the d4", async () => {
    const blessed = [{ name: "Unconscious" }, { name: "Bless", grants: { attack: "1d4", save: "1d4" } }];
    const h = harness(allyFight({ hp: 0, death_saves: { successes: 0, failures: 0 }, conditions: blessed }), { sources: SOURCES, players: tamSheets(), map: mapOf(), dieFaces: [8, 2] });
    const result = await runBatch(batch("b", tamTurn()), h.deps);
    expect(combatantOf(stored(h), "tam").death_saves).toEqual({ successes: 1, failures: 0 });
    expect(result.effects[0]).toMatchObject({ turn: { summary: "tam rolls a death save: 8 + 2 (Bless). Success." } });
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

/** Tam as a level 5 Wizard: Intelligence 16 (+3), proficiency +3, so spell save DC 14 and +6 to hit with spell attacks. */
function wizardTamSheets(over: { slots?: SpellSlotEntry[]; spells?: AllySpellRow[]; bear?: boolean; wildshape?: boolean } = {}): PlayerSheets {
  const base = tamSheets({ bare: true, bear: over.bear, wildshape: over.wildshape });
  const wizard = { id: "cls-wiz", party_member_id: "pm-tam", class_name: "Wizard", class_definition_id: "def-wiz", class_definition_kind: "system", subclass_name: null, subclass_definition_id: null, subclass_variant: null, levels: 5, is_primary: true, hit_dice_used: 0, sort_order: 0, capabilities: [] } as unknown as CharacterClass;
  const grant = (name: string, level: number): AllySpellRow => ({ id: `${name}-row`, party_member_id: "pm-tam", name, level, is_known: true, is_prepared: true, always_prepared: false, source_type: "class", source_class_id: "cls-wiz", casting_ability: null, uses_per_day: null, uses_remaining: null });
  return {
    ...base,
    members: [{ ...base.members[0], int: 16, level: 5, proficiency_bonus: 3, spell_slots: over.slots ?? [{ level: 3, max: 2, used: 0 }] }],
    casting: {
      spells: over.spells ?? [grant("Fire Bolt", 0), grant("Fireball", 3)],
      classes: [wizard],
      definitions: { system: [{ id: "def-wiz", caster_type: "prepared", prepared_ability: "int" }], custom: [], subclasses: [] },
    },
  };
}
const BOLT = "spell:Fire Bolt:0:victim";
const BALL = "spell:Fireball:3:victim";

describe("take_turn: an ally casts the spells their character has ready", () => {
  // SRD 5.1 "Fire Bolt": a ranged spell attack, 1d10 fire; a cantrip costs no slot. The sheet's attack bonus is +6 (3 + 3): d20 10 + 6 = 16
  // meets AC 13, and at 5th level the cantrip is 2d10 (6 + 4 = 10: 40 -> 30). Bug caught: an ally with a spell ready that is only ever offered its fists, or a cantrip that writes a slot.
  it("fails if an ally does not cast a ready cantrip by the sheet's spell attack bonus, or writes a slot for it", async () => {
    const h = harness(archerFight(), { sources: SOURCES, players: wizardTamSheets(), map: mapOf(), spells: [fireBolt(), fireball()], dieFaces: [10, 6, 4] });
    const result = await runBatch(batch("b", tamTurn({ optionId: BOLT })), h.deps);
    expect(result.effects[0]).toMatchObject({ type: "turn_taken", turn: { optionId: BOLT, kind: "spell" } });
    expect(hpOf(stored(h), "victim")).toBe(30);
    expect(h.slotWrites).toEqual([]);
  });

  // SRD 5.1 "Fireball": 8d6, a Dexterity save for half, a 3rd-level slot. The victim fails the save (DC 14 against a d20 of 2), takes
  // 8 dice of 1 = 8 (40 -> 32). One of the two 3rd-level slots is spent: the sheet is written whole, after the fight was saved.
  // Bug caught: a leveled spell cast for free, or its slot written before the save.
  it("fails if a leveled spell does not spend a slot on the sheet, written after the fight is saved", async () => {
    const h = harness(archerFight(), { sources: SOURCES, players: wizardTamSheets(), map: mapOf(), spells: [fireBolt(), fireball()], dieFaces: [2, 1, 1, 1, 1, 1, 1, 1, 1] });
    const result = await runBatch(batch("b", tamTurn({ optionId: BALL })), h.deps);
    expect(result.effectFailures).toEqual([]);
    expect(hpOf(stored(h), "victim")).toBe(32);
    expect(h.slotWrites).toEqual([{ memberId: "pm-tam", slots: [{ level: 3, max: 2, used: 1 }] }]);
    expect(h.log.indexOf("save")).toBeLessThan(h.log.indexOf("slots"));
    expect(combatantOf(stored(h), "tam").action_uses).toEqual({ "slots/3": { used: 1, per_day: 2 } });
  });

  // A second turn: the first Fireball was already written to the sheet (1 of 2 spent) and the fight tallies it (used 1). The slot left
  // is the one slot, not none. Bug caught: the fight's tally subtracted from a sheet that already shows the cast, so the ally on its
  // second turn believed both slots gone and never cast again.
  it("fails if an ally whose first cast is already on its sheet and in the fight's tally cannot cast its last slot", async () => {
    const fight = archerFight();
    fight.combatants_live[0] = { ...fight.combatants_live[0], action_uses: { "slots/3": { used: 1, per_day: 2 } } };
    const h = harness(fight, { sources: SOURCES, players: wizardTamSheets({ slots: [{ level: 3, max: 2, used: 1 }] }), map: mapOf(), spells: [fireBolt(), fireball()], dieFaces: [2, 1, 1, 1, 1, 1, 1, 1, 1] });
    await runBatch(batch("b", tamTurn({ optionId: BALL })), h.deps);
    expect(h.slotWrites).toEqual([{ memberId: "pm-tam", slots: [{ level: 3, max: 2, used: 2 }] }]);
    expect(combatantOf(stored(h), "tam").action_uses).toEqual({ "slots/3": { used: 2, per_day: 2 } });
  });

  // Bug caught: a failed write of the slot undoing the fight, or going unreported.
  it("reports a slot write that failed and keeps the fight", async () => {
    const h = harness(archerFight(), { sources: SOURCES, players: wizardTamSheets(), map: mapOf(), spells: [fireBolt(), fireball()], dieFaces: [2, 1, 1, 1, 1, 1, 1, 1, 1], slotsFail: true });
    const result = await runBatch(batch("b", tamTurn({ optionId: BALL })), h.deps);
    expect(result.effectFailures).toEqual(["ally_spell_slots: sheet is down"]);
    expect(hpOf(stored(h), "victim")).toBe(32);
  });

  // Bug caught: an ally with every 3rd-level slot spent still offered Fireball (it would cast on credit).
  it("fails if an ally with no slot left is offered the leveled spell", async () => {
    const h = harness(archerFight(), { sources: SOURCES, players: wizardTamSheets({ slots: [{ level: 3, max: 2, used: 2 }] }), map: mapOf(), spells: [fireBolt(), fireball()], dieFaces: [] });
    await expect(runBatch(batch("b", tamTurn({ optionId: BALL })), h.deps)).rejects.toMatchObject({ message: "That option is not on offer." });
  });

  // Bug caught: a spell on the sheet that the character has not prepared offered anyway.
  it("fails if an ally is offered a spell it has not prepared", async () => {
    const sheets = wizardTamSheets();
    sheets.casting.spells = sheets.casting.spells.map((g) => (g.name === "Fireball" ? { ...g, is_prepared: false } : g));
    const h = harness(archerFight(), { sources: SOURCES, players: sheets, map: mapOf(), spells: [fireBolt(), fireball()], dieFaces: [] });
    await expect(runBatch(batch("b", tamTurn({ optionId: BALL })), h.deps)).rejects.toMatchObject({ message: "That option is not on offer." });
  });

  // PHB 2014 "Wild Shape": the form casts nothing. Bug caught: a Wild Shaped ally casting from the character's sheet.
  it("fails if a Wild Shaped ally casts", async () => {
    const h = harness(archerFight(), { sources: SOURCES, players: wizardTamSheets({ wildshape: true, bear: true }), map: mapOf(), spells: [fireBolt(), fireball()], dieFaces: [] });
    await expect(runBatch(batch("b", tamTurn({ optionId: BOLT })), h.deps)).rejects.toMatchObject({ message: "That option is not on offer." });
  });
});

// ── healing spells (#1021) ───────────────────────────────────────────────────────────
describe("healing spells in a fight", () => {
  const typed = (id: string, monster_type: string) => ({ id, name: id, monster_type, stat_block: monster(id).stat_block }) as unknown as Monster;
  const spellsLine = (lines: string) => ({
    name: "Spellcasting", structured: { kind: "other" as const, source: "parsed" as const },
    description: `The cleric is a 5th-level spellcaster. Its spellcasting ability is Wisdom (spell save DC 13, +5 to hit with spell attacks). The cleric has the following cleric spells prepared:\n\n${lines}`,
  });
  const WITH_HEALS = (lines = "* 1st level (4 slots): cure wounds, healing word\n* 3rd level (2 slots): mass healing word"): StatBlockSources => ({
    monsters: [{ id: "m-cleric", name: "Cleric", stat_block: clericBlock({ special_abilities: [spellsLine(lines)] }) } as unknown as Monster, monster("m-ox"), typed("m-ghoul", "undead")],
    npcs: [],
    companions: [],
  });
  const CURE_ONLY = WITH_HEALS("* 1st level (4 slots): cure wounds");
  const DEAD = { successes: 0, failures: 3 };
  /** The cleric (30 HP, Wisdom +3) at (1,1) with `friends`, on the "m" side; the ox of the "p" side is far off at (8,1). */
  const fightOf = (friends: RunCombatant[], cleric: Partial<RunCombatant> = {}, foe: Partial<RunCombatant> = {}) =>
    row({
      combatants_live: [
        combatant("cleric", { monster_id: "m-cleric", faction_id: "m", hp: 30, max_hp: 30, initiative: 12, position: { x: 1, y: 1 }, ...cleric }),
        ...friends,
        combatant("ox", { monster_id: "m-ox", faction_id: "p", hp: 40, max_hp: 40, ac: "13", initiative: 5, position: { x: 8, y: 1 }, ...foe }),
      ],
    });
  /** Pip, a character on the cleric's side, at 0 hit points and Unconscious with two failed and one successful death save. */
  const pipDown = (over: Partial<RunCombatant> = {}) => pc("pip", { faction_id: "m", hp: 0, max_hp: 20, initiative: 3, position: { x: 2, y: 1 }, death_saves: { successes: 1, failures: 2 }, conditions: [{ name: "Unconscious" }], ...over });
  const pipHurt = (hp: number) => pc("pip", { faction_id: "m", hp, max_hp: 20, initiative: 3, position: { x: 2, y: 1 } });
  const clericTurn = (over: Record<string, unknown> = {}) => takeTurn({ instanceId: "cleric", ...over });
  const castHeal = (over: Record<string, unknown> = {}) => ({ type: "cast_spell", casterId: "cleric", spell: "cure wounds", targetIds: ["pip"], ...over }) as CommandRequest["commands"][number];
  const by = (r: FightRow, id: string) => r.combatants_live.find((c) => c.instance_id === id)!;
  const records = (ruleset: "2014" | "2024" = "2014") => [cureWounds({ ruleset }), healingWord({ ruleset }), massHealingWord()];

  // PHB 2014 "Cure Wounds": 1d8 + the spellcasting modifier (Wisdom 16 is +3); ch. 9 "Death Saving Throws": healing above 0 ends the death saves
  // and the Unconscious state. A 6 on the d8 heals 9 (0 -> 9). The cleric spends one 1st-level slot and its Action; the cleric has no attack,
  // so only a heal outranks a Dodge. Bug caught: a monster cleric that never casts a heal at a friend lying dying at 0 hit points.
  it("fails if a cleric does not heal a downed friend of its side back up, ending Unconscious and the death saves", async () => {
    const h = harness(fightOf([pipDown()]), { sources: CURE_ONLY, map: mapOf(), spells: records(), dieFaces: [6] });
    const result = await runBatch(batch("b", clericTurn()), h.deps);
    expect(result.effects[0]).toMatchObject({ type: "turn_taken", turn: { kind: "heal", optionId: "heal:Cure Wounds:1:pip" } });
    expect(result.effects.find((e) => e.type === "resolved")).toMatchObject({ resolved: { kind: "heal", spell: "Cure Wounds", rolled: 9, targets: [{ targetId: "pip", regained: 9, revived: true }] } });
    expect(by(stored(h), "pip")).toMatchObject({ hp: 9, death_saves: { successes: 0, failures: 0 }, conditions: [] });
    expect(by(stored(h), "cleric")).toMatchObject({ action_used: true, action_uses: { "slots/1": { used: 1, per_day: 4 } } });
  });

  // The tactic weighs a heal by what it restores: Power Word Heal gives Pip all 20, Cure Wounds about 7.5, so the cleric casts the full heal.
  // Bug caught: the option built without `full`, so the full heal is weighed at its average of 0 and the cleric casts Cure Wounds.
  it("fails if a cleric holding Power Word Heal weighs it at nothing and casts Cure Wounds at a downed friend", async () => {
    const sources = WITH_HEALS("* 1st level (4 slots): cure wounds\n* 9th level (1 slot): power word heal");
    const h = harness(fightOf([pipDown()]), { sources, map: mapOf(), ruleset: "2024", spells: [cureWounds({ ruleset: "2024" }), powerWordHeal()], dieFaces: [] });
    const result = await runBatch(batch("b", clericTurn()), h.deps);
    expect(result.effects[0]).toMatchObject({ type: "turn_taken", turn: { kind: "heal", optionId: "heal:Power Word Heal:9:pip" } });
    expect(hpOf(stored(h), "pip")).toBe(20);
  });

  // Bug caught: a heal for a friend who is only hurt (above half) cast ahead of everything, when the book's order is down first, then below half.
  it("fails if a cleric heals a friend with a scratch (above half) instead of taking its turn", async () => {
    const h = harness(fightOf([pipHurt(15)]), { sources: CURE_ONLY, map: mapOf(), spells: records(), dieFaces: [] });
    const result = await runBatch(batch("b", clericTurn()), h.deps);
    expect(result.effects[0]).toMatchObject({ turn: { kind: expect.not.stringMatching(/^heal$/) } });
    expect(h.dieCalls).toBe(0);
    expect(by(stored(h), "cleric").action_uses).toBeUndefined();
  });

  // Below half (9 of 20) is healed. 1d8 face 2 + 3 = 5 (9 -> 14). Bug caught: the low line never reached, so only the dying are ever healed.
  it("fails if a friend below half their hit points is not healed", async () => {
    const h = harness(fightOf([pipHurt(9)]), { sources: CURE_ONLY, map: mapOf(), spells: records(), dieFaces: [2] });
    await runBatch(batch("b", clericTurn()), h.deps);
    expect(hpOf(stored(h), "pip")).toBe(14);
  });

  // Bug caught: a heal cast, and a slot spent, when nobody on the side is hurt.
  it("fails if a heal is cast when nobody on the cleric's side is hurt", async () => {
    const h = harness(fightOf([pipHurt(20)]), { sources: CURE_ONLY, map: mapOf(), spells: records(), dieFaces: [] });
    const result = await runBatch(batch("b", clericTurn()), h.deps);
    expect(result.effects.some((e) => e.type === "resolved")).toBe(false);
    expect(by(stored(h), "cleric").action_uses).toBeUndefined();
  });

  // Bug caught: a heal aimed at a foe: the ox of the other side is at 3 of 40 and in no danger from the cleric's Cure Wounds.
  it("fails if a heal is cast at a foe", async () => {
    const h = harness(fightOf([], {}, { hp: 3, position: { x: 2, y: 1 } }), { sources: CURE_ONLY, map: mapOf(), spells: records(), dieFaces: [] });
    await runBatch(batch("b", clericTurn()), h.deps);
    expect(hpOf(stored(h), "ox")).toBe(3);
    expect(h.dieCalls).toBe(0);
  });

  // PHB 2014 "Healing Word": a Bonus Action, 1d4 + modifier. A 3 on the d4 heals 6. With a friend down the turn is chosen without a leveled
  // cast, so the cleric casts Healing Word as its Bonus Action and then walks toward the ox; Cure Wounds (an Action, 1st level) is not also cast
  // (PHB 2014 ch. 10: no second spell beside a Bonus Action spell). Bug caught: Healing Word cast as an Action, or beside another leveled spell.
  it("fails if Healing Word is not cast as a Bonus Action beside a turn that casts no leveled spell", async () => {
    const h = harness(fightOf([pipDown()]), { sources: WITH_HEALS(), map: mapOf(), spells: records(), dieFaces: [3] });
    const result = await runBatch(batch("b", clericTurn()), h.deps);
    expect(by(stored(h), "pip")).toMatchObject({ hp: 6, conditions: [] });
    const cleric = by(stored(h), "cleric");
    expect(cleric.bonus_used).toBe(true);
    expect(cleric.action_uses).toEqual({ "slots/1": { used: 1, per_day: 4 } });
    expect(result.effects.filter((e) => e.type === "resolved")).toHaveLength(1);
    expect(result.effects[0]).toMatchObject({ turn: { kind: expect.not.stringMatching(/^heal$/) } });
  });

  // PHB 2014 "Cure Wounds"/"Healing Word": "no effect on undead or constructs". The ghoul (undead) is at 5 of 20 and is not healed; the slot and the
  // Action are spent all the same (the spell was cast). Pip, a living friend, is the positive control: the same cast heals them. Bug caught:
  // a cleric healing the undead of its own side under the 2014 text.
  it("fails if a 2014 Cure Wounds heals an undead creature", async () => {
    const ghoul = combatant("ghoul", { monster_id: "m-ghoul", faction_id: "m", hp: 5, max_hp: 20, initiative: 2, position: { x: 2, y: 2 } });
    const h = harness(fightOf([ghoul, pipHurt(5)]), { sources: CURE_ONLY, map: mapOf(), spells: records(), dieFaces: [4, 4] });
    const result = await runBatch(batch("b", castHeal({ targetIds: ["ghoul", "pip"] })), h.deps);
    expect(result.effects.find((e) => e.type === "resolved")).toMatchObject({ resolved: { kind: "heal", targets: [{ targetId: "ghoul", regained: 0, unaffected: true }, { targetId: "pip", regained: 7, unaffected: false }] } });
    expect(hpOf(stored(h), "ghoul")).toBe(5);
    expect(hpOf(stored(h), "pip")).toBe(12);
    expect(by(stored(h), "cleric").action_uses).toEqual({ "slots/1": { used: 1, per_day: 4 } });
  });

  // PHB 2024 "Cure Wounds" has no sentence excluding undead: the same cast heals the ghoul (2d8 faces 4 + 5 + 3 = 12: 5 -> 17).
  it("fails if a 2024 Cure Wounds is refused to an undead creature", async () => {
    const ghoul = combatant("ghoul", { monster_id: "m-ghoul", faction_id: "m", hp: 5, max_hp: 20, initiative: 2, position: { x: 2, y: 2 } });
    const h = harness(fightOf([ghoul]), { sources: CURE_ONLY, map: mapOf(), ruleset: "2024", spells: records("2024"), dieFaces: [4, 5] });
    await runBatch(batch("b", castHeal({ targetIds: ["ghoul"] })), h.deps);
    expect(hpOf(stored(h), "ghoul")).toBe(17);
  });

  // The amount by the book, per edition and slot (each cast on a friend at 1 hit point of 20, so nothing is capped):
  // PHB 2014 Cure Wounds 1d8 + 3 (die 5: 8); PHB 2014 at a 3rd-level slot, +1d8 per level above 1st = 3d8 + 3 (dice 2, 3, 4: 12);
  // PHB 2024 Cure Wounds 2d8 + 3 (dice 5, 6: 14). The slots spent are the level cast at. Bug caught: the dice of the wrong edition, or an upcast that does not grow.
  it.each([
    { ruleset: "2014" as const, castLevel: undefined, faces: [5], healed: 8, slot: "slots/1", per: 4 },
    { ruleset: "2014" as const, castLevel: 3, faces: [2, 3, 4], healed: 12, slot: "slots/3", per: 2 },
    { ruleset: "2024" as const, castLevel: undefined, faces: [5, 6], healed: 14, slot: "slots/1", per: 4 },
  ])("restores $healed hit points by the $ruleset rules (cast level $castLevel)", async ({ ruleset, castLevel, faces, healed, slot, per }) => {
    const h = harness(fightOf([pipHurt(1)]), { sources: WITH_HEALS(), map: mapOf(), ruleset, spells: records(ruleset), dieFaces: [...faces] });
    await runBatch(batch("b", castHeal(castLevel === undefined ? {} : { castLevel })), h.deps);
    expect(hpOf(stored(h), "pip")).toBe(1 + healed);
    expect(by(stored(h), "cleric").action_uses).toEqual({ [slot]: { used: 1, per_day: per } });
  });

  // Healing stops at the maximum: 18 of 20 and a roll of 9 leaves 20, and says 2 were regained. Bug caught: hit points above the maximum.
  it("fails if healing takes a creature above its hit point maximum, or reports what was rolled as what was regained", async () => {
    const h = harness(fightOf([pipHurt(18)]), { sources: CURE_ONLY, map: mapOf(), spells: records(), dieFaces: [6] });
    const result = await runBatch(batch("b", castHeal()), h.deps);
    expect(hpOf(stored(h), "pip")).toBe(20);
    expect(result.effects.find((e) => e.type === "resolved")).toMatchObject({ resolved: { rolled: 9, targets: [{ regained: 2 }] } });
  });

  // PHB 2014 ch. 9 "Death Saving Throws": a character with three failures is dead and healing does not bring them back; a monster at 0 is dead too.
  // Nothing is rolled or spent. Bug caught: Cure Wounds raising the dead.
  it.each([
    { name: "a character with three failed death saves", dead: pipDown({ death_saves: DEAD }) },
    { name: "a monster at 0 hit points", dead: combatant("pip", { faction_id: "m", hp: 0, max_hp: 20, monster_id: "m-ox", position: { x: 2, y: 1 } }) },
  ])("refuses to heal $name", async ({ dead }) => {
    const h = harness(fightOf([dead]), { sources: CURE_ONLY, map: mapOf(), spells: records(), dieFaces: [] });
    await expect(runBatch(batch("b", castHeal()), h.deps)).rejects.toMatchObject({ status: 400, message: expect.stringMatching(/dead/) });
    expect(h.dieCalls).toBe(0);
    expect(h.saves).toBe(0);
  });

  // A Bonus Action spell takes the Bonus Action and leaves the Action; a second one in the same turn is refused. Bug caught: Healing Word marking the Action used.
  it("fails if Healing Word uses the Action instead of the Bonus Action, or can be cast with the Bonus Action spent", async () => {
    const h = harness(fightOf([pipHurt(5)]), { sources: WITH_HEALS(), map: mapOf(), spells: records(), dieFaces: [1] });
    await runBatch(batch("b", castHeal({ spell: "healing word" })), h.deps);
    expect(by(stored(h), "cleric")).toMatchObject({ bonus_used: true });
    expect(by(stored(h), "cleric").action_used).not.toBe(true);
    const spent = harness(fightOf([pipHurt(5)], { bonus_used: true }), { sources: WITH_HEALS(), map: mapOf(), spells: records(), dieFaces: [] });
    await expect(runBatch(batch("b", castHeal({ spell: "healing word" })), spent.deps)).rejects.toMatchObject({ status: 400, message: expect.stringMatching(/Bonus Action/) });
  });

  // A library row nobody has reviewed is not rolled (nothing proves its dice): the cast is spent and left to the table, as for a damage spell.
  it("fails if an unreviewed healing record is rolled", async () => {
    const h = harness(fightOf([pipHurt(5)]), { sources: CURE_ONLY, map: mapOf(), spells: [cureWounds({ mechanics_reviewed: false })], dieFaces: [] });
    const result = await runBatch(batch("b", castHeal()), h.deps);
    expect(hpOf(stored(h), "pip")).toBe(5);
    expect(result.effects.find((e) => e.type === "resolved")).toMatchObject({ resolved: { kind: "cast" } });
  });

  // PHB 2014 ch. 10 "Bonus Action" spells: with Pip only below half (not down) and a leveled damage spell the best turn, the turn stands and Healing Word is
  // not cast beside it (a leveled spell and a Bonus Action spell may not be cast in one turn). Pip stays at 9. Bug caught: a Bonus Action heal cast beside a leveled spell.
  it("fails if Healing Word rides a turn that casts a leveled spell when nobody is down", async () => {
    const bolt = fireBolt({ name: "Guiding Bolt", level: 1, range: "120 feet" });
    const lines = "* 1st level (4 slots): guiding bolt, healing word";
    const h = harness(fightOf([pipHurt(9)], {}, { position: { x: 6, y: 1 } }), { sources: WITH_HEALS(lines), map: mapOf(), spells: [bolt, ...records()], dieFaces: [15, 5, 5, 5] });
    const result = await runBatch(batch("b", clericTurn({ optionId: undefined })), h.deps);
    expect(result.effects[0]).toMatchObject({ turn: { kind: "spell" } });
    expect(hpOf(stored(h), "pip")).toBe(9);
    expect(by(stored(h), "cleric").bonus_used).not.toBe(true);
  });

  // A turn the caller names is exactly that turn: Healing Word does not ride it. Bug caught: the heal added to a turn someone chose by hand.
  it("fails if Healing Word is added to a turn the caller named", async () => {
    const h = harness(fightOf([pipDown()]), { sources: WITH_HEALS(), map: mapOf(), spells: records(), dieFaces: [] });
    await runBatch(batch("b", clericTurn({ optionId: "dodge" })), h.deps);
    expect(hpOf(stored(h), "pip")).toBe(0);
    expect(by(stored(h), "cleric").bonus_used).not.toBe(true);
  });

  const HEAL_LINES = "* 6th level (1 slot): heal\n* 7th level (1 slot): plane shift";
  const bigPip = (over: Partial<RunCombatant> = {}) => pc("pip", { faction_id: "m", hp: 1, max_hp: 300, initiative: 3, position: { x: 2, y: 1 }, ...over });

  // PHB 2014 "Heal": 70 hit points (+10 per slot level above 6th), and it ends blindness and deafness (and diseases). Pip is Blinded, Deafened and Poisoned:
  // Heal 2014 takes the first two off and leaves Poisoned; "diseases" is no condition of the app, so the line says it is the table's. Nothing is rolled.
  // Bug caught: Heal cast and spent with nothing restored, a condition it ends left on, or the one it does not end taken off.
  it("fails if Heal (2014) does not restore 70, end Blinded and Deafened and keep Poisoned, and leave diseases to the table", async () => {
    const conditions = [{ name: "Blinded" }, { name: "Deafened" }, { name: "Poisoned" }];
    const h = harness(fightOf([bigPip({ conditions })]), { sources: WITH_HEALS(HEAL_LINES), map: mapOf(), spells: [heal()], dieFaces: [] });
    const result = await runBatch(batch("b", castHeal({ spell: "heal" })), h.deps);
    expect(hpOf(stored(h), "pip")).toBe(71);
    expect(by(stored(h), "pip").conditions.map((c) => c.name)).toEqual(["Poisoned"]);
    expect(result.effects.find((e) => e.type === "resolved")).toMatchObject({ resolved: { kind: "heal", rolled: 70, leftToTable: ["diseases"], targets: [{ targetId: "pip", regained: 70, ended: ["Blinded", "Deafened"] }] } });
    expect(by(stored(h), "cleric").action_uses).toEqual({ "slots/6": { used: 1, per_day: 1 } });
  });

  // PHB 2024 "Heal" also ends Poisoned; cast with a 7th-level slot it is 80 (70 + 10 for the level above 6th).
  it("fails if Heal (2024) does not also end Poisoned, or an upcast Heal does not restore 80", async () => {
    const conditions = [{ name: "Blinded" }, { name: "Poisoned" }];
    const h = harness(fightOf([bigPip({ conditions })]), { sources: WITH_HEALS(HEAL_LINES), map: mapOf(), ruleset: "2024", spells: [heal({ ruleset: "2024" })], dieFaces: [] });
    const result = await runBatch(batch("b", castHeal({ spell: "heal", castLevel: 7 })), h.deps);
    expect(hpOf(stored(h), "pip")).toBe(81);
    expect(by(stored(h), "pip").conditions).toEqual([]);
    expect((result.effects.find((e) => e.type === "resolved") as { resolved: { leftToTable?: string[] } }).resolved.leftToTable).toBeUndefined();
  });

  // The typed list wins over the edition: a 2014 record that carries `unaffected: []` heals the ghoul, and a 2024 record that names "undead" does not.
  // The 2014 record with no field at all keeps the old inference (the test above for Cure Wounds). Bug caught: the edition read before the field.
  it("fails if a typed unaffected list is not honoured over the edition", async () => {
    const ghoul = () => combatant("ghoul", { monster_id: "m-ghoul", faction_id: "m", hp: 5, max_hp: 20, initiative: 2, position: { x: 2, y: 2 } });
    const typed = (ruleset: "2014" | "2024", unaffected: string[]) => cureWounds({ ruleset, effects: [{ ...cureWounds().effects![0], unaffected }] });
    const open = harness(fightOf([ghoul()]), { sources: CURE_ONLY, map: mapOf(), spells: [typed("2014", [])], dieFaces: [4] });
    await runBatch(batch("b", castHeal({ targetIds: ["ghoul"] })), open.deps);
    expect(hpOf(stored(open), "ghoul")).toBe(12);
    const shut = harness(fightOf([ghoul()]), { sources: CURE_ONLY, map: mapOf(), ruleset: "2024", spells: [typed("2024", ["undead"])], dieFaces: [4, 4] });
    await runBatch(batch("b", castHeal({ targetIds: ["ghoul"] })), shut.deps);
    expect(hpOf(stored(shut), "ghoul")).toBe(5);
  });

  // SRD 5.2 "Power Word Heal": the target regains all its hit points, and Poisoned (one of the five it names) ends. Pip is down at 0 of 20 and
  // Poisoned: she is back at 20, up, and no longer Poisoned, with no die rolled. Bug caught: a full heal rolled as dice "", given 0, or the
  // conditions left on.
  it("fails if Power Word Heal does not restore every hit point without a roll and end the conditions it names", async () => {
    const h = harness(fightOf([pipDown({ conditions: [{ name: "Unconscious" }, { name: "Poisoned" }] })]), { sources: WITH_HEALS("* 9th level (1 slot): power word heal"), map: mapOf(), ruleset: "2024", spells: [powerWordHeal()], dieFaces: [] });
    const result = await runBatch(batch("b", castHeal({ spell: "power word heal" })), h.deps);
    expect(hpOf(stored(h), "pip")).toBe(20);
    expect(h.dieCalls).toBe(0);
    expect(by(stored(h), "pip").conditions).toEqual([]);
    expect(result.effects.find((e) => e.type === "resolved")).toMatchObject({ resolved: { kind: "heal", full: true, targets: [{ targetId: "pip", regained: 20, revived: true, ended: ["Poisoned"] }] } });
  });

  // PHB "Mass Heal": 700 hit points divided as the caster chooses. The rule here: the downed first, each to full or to the pool's end, then the lowest.
  // Pip 0/20, Brug 5/100, Gar 40/400, Hob 100/400, targets named in the wrong order; the ghoul (undead, 2014) takes none of it. 20 + 95 + 360 = 475, so Hob
  // gets the last 225 (to 325 of 400) and is not filled. Bug caught: the pool given to each, hit points above the maximum, the ghoul healed, or the lowest not first.
  it("fails if Mass Heal does not share its 700 hit points down first, then the lowest, never overhealing", async () => {
    const friend = (id: string, hp: number, max_hp: number, x: number) => combatant(id, { monster_id: "m-ox", faction_id: "m", hp, max_hp, initiative: 2, position: { x, y: 2 } });
    const ghoul = combatant("ghoul", { monster_id: "m-ghoul", faction_id: "m", hp: 5, max_hp: 20, initiative: 2, position: { x: 6, y: 2 } });
    const friends = [friend("hob", 100, 400, 2), friend("gar", 40, 400, 3), friend("brug", 5, 100, 4), pipDown(), ghoul];
    const h = harness(fightOf(friends), { sources: WITH_HEALS("* 9th level (1 slot): mass heal"), map: mapOf(), spells: [massHeal()], dieFaces: [] });
    const result = await runBatch(batch("b", castHeal({ spell: "mass heal", targetIds: ["hob", "gar", "brug", "pip", "ghoul"] })), h.deps);
    expect([hpOf(stored(h), "pip"), hpOf(stored(h), "brug"), hpOf(stored(h), "gar"), hpOf(stored(h), "hob"), hpOf(stored(h), "ghoul")]).toEqual([20, 100, 400, 325, 5]);
    expect(h.dieCalls).toBe(0);
    expect(by(stored(h), "pip").conditions).toEqual([]);
    expect(result.effects.find((e) => e.type === "resolved")).toMatchObject({ resolved: { kind: "heal", pool: true, rolled: 700, targets: expect.arrayContaining([{ targetId: "ghoul", regained: 0, revived: false, unaffected: true }, { targetId: "hob", regained: 225, revived: false, unaffected: false }]) } });
  });

  // A campaign's own Cure Wounds has only flat columns (2d6, +1d6 per level). It heals by them, and adds no spellcasting modifier (no column says it does):
  // faces 3 and 4 heal 7, not 10. A flat row with no healing dice is still cast and left to the table. Bug caught: a DM's own heal that never heals.
  it("fails if a campaign's own spell with flat healing columns does not heal, or adds a modifier its data does not name", async () => {
    const mine = ownRecord({ ...cureWounds({ own: true, effects: [], healing_dice: "2d6" }), higher_level_healing: "1d6" } as Parameters<typeof ownRecord>[0]);
    const h = harness(fightOf([pipHurt(5)]), { sources: CURE_ONLY, map: mapOf(), spells: [mine], dieFaces: [3, 4] });
    await runBatch(batch("b", castHeal()), h.deps);
    expect(hpOf(stored(h), "pip")).toBe(12);
    const none = ownRecord({ ...cureWounds({ own: true, effects: [], healing_dice: null }), higher_level_healing: null } as Parameters<typeof ownRecord>[0]);
    const left = harness(fightOf([pipHurt(5)]), { sources: CURE_ONLY, map: mapOf(), spells: [none], dieFaces: [] });
    const result = await runBatch(batch("b", castHeal()), left.deps);
    expect(hpOf(stored(left), "pip")).toBe(5);
    expect(result.effects.find((e) => e.type === "resolved")).toMatchObject({ resolved: { kind: "cast" } });
  });

  // Heal (the 6th-level spell) stores no dice: its cast is spent and left to the table, like any spell the rules cannot roll.
  it("fails if a healing spell with no structured healing is rolled from its text, or casts for free", async () => {
    const heal = cureWounds({ name: "Cure Wounds", effects: [], healing_dice: null });
    const h = harness(fightOf([pipHurt(5)]), { sources: CURE_ONLY, map: mapOf(), spells: [heal], dieFaces: [] });
    const result = await runBatch(batch("b", castHeal()), h.deps);
    expect(hpOf(stored(h), "pip")).toBe(5);
    expect(result.effects.find((e) => e.type === "resolved")).toMatchObject({ resolved: { kind: "cast", spell: "Cure Wounds" } });
    expect(by(stored(h), "cleric").action_uses).toEqual({ "slots/1": { used: 1, per_day: 4 } });
  });

  describe("boon spells (Bless, Shield of Faith)", () => {
    const BOONS = WITH_HEALS("* 1st level (4 slots): bless, shield of faith\n* 2nd level (2 slots): aid");
    const friends = () => [pipHurt(20), pc("brug", { faction_id: "m", hp: 20, max_hp: 20, initiative: 3, position: { x: 2, y: 2 } }), pc("tam", { faction_id: "m", hp: 20, max_hp: 20, initiative: 3, position: { x: 3, y: 1 } }), pc("gar", { faction_id: "m", hp: 20, max_hp: 20, initiative: 3, position: { x: 3, y: 2 } })];
    const castBoon = (over: Record<string, unknown> = {}) => castHeal({ spell: "bless", targetIds: ["pip", "brug", "tam"], ...over });
    const boonHarness = (fight = fightOf(friends())) => harness(fight, { sources: BOONS, map: mapOf(), spells: [bless(), shieldOfFaith()], dieFaces: [] });
    const heldBless = (id: string) => by(stored(boonHarnessResult), id).conditions.find((c) => c.name === "Bless");
    let boonHarnessResult: ReturnType<typeof boonHarness>;

    // PHB 2014 "Bless": up to three creatures, a d4 on attack rolls and saves, Concentration up to a minute (10 rounds). A cast is a 1st-level slot and the Action;
    // the boon rolls nothing. Bug caught: Bless "left to the table" (no condition on anyone), or sourced without concentration so it outlives the caster's focus.
    it("fails if Bless does not put a concentration-sourced 1d4 boon for 10 rounds on three friends and spend a slot and the Action", async () => {
      boonHarnessResult = boonHarness();
      const result = await runBatch(batch("b", castBoon()), boonHarnessResult.deps);
      for (const id of ["pip", "brug", "tam"]) {
        expect(heldBless(id)).toMatchObject({ name: "Bless", grants: { attack: "1d4", save: "1d4" }, source: { id: "cleric", spell: "Bless", concentration: true }, ends: { kind: "rounds", remaining: 10 } });
      }
      expect(by(stored(boonHarnessResult), "gar").conditions).toEqual([]);
      expect(by(stored(boonHarnessResult), "cleric")).toMatchObject({ action_used: true, action_uses: { "slots/1": { used: 1, per_day: 4 } } });
      expect(by(stored(boonHarnessResult), "cleric").bonus_used).not.toBe(true);
      expect(boonHarnessResult.dieCalls).toBe(0);
      expect(result.effects.find((e) => e.type === "resolved")).toMatchObject({ resolved: { kind: "boon", casterId: "cleric", spell: "Bless", castLevel: 1, targetIds: ["pip", "brug", "tam"] } });
    });

    // PHB "Bless": three creatures at 1st level, "one additional creature for each slot level above 1st". Bug caught: no cap (a free fourth blessing), or a cap
    // that ignores the upcast; a refused cast must spend nothing.
    it("fails if a fourth creature is blessed with a 1st-level slot, refused casts spend, or a 2nd-level slot does not reach four", async () => {
      const four = ["pip", "brug", "tam", "gar"];
      const low = boonHarness();
      await expect(runBatch(batch("b", castBoon({ targetIds: four })), low.deps)).rejects.toMatchObject({ status: 400, message: expect.stringMatching(/up to 3/) });
      expect(by(stored(low), "cleric").action_uses).toBeUndefined();
      expect(by(stored(low), "cleric").action_used).not.toBe(true);
      const high = boonHarness();
      await runBatch(batch("b", castBoon({ targetIds: four, castLevel: 2 })), high.deps);
      expect(four.every((id) => by(stored(high), id).conditions.some((c) => c.name === "Bless"))).toBe(true);
      expect(by(stored(high), "cleric").action_uses).toEqual({ "slots/2": { used: 1, per_day: 2 } });
    });

    // A boon with no one to receive it is a wasted slot. Bug caught: a cast with no targets spends the slot.
    it("fails if Bless is cast at nobody", async () => {
      const h = boonHarness();
      await expect(runBatch(batch("b", castBoon({ targetIds: [] })), h.deps)).rejects.toMatchObject({ status: 400, message: expect.stringMatching(/at least one target/) });
      expect(by(stored(h), "cleric").action_uses).toBeUndefined();
    });

    // PHB 2014 ch. 9 "Death Saving Throws": the dead are past help. Bug caught: a boon laid on a corpse.
    it("fails if Bless is cast on a dead creature", async () => {
      const h = boonHarness(fightOf([pipDown({ death_saves: DEAD })]));
      await expect(runBatch(batch("b", castBoon({ targetIds: ["pip"] })), h.deps)).rejects.toMatchObject({ status: 400, message: expect.stringMatching(/dead/) });
      expect(by(stored(h), "cleric").action_uses).toBeUndefined();
    });

    // PHB 2014 "Shield of Faith": a Bonus Action, +2 AC for one creature, Concentration up to 10 minutes (100 rounds). Bug caught: it takes the Action, or is cast with the Bonus Action spent.
    it("fails if Shield of Faith uses the Action instead of the Bonus Action, or can be cast with the Bonus Action spent", async () => {
      boonHarnessResult = boonHarness();
      await runBatch(batch("b", castHeal({ spell: "shield of faith", targetIds: ["pip"] })), boonHarnessResult.deps);
      expect(by(stored(boonHarnessResult), "cleric")).toMatchObject({ bonus_used: true });
      expect(by(stored(boonHarnessResult), "cleric").action_used).not.toBe(true);
      expect(by(stored(boonHarnessResult), "pip").conditions.find((c) => c.name === "Shield of Faith")).toMatchObject({ grants: { ac: 2 }, source: { concentration: true }, ends: { kind: "rounds", remaining: 100 } });
      const spent = boonHarness(fightOf(friends(), { bonus_used: true }));
      await expect(runBatch(batch("b", castHeal({ spell: "shield of faith", targetIds: ["pip"] })), spent.deps)).rejects.toMatchObject({ status: 400, message: expect.stringMatching(/Bonus Action/) });
      expect(by(stored(spent), "cleric").action_uses).toBeUndefined();
    });

    // PHB 2014 ch. 10 "Concentration": casting another concentration spell ends the first, and a boon it gave ends with it, on every target.
    // Bug caught: a boon not sourced on the caster's concentration, which stays on its targets after the caster has moved on.
    it("fails if Bless stays on its targets after the caster concentrates on another spell", async () => {
      boonHarnessResult = boonHarness();
      await runBatch(batch("b", castBoon()), boonHarnessResult.deps);
      await runBatch(batch("c", castHeal({ spell: "shield of faith", targetIds: ["gar"] })), boonHarnessResult.deps);
      for (const id of ["pip", "brug", "tam"]) expect(heldBless(id)).toBeUndefined();
      expect(by(stored(boonHarnessResult), "gar").conditions.some((c) => c.name === "Shield of Faith")).toBe(true);
    });

    // The tactics cast a boon (#1021, `boonChoice.ts`). A cleric with a mace (the stat block's Bite stands in), Shield of Faith and a friend beside the foe, round 1.
    const MACE = (lines: string): StatBlockSources => ({
      monsters: [{ id: "m-cleric", name: "Cleric", stat_block: clericBlock({ actions: [bite], special_abilities: [spellsLine(lines)] }) } as unknown as Monster, monster("m-ox")],
      npcs: [], companions: [],
    });
    /** Cleric at (1,1); the ox at (3,1) with Pip at (4,1) beside it, and Brug far off at (1,5). */
    const meleeFight = () => fightOf(
      [pc("pip", { faction_id: "m", hp: 20, max_hp: 20, initiative: 3, position: { x: 4, y: 1 } }), pc("brug", { faction_id: "m", hp: 20, max_hp: 20, initiative: 3, position: { x: 1, y: 5 } })],
      {}, { position: { x: 3, y: 1 } },
    );

    // APP CONVENTION "cast early" + PHB 2014 ch. 10 "Bonus Action" spells: the cleric swings its mace (the Action) and casts Shield of Faith as its Bonus Action,
    // first, on the friend beside the foe (the most foes within 5 feet), not on Brug. A cantrip-free attack turn carries a Bonus Action spell.
    // Bug caught: a cleric that attacks and never shields anyone, or shields the friend nobody is hitting.
    it("fails if a cleric with a mace in round 1 does not attack and cast Shield of Faith on the friend beside the foe", async () => {
      const h = harness(meleeFight(), { sources: MACE("* 1st level (4 slots): shield of faith"), map: mapOf(), spells: [shieldOfFaith()], dieFaces: [15, 3] });
      const result = await runBatch(batch("b", clericTurn()), h.deps);
      expect(result.effects[0]).toMatchObject({ turn: { kind: "attack", picked: "rules" } });
      expect(by(stored(h), "pip").conditions.find((c) => c.name === "Shield of Faith")).toMatchObject({ grants: { ac: 2 }, source: { id: "cleric", concentration: true } });
      expect(by(stored(h), "brug").conditions).toEqual([]);
      expect(by(stored(h), "cleric")).toMatchObject({ bonus_used: true, action_used: true, action_uses: { "slots/1": { used: 1, per_day: 4 } } });
      expect(by(stored(h), "ox").hp).toBeLessThan(40);
    });

    // PHB 2014 ch. 10 "Bonus Action" spells: Bless is a leveled spell cast as the turn, so the Bonus Action spell Shield of Faith is not cast beside it.
    // Bug caught: two leveled spells in one turn.
    it("fails if a cleric whose turn is Bless also casts Shield of Faith that turn", async () => {
      const h = harness(meleeFight(), { sources: MACE("* 1st level (4 slots): bless, shield of faith"), map: mapOf(), spells: [bless(), shieldOfFaith()], dieFaces: [] });
      const result = await runBatch(batch("b", clericTurn()), h.deps);
      expect(result.effects[0]).toMatchObject({ turn: { kind: "boon", optionId: "boon:Bless:1" } });
      const cleric = by(stored(h), "cleric");
      expect(cleric.action_uses).toEqual({ "slots/1": { used: 1, per_day: 4 } });
      expect(cleric.bonus_used).not.toBe(true);
      expect(by(stored(h), "pip").conditions.map((c) => c.name)).toEqual(["Bless"]);
      expect(by(stored(h), "cleric").conditions.map((c) => c.name)).toContain("Bless");
    });

    // APP CONVENTION "cast early": in round 3 the fight is no longer young, so the cleric only attacks. Bug caught: a Bonus Action boon cast at any round.
    it("fails if Shield of Faith is cast in round 3", async () => {
      const h = harness({ ...meleeFight(), current_round: 3 }, { sources: MACE("* 1st level (4 slots): shield of faith"), map: mapOf(), spells: [shieldOfFaith()], dieFaces: [15, 3] });
      await runBatch(batch("b", clericTurn()), h.deps);
      expect(by(stored(h), "pip").conditions).toEqual([]);
      expect(by(stored(h), "cleric").bonus_used).not.toBe(true);
    });

    // A turn the caller names is exactly that turn: Shield of Faith does not ride it. Bug caught: a boon added to a turn someone chose by hand.
    it("fails if Shield of Faith rides a turn the caller named", async () => {
      const h = harness(meleeFight(), { sources: MACE("* 1st level (4 slots): shield of faith"), map: mapOf(), spells: [shieldOfFaith()], dieFaces: [15, 3] });
      await runBatch(batch("b", clericTurn({ optionId: "attack:actions:Bite:ox" })), h.deps);
      expect(by(stored(h), "pip").conditions).toEqual([]);
      expect(by(stored(h), "cleric").bonus_used).not.toBe(true);
    });
  });
});

/** Tam as a level 5 Cleric: Wisdom 16 (+3), proficiency +3, one prepared 1st-level spell, Healing Word, and two 1st-level slots. */
function clericTamSheets(over: { slots?: SpellSlotEntry[] } = {}): PlayerSheets {
  const base = tamSheets({ bare: true });
  const cleric = { id: "cls-clr", party_member_id: "pm-tam", class_name: "Cleric", class_definition_id: "def-clr", class_definition_kind: "system", subclass_name: null, subclass_definition_id: null, subclass_variant: null, levels: 5, is_primary: true, hit_dice_used: 0, sort_order: 0, capabilities: [] } as unknown as CharacterClass;
  const grant = (name: string, level: number): AllySpellRow => ({ id: `${name}-row`, party_member_id: "pm-tam", name, level, is_known: true, is_prepared: true, always_prepared: false, source_type: "class", source_class_id: "cls-clr", casting_ability: null, uses_per_day: null, uses_remaining: null });
  return {
    ...base,
    members: [{ ...base.members[0], wis: 16, level: 5, proficiency_bonus: 3, spell_slots: over.slots ?? [{ level: 1, max: 2, used: 0 }] }],
    casting: {
      spells: [grant("Healing Word", 1)],
      classes: [cleric],
      definitions: { system: [{ id: "def-clr", caster_type: "prepared", prepared_ability: "wis" }], custom: [], subclasses: [] },
    },
  };
}

describe("take_turn: an ally heals the character who is down", () => {
  // The played character, Pip, lies at 0 hit points; Tam the cleric (AI-played) is far from the ox. PHB 2014 "Healing Word": a Bonus Action, 1d4 + Wisdom
  // (+3): a 3 heals 6, Pip is up and no longer Unconscious. One of Tam's two 1st-level slots is written to the sheet; Tam's Bonus Action is spent.
  // Bug caught: an ally cleric that runs past a friend at 0 hit points, or a heal that spends no slot.
  it("fails if an ally cleric does not cast Healing Word at the played character at 0 hit points, spending a slot", async () => {
    const fight = row({
      combatants_live: [
        pc("tam", { faction_id: "p", hp: 20, max_hp: 20, initiative: 12, position: { x: 1, y: 1 } }),
        pc("pip", { faction_id: "p", hp: 0, max_hp: 20, initiative: 3, position: { x: 4, y: 1 }, death_saves: { successes: 0, failures: 1 }, conditions: [{ name: "Unconscious" }] }),
        combatant("victim", { monster_id: "m-ox", faction_id: "m", hp: 40, max_hp: 40, ac: "13", initiative: 5, position: { x: 12, y: 1 } }),
      ],
    });
    const h = harness(fight, { sources: SOURCES, players: clericTamSheets(), map: mapOf(), spells: [healingWord()], dieFaces: [3] });
    await runBatch(batch("b", tamTurn()), h.deps);
    expect(combatantOf(stored(h), "pip")).toMatchObject({ hp: 6, death_saves: { successes: 0, failures: 0 }, conditions: [] });
    expect(combatantOf(stored(h), "tam").bonus_used).toBe(true);
    expect(h.slotWrites).toEqual([{ memberId: "pm-tam", slots: [{ level: 1, max: 2, used: 1 }] }]);
  });

  // Bug caught: the heal cast on credit once every 1st-level slot is spent.
  it("fails if an ally cleric with no 1st-level slot left casts Healing Word", async () => {
    const fight = row({
      combatants_live: [
        pc("tam", { faction_id: "p", hp: 20, max_hp: 20, initiative: 12, position: { x: 1, y: 1 } }),
        pc("pip", { faction_id: "p", hp: 0, max_hp: 20, initiative: 3, position: { x: 4, y: 1 }, conditions: [{ name: "Unconscious" }] }),
        combatant("victim", { monster_id: "m-ox", faction_id: "m", hp: 40, max_hp: 40, ac: "13", initiative: 5, position: { x: 12, y: 1 } }),
      ],
    });
    const h = harness(fight, { sources: SOURCES, players: clericTamSheets({ slots: [{ level: 1, max: 2, used: 2 }] }), map: mapOf(), spells: [healingWord()], dieFaces: [] });
    await runBatch(batch("b", tamTurn()), h.deps);
    expect(combatantOf(stored(h), "pip").hp).toBe(0);
    expect(h.slotWrites).toEqual([]);
  });
});

// ── class features an ally fights with (#1021) ──────────────────────────────────────

/** One class row of Tam's: a book (system) class unless `custom`. */
const classRow = (name: string, levels: number, kind: "system" | "custom" = "system"): CharacterClass =>
  ({ id: `cls-${name}`, party_member_id: "pm-tam", class_name: name, class_definition_id: `def-${name}`, class_definition_kind: kind, subclass_name: null, subclass_definition_id: null, subclass_variant: null, levels, is_primary: true, hit_dice_used: 0, sort_order: 0, capabilities: [] }) as unknown as CharacterClass;
const withClasses = (sheets: PlayerSheets, ...classes: CharacterClass[]): PlayerSheets => ({ ...sheets, casting: { ...sheets.casting, classes } });
/** What the sheet's `class_resources` hold for one pool: `current` of `max`. */
const pool = (key: string, current: number, max: number, rest: "short" | "long" = "short") => ({ [key]: { current, max, rest } });
/** The sheet with the pools it holds (a feature with no pool stored reads full, as on the sheet). */
const withResources = (sheets: PlayerSheets, resources: NonNullable<PlayerSheets["members"][number]["class_resources"]>): PlayerSheets => ({ ...sheets, members: sheets.members.map((m) => ({ ...m, class_resources: resources })) });
/** Extra Attack tests are about the Attack action: the Fighter's Action Surge is spent so the picker does not double the turn. */
const noSurge = { ...pool("action_surge", 0, 1), ...pool("second_wind", 0, 1) };
const rogueSheets = (...classes: CharacterClass[]) => withClasses(tamSheets({ gear: [daggers(1)], items: [DAGGER] }), ...classes);
const STAB = "attack:actions:Dagger:victim";
const TWICE = (weapon: string) => `attack:actions:Extra Attack (${weapon}):victim`;

describe("take_turn: an ally's Extra Attack", () => {
  // PHB 2014 and 2024 "Extra Attack" (Fighter 5th level): the Attack action makes two attacks. d20 8 + 5 = 13 and 9 + 5 = 14 both meet AC 13;
  // 1d8+3 with a 4 and a 3 deals 7 and 6 (40 -> 27). Bug caught: a fifth-level Fighter swinging once.
  it("fails if a 5th-level Fighter does not make two attacks with one Attack action", async () => {
    const h = harness(allyFight(), { sources: SOURCES, players: withResources(withClasses(tamSheets(), classRow("Fighter", 5)), noSurge), map: mapOf(), dieFaces: [8, 4, 9, 3] });
    const result = await runBatch(batch("b", tamTurn()), h.deps);
    expect(result.effects[0]).toMatchObject({ turn: { optionId: TWICE("Longsword"), kind: "attack" } });
    expect(h.posted.map((p) => p.result.total)).toEqual([13, 7, 14, 6]);
    expect(hpOf(stored(h), "victim")).toBe(27);
    expect(combatantOf(stored(h), "tam").action_used).toBe(true);
  });

  // PHB 2014 "Fighter" table: three attacks at 11th level (Extra Attack (2)). Bug caught: the Fighter's later attacks missing.
  it("fails if an 11th-level Fighter does not make three attacks", async () => {
    const h = harness(allyFight(), { sources: SOURCES, players: withResources(withClasses(tamSheets(), classRow("Fighter", 11)), noSurge), map: mapOf(), dieFaces: [8, 4, 9, 3, 10, 2] });
    await runBatch(batch("b", tamTurn()), h.deps);
    expect(hpOf(stored(h), "victim")).toBe(22);
  });

  // Below 5th level there is one attack (a 4th-level Fighter, and a class with no Extra Attack at any level). Bug caught: the level gate dropped.
  it.each([
    { name: "a 4th-level Fighter", classes: [classRow("Fighter", 4)] },
    { name: "a 20th-level Wizard", classes: [classRow("Wizard", 20)] },
    // A homebrew class that happens to share the Fighter's name is not the book's Fighter.
    { name: "a homebrew class named Fighter", classes: [classRow("Fighter", 9, "custom")] },
    // PHB 2014 "Extra Attack": levels in two classes do not add up to the feature.
    { name: "a Fighter 3 and Barbarian 4", classes: [classRow("Fighter", 3), classRow("Barbarian", 4)] },
  ])("fails if $name is offered a second attack", async ({ classes }) => {
    const h = harness(allyFight(), { sources: SOURCES, players: withClasses(tamSheets(), ...classes), map: mapOf(), dieFaces: [] });
    await expect(runBatch(batch("b", tamTurn({ optionId: TWICE("Longsword") })), h.deps)).rejects.toMatchObject({ message: "That option is not on offer." });
  });

  // PHB 2014 "Extra Attack": "if you gain Extra Attack from more than one source, the extra attacks don't add". A Barbarian 5 / Fighter 5 and a Barbarian 5 / Monk 5 make two, not four.
  it.each([
    [classRow("Barbarian", 5), classRow("Fighter", 5)],
    [classRow("Barbarian", 5), classRow("Monk", 5)],
  ])("fails if Extra Attack from two classes adds up", async (...classes) => {
    const h = harness(allyFight(), { sources: SOURCES, players: withResources(withClasses(tamSheets(), ...classes), noSurge), map: mapOf(), dieFaces: [8, 4, 9, 3] });
    await runBatch(batch("b", tamTurn()), h.deps);
    expect(h.posted).toHaveLength(4);
  });

  // PHB 2014 "Fighter" table: four attacks at 20th level. Bug caught: the cap stopping at three.
  it("fails if a 20th-level Fighter does not make four attacks", async () => {
    const h = harness(allyFight(), { sources: SOURCES, players: withResources(withClasses(tamSheets(), classRow("Fighter", 20)), noSurge), map: mapOf(), dieFaces: [8, 4, 9, 3, 10, 2, 11, 1] });
    await runBatch(batch("b", tamTurn()), h.deps);
    expect(hpOf(stored(h), "victim")).toBe(40 - 7 - 6 - 5 - 4);
  });

  // PHB 2014 "Ammunition": each attack uses a piece of ammunition. One arrow cannot be shot twice, so the second attack is not on offer;
  // two arrows can, and both leave the quiver. Bug caught: an archer shooting arrows it does not have.
  it("offers two shots only when the quiver holds two arrows", async () => {
    const fight = archerFight();
    const one = harness(fight, { sources: SOURCES, players: withClasses(tamSheets({ gear: [SHORTBOW_HELD, arrows(1)], items: [SHORTBOW] }), classRow("Fighter", 5)), map: mapOf(), dieFaces: [] });
    await expect(runBatch(batch("b", tamTurn({ optionId: TWICE("Shortbow") })), one.deps)).rejects.toMatchObject({ message: "That option is not on offer." });
    const two = harness(archerFight(), { sources: SOURCES, players: withClasses(tamSheets({ gear: [SHORTBOW_HELD, arrows(2)], items: [SHORTBOW] }), classRow("Fighter", 5)), map: mapOf(), dieFaces: [15, 4, 15, 4] });
    await runBatch(batch("b", tamTurn({ optionId: TWICE("Shortbow") })), two.deps);
    expect(hpOf(stored(two), "victim")).toBe(32);
    expect(two.gearWrites.at(-1)).toEqual([{ kind: "remove", inventoryId: "inv-arrows" }]);
  });
});

/** A fighter-side friend of Tam's standing next to the victim, for the "enemy of the target within 5 feet" half of Sneak Attack. */
const friend = (over: Partial<RunCombatant> = {}) => pc("pal", { faction_id: "p", hp: 10, max_hp: 10, initiative: 8, position: { x: 2, y: 2 }, ...over });
function sneakFight(over: { victim?: Partial<RunCombatant>; tam?: Partial<RunCombatant>; friend?: Partial<RunCombatant> | null } = {}) {
  const base = allyFight(over.tam);
  base.combatants_live = base.combatants_live.map((c) => (c.instance_id === "victim" ? { ...c, ...over.victim } : c));
  if (over.friend !== null && over.friend !== undefined) base.combatants_live.push(friend(over.friend));
  return base;
}
const RESTRAINED = [{ name: "Restrained" }];

describe("take_turn: an ally's Sneak Attack", () => {
  // PHB 2014 "Rogue: Sneak Attack": once per turn, +1d6 at 1st level on a hit with a finesse weapon when the attacker has advantage. A Restrained
  // target gives it. d20 8 and 3 keep the 8 (13 meets AC 13); 1d4+3 with a 2 is 5, and the Sneak Attack d6 of 5 makes 10 (40 -> 30).
  // The use is tallied for this turn. Bug caught: a Rogue with advantage dealing only the dagger's damage.
  it("fails if a Rogue with advantage does not add the Sneak Attack dice", async () => {
    const h = harness(sneakFight({ victim: { conditions: RESTRAINED } }), { sources: SOURCES, players: rogueSheets(classRow("Rogue", 1)), map: mapOf(), dieFaces: [8, 3, 2, 5] });
    await runBatch(batch("b", tamTurn({ optionId: STAB })), h.deps);
    expect(hpOf(stored(h), "victim")).toBe(30);
    expect(combatantOf(stored(h), "tam").action_uses).toEqual({ "sneak_attack/1:tam": { used: 1, per_day: 1 } });
  });

  // PHB 2014 "Sneak Attack": no advantage is needed when another enemy of the target is within 5 feet of it and is not incapacitated. Pal stands
  // beside the ox. One d20 (8 + 5 = 13), 1d4 of 2 (5), Sneak Attack d6 of 5: 40 -> 30. Bug caught: the ally-adjacent route never read.
  it("fails if a Rogue with a friend beside the target does not add the Sneak Attack dice", async () => {
    const h = harness(sneakFight({ friend: {} }), { sources: SOURCES, players: rogueSheets(classRow("Rogue", 1)), map: mapOf(), dieFaces: [8, 2, 5] });
    await runBatch(batch("b", tamTurn({ optionId: STAB })), h.deps);
    expect(hpOf(stored(h), "victim")).toBe(30);
  });

  // The case it must NOT apply: no advantage and no one beside the ox. Only d20 and d4 are scripted, so a rolled Sneak Attack die throws.
  // Bug caught: Sneak Attack on every hit.
  it("fails if a Rogue with neither advantage nor an adjacent enemy of the target adds Sneak Attack", async () => {
    const h = harness(sneakFight(), { sources: SOURCES, players: rogueSheets(classRow("Rogue", 1)), map: mapOf(), dieFaces: [8, 2] });
    await runBatch(batch("b", tamTurn({ optionId: STAB })), h.deps);
    expect(hpOf(stored(h), "victim")).toBe(35);
    expect(combatantOf(stored(h), "tam").action_uses).toBeUndefined();
  });

  // PHB 2014 "Sneak Attack": the adjacent-enemy route needs the attacker to have no disadvantage. Poisoned gives disadvantage (d20 8 and 12 keep the 8).
  // Bug caught: the disadvantage clause dropped.
  it("fails if a Rogue with disadvantage sneak attacks because a friend stands beside the target", async () => {
    const h = harness(sneakFight({ friend: {}, tam: { conditions: [{ name: "Poisoned" }] } }), { sources: SOURCES, players: rogueSheets(classRow("Rogue", 1)), map: mapOf(), dieFaces: [8, 12, 2] });
    await runBatch(batch("b", tamTurn({ optionId: STAB })), h.deps);
    expect(hpOf(stored(h), "victim")).toBe(35);
  });

  // PHB 2014 "Sneak Attack": the adjacent enemy must not be incapacitated. Bug caught: a Stunned friend counted.
  it("fails if an incapacitated friend beside the target enables Sneak Attack", async () => {
    const h = harness(sneakFight({ friend: { conditions: [{ name: "Stunned" }] } }), { sources: SOURCES, players: rogueSheets(classRow("Rogue", 1)), map: mapOf(), dieFaces: [8, 2] });
    await runBatch(batch("b", tamTurn({ optionId: STAB })), h.deps);
    expect(hpOf(stored(h), "victim")).toBe(35);
  });

  // PHB 2014 "Sneak Attack": once per turn. A Rogue 1 / Fighter 5 makes two dagger attacks with advantage; only the first carries the d6.
  // First: 8 + 5 hits, d4 2 + 3 + d6 5 = 10; second: 9 + 5 hits, d4 3 + 3 = 6 (40 -> 24). The second's d6 is not scripted, so a second Sneak Attack throws.
  // Bug caught: Sneak Attack on every swing of an Attack action.
  it("fails if a second attack in the same turn adds Sneak Attack again", async () => {
    const h = harness(sneakFight({ victim: { conditions: RESTRAINED } }), { sources: SOURCES, players: rogueSheets(classRow("Rogue", 1), classRow("Fighter", 5)), map: mapOf(), dieFaces: [8, 3, 2, 5, 9, 4, 3] });
    await runBatch(batch("b", tamTurn({ optionId: TWICE("Dagger") })), h.deps);
    expect(hpOf(stored(h), "victim")).toBe(24);
  });

  // PHB 2014 "Sneak Attack": the extra damage is on a hit. A miss (d20 2 and 1 keep the 1) leaves the turn's use for the next swing. Bug caught: a miss spending it.
  it("fails if a missed attack spends the turn's Sneak Attack", async () => {
    const h = harness(sneakFight({ victim: { conditions: RESTRAINED } }), { sources: SOURCES, players: rogueSheets(classRow("Rogue", 1), classRow("Fighter", 5)), map: mapOf(), dieFaces: [2, 1, 9, 4, 3, 5] });
    await runBatch(batch("b", tamTurn({ optionId: TWICE("Dagger") })), h.deps);
    expect(hpOf(stored(h), "victim")).toBe(40 - (3 + 3 + 5));
  });

  // PHB 2014 and 2024 "Sneak Attack": once per turn, and a turn is any creature's. A use spent this round on a Reaction in the ox's turn
  // ("1:victim") leaves Tam's own turn ("1:tam") its own use. Bug caught: the tally keyed on the Rogue's own turns, so the Reaction's use
  // stops the Rogue's next Sneak Attack, or the reverse.
  it("fails if a Sneak Attack spent in another creature's turn stops the Rogue's own", async () => {
    const tam = { shown_deeds: { dealt: 0, turns: 1, cast: 0, ranged: 0, melee: 0 }, action_uses: { "sneak_attack/1:victim": { used: 1, per_day: 1 } } };
    const h = harness(sneakFight({ victim: { conditions: RESTRAINED }, tam }), { sources: SOURCES, players: rogueSheets(classRow("Rogue", 1)), map: mapOf(), dieFaces: [8, 3, 2, 5] });
    await runBatch(batch("b", tamTurn({ optionId: STAB })), h.deps);
    expect(hpOf(stored(h), "victim")).toBe(30);
    expect(combatantOf(stored(h), "tam").action_uses?.["sneak_attack/1:tam"]).toEqual({ used: 1, per_day: 1 });
  });

  // PHB 2014 "Critical Hits": a critical hit rolls all the attack's damage dice twice, Sneak Attack's included. d20 20 and 5 keep the 20;
  // two d4 of 1 and two d6 of 1: 4 + 3 = 7 (40 -> 33). Bug caught: the Sneak Attack dice left out of the doubling.
  it("fails if a critical hit does not double the Sneak Attack dice", async () => {
    const h = harness(sneakFight({ victim: { conditions: RESTRAINED } }), { sources: SOURCES, players: rogueSheets(classRow("Rogue", 1)), map: mapOf(), dieFaces: [20, 5, 1, 1, 1, 1] });
    await runBatch(batch("b", tamTurn({ optionId: STAB })), h.deps);
    expect(hpOf(stored(h), "victim")).toBe(33);
  });

  // PHB 2014 "Sneak Attack": the weapon must be finesse or ranged. A longsword is neither. Bug caught: any weapon sneak attacking.
  it("fails if a Rogue's longsword attack carries Sneak Attack", async () => {
    const h = harness(sneakFight({ victim: { conditions: RESTRAINED } }), { sources: SOURCES, players: withClasses(tamSheets(), classRow("Rogue", 1)), map: mapOf(), dieFaces: [8, 3, 4] });
    await runBatch(batch("b", tamTurn({ optionId: "attack:actions:Longsword:victim" })), h.deps);
    expect(hpOf(stored(h), "victim")).toBe(33);
  });

  // Sneak Attack is the Rogue's. Bug caught: any ally with a finesse weapon and advantage adding the dice.
  it("fails if a Fighter with a dagger and advantage adds Sneak Attack", async () => {
    const h = harness(sneakFight({ victim: { conditions: RESTRAINED } }), { sources: SOURCES, players: withClasses(rogueSheets(), classRow("Fighter", 1)), map: mapOf(), dieFaces: [8, 3, 2] });
    await runBatch(batch("b", tamTurn({ optionId: STAB })), h.deps);
    expect(hpOf(stored(h), "victim")).toBe(35);
  });

  // The dice grow with the Rogue's level (PHB 2014 Rogue table, PHB 2024 "Sneak Attack": 2d6 at 3rd level), read from the sheet's own catalogue
  // in either edition. d20 8 + 5 hits; d4 2 + 3 = 5; Sneak Attack 4 + 5 = 9: 40 -> 26. Bug caught: a flat 1d6, or the wrong edition's row.
  it.each(["2014", "2024"] as const)("deals 2d6 of Sneak Attack to a 3rd-level Rogue under the %s rules", async (ruleset) => {
    const sheets = rogueSheets(classRow("Rogue", 3));
    sheets.members = sheets.members.map((m) => ({ ...m, ruleset }));
    const h = harness(sneakFight({ victim: { conditions: RESTRAINED } }), { sources: SOURCES, players: sheets, map: mapOf(), dieFaces: [8, 3, 2, 4, 5] });
    await runBatch(batch("b", tamTurn({ optionId: STAB })), h.deps);
    expect(hpOf(stored(h), "victim")).toBe(26);
  });
});

// ── class features that spend a limited use of the sheet (#1021) ────────────────────

/** Tam's turn with a free Action and Bonus Action, hurt to `hp` of 20. */
const hurtFight = (hp: number, over: Partial<RunCombatant> = {}) => allyFight({ hp, ...over });
/** The written `class_resources` of Tam, the last write. */
const writtenResources = (h: { resourceWrites: Array<{ memberId: string; resources: StoredClassResources }> }) => h.resourceWrites.at(-1)?.resources;

describe("take_turn: an ally's Second Wind", () => {
  // PHB 2014 "Fighter: Second Wind": a Bonus Action, regain 1d10 + the Fighter level, once per short rest. Tam is at 8 of 20 (below half), Fighter 1:
  // the d10 is a 6, +1 = 7 (8 -> 15). Then the Attack action: d20 8 + 5 = 13 meets AC 13, a 4 on the d8 + 3 = 7 (40 -> 33). The pool is stored
  // 0 of 1, written after the fight is saved. Bug caught: a hurt Fighter that never heals, or a use that costs nothing.
  it("fails if a Fighter below half its hit points does not heal and spend the use, written after the save", async () => {
    const h = harness(hurtFight(8), { sources: SOURCES, players: withClasses(tamSheets(), classRow("Fighter", 1)), map: mapOf(), dieFaces: [6, 8, 4] });
    const result = await runBatch(batch("b", tamTurn()), h.deps);
    expect(result.effectFailures).toEqual([]);
    expect(combatantOf(stored(h), "tam")).toMatchObject({ hp: 15, bonus_used: true, action_used: true });
    expect(hpOf(stored(h), "victim")).toBe(33);
    expect(writtenResources(h)).toEqual({ second_wind: { current: 0, max: 1, rest: "short" } });
    expect(h.log.indexOf("save")).toBeLessThan(h.log.indexOf("resources"));
  });

  // PHB 2024 "Second Wind": two uses at 1st level, a long-rest pool of which a short rest gives one back. One used leaves one.
  // Bug caught: the 2014 table (one use) read for a 2024 character.
  it("leaves one of the two uses a 2024 Fighter has", async () => {
    const sheets = withClasses(tamSheets(), classRow("Fighter", 1));
    sheets.members = sheets.members.map((m) => ({ ...m, ruleset: "2024" as const }));
    const h = harness(hurtFight(8), { sources: SOURCES, players: sheets, map: mapOf(), dieFaces: [6, 8, 4] });
    await runBatch(batch("b", tamTurn()), h.deps);
    expect(writtenResources(h)).toEqual({ second_wind: { current: 1, max: 2, rest: "long", short_rest_regain: 1 } });
  });

  // The cases it must NOT apply: not below half (10 of 20 is exactly half, 15 is healthy), no use left, no Fighter levels, Wild Shaped. Only the
  // attack's two dice are scripted, so a rolled Second Wind throws, and nothing is written.
  it.each([
    { name: "at exactly half", hp: 10, resources: {}, classes: [classRow("Fighter", 1)] },
    { name: "healthy", hp: 15, resources: {}, classes: [classRow("Fighter", 1)] },
    { name: "with no use left", hp: 8, resources: pool("second_wind", 0, 1), classes: [classRow("Fighter", 1)] },
    { name: "of a Wizard", hp: 8, resources: {}, classes: [classRow("Wizard", 1)] },
  ])("fails if Second Wind is used $name", async ({ hp, resources, classes }) => {
    const h = harness(hurtFight(hp), { sources: SOURCES, players: withResources(withClasses(tamSheets(), ...classes), resources), map: mapOf(), dieFaces: [8, 4] });
    await runBatch(batch("b", tamTurn()), h.deps);
    expect(h.resourceWrites).toEqual([]);
    expect(combatantOf(stored(h), "tam").bonus_used).not.toBe(true);
  });

  // PHB 2014 "Wild Shape": the form's body fights, with none of the character's class features. Bug caught: a Wild Shaped Fighter healing from its beast form.
  it("fails if a Wild Shaped Fighter uses Second Wind", async () => {
    const h = harness(hurtFight(8), { sources: SOURCES, players: withClasses(tamSheets({ wildshape: true, bear: true }), classRow("Fighter", 1)), map: mapOf(), dieFaces: [8, 5] });
    await runBatch(batch("b", tamTurn()), h.deps);
    expect(h.resourceWrites).toEqual([]);
  });

  // PHB 2014 ch. 9 "Bonus Actions": one a turn. With the Bonus Action already used, a hurt Fighter does not heal again. Bug caught: the Bonus Action unlimited.
  it("fails if a Fighter whose Bonus Action is used heals", async () => {
    const h = harness(hurtFight(8, { bonus_used: true }), { sources: SOURCES, players: withClasses(tamSheets(), classRow("Fighter", 1)), map: mapOf(), dieFaces: [8, 4] });
    await runBatch(batch("b", tamTurn()), h.deps);
    expect(h.resourceWrites).toEqual([]);
  });

  // Bug caught: a failed sheet write undoing the fight, or going unreported.
  it("reports a failed write of the use and keeps the fight", async () => {
    const h = harness(hurtFight(8), { sources: SOURCES, players: withClasses(tamSheets(), classRow("Fighter", 1)), map: mapOf(), dieFaces: [6, 8, 4], resourcesFail: true });
    const result = await runBatch(batch("b", tamTurn()), h.deps);
    expect(result.effectFailures).toEqual(["ally_class_resources: sheet is down"]);
    expect(combatantOf(stored(h), "tam").hp).toBe(15);
  });
});

describe("take_turn: an ally's Action Surge", () => {
  // PHB 2014 "Fighter: Action Surge": one additional action on the turn, once per short rest. A 2nd-level Fighter surges into a second Attack action:
  // two longsword swings (8 + 5 and 9 + 5 hit AC 13; 4 + 3 and 3 + 3 = 7 and 6: 40 -> 27) and the use is written 0 of 1. Bug caught: the surge never
  // taken, or taken for free.
  it("fails if a 2nd-level Fighter does not attack twice and spend Action Surge", async () => {
    const h = harness(allyFight(), { sources: SOURCES, players: withClasses(tamSheets(), classRow("Fighter", 2)), map: mapOf(), dieFaces: [8, 4, 9, 3] });
    const result = await runBatch(batch("b", tamTurn()), h.deps);
    expect(result.effects[0]).toMatchObject({ turn: { optionId: "attack:actions:Action Surge (Longsword):victim" } });
    expect(hpOf(stored(h), "victim")).toBe(27);
    expect(writtenResources(h)).toEqual({ action_surge: { current: 0, max: 1, rest: "short" } });
    expect(h.log.indexOf("save")).toBeLessThan(h.log.indexOf("resources"));
  });

  // PHB 2014 "Fighter" table: Action Surge is gained at 2nd level; with Extra Attack (5th) the surge is four swings (2 x 2).
  it("makes four swings with Extra Attack", async () => {
    const h = harness(allyFight(), { sources: SOURCES, players: withClasses(tamSheets(), classRow("Fighter", 5)), map: mapOf(), dieFaces: [8, 4, 9, 3, 10, 2, 11, 1] });
    await runBatch(batch("b", tamTurn()), h.deps);
    expect(hpOf(stored(h), "victim")).toBe(40 - 7 - 6 - 5 - 4);
  });

  // The cases it must NOT apply: a 1st-level Fighter (gained at 2nd) and one with no use left make one attack; a Rogue has none.
  it.each([
    { name: "a 1st-level Fighter", classes: [classRow("Fighter", 1)], resources: {} },
    { name: "a Fighter with no use left", classes: [classRow("Fighter", 2)], resources: pool("action_surge", 0, 1) },
    { name: "a 2nd-level Rogue", classes: [classRow("Rogue", 2)], resources: {} },
  ])("fails if $name takes an additional action", async ({ classes, resources }) => {
    const h = harness(allyFight(), { sources: SOURCES, players: withResources(withClasses(tamSheets(), ...classes), resources), map: mapOf(), dieFaces: [8, 4] });
    await runBatch(batch("b", tamTurn()), h.deps);
    expect(hpOf(stored(h), "victim")).toBe(33);
    expect(h.resourceWrites).toEqual([]);
  });

  // Bug caught: a Wild Shaped Fighter surging with a beast's claws.
  it("fails if a Wild Shaped Fighter surges", async () => {
    const h = harness(allyFight(), { sources: SOURCES, players: withClasses(tamSheets({ wildshape: true, bear: true }), classRow("Fighter", 2)), map: mapOf(), dieFaces: [8, 5] });
    await runBatch(batch("b", tamTurn()), h.deps);
    expect(h.resourceWrites).toEqual([]);
  });
});

describe("take_turn: an ally's Rage", () => {
  // PHB 2014 "Barbarian: Rage": a Bonus Action; while raging, +2 damage on a Strength melee weapon attack (1st level), two uses a long rest at 1st level.
  // Tam rages first (a condition for ten rounds, the use written 1 of 2), then d20 8 + 5 = 13 hits and the d8 of 4 + 3 + 2 = 9 (40 -> 31).
  // Bug caught: a Barbarian that never rages, rages for free, or rages without the damage.
  it("fails if a Barbarian does not rage before a melee attack and add the Rage Damage", async () => {
    const h = harness(allyFight(), { sources: SOURCES, players: withClasses(tamSheets(), classRow("Barbarian", 1)), map: mapOf(), dieFaces: [8, 4] });
    await runBatch(batch("b", tamTurn()), h.deps);
    expect(combatantOf(stored(h), "tam")).toMatchObject({ bonus_used: true, conditions: [{ name: "Raging", ends: { kind: "rounds", remaining: 10 } }] });
    expect(hpOf(stored(h), "victim")).toBe(31);
    expect(writtenResources(h)).toEqual({ rage_uses: { current: 1, max: 2, rest: "long" } });
    expect(h.log.indexOf("save")).toBeLessThan(h.log.indexOf("resources"));
  });

  // Already raging: no second use is spent, and the damage still rides. Bug caught: a Barbarian re-raging every turn.
  it("fails if a raging Barbarian rages again", async () => {
    const h = harness(allyFight({ conditions: [{ name: "Raging" }] }), { sources: SOURCES, players: withClasses(tamSheets(), classRow("Barbarian", 1)), map: mapOf(), dieFaces: [8, 4] });
    await runBatch(batch("b", tamTurn()), h.deps);
    expect(hpOf(stored(h), "victim")).toBe(31);
    expect(h.resourceWrites).toEqual([]);
  });

  // No use left: it fights on, unraging, for plain damage (4 + 3 = 7: 40 -> 33). Bug caught: Rage on credit.
  it("fails if a Barbarian with no use left rages", async () => {
    const h = harness(allyFight(), { sources: SOURCES, players: withResources(withClasses(tamSheets(), classRow("Barbarian", 1)), pool("rage_uses", 0, 2, "long")), map: mapOf(), dieFaces: [8, 4] });
    await runBatch(batch("b", tamTurn()), h.deps);
    expect(hpOf(stored(h), "victim")).toBe(33);
    expect(combatantOf(stored(h), "tam").conditions).toEqual([]);
  });

  // Rage Damage is for a Strength melee attack: a bow (Dexterity, ranged) takes none, and no rage starts for it (the Bonus Action is saved for a blow
  // it can land). Shortbow 1d6 with a 4 = 4 (40 -> 36).
  it("fails if a Barbarian shooting a bow rages", async () => {
    const h = harness(archerFight(), { sources: SOURCES, players: withClasses(tamSheets({ gear: [SHORTBOW_HELD, ARROWS_ON_BELT], items: [SHORTBOW] }), classRow("Barbarian", 1)), map: mapOf(), dieFaces: [15, 4] });
    await runBatch(batch("b", tamTurn()), h.deps);
    expect(hpOf(stored(h), "victim")).toBe(36);
    expect(h.resourceWrites).toEqual([]);
  });

  // A turn the caller named is exactly that turn: the Barbarian does not rage on top of it. Bug caught: the Bonus Action decided for a caller's own choice.
  it("fails if a named turn gets a Rage the caller did not ask for", async () => {
    const h = harness(allyFight(), { sources: SOURCES, players: withClasses(tamSheets(), classRow("Barbarian", 1)), map: mapOf(), dieFaces: [8, 4] });
    await runBatch(batch("b", tamTurn({ optionId: "attack:actions:Longsword:victim" })), h.deps);
    expect(hpOf(stored(h), "victim")).toBe(33);
    expect(h.resourceWrites).toEqual([]);
  });

  // PHB 2014 "Wild Shape": a Wild Shaped Barbarian fights as the beast and does not rage.
  it("fails if a Wild Shaped Barbarian rages", async () => {
    const h = harness(allyFight(), { sources: SOURCES, players: withClasses(tamSheets({ wildshape: true, bear: true }), classRow("Barbarian", 1)), map: mapOf(), dieFaces: [8, 5] });
    await runBatch(batch("b", tamTurn()), h.deps);
    expect(h.resourceWrites).toEqual([]);
  });

  const rageOnSheet = (classes: CharacterClass[], rage_active: boolean) => {
    const sheets = withClasses(tamSheets(), ...classes);
    sheets.members = sheets.members.map((m) => ({ ...m, class_choices: { rage_active } }));
    return sheets;
  };

  // PHB 2014 "Rage": a rage the player started on the sheet (its toggle, `rage_active`) is a rage in the fight: Tam is Raging for the full minute, spends no use
  // again, and the Rage Damage rides (d20 8 + 5 hits, the d8 of 4 + 3 + 2 = 9: 40 -> 31). Bug caught: a second use spent, or the damage forgotten.
  it("fails if a Barbarian already raging on the sheet spends another use or loses the Rage Damage", async () => {
    const h = harness(allyFight(), { sources: SOURCES, players: rageOnSheet([classRow("Barbarian", 1)], true), map: mapOf(), dieFaces: [8, 4] });
    await runBatch(batch("b", tamTurn()), h.deps);
    expect(hpOf(stored(h), "victim")).toBe(31);
    expect(h.resourceWrites).toEqual([]);
    expect(combatantOf(stored(h), "tam")).toMatchObject({ conditions: [{ name: "Raging", ends: { kind: "rounds", remaining: 10 } }] });
    expect(combatantOf(stored(h), "tam").bonus_used).not.toBe(true);
  });

  // The sheet's toggle is a Barbarian's: a Fighter whose sheet says rage_active is not raging, and a toggle that is off changes nothing (plain 7: 40 -> 33).
  it.each([
    { name: "a Fighter with the toggle on", sheets: rageOnSheet([classRow("Fighter", 1)], true) },
    { name: "a Barbarian with the toggle off and no use left", sheets: withResources(rageOnSheet([classRow("Barbarian", 1)], false), pool("rage_uses", 0, 2, "long")) },
  ])("fails if $name is raging", async ({ sheets }) => {
    const h = harness(allyFight(), { sources: SOURCES, players: sheets, map: mapOf(), dieFaces: [8, 4] });
    await runBatch(batch("b", tamTurn()), h.deps);
    expect(hpOf(stored(h), "victim")).toBe(33);
    expect(combatantOf(stored(h), "tam").conditions).toEqual([]);
  });

  // PHB 2014 and 2024 "Rage": no spells while raging. A raging Barbarian / Wizard has Fire Bolt on its sheet but the block lists no spell: naming the cast is refused.
  // The same character not raging casts it (the existing cantrip test). Bug caught: a raging ally casting.
  it("fails if a raging ally is offered a spell", async () => {
    const sheets = wizardTamSheets();
    sheets.casting.classes = [...sheets.casting.classes, classRow("Barbarian", 1)];
    const fight = archerFight();
    fight.combatants_live[0] = { ...fight.combatants_live[0], conditions: [{ name: "Raging" }] };
    const h = harness(fight, { sources: SOURCES, players: sheets, map: mapOf(), spells: [fireBolt(), fireball()], dieFaces: [] });
    await expect(runBatch(batch("b", tamTurn({ optionId: BOLT })), h.deps)).rejects.toMatchObject({ message: "That option is not on offer." });
  });

  // PHB 2014 and 2024 "Rage": starting a Rage ends the concentration the Barbarian holds: the Charmed on the ox, which rides on Tam's concentration, is gone.
  // With no use left there is no Rage, and the spell holds. Bug caught: a Barbarian raging while still holding a spell.
  it.each([
    { name: "starting a Rage", resources: {}, kept: [] },
    { name: "no Rage to start", resources: pool("rage_uses", 0, 2, "long"), kept: [{ name: "Charmed" }] },
  ])("ends the concentration held when $name", async ({ resources, kept }) => {
    const fight = allyFight();
    fight.combatants_live = fight.combatants_live.map((c) => (c.instance_id === "victim" ? { ...c, conditions: [{ name: "Charmed", source: { id: "tam", spell: "Charm Person", concentration: true } }] } : c));
    const h = harness(fight, { sources: SOURCES, players: withResources(withClasses(tamSheets(), classRow("Barbarian", 1)), resources), map: mapOf(), dieFaces: [8, 4] });
    await runBatch(batch("b", tamTurn()), h.deps);
    expect(combatantOf(stored(h), "victim").conditions.map((c) => ({ name: c.name }))).toEqual(kept);
  });

  // PHB 2014 "Rage": resistance to bludgeoning, piercing and slashing damage. The wolf's bite (1d6+2 piercing; d20 15 + 4 hits AC 10, a 4 on the d6 = 6)
  // is halved to 3 for a raging Tam and stays 6 for one who is not. Bug caught: Rage without the resistance, or the resistance without Rage.
  it.each([
    { name: "raging", conditions: [{ name: "Raging" }], hp: 17 },
    { name: "not raging", conditions: [], hp: 14 },
  ])("takes the bite of a wolf as a Barbarian $name", async ({ conditions, hp }) => {
    const fight = row({ combatants_live: [combatant("wolf", { monster_id: "m-wolf", faction_id: "m", hp: 11, max_hp: 11, initiative: 12, position: { x: 0, y: 0 } }), pc("tam", { faction_id: "p", hp: 20, max_hp: 20, initiative: 5, position: { x: 1, y: 0 }, conditions })] });
    const h = harness(fight, { sources: SOURCES, players: withClasses(tamSheets(), classRow("Barbarian", 1)), map: mapOf(), dieFaces: [15, 4] });
    await runBatch(batch("b", { type: "resolve_attack", attackerId: "wolf", list: "actions", action: "Bite", targetId: "tam" } as CommandRequest["commands"][number]), h.deps);
    expect(hpOf(stored(h), "tam")).toBe(hp);
  });
});

describe("an ally's Rage ends early (#1021)", () => {
  // The Rage the server starts for an ally: sourced on its own bearer with the spell "Rage" (`ragingCondition`).
  const RAGE_2014: AppliedCondition = { name: "Raging", source: { id: "tam", spell: "Rage" }, ends: { kind: "rounds", remaining: 10 } };
  const rage2024 = (armed: boolean): AppliedCondition => ({ name: "Raging", source: { id: "tam", spell: "Rage" }, ends: { kind: "turn", at: "end", of: "self", armed } });
  const NEXT = { type: "next_turn" } as CommandRequest["commands"][number];
  const hurt = (delta: number) => ({ type: "adjust_hp", instanceId: "tam", delta }) as CommandRequest["commands"][number];
  const ragingNow = (h: Harness) => combatantOf(stored(h), "tam").conditions.some((c) => c.name === "Raging");
  const barbarian = (ruleset: "2014" | "2024" = "2014") => {
    const sheets = withClasses(tamSheets(), classRow("Barbarian", 1));
    sheets.members = sheets.members.map((m) => ({ ...m, ruleset }));
    return sheets;
  };
  const fightWith = (conditions: AppliedCondition[], over: Partial<RunCombatant> = {}) => allyFight({ conditions, ...over });

  // PHB 2014 "Barbarian: Rage": "It ends early ... if your turn ends and you haven't attacked a hostile creature since your last turn or taken damage since then."
  // Tam rages, nobody swings and nobody hurts him, and his turn ends: the Rage goes out. Bug caught: a Rage that lasts the whole minute whatever happens.
  it("fails if a 2014 Rage survives a turn that ended with no attack made and no damage taken", async () => {
    const h = harness(fightWith([RAGE_2014]), { sources: SOURCES, players: barbarian(), map: mapOf(), dieFaces: [] });
    const result = await runBatch(batch("b", NEXT), h.deps);
    expect(ragingNow(h)).toBe(false);
    expect(result.effects).toContainEqual({ type: "condition_ended", instanceId: "tam", name: "Raging", reason: "expired" });
  });

  // The same turn with an attack made (d20 8 + 5 = 13 hits AC 13, a 4 + 3 + 2): the Rage is kept going. Bug caught: the attack not counted, so a raging Barbarian that fought stops raging.
  it("fails if a 2014 Rage ends after a turn the Barbarian attacked in", async () => {
    const h = harness(fightWith([RAGE_2014]), { sources: SOURCES, players: barbarian(), map: mapOf(), dieFaces: [8, 4] });
    await runBatch(batch("t", tamTurn()), h.deps);
    await runBatch(batch("n", NEXT), h.deps);
    expect(ragingNow(h)).toBe(true);
  });

  // "... or taken damage since then": a blow on the Barbarian keeps it, and the temporary hit points that soak the blow are still damage taken.
  // The keep is for one turn's end only: three turns later with nothing since, it goes out. Bug caught: damage ignored, temp hit points ignored, or the keep never reset.
  it.each([
    { name: "hit points", over: {}, delta: -3 },
    { name: "temporary hit points alone", over: { temp_hp: 5 }, delta: -3 },
  ])("fails if a 2014 Rage does not survive $name damage taken, once", async ({ over, delta }) => {
    const h = harness(fightWith([RAGE_2014], over), { sources: SOURCES, players: barbarian(), map: mapOf(), dieFaces: [] });
    await runBatch(batch("hurt", hurt(delta), NEXT), h.deps);
    expect(ragingNow(h)).toBe(true);
    await runBatch(batch("round", NEXT, NEXT), h.deps);
    expect(ragingNow(h)).toBe(false);
  });

  // A Raging the DM typed onto a player by hand carries no source: the table's, not judged (a human-played Barbarian's attacks are rolled at the table).
  it("fails if a Raging the server did not start is ended by the rules", async () => {
    const h = harness(fightWith([{ name: "Raging" }]), { sources: SOURCES, players: barbarian(), map: mapOf(), dieFaces: [] });
    await runBatch(batch("b", NEXT), h.deps);
    expect(ragingNow(h)).toBe(true);
  });

  // "... if you are knocked unconscious" (2014): Tam at 20 takes 20 and is at 0. A lesser blow leaves the Rage (and the damage keeps it). Bug caught: a Barbarian raging on while down.
  it.each([
    { name: "knocked to 0 hit points", delta: -20, raging: false },
    { name: "hurt but standing", delta: -5, raging: true },
  ])("a 2014 Barbarian $name is raging: $raging", async ({ delta, raging }) => {
    const h = harness(fightWith([RAGE_2014]), { sources: SOURCES, players: barbarian(), map: mapOf(), dieFaces: [] });
    await runBatch(batch("b", hurt(delta)), h.deps);
    expect(ragingNow(h)).toBe(raging);
  });

  // PHB 2024 "Rage": it "ends early if you ... have the Incapacitated condition". Stunned incapacitates; Prone does not; a 2014 Rage is not ended by being Stunned (only unconscious).
  it.each([
    { name: "a 2024 Rage and a Stunned Barbarian", ruleset: "2024" as const, rage: rage2024(false), condition: "Stunned", raging: false },
    { name: "a 2024 Rage and a Prone Barbarian", ruleset: "2024" as const, rage: rage2024(false), condition: "Prone", raging: true },
    { name: "a 2014 Rage and a Stunned Barbarian", ruleset: "2014" as const, rage: RAGE_2014, condition: "Stunned", raging: true },
  ])("with $name, raging is $raging", async ({ ruleset, rage, condition, raging }) => {
    const h = harness(fightWith([rage]), { sources: SOURCES, players: barbarian(ruleset), map: mapOf(), ruleset, dieFaces: [] });
    await runBatch(batch("b", { type: "apply_condition", instanceId: "tam", condition: { name: condition } } as CommandRequest["commands"][number]), h.deps);
    expect(ragingNow(h)).toBe(raging);
  });

  // The sheet still shows rage_active after the Rage ended in this fight: the next turn does not start it again. Tam rages from the sheet (no use spent), is knocked to 0 and
  // brought back up, and with no use left he does not rage again. Bug caught: a rage that ended coming back every turn off the sheet's toggle.
  it("fails if a Rage that ended in the fight is started again from the sheet's toggle", async () => {
    const sheets = withResources(barbarian(), pool("rage_uses", 0, 2, "long"));
    sheets.members = sheets.members.map((m) => ({ ...m, class_choices: { rage_active: true } }));
    const h = harness(allyFight(), { sources: SOURCES, players: sheets, map: mapOf(), dieFaces: [8, 4, 8, 4] });
    await runBatch(batch("t1", tamTurn()), h.deps);
    expect(ragingNow(h)).toBe(true);
    await runBatch(batch("down", hurt(-30)), h.deps);
    expect(ragingNow(h)).toBe(false);
    await runBatch(batch("up", hurt(10)), h.deps);
    await runBatch(batch("t2", NEXT, NEXT), h.deps);
    await runBatch(batch("t3", tamTurn()), h.deps);
    expect(ragingNow(h)).toBe(false);
  });

  // PHB 2024 "Rage": it lasts until the end of the NEXT turn. Started on his own turn it survives that turn's end (and the attack he made), is armed when his next turn
  // begins and, with nothing to extend it, ends at that turn's end. Bug caught: the 2014 ten-round condition given to a 2024 Barbarian, or a Rage that ends the turn it began.
  it("fails if a 2024 Rage does not last until the end of the Barbarian's next turn", async () => {
    const h = harness(allyFight(), { sources: SOURCES, players: barbarian("2024"), map: mapOf(), ruleset: "2024", dieFaces: [8, 4] });
    await runBatch(batch("t", tamTurn()), h.deps);
    expect(combatantOf(stored(h), "tam").conditions).toMatchObject([{ name: "Raging", ends: { kind: "turn", at: "end", of: "self" } }]);
    await runBatch(batch("n1", NEXT, NEXT), h.deps);
    expect(ragingNow(h)).toBe(true);
    await runBatch(batch("n2", NEXT), h.deps);
    expect(ragingNow(h)).toBe(false);
  });

  // 2024: "make an attack roll against an enemy" on the turn the Rage would end carries it another round. Armed Rage, Tam attacks (d20 8 + 5 hits, 4 + 3 + 2), and his turn's end
  // leaves it. No Bonus Action is spent for it. Bug caught: the attack not extending, or the Bonus Action spent when the attack already did.
  it("fails if a 2024 Rage is not extended by an attack roll on the turn it would end", async () => {
    const h = harness(fightWith([rage2024(true)]), { sources: SOURCES, players: barbarian("2024"), map: mapOf(), ruleset: "2024", dieFaces: [8, 4] });
    await runBatch(batch("t", tamTurn()), h.deps);
    expect(combatantOf(stored(h), "tam").bonus_used).not.toBe(true);
    await runBatch(batch("n", NEXT), h.deps);
    expect(combatantOf(stored(h), "tam").conditions).toMatchObject([{ name: "Raging", ends: { kind: "turn", armed: false } }]);
  });

  // The attack on the turn the Rage began extends nothing (it already lasts through this turn's end), so the sheet's conditions are not written again for it.
  // Bug caught: every attack of a raging Barbarian rewriting its conditions to the character.
  it("fails if an attack by a 2024 Rage that is not armed writes the conditions again", async () => {
    const h = harness(fightWith([rage2024(false)]), { sources: SOURCES, players: barbarian("2024"), map: mapOf(), ruleset: "2024", dieFaces: [8, 4] });
    const result = await runBatch(batch("t", tamTurn()), h.deps);
    expect(result.effects.filter((e) => e.type === "player_persist" && "patch" in e && "conditions" in e.patch)).toEqual([]);
  });

  // 2024: with no attack to make, "take a Bonus Action to extend your Rage". The ox stands twenty squares away, out of any reach this turn, so the rules-picked turn is a walk,
  // and the Bonus Action extends the armed Rage. With the Bonus Action already used there is nothing to extend it and the Rage ends at the turn's end; and a Rage that is not
  // armed (it began this turn) needs no extension, so the Bonus Action is left. Bug caught: no extension, a free one, or an unneeded one.
  it.each([
    { name: "a free Bonus Action", conditions: [rage2024(true)], over: {}, raging: true, bonus: true },
    { name: "the Bonus Action used", conditions: [rage2024(true)], over: { bonus_used: true }, raging: false, bonus: true },
    { name: "a Rage that is not armed", conditions: [rage2024(false)], over: {}, raging: true, bonus: false },
  ])("a 2024 Barbarian who only walks, with $name: raging $raging, Bonus Action used $bonus", async ({ conditions, over, raging, bonus }) => {
    const far = row({
      combatants_live: [
        pc("tam", { faction_id: "p", hp: 20, max_hp: 20, initiative: 12, position: { x: 1, y: 1 }, conditions, ...over }),
        combatant("victim", { monster_id: "m-ox", faction_id: "m", hp: 40, max_hp: 40, ac: "13", initiative: 5, position: { x: 21, y: 1 } }),
      ],
    });
    const h = harness(far, { sources: SOURCES, players: barbarian("2024"), map: mapOf(), ruleset: "2024", dieFaces: [] });
    const result = await runBatch(batch("t", tamTurn()), h.deps);
    expect(result.effects[0]).toMatchObject({ turn: { kind: expect.not.stringMatching(/^attack$/) } });
    await runBatch(batch("n", NEXT), h.deps);
    expect(ragingNow(h)).toBe(raging);
    expect(combatantOf(stored(h), "tam").bonus_used === true).toBe(bonus);
  });
});

describe("take_turn: a Monk's weapons", () => {
  // Tam, a 1st-level Monk: Strength 10 (+0), Dexterity 16 (+3), proficiency +2, Martial Arts die d4, holding `gear`. The ox has AC 13.
  const weapon = (id: string, name: string, subtype: string, dice: string, properties: string[] = []) => ({ id, name, item_type: "weapon", properties, tags: [], subtype, charges: null, weapon_range: null, damage_rolls: [{ dice, type: "bludgeoning" }] }) as unknown as Item;
  const held = (id: string, slot: "main_hand" | "off_hand" = "main_hand") => ({ id: `inv-${id}`, item_id: id, library_item_id: null, name: id, quantity: 1, carried_by: "pm-tam", slot, location: "equipped" }) as unknown as PartyInventoryItem;
  const monk = (items: Item[], slots: Array<[string, "main_hand" | "off_hand" | "body"]>, ruleset: "2014" | "2024" = "2014", level = 1) => {
    const gear = slots.map(([id, slot]) => ({ ...held(id), slot })) as PartyInventoryItem[];
    const sheets = withClasses(tamSheets({ gear, items }), classRow("Monk", level));
    sheets.members = sheets.members.map((m) => ({ ...m, str: 10, dex: 16, ruleset }));
    return sheets;
  };
  const QUARTERSTAFF = weapon("staff", "Quarterstaff", "Simple Melee Weapons", "1d6", ["versatile"]);
  const GREATCLUB = weapon("club", "Greatclub", "Simple Melee Weapons", "1d8", ["two-handed"]);
  const SCIMITAR = weapon("scimitar", "Scimitar", "Martial Melee Weapons", "1d6", ["finesse", "light"]);
  const SHORTSWORD = weapon("shortsword", "Shortsword", "Martial Melee Weapons", "1d6", ["finesse", "light"]);
  const LONGSWORD_M = weapon("sword", "Longsword", "Martial Melee Weapons", "1d8", ["versatile"]);
  const CHAIN_MAIL = { id: "mail", name: "Chain Mail", item_type: "armor", properties: [], tags: [], subtype: "Heavy Armor", armor_class: "16" } as unknown as Item;
  const SHIELD = { id: "shield", name: "Shield", item_type: "shield", properties: [], tags: [], subtype: null, armor_class: "2" } as unknown as Item;

  // PHB 2014 "Monk: Martial Arts": a monk weapon (a simple melee weapon without two-handed or heavy; a quarterstaff) is struck with Dexterity (+3, proficiency +2: d20 8 -> 13 hits AC 13), the
  // Martial Arts die stands in only when it is greater (the staff's d6 stays: 4 + 3 = 7), and the Attack action with it is followed by an unarmed strike as a Bonus Action
  // (d20 9 + 5 = 14, the d4 of 2 + 3 = 5): 40 - 7 - 5 = 28. Bug caught: a Monk who swings a staff with Strength 10, or gets no bonus strike after it.
  it("fails if a Monk's quarterstaff is not struck with Dexterity and followed by a Martial Arts strike", async () => {
    const h = harness(allyFight(), { sources: SOURCES, players: monk([QUARTERSTAFF], [["staff", "main_hand"]]), map: mapOf(), dieFaces: [8, 4, 9, 2] });
    await runBatch(batch("b", tamTurn()), h.deps);
    // The staff is what struck (not the fists): Dexterity +3 and proficiency +2 on the attack, the staff's d6 and not the d4 on the damage, then the d4 of the bonus strike.
    expect(h.posted.map((p) => [p.result.label, p.result.modifier])).toEqual([["staff attack vs victim", 5], ["staff damage vs victim (bludgeoning)", 3], ["Unarmed Strike attack vs victim", 5], ["Unarmed Strike damage vs victim (bludgeoning)", 3]]);
    expect(h.dieSides).toEqual([20, 6, 20, 4]);
    expect(hpOf(stored(h), "victim")).toBe(28);
    expect(combatantOf(stored(h), "tam").bonus_used).toBe(true);
  });

  // What is a monk weapon, by edition. A strike with d20 10: a monk weapon hits AC 13 on Dexterity (+5) and is followed by a bonus strike (d20 10 + 5 hits; a 4 on the greater die + 3 each time),
  // a weapon that is not one takes Strength (+2: 12 misses) or, for a finesse weapon, still Dexterity, and gets no bonus strike.
  // Greatclub (two-handed, 1d8): 2014 no, 2024 yes (Simple melee). Scimitar (Martial, Light): 2014 no, 2024 yes. Shortsword: both (2014 names it; 2024 Martial and Light). Longsword: neither.
  // Monk weapon: 4 + 3 and 4 + 3 = 14 (40 -> 26). Not one: a greatclub misses (40); a finesse scimitar hits once for 4 + 3 = 7 (33); a longsword misses (40).
  it.each([
    { name: "a greatclub under 2014", ruleset: "2014" as const, item: GREATCLUB, hp: 40 },
    { name: "a greatclub under 2024", ruleset: "2024" as const, item: GREATCLUB, hp: 26 },
    { name: "a scimitar under 2014", ruleset: "2014" as const, item: SCIMITAR, hp: 33 },
    { name: "a scimitar under 2024", ruleset: "2024" as const, item: SCIMITAR, hp: 26 },
    { name: "a shortsword under 2014", ruleset: "2014" as const, item: SHORTSWORD, hp: 26 },
    { name: "a shortsword under 2024", ruleset: "2024" as const, item: SHORTSWORD, hp: 26 },
    { name: "a longsword under 2024", ruleset: "2024" as const, item: LONGSWORD_M, hp: 40 },
  ])("strikes with $name as a Monk by the edition's list of monk weapons", async ({ ruleset, item, hp }) => {
    const h = harness(allyFight(), { sources: SOURCES, players: monk([item], [[item.id, "main_hand"]], ruleset), map: mapOf(), ruleset, dieFaces: [10, 4, 10, 4] });
    await runBatch(batch("b", tamTurn()), h.deps);
    expect(hpOf(stored(h), "victim")).toBe(hp);
  });

  // PHB 2014 "Martial Arts": the benefits are for a Monk "unarmed or wielding only monk weapons, and not wearing armor or wielding a shield". In chain mail, behind a shield, or with a longsword
  // in the other hand, Tam strikes with Strength (+2: d20 10 -> 12 misses AC 13), and bare hands are the same. Bug caught: Martial Arts that works in armor, with a shield or beside a sword.
  it.each([
    { name: "chain mail", items: [QUARTERSTAFF, CHAIN_MAIL], slots: [["staff", "main_hand"], ["mail", "body"]] as Array<[string, "main_hand" | "off_hand" | "body"]> },
    { name: "a shield", items: [QUARTERSTAFF, SHIELD], slots: [["staff", "main_hand"], ["shield", "off_hand"]] as Array<[string, "main_hand" | "off_hand" | "body"]> },
    { name: "a longsword in the other hand", items: [QUARTERSTAFF, LONGSWORD_M], slots: [["staff", "main_hand"], ["sword", "off_hand"]] as Array<[string, "main_hand" | "off_hand" | "body"]> },
    { name: "chain mail and bare hands", items: [CHAIN_MAIL], slots: [["mail", "body"]] as Array<[string, "main_hand" | "off_hand" | "body"]> },
  ])("fails if a Monk with $name strikes with Martial Arts", async ({ items, slots }) => {
    const h = harness(allyFight(), { sources: SOURCES, players: monk(items, slots), map: mapOf(), dieFaces: [10, 4, 10, 4] });
    await runBatch(batch("b", tamTurn()), h.deps);
    expect(hpOf(stored(h), "victim")).toBe(40);
    expect(combatantOf(stored(h), "tam").bonus_used).not.toBe(true);
  });
});

describe("take_turn: an ally's Attack action with a mixed set of weapons", () => {
  const HANDAXE = {
    id: "axe", name: "Handaxe", item_type: "weapon", properties: ["light", "thrown"], tags: [], subtype: null, charges: null, weapon_range: "20/60",
    damage_rolls: [{ dice: "1d6", type: "slashing" }], rarity: "mundane", image_url: null, description: "A plain handaxe.",
  } as unknown as Item;
  const handaxes = (quantity: number) => ({ id: "inv-axe", item_id: "axe", library_item_id: null, name: "Handaxe", quantity, carried_by: "pm-tam", slot: "off_hand", location: "equipped", quality: "standard" }) as unknown as PartyInventoryItem;
  const thrower = (levels: number, gear: PartyInventoryItem[], className = "Fighter") => withClasses(tamSheets({ gear, items: [DAGGER, HANDAXE] }), classRow(className, levels));
  // Tam has used all his movement, so the ox 25 feet away is out of any melee reach and what he can do is throw, from beyond the 20 feet of normal range: each throw rolls two d20s
  // (disadvantage at long range) and takes the lower. Sword and bare hands cannot reach, so the throws are the whole turn.
  const standing = () => {
    const fight = archerFight();
    fight.combatants_live[0] = { ...fight.combatants_live[0], movement_used: 30 };
    return fight;
  };

  // PHB 2014 "Extra Attack": two attacks with the Attack action, each with a weapon the character holds. A Ranger of 5th level (Extra Attack, no Action Surge) holds one dagger and one handaxe to throw: neither can be thrown
  // twice, so the set is the handaxe and then the dagger (+5 to hit; the handaxe's d20s 15 and 15 meet AC 13, 1d6 of 3 + 3 = 6; the dagger's 15 and 15, 1d4 of 2 + 3 = 5: 40 - 11 = 29).
  // Both leave the hand and lie on the ground. Bug caught: one throw for a Fighter who has two attacks and two things to throw.
  it("fails if a Ranger with two attacks and a dagger and a handaxe does not throw both", async () => {
    const h = harness(standing(), { sources: SOURCES, players: thrower(5, [daggers(1), handaxes(1)], "Ranger"), map: mapOf(), dieFaces: [15, 15, 3, 15, 15, 2] });
    const result = await runBatch(batch("b", tamTurn()), h.deps);
    expect(result.effectFailures).toEqual([]);
    expect(result.effects[0]).toMatchObject({ turn: { optionId: "attack:actions:Extra Attack (Handaxe (thrown) + Dagger (thrown)):victim" } });
    expect(hpOf(stored(h), "victim")).toBe(29);
    expect(h.gearWrites).toEqual([[{ kind: "remove", inventoryId: "inv-axe" }], [{ kind: "remove", inventoryId: "inv-dagger" }]]);
    expect(h.drops.map((d) => d.drop.name)).toEqual(["Handaxe", "Dagger"]);
  });

  // The cases it must NOT apply. Two handaxes make every swing with one weapon (the single-weapon set, no mixed entry, the dagger left alone); a single dagger has nothing to make a second
  // swing with (one throw: d20s 15 and 15, 1d4 of 2 + 3 = 5: 40 -> 35); a 1st-level Fighter has one attack, so one throw. Bug caught: a mixed set where one weapon makes every swing, or
  // where nothing is left for the second.
  it.each([
    { name: "two handaxes and a dagger", fighter: 5, className: "Ranger", gear: () => [daggers(1), handaxes(2)], id: "attack:actions:Extra Attack (Handaxe (thrown)):victim", dice: [15, 15, 3, 15, 15, 3], hp: 28 },
    { name: "a single dagger", fighter: 5, className: "Ranger", gear: () => [daggers(1)], id: "attack:actions:Dagger (thrown):victim", dice: [15, 15, 2], hp: 35 },
    { name: "a 1st-level Fighter and two throwing weapons", fighter: 1, className: "Fighter", gear: () => [daggers(1), handaxes(1)], id: "attack:actions:Handaxe (thrown):victim", dice: [15, 15, 3], hp: 34 },
  ])("makes the turn $id with $name", async ({ fighter, className, gear, id, dice, hp }) => {
    const h = harness(standing(), { sources: SOURCES, players: thrower(fighter, gear(), className), map: mapOf(), dieFaces: [...dice] });
    const result = await runBatch(batch("b", tamTurn()), h.deps);
    expect(result.effects[0]).toMatchObject({ turn: { optionId: id } });
    expect(hpOf(stored(h), "victim")).toBe(hp);
  });

  // A surge that adds no swing is not spent: a 5th-level Fighter (two attacks, four with the surge) who has only the two pieces to throw makes the plain Extra Attack set. Bug caught:
  // the Fighter's Action Surge burnt on a mixed set no longer than the Attack action it replaces.
  it("fails if Action Surge is spent on a mixed set no longer than the Attack action", async () => {
    const h = harness(standing(), { sources: SOURCES, players: thrower(5, [daggers(1), handaxes(1)]), map: mapOf(), dieFaces: [15, 15, 3, 15, 15, 2] });
    const result = await runBatch(batch("b", tamTurn()), h.deps);
    expect(result.effects[0]).toMatchObject({ turn: { optionId: "attack:actions:Extra Attack (Handaxe (thrown) + Dagger (thrown)):victim" } });
    expect(h.resourceWrites).toEqual([]);
  });

  // PHB 2014 "Fighter: Action Surge" doubles the Attack action: a 2nd-level Fighter (one attack) with a dagger and a handaxe throws both on the surge (the same two swings) and the use is written.
  // Bug caught: Action Surge that cannot fill two swings from two weapons, or is not charged.
  it("fails if Action Surge does not carry a mixed set of two weapons", async () => {
    const h = harness(standing(), { sources: SOURCES, players: thrower(2, [daggers(1), handaxes(1)]), map: mapOf(), dieFaces: [15, 15, 3, 15, 15, 2] });
    const result = await runBatch(batch("b", tamTurn()), h.deps);
    expect(result.effects[0]).toMatchObject({ turn: { optionId: "attack:actions:Action Surge (Handaxe (thrown) + Dagger (thrown)):victim" } });
    expect(hpOf(stored(h), "victim")).toBe(29);
    expect(writtenResources(h)).toEqual({ action_surge: { current: 0, max: 1, rest: "short" } });
  });
});

describe("take_turn: an ally's Action Surge carries a cast", () => {
  // Tam is a 5th-level Wizard (Fire Bolt, Fireball; two 3rd-level slots) and a Fighter of `fighter` levels, 25 feet from the ox (AC 13, 40 hit points).
  const eldritch = (fighter: number, over: { slots?: SpellSlotEntry[]; ruleset?: "2014" | "2024"; resources?: Parameters<typeof withResources>[1] } = {}) => {
    const sheets = wizardTamSheets({ slots: over.slots });
    sheets.casting = { ...sheets.casting, classes: [...sheets.casting.classes, { ...classRow("Fighter", fighter), id: "cls-fig", is_primary: false, sort_order: 1 }] };
    sheets.members = sheets.members.map((m) => ({ ...m, ruleset: over.ruleset ?? "2014" }));
    return over.resources === undefined ? sheets : withResources(sheets, over.resources);
  };
  // The ox fails each Dexterity save (d20 2 against DC 14) and takes 8 dice of 1, 8 damage a Fireball.
  const BALLS = [2, 1, 1, 1, 1, 1, 1, 1, 1];

  // PHB 2014 "Fighter: Action Surge": one additional action, and nothing in it bars a spell; Fireball twice spends both 3rd-level slots and one use of the surge.
  // 40 - 8 - 8 = 24. Bug caught: a Fighter with a spell and a surge that only ever surges into weapon swings, or a surge that is not charged.
  it("fails if a Fighter-Wizard with Action Surge and two slots does not cast twice and spend the use", async () => {
    const h = harness(archerFight(), { sources: SOURCES, players: eldritch(2), map: mapOf(), spells: [fireBolt(), fireball()], dieFaces: [...BALLS, ...BALLS] });
    const result = await runBatch(batch("b", tamTurn()), h.deps);
    expect(result.effectFailures).toEqual([]);
    expect(result.effects[0]).toMatchObject({ turn: { kind: "spell", optionId: "surge:spell:Fireball:3:victim+spell:Fireball:3:victim" } });
    expect(hpOf(stored(h), "victim")).toBe(24);
    expect(h.slotWrites.at(-1)).toEqual({ memberId: "pm-tam", slots: [{ level: 3, max: 2, used: 2 }] });
    expect(writtenResources(h)).toEqual({ action_surge: { current: 0, max: 1, rest: "short" } });
    expect(combatantOf(stored(h), "tam").action_used).toBe(true);
  });

  // With one slot left the extra action is the cantrip: Fireball takes the last slot (8), then Fire Bolt (d20 10 + 6 = 16 meets AC 13, 2d10 of 6 and 4 = 10): 40 - 8 - 10 = 22.
  // The slot list is written once at 2 of 2, never 3. Bug caught: a second cast of a slot that is not there (the batch would refuse), or the cantrip left out.
  it("fails if the extra action is not the cantrip when the slots are spent", async () => {
    const h = harness(archerFight(), { sources: SOURCES, players: eldritch(2, { slots: [{ level: 3, max: 2, used: 1 }] }), map: mapOf(), spells: [fireBolt(), fireball()], dieFaces: [...BALLS, 10, 6, 4] });
    const result = await runBatch(batch("b", tamTurn()), h.deps);
    expect(result.effects[0]).toMatchObject({ turn: { optionId: "surge:spell:Fireball:3:victim+spell:Fire Bolt:0:victim" } });
    expect(hpOf(stored(h), "victim")).toBe(22);
    expect(h.slotWrites.at(-1)).toEqual({ memberId: "pm-tam", slots: [{ level: 3, max: 2, used: 2 }] });
  });

  // The cases it must NOT apply: the 2024 Action Surge is "one additional action, except the Magic action"; no use left; a 1st-level Fighter has no surge. Each casts one Fireball (8: 40 -> 32).
  it.each([
    { name: "a 2024 Fighter", sheets: () => eldritch(2, { ruleset: "2024" }) },
    { name: "a Fighter with no use left", sheets: () => eldritch(2, { resources: pool("action_surge", 0, 1) }) },
    { name: "a 1st-level Fighter", sheets: () => eldritch(1) },
  ])("fails if $name takes a second action for a spell", async ({ sheets }) => {
    const h = harness(archerFight(), { sources: SOURCES, players: sheets(), map: mapOf(), spells: [fireBolt(), fireball()], ruleset: sheets().members[0].ruleset, dieFaces: [...BALLS] });
    await runBatch(batch("b", tamTurn()), h.deps);
    expect(hpOf(stored(h), "victim")).toBe(32);
    expect(h.resourceWrites).toEqual([]);
  });

  // A turn the caller named is exactly that turn: naming the Fireball casts it once and the surge is not spent. Bug caught: a surge added to a turn the caller chose.
  it("fails if a named cast gets an extra action the caller did not ask for", async () => {
    const h = harness(archerFight(), { sources: SOURCES, players: eldritch(2), map: mapOf(), spells: [fireBolt(), fireball()], dieFaces: [...BALLS] });
    await runBatch(batch("b", tamTurn({ optionId: BALL })), h.deps);
    expect(hpOf(stored(h), "victim")).toBe(32);
    expect(h.resourceWrites).toEqual([]);
  });
});

describe("take_turn: an ally Monk's Martial Arts and Flurry of Blows", () => {
  const monkSheets = (level: number, resources: Parameters<typeof withResources>[1] = {}) => {
    const sheets = withResources(withClasses(tamSheets({ bare: true }), classRow("Monk", level)), resources);
    sheets.members = sheets.members.map((m) => ({ ...m, str: 10, dex: 16 }));
    return sheets;
  };
  // PHB 2014 "Monk: Martial Arts" (a d4 die at 1st level, Dexterity for the strike) and "Flurry of Blows" (immediately after the Attack action, spend 1 ki:
  // two unarmed strikes as a Bonus Action; ki points equal the Monk level from 2nd). Dexterity 16 is +3, proficiency +2: +5 to hit, 1d4+3.
  // d20 8 -> 13, d4 2 = 5; Flurry: 9 -> 14, d4 1 = 4; 10 -> 15, d4 3 = 6 (40 -> 25). Ki 2 of 2 -> 1, written after the save.
  // Bug caught: the flat 1 + Strength strike (Str 10 would deal 1), no Flurry, or a Flurry for free.
  it("fails if a 2nd-level Monk does not strike with the Martial Arts die, then Flurry for two more and spend a Ki point", async () => {
    const h = harness(allyFight(), { sources: SOURCES, players: monkSheets(2), map: mapOf(), dieFaces: [8, 2, 9, 1, 10, 3] });
    await runBatch(batch("b", tamTurn()), h.deps);
    expect(hpOf(stored(h), "victim")).toBe(25);
    expect(combatantOf(stored(h), "tam").bonus_used).toBe(true);
    expect(writtenResources(h)).toEqual({ ki_points: { current: 1, max: 2, rest: "short" } });
    expect(h.log.indexOf("save")).toBeLessThan(h.log.indexOf("resources"));
  });

  // With no Ki left (or before Ki at 1st level) the Bonus Action is Martial Arts alone: one more unarmed strike, no use spent
  // (PHB 2014 "Martial Arts": when you use the Attack action with an unarmed strike, make one unarmed strike as a Bonus Action). 5 + 4 = 9 (40 -> 31).
  it.each([
    { name: "a Monk with no Ki left", sheets: monkSheets(2, pool("ki_points", 0, 2)) },
    { name: "a 1st-level Monk", sheets: monkSheets(1) },
  ])("makes one more unarmed strike for $name and writes nothing", async ({ sheets }) => {
    const h = harness(allyFight(), { sources: SOURCES, players: sheets, map: mapOf(), dieFaces: [8, 2, 9, 1] });
    await runBatch(batch("b", tamTurn()), h.deps);
    expect(hpOf(stored(h), "victim")).toBe(31);
    expect(h.resourceWrites).toEqual([]);
  });

  // PHB 2014 "Martial Arts": the bonus strike follows the Attack action made with an unarmed strike or a monk weapon. A Fighter's fists get none (no Martial Arts), and a 1st-level Monk's
  // longsword is not a monk weapon, so it gets none either (7: 40 -> 33). Bug caught: a bonus strike for any ally with bare hands, or after any weapon.
  it("fails if a Fighter's Unarmed Strike or a Monk's longsword is followed by a Martial Arts strike", async () => {
    const fists = harness(allyFight(), { sources: SOURCES, players: withClasses(tamSheets({ bare: true }), classRow("Fighter", 1)), map: mapOf(), dieFaces: [8] });
    await runBatch(batch("b", tamTurn()), fists.deps);
    expect(hpOf(stored(fists), "victim")).toBe(36);
    const sword = harness(allyFight(), { sources: SOURCES, players: withClasses(tamSheets(), classRow("Monk", 1)), map: mapOf(), dieFaces: [8, 4] });
    await runBatch(batch("b", tamTurn()), sword.deps);
    expect(hpOf(stored(sword), "victim")).toBe(33);
    expect(sword.resourceWrites).toEqual([]);
  });

  // PHB 2014 "Flurry of Blows": "immediately after you take the Attack action", with any attack: a 2nd-level Monk who swings a longsword (d20 8 + 5 hits AC 13, 1d8 of 4 + 3 = 7) spends a Ki point on two
  // unarmed strikes. A longsword is no monk weapon, so Martial Arts does not apply to them: +5 (Strength) and the flat 1 + 3 = 4 each (9 and 10 hit): 40 - 7 - 4 - 4 = 25, Ki 1 of 2.
  // Bug caught: a Flurry asked to follow an Unarmed Strike only, or Martial Arts dice on a Monk who holds a sword.
  it("fails if a Monk's Flurry of Blows does not follow an Attack action made with a weapon", async () => {
    const h = harness(allyFight(), { sources: SOURCES, players: withResources(withClasses(tamSheets(), classRow("Monk", 2)), {}), map: mapOf(), dieFaces: [8, 4, 9, 10] });
    await runBatch(batch("b", tamTurn()), h.deps);
    expect(hpOf(stored(h), "victim")).toBe(25);
    expect(writtenResources(h)).toEqual({ ki_points: { current: 1, max: 2, rest: "short" } });
  });

  // The Flurry follows a strike that landed on someone: with the foe already down after the Attack action (5 hit points, a 5), no Ki is spent.
  // Bug caught: Ki spent on strikes with no one to land on.
  it("spends no Ki on a Flurry when the Attack action dropped its target", async () => {
    const h = harness(allyFight(), { sources: SOURCES, players: monkSheets(2), map: mapOf(), dieFaces: [8, 2] });
    const fight = stored(h);
    fight.combatants_live = fight.combatants_live.map((c) => (c.instance_id === "victim" ? { ...c, hp: 5 } : c));
    await runBatch(batch("b", tamTurn()), h.deps);
    expect(hpOf(stored(h), "victim")).toBe(0);
    expect(h.resourceWrites).toEqual([]);
  });

  // PHB 2014 "Wild Shape": a Wild Shaped Monk fights as the beast, no Ki spent.
  it("fails if a Wild Shaped Monk flurries", async () => {
    const sheets = withClasses(tamSheets({ wildshape: true, bear: true }), classRow("Monk", 2));
    const h = harness(allyFight(), { sources: SOURCES, players: sheets, map: mapOf(), dieFaces: [8, 5] });
    await runBatch(batch("b", tamTurn()), h.deps);
    expect(h.resourceWrites).toEqual([]);
  });
});

describe("take_turn: an ally Paladin's Divine Smite", () => {
  const paladinSheets = (level: number, slots: SpellSlotEntry[], ruleset: "2014" | "2024" = "2014", ...more: CharacterClass[]) => {
    const sheets = withClasses(tamSheets(), classRow("Paladin", level), ...more);
    sheets.members = sheets.members.map((m) => ({ ...m, spell_slots: slots, ruleset }));
    return sheets;
  };
  const SLOT_1 = [{ level: 1, max: 2, used: 0 }];
  // PHB 2014 "Paladin: Divine Smite": on a melee weapon hit, spend a slot for 2d8 radiant damage at 1st level. d20 8 + 5 = 13 hits AC 13; the d8 of 4 + 3 = 7;
  // the smite's two d8 are 3 and 5 = 8 (40 -> 25). One 1st-level slot is spent and written after the save; in 2014 no Bonus Action is used.
  // Bug caught: a Paladin that never smites, or smites for free.
  it("fails if a 2nd-level Paladin does not smite on a hit and spend the slot, written after the save", async () => {
    const h = harness(allyFight(), { sources: SOURCES, players: paladinSheets(2, SLOT_1), map: mapOf(), dieFaces: [8, 4, 3, 5] });
    await runBatch(batch("b", tamTurn()), h.deps);
    expect(hpOf(stored(h), "victim")).toBe(25);
    expect(h.slotWrites).toEqual([{ memberId: "pm-tam", slots: [{ level: 1, max: 2, used: 1 }] }]);
    expect(h.log.indexOf("save")).toBeLessThan(h.log.indexOf("slots"));
    expect(combatantOf(stored(h), "tam").bonus_used).not.toBe(true);
  });

  // PHB 2014 "Divine Smite": +1d8 against a fiend or an undead, and the lowest unspent slot is spent (a 1st-level slot is there, so 2d8 and not 3d8).
  // The undead ox: 4 + 3 = 7; smite 2d8 + 1d8 of 2 each = 6 (40 -> 27). The 2nd-level slot is left alone.
  it("adds the extra die against an undead, from the lowest slot", async () => {
    const undead = { ...SOURCES, monsters: [monster("m-wolf"), { ...monster("m-ox"), monster_type: "Undead" } as unknown as Monster] };
    const h = harness(allyFight(), { sources: undead, players: paladinSheets(2, [{ level: 1, max: 1, used: 0 }, { level: 2, max: 1, used: 0 }]), map: mapOf(), dieFaces: [8, 4, 2, 2, 2] });
    await runBatch(batch("b", tamTurn()), h.deps);
    expect(hpOf(stored(h), "victim")).toBe(40 - 7 - 6);
    expect(h.slotWrites[0].slots).toEqual([{ level: 1, max: 1, used: 1 }, { level: 2, max: 1, used: 0 }]);
  });

  // PHB 2014 "Divine Smite": +1d8 for each slot level above 1st. With only a 2nd-level slot left the smite is 3d8 of 2 = 6 (40 -> 27 with the 7 of the hit).
  it("deals 3d8 from a 2nd-level slot", async () => {
    const h = harness(allyFight(), { sources: SOURCES, players: paladinSheets(2, [{ level: 1, max: 1, used: 1 }, { level: 2, max: 1, used: 0 }]), map: mapOf(), dieFaces: [8, 4, 2, 2, 2] });
    await runBatch(batch("b", tamTurn()), h.deps);
    expect(hpOf(stored(h), "victim")).toBe(40 - 7 - 6);
    expect(h.slotWrites[0].slots).toEqual([{ level: 1, max: 1, used: 1 }, { level: 2, max: 1, used: 1 }]);
  });

  // PHB 2014 "Critical Hits": the smite's dice double. d20 20: the d8 twice (1, 1) + 3 = 5 and the smite 4d8 of 1 = 4 (40 -> 31). Bug caught: the smite's dice left out of the doubling.
  it("doubles the smite's dice on a critical hit", async () => {
    const h = harness(allyFight(), { sources: SOURCES, players: paladinSheets(2, SLOT_1), map: mapOf(), dieFaces: [20, 1, 1, 1, 1, 1, 1] });
    await runBatch(batch("b", tamTurn()), h.deps);
    expect(hpOf(stored(h), "victim")).toBe(31);
  });

  // A miss costs no slot (the smite is added to a hit).
  it("fails if a missed attack spends the slot", async () => {
    const h = harness(allyFight(), { sources: SOURCES, players: paladinSheets(2, SLOT_1), map: mapOf(), dieFaces: [2] });
    await runBatch(batch("b", tamTurn()), h.deps);
    expect(h.slotWrites).toEqual([]);
  });

  // The cases it must NOT apply: no slot left, a 1st-level Paladin (Divine Smite is gained at 2nd), a Fighter with slots, a bow (not a melee attack), Wild Shaped.
  // Only the longsword's d20 and d8 are scripted, so a rolled smite die throws.
  it.each([
    { name: "a Paladin with no slot left", sheets: paladinSheets(2, [{ level: 1, max: 2, used: 2 }]) },
    { name: "a 1st-level Paladin", sheets: paladinSheets(1, SLOT_1) },
    { name: "a Fighter with slots", sheets: (() => { const s = withClasses(tamSheets(), classRow("Fighter", 1)); s.members = s.members.map((m) => ({ ...m, spell_slots: SLOT_1 })); return s; })() },
  ])("fails if $name smites", async ({ sheets }) => {
    const h = harness(allyFight(), { sources: SOURCES, players: sheets, map: mapOf(), dieFaces: [8, 4] });
    await runBatch(batch("b", tamTurn()), h.deps);
    expect(hpOf(stored(h), "victim")).toBe(33);
    expect(h.slotWrites).toEqual([]);
  });

  it("fails if a Paladin's bow shot smites", async () => {
    const sheets = paladinSheets(2, SLOT_1);
    sheets.inventory = [SHORTBOW_HELD, ARROWS_ON_BELT];
    sheets.items = [SHORTBOW];
    const h = harness(archerFight(), { sources: SOURCES, players: sheets, map: mapOf(), dieFaces: [15, 4] });
    await runBatch(batch("b", tamTurn()), h.deps);
    expect(h.slotWrites).toEqual([]);
  });

  it("fails if a Wild Shaped Paladin smites", async () => {
    const sheets = paladinSheets(2, SLOT_1);
    const wild = tamSheets({ wildshape: true, bear: true });
    const h = harness(allyFight(), { sources: SOURCES, players: { ...wild, casting: sheets.casting, members: wild.members.map((m) => ({ ...m, spell_slots: SLOT_1 })) }, map: mapOf(), dieFaces: [8, 5] });
    await runBatch(batch("b", tamTurn()), h.deps);
    expect(h.slotWrites).toEqual([]);
  });

  // PHB 2024 "Paladin's Smite": the Paladin "can cast it once without expending a spell slot", regained on a Long Rest: the free cast is a 1st-level Divine Smite (2d8) that spends the sheet's own
  // use. d20 8 + 5 hits AC 13, 4 + 3 = 7, the smite's 3 + 5 = 8 (40 -> 25). No slot is written (not even one is held), the use is 0 of 1, and the Bonus Action is the cast's.
  // Bug caught: the free cast taking a slot a Paladin does not have, or being free every time.
  it("fails if a 2024 Paladin's first smite is not the free cast, a use of the sheet and no slot", async () => {
    const h = harness(allyFight(), { sources: SOURCES, players: paladinSheets(2, [], "2024"), map: mapOf(), ruleset: "2024", dieFaces: [8, 4, 3, 5] });
    await runBatch(batch("b", tamTurn()), h.deps);
    expect(hpOf(stored(h), "victim")).toBe(25);
    expect(h.slotWrites).toEqual([]);
    expect(writtenResources(h)).toEqual({ paladins_smite: { current: 0, max: 1, rest: "long" } });
    expect(combatantOf(stored(h), "tam").bonus_used).toBe(true);
  });

  // With the free cast spent the smite takes the lowest slot as it always did; the 2014 Paladin has no free cast at all (its sheet may hold the use, nothing reads it). Both: 2d8 for a 1st-level slot,
  // one slot written, no use written.
  it.each([
    { name: "a 2024 Paladin with the free cast spent", ruleset: "2024" as const, resources: pool("paladins_smite", 0, 1, "long") },
    { name: "a 2014 Paladin with the use on its sheet", ruleset: "2014" as const, resources: pool("paladins_smite", 1, 1, "long") },
  ])("spends a slot for the smite of $name", async ({ ruleset, resources }) => {
    const h = harness(allyFight(), { sources: SOURCES, players: withResources(paladinSheets(2, SLOT_1, ruleset), resources), map: mapOf(), ruleset, dieFaces: [8, 4, 3, 5] });
    await runBatch(batch("b", tamTurn()), h.deps);
    expect(hpOf(stored(h), "victim")).toBe(25);
    expect(h.slotWrites).toEqual([{ memberId: "pm-tam", slots: [{ level: 1, max: 2, used: 1 }] }]);
    expect(h.resourceWrites).toEqual([]);
  });

  // PHB 2024 "Divine Smite" is cast as a Bonus Action: with it already used, not even the free cast happens (and the use is kept). 7 on the hit alone: 40 -> 33.
  it("fails if the 2024 free smite is cast with the Bonus Action spent", async () => {
    const h = harness(allyFight({ bonus_used: true }), { sources: SOURCES, players: paladinSheets(2, [], "2024"), map: mapOf(), ruleset: "2024", dieFaces: [8, 4] });
    await runBatch(batch("b", tamTurn()), h.deps);
    expect(hpOf(stored(h), "victim")).toBe(33);
    expect(h.resourceWrites).toEqual([]);
  });

  // PHB 2014 "Improved Divine Smite" (11th level): every melee weapon hit takes an extra 1d8 radiant damage, no slot. A Paladin of 11th level (two attacks) with no slot left: the first blow is
  // d20 8 + 5 hits, the longsword's 4 + 3 and the extra die of 2 (9); the second d20 9 hits, 3 + 3 and 1 (7): 40 -> 24. Nothing is written. A Paladin of 10th has no extra die (7 + 6: 40 -> 27).
  // Bug caught: the extra die left out, or given before 11th level.
  it.each([
    { name: "an 11th-level Paladin", level: 11, dice: [8, 4, 2, 9, 3, 1], hp: 24 },
    { name: "a 10th-level Paladin", level: 10, dice: [8, 4, 9, 3], hp: 27 },
  ])("takes the extra radiant die of $name on every melee hit", async ({ level, dice, hp }) => {
    const h = harness(allyFight(), { sources: SOURCES, players: paladinSheets(level, []), map: mapOf(), dieFaces: [...dice] });
    await runBatch(batch("b", tamTurn()), h.deps);
    expect(hpOf(stored(h), "victim")).toBe(hp);
    expect(h.slotWrites).toEqual([]);
  });

  // A critical hit doubles the extra die like any other (PHB 2014 "Critical Hits"): d20 20, the longsword's two d8 (1, 1) + 3 = 5, the extra two d8 (1, 1) = 2 (7: 40 -> 33); the second blow misses (d20 2).
  it("doubles the extra die of Improved Divine Smite on a critical hit", async () => {
    const h = harness(allyFight(), { sources: SOURCES, players: paladinSheets(11, []), map: mapOf(), dieFaces: [20, 1, 1, 1, 1, 2] });
    await runBatch(batch("b", tamTurn()), h.deps);
    expect(hpOf(stored(h), "victim")).toBe(33);
  });

  // The extra die rides a melee WEAPON hit (2014) and, as Radiant Strikes, an Unarmed Strike too (2024). A bare-handed Paladin of 11th level strikes twice for the flat 1 + 3 = 4 each (d20 8 and 9
  // hit): 2024 adds the die (2 and 1: 40 - 6 - 5 = 29); 2014 does not (40 - 8 = 32). A shot with a bow is no melee blow in either edition.
  // Bug caught: the extra die on fists in 2014, or left off them in 2024.
  it.each([
    { name: "2024", ruleset: "2024" as const, dice: [8, 2, 9, 1], hp: 29 },
    { name: "2014", ruleset: "2014" as const, dice: [8, 9], hp: 32 },
  ])("takes $name Unarmed Strikes with the extra die only where the edition has it", async ({ ruleset, dice, hp }) => {
    const sheets = paladinSheets(11, [], ruleset);
    sheets.inventory = [];
    sheets.items = [];
    const h = harness(allyFight(), { sources: SOURCES, players: sheets, map: mapOf(), ruleset, dieFaces: [...dice] });
    await runBatch(batch("b", tamTurn()), h.deps);
    expect(hpOf(stored(h), "victim")).toBe(hp);
  });

  it("fails if a bow shot of an 11th-level Paladin takes the extra radiant die", async () => {
    const sheets = paladinSheets(11, []);
    // One arrow, so one shot: d20 15 + 2 hits AC 13 and the d6 is 4 (40 -> 36); a rolled extra die would throw, for the dice are only these two.
    sheets.inventory = [SHORTBOW_HELD, arrows(1)];
    sheets.items = [SHORTBOW];
    const h = harness(archerFight(), { sources: SOURCES, players: sheets, map: mapOf(), dieFaces: [15, 4] });
    await runBatch(batch("b", tamTurn()), h.deps);
    expect(hpOf(stored(h), "victim")).toBe(36);
  });

  // The slot is for one blow a turn (APP CONVENTION): a 2nd-level Paladin with Extra Attack cannot be built here, so a Paladin 2 / Fighter 5 swings twice and
  // smites the first hit only. 7 + 8 = 15, then 3 + 3 = 6 (40 -> 19); one slot written. Bug caught: a smite on every blow.
  it("smites once a turn", async () => {
    const sheets = paladinSheets(2, SLOT_1, "2014", classRow("Fighter", 5));
    const h = harness(allyFight(), { sources: SOURCES, players: withResources(sheets, noSurge), map: mapOf(), dieFaces: [8, 4, 3, 5, 9, 3] });
    await runBatch(batch("b", tamTurn()), h.deps);
    expect(hpOf(stored(h), "victim")).toBe(19);
    expect(h.slotWrites.at(-1)?.slots).toEqual([{ level: 1, max: 2, used: 1 }]);
  });

  // PHB 2024 "Divine Smite" is a spell cast as a Bonus Action after the hit: it uses the Bonus Action, and does not happen with the Bonus Action spent.
  it("uses the Bonus Action in 2024, and does not smite without one", async () => {
    const on = harness(allyFight(), { sources: SOURCES, players: paladinSheets(2, SLOT_1, "2024"), map: mapOf(), dieFaces: [8, 4, 3, 5] });
    await runBatch(batch("b", tamTurn()), on.deps);
    expect(hpOf(stored(on), "victim")).toBe(25);
    expect(combatantOf(stored(on), "tam").bonus_used).toBe(true);
    const off = harness(allyFight({ bonus_used: true }), { sources: SOURCES, players: paladinSheets(2, SLOT_1, "2024"), map: mapOf(), dieFaces: [8, 4] });
    await runBatch(batch("b", tamTurn()), off.deps);
    expect(hpOf(stored(off), "victim")).toBe(33);
    expect(off.slotWrites).toEqual([]);
  });
});

describe("take_turn: a Rogue ally's tactics weigh Sneak Attack", () => {
  const DAGGER_OFF_HAND = { ...daggers(1), id: "inv-dagger2", slot: "off_hand" } as unknown as PartyInventoryItem;
  const armed = () => withClasses(tamSheets({ gear: [heldSword, DAGGER_OFF_HAND], items: [LONGSWORD, DAGGER] }), classRow("Rogue", 1));

  // PHB 2014 "Rogue: Sneak Attack": a finesse dagger with an enemy of the target beside it adds 1d6 once a turn; a longsword (1d8+3) is not a finesse weapon.
  // Both hit at +5 against AC 13 (8 or better, 0.65). The longsword averages 4.5 + 3 on a hit and the dagger 2.5 + 3, so the sword is the better plain
  // weapon, but Sneak Attack's 3.5 on the dagger turns it round. Bug caught: the picker weighing a Rogue by the weapon's own damage alone.
  it("picks the dagger when a friend of the Rogue stands beside the target, and the longsword when none does", async () => {
    const withFriend = harness(sneakFight({ friend: {} }), { sources: SOURCES, players: armed(), map: mapOf(), dieFaces: [8, 2, 5] });
    const result = await runBatch(batch("b", tamTurn()), withFriend.deps);
    expect(result.effects[0]).toMatchObject({ turn: { optionId: STAB, kind: "attack" } });
    const alone = harness(sneakFight(), { sources: SOURCES, players: armed(), map: mapOf(), dieFaces: [8, 4] });
    const second = await runBatch(batch("b", tamTurn()), alone.deps);
    expect(second.effects[0]).toMatchObject({ turn: { optionId: "attack:actions:Longsword:victim", kind: "attack" } });
  });

  // PHB 2014 "Sneak Attack": once per turn. With this turn's use spent (the tally under this turn's key) the dagger has no edge and the sword is picked.
  // Bug caught: the weighing ignoring a spent use.
  it("stops favouring the dagger once the turn's Sneak Attack is spent", async () => {
    const spent = { action_uses: { "sneak_attack/1:tam": { used: 1, per_day: 1 } } };
    const h = harness(sneakFight({ friend: {}, tam: spent }), { sources: SOURCES, players: armed(), map: mapOf(), dieFaces: [8, 4] });
    const result = await runBatch(batch("b", tamTurn()), h.deps);
    expect(result.effects[0]).toMatchObject({ turn: { optionId: "attack:actions:Longsword:victim" } });
  });

  // PHB 2014 and 2024 "Sneak Attack": once per turn, any creature's. In the ox's own turn (its Action spent, so a plain move is on offer) it walks off toward Bait, leaving Tam's reach; Tam's
  // own-turn use is spent, but this is the ox's turn, so the Reaction has its own. Pal beside the ox makes it count, so the Reaction is the
  // dagger (8 + 5 hits AC 13; d4 2 + 3 and the Sneak Attack d6 5: 10, 40 -> 30). Bug caught: the Reaction refused Sneak Attack because the
  // key counted Tam's own turns, or the opportunity strike weighed without it and swung the longsword (8 hits, d8 2 + 3: 35).
  it("fails if a Rogue's opportunity attack in a foe's turn does not Sneak Attack with the dagger", async () => {
    const fight = sneakFight({ friend: {}, tam: { action_uses: { "sneak_attack/1:tam": { used: 1, per_day: 1 } } }, victim: { initiative: 20, action_used: true } });
    fight.combatants_live.push(pc("bait", { faction_id: "p", hp: 10, max_hp: 10, initiative: 1, position: { x: 12, y: 1 } }));
    const h = harness(fight, { sources: SOURCES, players: armed(), map: mapOf(), dieFaces: [8, 2, 5] });
    const result = await runBatch(batch("b", takeTurn({ instanceId: "victim", optionId: "move:bait", playedMemberId: "pm-someone-else" })), h.deps);
    expect(result.effects.find((e) => e.type === "opportunity")).toMatchObject({ attackerId: "tam", targetId: "victim" });
    expect(hpOf(stored(h), "victim")).toBe(30);
  });
});

describe("take_turn: an ally's daily-limited innate spell", () => {
  const racialFireball = (over: Partial<AllySpellRow> = {}): AllySpellRow => ({ id: "row-fireball", party_member_id: "pm-tam", name: "Fireball", level: 3, is_known: true, is_prepared: false, always_prepared: false, source_type: "racial", source_class_id: null, casting_ability: "cha", uses_per_day: 1, uses_remaining: 1, ...over });
  const innateSheets = (spell: AllySpellRow) => ({ ...wizardTamSheets({ slots: [], spells: [spell] }), casting: { ...wizardTamSheets().casting, classes: [], spells: [spell] } });

  // SRD 5.1 "Innate Spellcasting": a "1/day" spell is one cast a day, no slot. The cast writes the grant's remaining count (1 -> 0), absolute and
  // after the fight is saved; no slot is written. 8 dice of 1 against a failed save: 40 -> 32. Bug caught: a daily spell cast for free
  // (never written), or spending a spell slot the character does not have.
  it("spends one use of the grant, written after the save, and no slot", async () => {
    const h = harness(archerFight(), { sources: SOURCES, players: innateSheets(racialFireball()), map: mapOf(), spells: [fireball()], dieFaces: [2, 1, 1, 1, 1, 1, 1, 1, 1] });
    const result = await runBatch(batch("b", tamTurn({ optionId: BALL })), h.deps);
    expect(result.effectFailures).toEqual([]);
    expect(hpOf(stored(h), "victim")).toBe(32);
    expect(h.innateWrites).toEqual([{ memberId: "pm-tam", spellRowId: "row-fireball", remaining: 0 }]);
    expect(h.slotWrites).toEqual([]);
    expect(h.log.indexOf("save")).toBeLessThan(h.log.indexOf("innate"));
    expect(combatantOf(stored(h), "tam").action_uses).toEqual({ "spell/fireball": { used: 1, per_day: 1 } });
  });

  // Bug caught: a spent daily spell still on offer (the old code left it out; the new must not offer it with no use left).
  it("does not offer the spell with no use left", async () => {
    const h = harness(archerFight(), { sources: SOURCES, players: innateSheets(racialFireball({ uses_remaining: 0 })), map: mapOf(), spells: [fireball()], dieFaces: [] });
    await expect(runBatch(batch("b", tamTurn({ optionId: BALL })), h.deps)).rejects.toMatchObject({ message: "That option is not on offer." });
  });

  // Bug caught: a failed write undoing the fight, or going unreported.
  it("reports a use that could not be written and keeps the fight", async () => {
    const h = harness(archerFight(), { sources: SOURCES, players: innateSheets(racialFireball()), map: mapOf(), spells: [fireball()], dieFaces: [2, 1, 1, 1, 1, 1, 1, 1, 1], innateFail: true });
    const result = await runBatch(batch("b", tamTurn({ optionId: BALL })), h.deps);
    expect(result.effectFailures).toEqual(["ally_innate_uses: sheet is down"]);
    expect(hpOf(stored(h), "victim")).toBe(32);
  });

  // An at-will innate spell (no daily limit) of 3rd level takes neither a use nor a 3rd-level slot, though the wizard has two. Bug caught: any cast
  // of a leveled spell spending the slot of its level, whatever line it was listed under.
  it("spends nothing for an at-will innate spell, even with a slot of its level on the sheet", async () => {
    const atWill = racialFireball({ uses_per_day: null, uses_remaining: null });
    const sheets = { ...wizardTamSheets({ slots: [{ level: 3, max: 2, used: 0 }], spells: [atWill] }), };
    sheets.casting = { ...sheets.casting, classes: [], spells: [atWill] };
    const h = harness(archerFight(), { sources: SOURCES, players: sheets, map: mapOf(), spells: [fireball()], dieFaces: [2, 1, 1, 1, 1, 1, 1, 1, 1] });
    await runBatch(batch("b", tamTurn({ optionId: BALL })), h.deps);
    expect(hpOf(stored(h), "victim")).toBe(32);
    expect(h.slotWrites).toEqual([]);
    expect(h.innateWrites).toEqual([]);
  });
});

describe("take_turn: Pact Magic slots", () => {
  const warlockClass = { id: "cls-wl", party_member_id: "pm-tam", class_name: "Warlock", class_definition_id: "def-wl", class_definition_kind: "system", subclass_name: null, subclass_definition_id: null, subclass_variant: null, levels: 5, is_primary: true, hit_dice_used: 0, sort_order: 0, capabilities: [] } as unknown as CharacterClass;
  const SPELLCASTING_3: SpellSlotEntry = { level: 3, max: 2, used: 0 };
  const PACT_3: SpellSlotEntry = { level: 3, max: 2, used: 0, pool: "pact", recovery: "short" };
  const fireballFrom = (classId: string): AllySpellRow => ({ id: "row-fb", party_member_id: "pm-tam", name: "Fireball", level: 3, is_known: true, is_prepared: true, always_prepared: false, source_type: "class", source_class_id: classId, casting_ability: null, uses_per_day: null, uses_remaining: null });
  const multiclass = (classId: string, slots: SpellSlotEntry[]): PlayerSheets => {
    const base = wizardTamSheets({ slots, spells: [fireballFrom(classId)] });
    return { ...base, casting: { ...base.casting, classes: [...base.casting.classes, warlockClass], definitions: { ...base.casting.definitions, system: [...base.casting.definitions.system, { id: "def-wl", caster_type: "known", prepared_ability: "cha" }] } } };
  };
  const cast = async (players: PlayerSheets) => {
    const h = harness(archerFight(), { sources: SOURCES, players, map: mapOf(), spells: [fireball()], dieFaces: [2, 1, 1, 1, 1, 1, 1, 1, 1] });
    await runBatch(batch("b", tamTurn({ optionId: BALL })), h.deps);
    return h;
  };

  // PHB 2014 "Multiclassing: Pact Magic": a Warlock's spell is cast from its short-rest Pact Magic slot. The pact slot is listed second here, so the
  // first unspent slot at the level would be the spellcasting one. Bug caught: the cast always spending the first slot at the level.
  it("spends the Pact Magic slot for a Warlock's spell", async () => {
    const h = await cast(multiclass("cls-wl", [SPELLCASTING_3, PACT_3]));
    expect(h.slotWrites.at(-1)?.slots).toEqual([SPELLCASTING_3, { ...PACT_3, used: 1 }]);
  });

  // The Wizard's own spell keeps to the Spellcasting slot even when the pact slot comes first. Bug caught: the Warlock's pool eaten by the Wizard's spell.
  it("spends the Spellcasting slot for another class's spell", async () => {
    const h = await cast(multiclass("cls-wiz", [PACT_3, SPELLCASTING_3]));
    expect(h.slotWrites.at(-1)?.slots).toEqual([PACT_3, { ...SPELLCASTING_3, used: 1 }]);
  });

  // PHB 2014: slots of either kind cast a spell of either kind. A Wizard's spell with only pact slots left is cast with one. Bug caught: refused or free.
  it("casts a Wizard's spell from the pact slot when no Spellcasting slot is left", async () => {
    const h = await cast(multiclass("cls-wiz", [{ ...SPELLCASTING_3, used: 2 }, PACT_3]));
    expect(h.slotWrites.at(-1)?.slots).toEqual([{ ...SPELLCASTING_3, used: 2 }, { ...PACT_3, used: 1 }]);
    expect(hpOf(stored(h), "victim")).toBe(32);
  });
});

// ── Shield: a Reaction a creature the rules play casts when it is hit (#1021) ─────────────────────────────

describe("a Reaction: Shield", () => {
  // PHB 2014 and 2024 "Shield": a Reaction taken when hit by an attack; +5 AC until the start of the caster's next turn, the triggering attack included.
  // The wolf's Bite is +4 for 1d6+2 and the mage (AC 12, "1st level (4 slots): magic missile, shield") stands beside it. A natural d20 of 11 totals 15.
  const SHIELD_SOURCES: StatBlockSources = {
    monsters: [{ id: "m-mage", name: "Mage", stat_block: mageBlock() } as unknown as Monster, monster("m-wolf")],
    npcs: [],
    companions: [],
  };
  const duelWithMage = (mage: Partial<RunCombatant> = {}) =>
    row({
      combatants_live: [
        combatant("wolf", { monster_id: "m-wolf", faction_id: "m", hp: 11, max_hp: 11, initiative: 12, position: { x: 1, y: 1 } }),
        combatant("mage", { monster_id: "m-mage", faction_id: "p", hp: 40, max_hp: 40, initiative: 8, position: { x: 2, y: 1 }, ...mage }),
      ],
    });
  const bites = (over: Record<string, unknown> = {}) => attack({ targetId: "mage", ...over });
  const withShield = (fight: FightRow, dieFaces: number[], over: { spells?: SpellRecord[]; ruleset?: "2014" | "2024" } = {}) =>
    harness(fight, { sources: SHIELD_SOURCES, map: mapOf(), spells: over.spells ?? [shield()], ruleset: over.ruleset, dieFaces });
  const shielded = (r: FightRow) => combatantOf(r, "mage").conditions.find((c) => c.name === "Shield");
  const attackLine = (result: { effects: Array<{ type: string }> }) => (result.effects.find((e) => e.type === "resolved") as unknown as { resolved: Record<string, unknown> }).resolved;

  // Total 15 meets AC 12 (a hit) and falls short of 12 + 5 = 17: Shield turns it into a miss. Nothing else is rolled (no damage die), 40 hit points stay.
  // The Reaction and one 1st-level slot are spent, the condition carries +5 and ends at the start of the mage's own next turn, the summary names the reaction and quotes AC 17.
  // Bugs caught: the hit stands after the cast (the roll not decided again), the cast spends no Reaction or slot, the condition lasts rounds instead of until the next turn.
  it("fails if a hit of 15 on a mage with Shield does not become a miss at AC 17, spending the Reaction and a 1st-level slot", async () => {
    const h = withShield(duelWithMage(), [11]);
    const result = await runBatch(batch("s1", bites()), h.deps);
    const after = stored(h);
    expect(hpOf(after, "mage")).toBe(40);
    expect(h.dieCalls).toBe(1);
    expect(combatantOf(after, "mage").reactionUsed).toBe(true);
    expect(combatantOf(after, "mage").action_uses).toEqual({ "slots/1": { used: 1, per_day: 4 } });
    expect(combatantOf(after, "mage").action_used).not.toBe(true);
    expect(shielded(after)).toMatchObject({ name: "Shield", grants: { ac: 5 }, source: { id: "mage", spell: "Shield" }, ends: { kind: "turn", at: "start", of: "self" } });
    expect(attackLine(result)).toMatchObject({ kind: "attack", natural: 11, total: 15, targetAc: 17, hit: false, damageTotal: 0, reaction: { by: "mage", spell: "Shield" } });
    expect(combatantOf(after, "mage").shown_deeds).toMatchObject({ cast: 1 });
  });

  // Total 18 meets 17 even with Shield: the slot would be wasted, so nothing is cast. d20 14 + 4 = 18 hits; 1d6+2 with a 3 deals 5 (40 -> 35).
  // Bug caught: Shield cast on every hit (the comparison against the bare AC, or `<=`).
  it("fails if Shield is cast on a hit of 18, which it would not turn", async () => {
    const h = withShield(duelWithMage(), [14, 3]);
    await runBatch(batch("s2", bites()), h.deps);
    expect(hpOf(stored(h), "mage")).toBe(35);
    expect(combatantOf(stored(h), "mage").reactionUsed).not.toBe(true);
    expect(combatantOf(stored(h), "mage").action_uses).toBeUndefined();
    expect(shielded(stored(h))).toBeUndefined();
  });

  // PHB 2014 ch. 9 "Rolling 20": a natural 20 hits whatever the AC. d20 20 (total 24) is a critical hit: 2d6+2 with 3 and 3 deals 8 (40 -> 32). Shield could not turn it.
  // Bug caught: Shield cast on a natural 20 (a slot and the Reaction gone for nothing).
  it("fails if Shield is cast against a natural 20", async () => {
    const h = withShield(duelWithMage(), [20, 3, 3]);
    await runBatch(batch("s3", bites()), h.deps);
    expect(hpOf(stored(h), "mage")).toBe(32);
    expect(combatantOf(stored(h), "mage").reactionUsed).not.toBe(true);
    expect(shielded(stored(h))).toBeUndefined();
  });

  // PHB 2014 ch. 9 "Reactions": one Reaction per round. A mage that already used it takes the 15: 40 - 5 = 35 (a 3 on the d6, plus 2). Bug caught: a second Reaction in a round.
  it("fails if Shield is cast with the Reaction already used", async () => {
    const h = withShield(duelWithMage({ reactionUsed: true }), [11, 3]);
    await runBatch(batch("s4", bites()), h.deps);
    expect(hpOf(stored(h), "mage")).toBe(35);
    expect(shielded(stored(h))).toBeUndefined();
  });

  // RULE spell-slots (PHB 2014 ch. 10): a spell is cast with a slot of its level or higher. With the four 1st-level slots spent, Shield is cast at the next level the mage
  // has a slot for, the 3rd (it lists 3rd level, 3 slots): that tally rises to 1 of 3 and the 1st stays at 4 of 4. Bug caught: no upcast (a cast refused for want of a 1st-level slot).
  it("fails if Shield is not cast from the next slot up when the 1st-level slots are spent", async () => {
    const h = withShield(duelWithMage({ action_uses: { "slots/1": { used: 4, per_day: 4 } } }), [11]);
    await runBatch(batch("s5", bites()), h.deps);
    expect(hpOf(stored(h), "mage")).toBe(40);
    expect(combatantOf(stored(h), "mage").action_uses).toEqual({ "slots/1": { used: 4, per_day: 4 }, "slots/3": { used: 1, per_day: 3 } });
  });

  // With every slot the mage lists spent (4 of 4, 3 of 3, 3 of 3) nothing can cast it: the 15 hits, 5 damage (40 -> 35). Bug caught: a Shield cast with no slot left.
  it("fails if Shield is cast with no slot left", async () => {
    const spent = { "slots/1": { used: 4, per_day: 4 }, "slots/3": { used: 3, per_day: 3 }, "slots/4": { used: 3, per_day: 3 } };
    const h = withShield(duelWithMage({ action_uses: spent }), [11, 3]);
    await runBatch(batch("s6", bites()), h.deps);
    expect(hpOf(stored(h), "mage")).toBe(35);
    expect(shielded(stored(h))).toBeUndefined();
  });

  // A Shield already up counts in the AC the roll was made against (12 + 5 = 17). A 17 hits it; casting again would add nothing and spend a slot. 40 - 5 = 35.
  // Bug caught: Shield cast on top of Shield.
  it("fails if Shield is cast on a creature that already has it", async () => {
    const up = { name: "Shield", grants: { ac: 5 }, source: { id: "mage", spell: "Shield" }, ends: { kind: "turn" as const, at: "start" as const, of: "self" as const } };
    const h = withShield(duelWithMage({ conditions: [up] }), [13, 3]);
    await runBatch(batch("s7", bites()), h.deps);
    expect(hpOf(stored(h), "mage")).toBe(35);
    expect(combatantOf(stored(h), "mage").action_uses).toBeUndefined();
    expect(combatantOf(stored(h), "mage").reactionUsed).not.toBe(true);
  });

  // PHB 2014 ch. 9 "Reactions" and "Conditions: Incapacitated": an Incapacitated creature cannot take Reactions. The 15 hits: 35. Bug caught: a Reaction taken while Incapacitated.
  it("fails if an Incapacitated mage casts Shield", async () => {
    const h = withShield(duelWithMage({ conditions: [{ name: "Incapacitated" }] }), [11, 3]);
    await runBatch(batch("s8", bites()), h.deps);
    expect(hpOf(stored(h), "mage")).toBe(35);
    expect(shielded(stored(h))).toBeUndefined();
  });

  // A creature at 0 hit points is dead or dying and takes no Reaction. The 15 hits it; Shield is not cast. Bug caught: a Reaction (and a slot) spent by a creature that is down.
  it("fails if a mage at 0 hit points casts Shield", async () => {
    const h = withShield(duelWithMage({ hp: 0 }), [11, 3]);
    await runBatch(batch("s8b", bites()), h.deps);
    expect(shielded(stored(h))).toBeUndefined();
    expect(combatantOf(stored(h), "mage").action_uses).toBeUndefined();
  });

  // PHB 2014 ch. 9 "Surprise": a surprised creature cannot take a Reaction until its first turn ends (2014 only). The 15 hits: 35. Bug caught: a surprised mage reacting.
  it("fails if a surprised mage casts Shield under the 2014 rules", async () => {
    const h = withShield(duelWithMage({ surprised: true }), [11, 3]);
    await runBatch(batch("s9", bites()), h.deps);
    expect(hpOf(stored(h), "mage")).toBe(35);
  });

  // A spell record the library has not reviewed is not read for mechanics (`automatable`): the 15 hits, 35. Bug caught: an unreviewed record rolled as if checked.
  it("fails if an unreviewed Shield record is cast", async () => {
    const h = withShield(duelWithMage(), [11, 3], { spells: [shield({ mechanics_reviewed: false })] });
    await runBatch(batch("s10", bites()), h.deps);
    expect(hpOf(stored(h), "mage")).toBe(35);
    expect(shielded(stored(h))).toBeUndefined();
  });

  // A creature whose block does not list Shield never casts it, whatever the library holds: the ox's bite of 15 (a 11 and +4) hits the wolf (AC 12), 1d6+2 with a 3 deals 5 (11 -> 6).
  // Bug caught: Shield cast by a creature that does not list it.
  it("fails if a creature that does not list Shield casts it", async () => {
    const fight = row({
      combatants_live: [
        combatant("ox", { monster_id: "m-ox", faction_id: "p", hp: 40, max_hp: 40, initiative: 12, position: { x: 2, y: 1 } }),
        combatant("wolf", { monster_id: "m-wolf", faction_id: "m", hp: 11, max_hp: 11, initiative: 8, position: { x: 1, y: 1 } }),
      ],
    });
    const sources: StatBlockSources = { monsters: [monster("m-ox"), monster("m-wolf")], npcs: [], companions: [] };
    const h = harness(fight, { sources, map: mapOf(), spells: [shield()], dieFaces: [11, 3] });
    await runBatch(batch("s11", attack({ attackerId: "ox", targetId: "wolf" })), h.deps);
    expect(hpOf(stored(h), "wolf")).toBe(6);
    expect(combatantOf(stored(h), "wolf").reactionUsed).not.toBe(true);
  });

  // The Shield lapses "until the start of your next turn": the wolf (initiative 12) bites, the mage (8) is next. Bug caught: a condition with the wrong end (the end of its turn, never).
  it("fails if the Shield does not end at the start of the mage's next turn", async () => {
    const h = withShield(duelWithMage(), [11]);
    await runBatch(batch("s12", bites()), h.deps);
    expect(shielded(stored(h))).toBeDefined();
    await runBatch(batch("s13", { type: "next_turn" }), h.deps);
    expect(combatantOf(stored(h), "mage").conditions.some((c) => c.name === "Shield")).toBe(false);
    // The Reaction is the mage's again at the start of its own turn (PHB 2014 ch. 9 "Reactions").
    expect(combatantOf(stored(h), "mage").reactionUsed).toBe(false);
  });

  // A player in a DM's own fight (no `playedMemberId`) and the character the person plays choose for themselves: the server has no stat block for them and casts nothing.
  // Nessa (AC 18) is hit by 19 (a 15 and +4): 1d6+2 with a 5 deals 7 (20 -> 13). Bug caught: a player's Reaction taken for them.
  it("fails if the server casts Shield for a player the person plays", async () => {
    const fight = row({
      combatants_live: [
        combatant("wolf", { monster_id: "m-wolf", faction_id: "m", hp: 11, max_hp: 11, initiative: 12, position: { x: 1, y: 1 } }),
        pc("nessa", { faction_id: "p", hp: 20, max_hp: 20, initiative: 8, position: { x: 0, y: 1 } }),
      ],
    });
    const h = harness(fight, { sources: SOURCES, players: NESSA_IN_PLATE, map: mapOf(), spells: [shield()], dieFaces: [15, 5] });
    await runBatch(batch("s14", attack({ targetId: "nessa" })), h.deps);
    expect(hpOf(stored(h), "nessa")).toBe(13);
    const played = harness(fight, { sources: SOURCES, players: NESSA_IN_PLATE, map: mapOf(), spells: [shield()], dieFaces: [15, 5] });
    await runBatch(batch("s15", takeTurn({ playedMemberId: "pm-nessa", optionId: "attack:actions:Bite:nessa" })), played.deps);
    expect(hpOf(stored(played), "nessa")).toBe(13);
    expect(combatantOf(stored(played), "nessa").reactionUsed).not.toBe(true);
  });

  // An AI-played ally: Tam, a 5th-level Wizard (Dex 10, no armour: AC 10) with Shield prepared and two 1st-level slots, while the person plays someone else (`pm-pip`).
  // The wolf's d20 8 + 4 = 12 hits AC 10 and falls short of 15: Shield turns it, a miss. One slot is written to the sheet (1 of 2) once the fight is saved, and the Reaction is spent.
  // Bug caught: an ally struck with no Reaction taken, or a cast whose slot is never written to the sheet.
  it("fails if an ally the AI plays does not cast Shield against a hit it turns, writing the slot to the sheet", async () => {
    const sheets = wizardTamSheets({ slots: [{ level: 1, max: 2, used: 0 }], spells: [{ id: "Shield-row", party_member_id: "pm-tam", name: "Shield", level: 1, is_known: true, is_prepared: true, always_prepared: false, source_type: "class", source_class_id: "cls-wiz", casting_ability: null, uses_per_day: null, uses_remaining: null }] });
    const fight = row({
      combatants_live: [
        combatant("wolf", { monster_id: "m-wolf", faction_id: "m", hp: 11, max_hp: 11, initiative: 12, position: { x: 1, y: 1 } }),
        pc("tam", { faction_id: "p", hp: 20, max_hp: 20, initiative: 8, position: { x: 2, y: 1 } }),
      ],
    });
    const h = harness(fight, { sources: SOURCES, players: sheets, map: mapOf(), spells: [shield()], dieFaces: [8] });
    const result = await runBatch(batch("s16", takeTurn({ playedMemberId: "pm-pip", optionId: "attack:actions:Bite:tam" })), h.deps);
    expect(hpOf(stored(h), "tam")).toBe(20);
    expect(combatantOf(stored(h), "tam").reactionUsed).toBe(true);
    expect(combatantOf(stored(h), "tam").conditions.find((c) => c.name === "Shield")).toMatchObject({ grants: { ac: 5 } });
    expect(h.slotWrites).toEqual([{ memberId: "pm-tam", slots: [{ level: 1, max: 2, used: 1 }] }]);
    expect(result.effectFailures).toEqual([]);
  });
});

// ── Counterspell: a Reaction a creature the rules play casts when a hostile casts a spell (#1021) ──────────

describe("a Reaction: Counterspell", () => {
  // The caster and the warden are both SRD mages: spell save DC 14, Intelligence 17 (+3), Constitution 11 (+0), "3rd level (3 slots): counterspell, fireball",
  // "4th level (3 slots): ice storm". The caster is at (1,1), 5 ft squares: a creature at x is (x - 2) squares of gap away, so (gap + 1) * 5 feet.
  // x = 13 is 60 ft (within reach), x = 14 is 65 ft. The ox t1 stands on the caster's side of any wall, so the fireball itself is never covered.
  const NO_FOURTH: MonsterStatBlock = mageBlock({
    special_abilities: [{ name: "Spellcasting", description: "The mage is a 9th-level spellcaster. Its spellcasting ability is Intelligence (spell save DC 14, +6 to hit with spell attacks). The mage has the following wizard spells prepared:\n\n* 3rd level (3 slots): counterspell, fireball", structured: { kind: "other", source: "parsed" } } as StatBlockEntry],
  });
  const COUNTER_SOURCES: StatBlockSources = {
    monsters: [{ id: "m-mage", name: "Mage", stat_block: mageBlock() } as unknown as Monster, { id: "m-low", name: "Low Mage", stat_block: NO_FOURTH } as unknown as Monster, monster("m-ox")],
    npcs: [],
    companions: [],
  };
  const duel = (warden: Partial<RunCombatant> = {}, caster: Partial<RunCombatant> = {}, extra: RunCombatant[] = []) =>
    row({
      combatants_live: [
        combatant("caster", { monster_id: "m-mage", faction_id: "p", hp: 40, max_hp: 40, initiative: 12, position: { x: 1, y: 1 }, ...caster }),
        combatant("warden", { monster_id: "m-mage", faction_id: "m", hp: 40, max_hp: 40, initiative: 8, position: { x: 4, y: 1 }, ...warden }),
        combatant("t1", { monster_id: "m-ox", faction_id: "m", hp: 40, max_hp: 40, ac: "13", initiative: 4, position: { x: 1, y: 3 } }),
        ...extra,
      ],
    });
  const fireballAt = (over: Record<string, unknown> = {}): CommandRequest["commands"][number] =>
    ({ type: "cast_spell", casterId: "caster", spell: "fireball", targetIds: ["t1"], ...over }) as CommandRequest["commands"][number];
  const withCounter = (fight: FightRow, dieFaces: number[], over: { ruleset?: "2014" | "2024"; map?: FightMap | null; spells?: SpellRecord[]; sources?: StatBlockSources; factions?: { id: string; hostile_to: string[] }[] } = {}) => {
    const ruleset = over.ruleset ?? "2014";
    return harness(fight, {
      sources: over.sources ?? COUNTER_SOURCES, ruleset, map: over.map === undefined ? null : over.map, factions: over.factions,
      spells: over.spells ?? [counterspell({ ruleset }), fireball({ ruleset }), fireBolt({ ruleset })], dieFaces: [...dieFaces],
    });
  };
  const SAVE_FAILS_FOR_FULL = [5, 1, 1, 1, 1, 1, 1, 1, 1]; // the ox's save (5 + 0 against DC 14 fails), then 8d6 of ones: 8
  const countLine = (result: { effects: Array<{ type: string }> }) => (result.effects.find((e) => e.type === "resolved" && (e as unknown as { resolved: { kind: string } }).resolved.kind === "countered") as unknown as { resolved: Record<string, unknown> } | undefined)?.resolved;

  // PHB 2014 "Counterspell": a 3rd-level spell is stopped by a 3rd-level slot with no check. No die is thrown at all (not the ox's save, not the damage), so the ox keeps 40.
  // The caster still spends its 3rd-level slot, its Action and its cast; the warden spends its Reaction and one 3rd-level slot. No map, so sight is not checked.
  // Bugs caught: the spell resolving after the counter, the caster's cost refunded, the counterer's Reaction or slot not spent, a check rolled for a spell the slot covers.
  it("fails if a 3rd-level Fireball is not stopped without a check, or the costs are not all paid", async () => {
    const h = withCounter(duel(), []);
    const result = await runBatch(batch("c1", fireballAt()), h.deps);
    const after = stored(h);
    expect(hpOf(after, "t1")).toBe(40);
    expect(h.dieCalls).toBe(0);
    expect(combatantOf(after, "caster").action_uses).toEqual({ "slots/3": { used: 1, per_day: 3 } });
    expect(combatantOf(after, "caster").action_used).toBe(true);
    expect(combatantOf(after, "caster").shown_deeds).toMatchObject({ cast: 1 });
    expect(combatantOf(after, "warden").reactionUsed).toBe(true);
    expect(combatantOf(after, "warden").action_uses).toEqual({ "slots/3": { used: 1, per_day: 3 } });
    expect(combatantOf(after, "warden").shown_deeds).toMatchObject({ cast: 1 });
    expect(countLine(result)).toMatchObject({ kind: "countered", casterId: "caster", spell: "Fireball", castLevel: 3, counterId: "warden", counterSpell: "Counterspell", stopped: true });
    expect(result.effects.some((e) => e.type === "resolved" && (e as unknown as { resolved: { kind: string } }).resolved.kind === "save")).toBe(false);
  });

  // PHB 2014 "Counterspell": a 4th-level spell against a warden with only 3rd-level slots is a check: d20 + Intelligence +3 against DC 10 + 4 = 14.
  // A 10 totals 13 and fails: the Fireball (upcast, 9d6 of ones = 9) goes on, 40 -> 31, the ox failing with a 5. A 11 totals 14 and meets the DC: stopped, 40 stays.
  // Both spend the warden's Reaction and a 3rd-level slot. Bugs caught: the DC off by one (`>` for `>=`), a failed check still stopping the spell, no check at all.
  it("fails if the check against DC 14 does not stop the spell on 14 and let it through on 13", async () => {
    const low = (id: string) => combatant(id, { monster_id: "m-low", faction_id: "m", hp: 40, max_hp: 40, initiative: 8, position: { x: 4, y: 1 } });
    // Make the warden the one with no 4th-level slots.
    const fight = (): FightRow => ({ ...duel(), combatants_live: [duel().combatants_live[0], low("warden"), duel().combatants_live[2]] });
    const miss = withCounter(fight(), [10, 5, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
    const r1 = await runBatch(batch("c2", fireballAt({ castLevel: 4 })), miss.deps);
    expect(hpOf(stored(miss), "t1")).toBe(31);
    expect(countLine(r1)).toMatchObject({ check: { total: 13, dc: 14 }, stopped: false });
    expect(combatantOf(stored(miss), "warden").reactionUsed).toBe(true);
    expect(combatantOf(stored(miss), "warden").action_uses).toEqual({ "slots/3": { used: 1, per_day: 3 } });
    expect(miss.posted.some((p) => p.result.label?.startsWith("Counterspell: spellcasting check"))).toBe(true);
    const hit = withCounter(fight(), [11]);
    const r2 = await runBatch(batch("c3", fireballAt({ castLevel: 4 })), hit.deps);
    expect(hpOf(stored(hit), "t1")).toBe(40);
    expect(countLine(r2)).toMatchObject({ check: { total: 14, dc: 14 }, stopped: true });
    expect(combatantOf(stored(hit), "caster").action_uses).toEqual({ "slots/4": { used: 1, per_day: 3 } });
  });

  // PHB 2014 "Counterspell", At Higher Levels: a warden that holds a 4th-level slot (the default mage) stops a 4th-level spell with no check, spending that slot, not its 3rd.
  // Bug caught: the lowest slot used regardless of the spell's level (a check rolled, or the 3rd-level slot spent).
  it("fails if a 4th-level spell is not countered automatically by a 4th-level slot", async () => {
    const h = withCounter(duel(), []);
    const result = await runBatch(batch("c4", fireballAt({ castLevel: 4 })), h.deps);
    expect(hpOf(stored(h), "t1")).toBe(40);
    expect(h.dieCalls).toBe(0);
    expect(combatantOf(stored(h), "warden").action_uses).toEqual({ "slots/4": { used: 1, per_day: 3 } });
    expect(countLine(result)).toMatchObject({ stopped: true });
    expect(countLine(result)).not.toHaveProperty("check");
  });

  // PHB 2024 "Counterspell": the caster makes a Constitution save against the counterer's spell save DC 14; the caster's Con 11 is +0. A 13 fails: the spell has no effect,
  // the Action is wasted but the 3rd-level slot "isn't expended" (no tally), the warden pays its Reaction and slot. The ox keeps 40 and no damage die is thrown (one die call).
  // Bugs caught: the slot spent anyway, the Action not wasted, the save made against the wrong DC or with the counterer's bonus, the spell resolving.
  it("fails if a failed Constitution save does not stop the spell, waste the Action and keep the slot", async () => {
    const h = withCounter(duel(), [13], { ruleset: "2024" });
    const result = await runBatch(batch("c5", fireballAt()), h.deps);
    const after = stored(h);
    expect(hpOf(after, "t1")).toBe(40);
    expect(h.dieCalls).toBe(1);
    expect(combatantOf(after, "caster").action_used).toBe(true);
    expect(combatantOf(after, "caster").action_uses).toBeUndefined();
    expect(combatantOf(after, "warden").reactionUsed).toBe(true);
    expect(combatantOf(after, "warden").action_uses).toEqual({ "slots/3": { used: 1, per_day: 3 } });
    expect(countLine(result)).toMatchObject({ save: { total: 13, dc: 14 }, stopped: true });
  });

  // PHB 2024: a 14 meets DC 14 and the spell goes on: the ox's save 5 fails, 8d6 of ones deal 8 (40 -> 32), the caster pays its slot as for any cast.
  // Bug caught: a made save still stopping the spell (`<=` for `<`).
  it("fails if a made Constitution save does not let the spell go on", async () => {
    const h = withCounter(duel(), [14, ...SAVE_FAILS_FOR_FULL], { ruleset: "2024" });
    const result = await runBatch(batch("c6", fireballAt()), h.deps);
    expect(hpOf(stored(h), "t1")).toBe(32);
    expect(combatantOf(stored(h), "caster").action_uses).toEqual({ "slots/3": { used: 1, per_day: 3 } });
    expect(countLine(result)).toMatchObject({ save: { total: 14, dc: 14 }, stopped: false });
  });

  // A stopped spell starts no concentration and ends none the caster held (nothing is resolved). The Fireball record is made a concentration spell; the caster
  // already holds Bless. Bug caught: the countered spell still ending the caster's earlier concentration or starting its own.
  it("fails if a countered concentration spell ends the caster's earlier concentration or starts its own", async () => {
    const holding = { spellId: null, spellName: "Bless", castAtLevel: 1, startedRound: 1, appliedEffectIds: [] };
    const h = withCounter(duel({}, { concentration: holding }), [], { spells: [counterspell(), fireball({ concentration: true })] });
    await runBatch(batch("c7", fireballAt()), h.deps);
    expect(combatantOf(stored(h), "caster").concentration).toEqual(holding);
  });

  // A cantrip is never countered (APP CONVENTION): Fire Bolt's attack d20 5 + 6 = 11 against the ox's AC 13 misses. The warden keeps its Reaction and slot.
  // Bug caught: the slot spent on a cantrip.
  it("fails if a cantrip is countered", async () => {
    const h = withCounter(duel(), [5]);
    const result = await runBatch(batch("c8", fireballAt({ spell: "fire bolt" })), h.deps);
    expect(combatantOf(stored(h), "warden").reactionUsed).not.toBe(true);
    expect(combatantOf(stored(h), "warden").action_uses).toBeUndefined();
    expect(countLine(result)).toBeUndefined();
  });

  // Not countered: each of these leaves the Fireball to resolve (the ox's 5 fails, 8d6 of ones: 40 -> 32) and the warden's Reaction untouched.
  const goesThrough = async (fight: FightRow, over: { map?: FightMap | null; factions?: { id: string; hostile_to: string[] }[] } = {}) => {
    const h = withCounter(fight, SAVE_FAILS_FOR_FULL, over);
    await runBatch(batch("c9", fireballAt()), h.deps);
    expect(hpOf(stored(h), "t1")).toBe(32);
    // The warden is exactly as it was: no Reaction spent, no slot (whatever it held before).
    const was = combatantOf(fight, "warden");
    expect(combatantOf(stored(h), "warden").reactionUsed).toBe(was.reactionUsed);
    expect(combatantOf(stored(h), "warden").action_uses).toEqual(was.action_uses);
  };
  // Bug caught: a creature countering its own side's spell (the hostility test missing).
  it("fails if a counterer of the caster's own side counters", async () => {
    await goesThrough(duel({ faction_id: "p" }));
  });
  // Bug caught: the reach ignored. x = 14 is 65 ft, past the record's 60.
  it("fails if a counterer 65 feet away counters", async () => {
    await goesThrough(duel({ position: { x: 14, y: 1 } }));
  });
  // The control for the one above: x = 13 is exactly 60 ft and does counter. Bug caught: the reach off by one square the other way.
  it("fails if a counterer exactly 60 feet away does not counter", async () => {
    const h = withCounter(duel({ position: { x: 13, y: 1 } }), []);
    await runBatch(batch("c10", fireballAt()), h.deps);
    expect(hpOf(stored(h), "t1")).toBe(40);
    expect(combatantOf(stored(h), "warden").reactionUsed).toBe(true);
  });
  // Bug caught: a second Reaction in a round.
  it("fails if a counterer that already used its Reaction counters", async () => {
    await goesThrough(duel({ reactionUsed: true }));
  });
  // Both slot levels it lists are spent (3 of 3, 3 of 3). Bug caught: a counter cast with no slot left.
  it("fails if a counterer with no slot left counters", async () => {
    await goesThrough(duel({ action_uses: { "slots/3": { used: 3, per_day: 3 }, "slots/4": { used: 3, per_day: 3 } } }));
  });
  // Bug caught: an Incapacitated creature taking a Reaction.
  it("fails if an Incapacitated counterer counters", async () => {
    await goesThrough(duel({ conditions: [{ name: "Incapacitated" }] }));
  });
  // A creature at 0 hit points takes no Reaction. Bug caught: a downed creature's Reaction (and slot) spent.
  it("fails if a counterer at 0 hit points counters", async () => {
    await goesThrough(duel({ hp: 0 }));
  });
  // PHB 2014 ch. 9 "Surprise": a surprised creature takes no Reaction until its first turn ends. Bug caught: a surprised warden reacting under 2014.
  it("fails if a surprised counterer counters under the 2014 rules", async () => {
    await goesThrough(duel({ surprised: true }));
  });
  // Bug caught: no position known (the distance read as 0): a counterer with no place on the map does not counter.
  it("fails if a counterer with no known position counters", async () => {
    await goesThrough(duel({ position: undefined }));
  });
  // A wall at x = 2 (full height of the row) stands between the caster (1,1) and the warden at (4,1): every line is blocked. Bug caught: a counter from a creature that cannot see the caster.
  it("fails if a counterer behind a wall counters", async () => {
    await goesThrough(duel(), { map: mapOf(TOTAL_WALL) });
  });
  // The control: the same map with no wall in the way counters. Bug caught: sight refusing every counter when a map is known.
  it("fails if a counterer in the open on a map does not counter", async () => {
    const h = withCounter(duel(), [], { map: mapOf() });
    await runBatch(batch("c11", fireballAt()), h.deps);
    expect(combatantOf(stored(h), "warden").reactionUsed).toBe(true);
  });
  // The played character is a person: with no `playedMemberId` the server never casts a player's Reaction. Nessa (a player with no stat block here) is the only would-be counterer.
  // Bug caught: a player's Reaction taken for them.
  it("fails if a player the person plays counters", async () => {
    const fight = row({
      combatants_live: [
        combatant("caster", { monster_id: "m-mage", faction_id: "p", hp: 40, max_hp: 40, initiative: 12, position: { x: 1, y: 1 } }),
        pc("nessa", { faction_id: "m", hp: 20, max_hp: 20, initiative: 8, position: { x: 4, y: 1 } }),
        combatant("t1", { monster_id: "m-ox", faction_id: "m", hp: 40, max_hp: 40, ac: "13", initiative: 4, position: { x: 1, y: 3 } }),
      ],
    });
    const h = harness(fight, { sources: COUNTER_SOURCES, players: NESSA_IN_PLATE, spells: [counterspell(), fireball()], dieFaces: SAVE_FAILS_FOR_FULL });
    await runBatch(batch("c12", fireballAt()), h.deps);
    expect(hpOf(stored(h), "t1")).toBe(32);
    expect(combatantOf(stored(h), "nessa").reactionUsed).not.toBe(true);
  });

  // At most one counter per cast: two wardens, the nearer at (4,1) (15 ft) and the farther at (6,1) (25 ft). The nearer counters; the farther keeps its Reaction.
  // Bug caught: every eligible creature countering (two Reactions and two slots for one spell), or the farther one chosen.
  it("fails if two wardens both counter, or the farther one does", async () => {
    const far = combatant("far", { monster_id: "m-mage", faction_id: "m", hp: 40, max_hp: 40, initiative: 20, position: { x: 6, y: 1 } });
    const h = withCounter(duel({}, {}, [far]), []);
    await runBatch(batch("c13", fireballAt()), h.deps);
    expect(combatantOf(stored(h), "warden").reactionUsed).toBe(true);
    expect(combatantOf(stored(h), "far").reactionUsed).not.toBe(true);
    expect(combatantOf(stored(h), "far").action_uses).toBeUndefined();
  });

  // Equal distance (both 15 ft from (1,1): (4,1) and (1,4)): the one earlier in initiative order counters. The `twin` stands at initiative 20, the warden at 8.
  // Bug caught: ties broken by roster position instead of the turn order.
  it("fails if a tie in distance is not broken by the initiative order", async () => {
    const twin = combatant("twin", { monster_id: "m-mage", faction_id: "m", hp: 40, max_hp: 40, initiative: 20, position: { x: 1, y: 4 } });
    const h = withCounter(duel({}, {}, [twin]), []);
    await runBatch(batch("c14", fireballAt()), h.deps);
    expect(combatantOf(stored(h), "twin").reactionUsed).toBe(true);
    expect(combatantOf(stored(h), "warden").reactionUsed).not.toBe(true);
  });

  // An AI-played ally's cast under 2024: Tam (a 5th-level Wizard, two 3rd-level slots) casts Fireball and a hostile mage standing 20 ft from her counters. Her Constitution
  // save (a 1 on the d20, far below DC 14 with any bonus a Con 10 to 16 sheet has) fails, the spell is stopped and PHB 2024 says "the slot isn't expended": nothing is
  // written to the sheet, though the Action is spent. Bug caught: the sheet's slot written for a spell that was stopped (the fight's tally was right, the sheet not).
  it("fails if an ally whose spell a 2024 Counterspell stops still has the slot written to its sheet", async () => {
    const mage = { id: "m-mage", name: "Mage", stat_block: mageBlock() } as unknown as Monster;
    const fight = row({
      combatants_live: [
        pc("tam", { faction_id: "p", hp: 20, max_hp: 20, initiative: 12, position: { x: 1, y: 1 } }),
        combatant("victim", { monster_id: "m-ox", faction_id: "m", hp: 40, max_hp: 40, ac: "13", initiative: 5, position: { x: 6, y: 1 } }),
        combatant("warden", { monster_id: "m-mage", faction_id: "m", hp: 40, max_hp: 40, initiative: 3, position: { x: 5, y: 2 } }),
      ],
    });
    const h = harness(fight, {
      sources: { ...SOURCES, monsters: [...SOURCES.monsters, mage] }, players: wizardTamSheets(), map: mapOf(), ruleset: "2024",
      spells: [fireBolt({ ruleset: "2024" }), fireball({ ruleset: "2024" }), counterspell({ ruleset: "2024" })], dieFaces: [1],
    });
    const result = await runBatch(batch("t-ally", takeTurn({ instanceId: "tam", playedMemberId: "pm-pip", optionId: BALL })), h.deps);
    expect(result.effectFailures).toEqual([]);
    expect(hpOf(stored(h), "victim")).toBe(40);
    expect(combatantOf(stored(h), "tam").action_used).toBe(true);
    expect(combatantOf(stored(h), "warden").reactionUsed).toBe(true);
    expect(h.slotWrites).toEqual([]);
  });

  // An ally the AI plays (Tam, a 5th-level Wizard with Counterspell prepared and two 3rd-level slots) counters a hostile mage's Fireball aimed at her: the spell is stopped (no
  // damage, 20 stays), her Reaction is spent and ONE 3rd-level slot is written to her sheet (1 of 2), after the save. Bug caught: an ally's counter that never reaches the sheet.
  const tamCounters = () => {
    const grant = (name: string, level: number): AllySpellRow => ({ id: `${name}-row`, party_member_id: "pm-tam", name, level, is_known: true, is_prepared: true, always_prepared: false, source_type: "class", source_class_id: "cls-wiz", casting_ability: null, uses_per_day: null, uses_remaining: null });
    return wizardTamSheets({ spells: [grant("Counterspell", 3)] });
  };
  const mageVersusTam = () => row({
    combatants_live: [
      combatant("mage", { monster_id: "m-mage", faction_id: "m", hp: 40, max_hp: 40, initiative: 12, position: { x: 1, y: 1 } }),
      pc("tam", { faction_id: "p", hp: 20, max_hp: 20, initiative: 8, position: { x: 4, y: 1 } }),
    ],
  });
  const mageSources = (): StatBlockSources => ({ ...SOURCES, monsters: [...SOURCES.monsters, { id: "m-mage", name: "Mage", stat_block: mageBlock() } as unknown as Monster] });
  it("fails if an ally the AI plays counters a Fireball without writing her slot to the sheet", async () => {
    const h = harness(mageVersusTam(), { sources: mageSources(), players: tamCounters(), map: mapOf(), spells: [counterspell(), fireball()], dieFaces: [] });
    const result = await runBatch(batch("t-c1", takeTurn({ instanceId: "mage", playedMemberId: "pm-pip", optionId: "spell:Fireball:3:tam" })), h.deps);
    expect(result.effectFailures).toEqual([]);
    expect(hpOf(stored(h), "tam")).toBe(20);
    expect(combatantOf(stored(h), "tam").reactionUsed).toBe(true);
    expect(h.slotWrites).toEqual([{ memberId: "pm-tam", slots: [{ level: 3, max: 2, used: 1 }] }]);
  });

  // The same fight where the person plays Tam herself (and one with no one named: a DM's own fight): her Reaction is the person's, not the rules'. Her save (a 1) fails,
  // 8d6 of ones deal 8 (20 -> 12), no Reaction, no slot written. Bug caught: a player's Reaction taken for them.
  it.each([["pm-tam"], [undefined]])("fails if a player the person plays (%s) is made to counter", async (played) => {
    const h = harness(mageVersusTam(), { sources: mageSources(), players: tamCounters(), map: mapOf(), spells: [counterspell(), fireball()], dieFaces: [1, 1, 1, 1, 1, 1, 1, 1, 1], standIns: [] });
    await runBatch(batch("t-c2", takeTurn({ instanceId: "mage", ...(played === undefined ? {} : { playedMemberId: played }), optionId: "spell:Fireball:3:tam" })), h.deps);
    expect(hpOf(stored(h), "tam")).toBe(12);
    expect(combatantOf(stored(h), "tam").reactionUsed).not.toBe(true);
    expect(h.slotWrites).toEqual([]);
  });
});

// ── hiding and finding (#1021 row 13) ────────────────────────────────────────────

describe("take_turn: hide, search, and what a hidden creature cannot be aimed at", () => {
  /** A wolf of Intelligence 12 (a tactical creature is offered Hide) with Stealth +4 and Perception +5 listed. */
  const wise = (over: Record<string, unknown> = {}): StatBlockSources => ({ monsters: [monster("m-wolf", { int: 12, skills: { stealth: "+4", perception: "+5" }, ...over }), monster("m-ox")], npcs: [], companions: [] });
  // A wall through x = 2 long enough that nothing walks round it: the wolf at (0,0) has total cover from the ox at (4,0) where it stands.
  const WALLED = () => mapOf([[2, -50], [2, 50]]);
  const conditionsOf = (h: Harness, id: string) => combatantOf(stored(h), id).conditions;
  const hiddenOf = (h: Harness, id: string) => conditionsOf(h, id).find((c) => c.name === "Hidden");
  const outcomeOf = (result: { effects: Array<{ type: string }> }) => (result.effects[0] as unknown as { turn: { outcome?: string } }).turn.outcome;

  // SRD 5.2 "Hide": DC 15. Stealth +4 and a d20 of 11 is 15: hidden, with 15 kept as the DC a search must meet. A 10 is 14: not hidden.
  // Bug caught: the Hide option spends the Action and records nothing (as before), or the total is compared strictly (15 failing).
  it("fails if a kobold's Hide records no Hidden, loses its total, or is off by one at the DC", async () => {
    const win = harness(duel(), { sources: wise(), map: WALLED(), ruleset: "2024", dieFaces: [11] });
    const won = await runBatch(batch("b1", takeTurn({ optionId: "hide" })), win.deps);
    expect(hiddenOf(win, "wolf")).toMatchObject({ name: "Hidden", stealth: 15 });
    expect(combatantOf(stored(win), "wolf").action_used).toBe(true);
    expect(win.posted.map((p) => p.result.total)).toEqual([15]);
    expect(outcomeOf(won)).toBe("wolf hides.");

    const lose = harness(duel(), { sources: wise(), map: WALLED(), ruleset: "2024", dieFaces: [10] });
    const lost = await runBatch(batch("b2", takeTurn({ optionId: "hide" })), lose.deps);
    expect(hiddenOf(lose, "wolf")).toBeUndefined();
    expect(combatantOf(stored(lose), "wolf").action_used).toBe(true);
    expect(outcomeOf(lost)).toBe("wolf tries to hide but fails (Stealth 14, DC 15).");
  });

  // Dex 10 is +0, so without the listed +4 a d20 of 11 is 11 and fails: a creature that rolls Stealth with its Dexterity alone never hides.
  it("fails if the Stealth roll ignores the stat block's listed Stealth bonus", async () => {
    const h = harness(duel(), { sources: wise({ skills: {} }), map: WALLED(), ruleset: "2024", dieFaces: [11] });
    await runBatch(batch("b1", takeTurn({ optionId: "hide" })), h.deps);
    expect(hiddenOf(h, "wolf")).toBeUndefined();
  });

  // SRD 5.2 "Search [Action]": a Wisdom (Perception) check against the Stealth total. The ox hides at 15 (Hidden's own total) and the wolf
  // has Perception +5: a d20 of 10 is 15, which meets it; a 9 is 14, which does not.
  // Bug caught: a search that never removes Hidden, or finds on a total below it, or rolls without the listed Perception bonus.
  it("fails if a search does not find a hidden foe its Perception meets, or finds one it does not meet", async () => {
    const fight = () => duel({ victim: { conditions: [hiddenCondition(15)] } });
    const finds = harness(fight(), { sources: wise(), map: mapOf(), ruleset: "2024", dieFaces: [10] });
    const found = await runBatch(batch("b1", takeTurn({ optionId: "search" })), finds.deps);
    expect(hiddenOf(finds, "victim")).toBeUndefined();
    expect(combatantOf(stored(finds), "wolf").action_used).toBe(true);
    expect(outcomeOf(found)).toBe("wolf searches (Perception 15) and finds victim.");

    const misses = harness(fight(), { sources: wise(), map: mapOf(), ruleset: "2024", dieFaces: [9] });
    const missed = await runBatch(batch("b2", takeTurn({ optionId: "search" })), misses.deps);
    expect(hiddenOf(misses, "victim")).toMatchObject({ stealth: 15 });
    expect(outcomeOf(missed)).toBe("wolf searches (Perception 14) and finds no one.");
  });

  // 2014 is a contest (PHB ch. 7): a tie leaves the hider hidden. Total 15 against Stealth 15 finds no one, 16 finds. Bug caught: the 2024 rule used in 2014.
  it("fails if a 2014 search that only ties the hider's Stealth finds it", async () => {
    const tie = harness(duel({ victim: { conditions: [hiddenCondition(15)] } }), { sources: wise(), map: mapOf(), ruleset: "2014", dieFaces: [10] });
    await runBatch(batch("b1", takeTurn({ optionId: "search" })), tie.deps);
    expect(hiddenOf(tie, "victim")).toBeDefined();
    const beat = harness(duel({ victim: { conditions: [hiddenCondition(15)] } }), { sources: wise(), map: mapOf(), ruleset: "2014", dieFaces: [11] });
    await runBatch(batch("b2", takeTurn({ optionId: "search" })), beat.deps);
    expect(hiddenOf(beat, "victim")).toBeUndefined();
  });

  // One roll, a 60 ft reach: the near ox (gap 3 squares = 15 ft) is found, the far one (x = 20: gap 19 squares, 95 ft) is not, though the one total beats both.
  // Bug caught: a search that finds a creature across the map, or rolls once per creature.
  it("fails if one search finds a hidden foe beyond 60 feet, or rolls more than once", async () => {
    const fight = duel({ victim: { conditions: [hiddenCondition(10)] }, extra: [combatant("far", { monster_id: "m-ox", faction_id: "p", hp: 40, max_hp: 40, ac: "13", initiative: 3, position: { x: 20, y: 0 }, conditions: [hiddenCondition(10)] })] });
    const h = harness(fight, { sources: wise(), map: mapOf(), ruleset: "2024", dieFaces: [19] });
    await runBatch(batch("b1", takeTurn({ optionId: "search" })), h.deps);
    expect(hiddenOf(h, "victim")).toBeUndefined();
    expect(hiddenOf(h, "far")).toBeDefined();
    expect(h.dieCalls).toBe(1);
  });

  // The rules-only picker: the only foe is hidden, so no attack is offered and the wolf searches rather than walking at a foe it cannot find.
  it("fails if the picker does not search when the only foe is hidden", async () => {
    const h = harness(duel({ victim: { conditions: [hiddenCondition(15)] } }), { sources: wise({ int: 10 }), map: mapOf(), ruleset: "2024", dieFaces: [10] });
    const result = await runBatch(batch("b1", takeTurn()), h.deps);
    expect(result.effects[0]).toMatchObject({ type: "turn_taken", turn: { kind: "search", picked: "rules" } });
    expect(hpOf(stored(h), "victim")).toBe(40);
  });

  // An attack on a foe in view ends the attacker's own Hidden, hit or miss (PHB 2014 ch. 9 "Unseen Attackers and Targets"). An unseen attacker rolls with
  // advantage, so two d20s, both 1: a miss.
  // Bug caught: a creature keeps Hidden through its own attack, so it strikes from hiding every round.
  it("fails if a hiding creature keeps Hidden after it attacks", async () => {
    const h = harness(duel({ wolf: { conditions: [hiddenCondition(15)] } }), { sources: SOURCES, map: mapOf(), dieFaces: [1, 1] });
    await runBatch(batch("b1", takeTurn()), h.deps);
    expect(hiddenOf(h, "wolf")).toBeUndefined();
    expect(combatantOf(stored(h), "wolf").action_used).toBe(true);
  });

  // The same for a spell with an attack roll (Fire Bolt): d20 15, then its damage dice.
  it("fails if a hiding caster keeps Hidden after a spell attack", async () => {
    const sources: StatBlockSources = { monsters: [{ id: "m-mage", name: "Mage", stat_block: mageBlock({ actions: [] }) } as unknown as Monster, monster("m-ox")], npcs: [], companions: [] };
    const fight = row({
      combatants_live: [
        combatant("mage", { monster_id: "m-mage", faction_id: "m", hp: 40, max_hp: 40, initiative: 12, position: { x: 1, y: 1 }, conditions: [hiddenCondition(12)] }),
        combatant("t1", { monster_id: "m-ox", faction_id: "p", hp: 40, max_hp: 40, ac: "13", initiative: 5, position: { x: 4, y: 1 } }),
      ],
    });
    const h = harness(fight, { sources, map: mapOf(), spells: [fireBolt()], dieFaces: [15, 3, 4, 1, 1, 1, 1] });
    await runBatch(batch("b1", { type: "cast_spell", casterId: "mage", spell: "fire bolt", targetIds: ["t1"] } as CommandRequest["commands"][number]), h.deps);
    expect(hpOf(stored(h), "t1")).toBeLessThan(40);
    expect(hiddenOf(h, "mage")).toBeUndefined();
  });

  // A hidden creature leaving a foe's reach is not seen to leave: the ox does not strike (PHB 2014 ch. 9 "Opportunity Attacks": a creature you can see).
  // Same fight as the opportunity test above, where the ox's d20 9 + 4 downs the wolf; here no die is thrown and the wolf is not downed.
  it("fails if an enemy strikes a hidden creature as it leaves its reach", async () => {
    const fight = duel({ wolf: { hp: 2, position: { x: 1, y: 0 }, conditions: [hiddenCondition(15)] }, victim: { position: { x: 2, y: 0 } } });
    const h = harness(fight, { sources: SOURCES, map: mapOf(), dieFaces: [] });
    const result = await runBatch(batch("b1", takeTurn()), h.deps);
    expect(result.effects.some((e) => e.type === "opportunity")).toBe(false);
    expect(hpOf(stored(h), "wolf")).toBe(2);
    expect(h.dieCalls).toBe(0);
  });
});
