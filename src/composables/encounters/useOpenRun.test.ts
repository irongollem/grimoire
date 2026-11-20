import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { effectScope, ref, nextTick } from "vue";
import { useEncounterRunStore } from "@/stores/encounterRun";
const net = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { functions: { invoke: net.invoke } } }));

// The reads the run view makes are stood in for; what is under test is what it sends and what it builds from the answer.
const reads = await vi.hoisted(async () => {
  const { ref: r } = await import("vue");
  return { send: vi.fn(), encounter: r<unknown>(null), npcs: r<unknown>(undefined) };
});
vi.mock("@/lib/encounters/fightWire", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/encounters/fightWire")>()), sendAlone: reads.send }));
vi.mock("@/composables/encounters/useEncounters", () => ({ useEncounter: () => ({ data: reads.encounter }) }));
vi.mock("@/composables/npcs/useNpcs", () => ({ useNpcs: () => ({ data: reads.npcs }) }));
vi.mock("@/composables/monsters/useMonstersByIds", () => ({ useMonstersByIds: () => ({ data: ref(new Map()), isLoading: ref(false) }) }));
vi.mock("@/composables/dungeon-features/useTraps", () => ({ useTrapResolver: () => ({ byId: ref(new Map()), isLoading: ref(false) }) }));
vi.mock("@/composables/encounters/useEncounterLive", () => ({ useEncounterLive: () => ({ liveState: ref(null) }) }));
vi.mock("@/composables/useToast", () => ({ useToast: () => ({ error: vi.fn(), fromError: vi.fn(() => "failed") }) }));

import { sendLeftBehind, useOpenRun } from "@/composables/encounters/useOpenRun";
import type { RunCombatant } from "@/types/encounter.types";

function npcRow(id: string, locationId: string) {
  return { id, name: id, stat_block: null, portrait_url: null, portrait_focal_point: null, cutout_url: null, size: "medium", location_id: locationId, disguise_name: null, disguise_portrait_url: null, disguise_portrait_focal_point: null, is_revealed: true, unmasked_at: null };
}

function answerWith(combatants: Partial<RunCombatant>[], round: number) {
  return { answer: { version: 1, state: { combatants_live: combatants, current_round: round, active_combatant_index: 0, events_fired: [], lair_fired_rounds: [] }, effects: [], effectFailures: [] }, batchId: "b" };
}

describe("useOpenRun", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    reads.send.mockReset();
    net.invoke.mockReset();
    net.invoke.mockResolvedValue({ data: { version: 2, state: { combatants_live: [], current_round: 0, active_combatant_index: 0, events_fired: [], lair_fired_rounds: [] }, effects: [], effectFailures: [] }, error: null });
    reads.encounter.value = { id: "enc-1", name: "Ambush", location_id: "room", factions: [], events: [], combatants: [], trap_ids: [], library_trap_ids: [], lair_enabled: false, lair_owner_def_id: null };
    reads.npcs.value = [npcRow("guard", "room"), npcRow("clerk", "elsewhere")];
  });

  /** The NPCs the run asked the server to seat after opening (a join is a command the pump sends). */
  function joinedNpcIds(): string[] {
    return net.invoke.mock.calls.flatMap(([, init]) => (init.body.commands as { type: string; combatants?: { npc_id?: string }[] }[]).filter((c) => c.type === "add_combatants").flatMap((c) => (c.combatants ?? []).map((x) => x.npc_id ?? "")));
  }

  async function open(onlyMemberId?: () => string | null) {
    const scope = effectScope();
    const handle = scope.run(() => useOpenRun(ref("enc-1"), onlyMemberId ? { onlyMemberId } : {}));
    for (let i = 0; i < 10; i++) await nextTick();
    await Promise.resolve();
    await Promise.resolve();
    return { scope, handle };
  }

  it("fails if the browser still builds and sends a roster, or sends a played member for the DM's own fight", async () => {
    reads.send.mockResolvedValue(answerWith([], 0));
    const { scope } = await open();
    expect(reads.send).toHaveBeenCalledTimes(1);
    expect(reads.send.mock.calls[0][1]).toStrictEqual({ type: "open" });
    scope.stop();
  });

  it("fails if the AI table does not tell the server which member is played", async () => {
    reads.send.mockResolvedValue(answerWith([], 0));
    const { scope } = await open(() => "pm-1");
    expect(reads.send.mock.calls[0][1]).toStrictEqual({ type: "open", playedMemberId: "pm-1" });
    scope.stop();
  });

  it("fails if the store is not built from the server's answer, or a fresh DM fight is seated with the room's NPCs", async () => {
    reads.send.mockResolvedValue(answerWith([{ instance_id: "ogre", type: "monster", name: "Ogre", faction_id: "foes", hp: 5, max_hp: 5, ac: "10", conditions: [], curses: [], death_saves: { successes: 0, failures: 0 } }], 0));
    const { handle, scope } = await open();
    const store = useEncounterRunStore();
    expect(store.combatants.map((c) => c.instance_id)).toStrictEqual(["ogre"]);
    expect(handle?.opened.value).toBe(true);
    expect(joinedNpcIds()).toStrictEqual([]);
    scope.stop();
  });

  it("fails if the AI table's fight that was under way before the first round is not joined by the room's characters the server left out", async () => {
    reads.send.mockResolvedValue(answerWith([{ instance_id: "pc", type: "player", name: "Pc", faction_id: "players", party_member_id: "pm-1", hp: 5, max_hp: 5, ac: "10", conditions: [], curses: [], death_saves: { successes: 0, failures: 0 } }], 0));
    const { scope } = await open(() => "pm-1");
    expect(joinedNpcIds()).toStrictEqual(["guard"]);
    scope.stop();
  });

  it("fails if a character the server already seated is seated a second time", async () => {
    reads.send.mockResolvedValue(answerWith([{ instance_id: "b-guard", type: "monster", name: "guard", faction_id: "players", npc_id: "guard", hp: 1, max_hp: 1, ac: "10", conditions: [], curses: [], death_saves: { successes: 0, failures: 0 } }], 0));
    const { scope } = await open(() => "pm-1");
    expect(joinedNpcIds()).toStrictEqual([]);
    scope.stop();
  });

  it("fails if a refetch of the encounter while the open is in flight asks the server to open a second time", async () => {
    let release: (value: ReturnType<typeof answerWith>) => void = () => undefined;
    reads.send.mockReturnValue(new Promise((resolve) => { release = resolve; }));
    const { scope } = await open();
    reads.encounter.value = { ...(reads.encounter.value as object) };
    for (let i = 0; i < 5; i++) await nextTick();
    expect(reads.send).toHaveBeenCalledTimes(1);
    release(answerWith([], 0));
    scope.stop();
  });

  it("fails if a remount over a run the store already holds opens a second fight", async () => {
    reads.send.mockResolvedValue(answerWith([], 0));
    const first = await open();
    await vi.waitFor(() => expect(useEncounterRunStore().encounterId).toBe("enc-1"));
    const again = await open();
    expect(reads.send).toHaveBeenCalledTimes(1);
    expect(again.handle?.opened.value).toBe(true);
    first.scope.stop();
    again.scope.stop();
  });
});

describe("sendLeftBehind", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    useEncounterRunStore().$dispose();
    vi.useRealTimers();
  });

  function fightWithUnsent() {
    setActivePinia(createPinia());
    const store = useEncounterRunStore();
    store.startFight(
      { encounterId: "enc-old", encounterName: "Old", factions: [], events: [], traps: [] },
      { combatants: [{ instance_id: "ogre", type: "monster", name: "ogre", faction_id: "f", initiative: 10, hp: 20, max_hp: 30, ac: "12", conditions: [], curses: [], death_saves: { successes: 0, failures: 0 }, dex_mod: 0 }], round: 1, activeIndex: 0, eventsFired: [], lairFiredRounds: [], version: 1 },
    );
    store.adjustHp("ogre", -4);
    return store;
  }

  it("fails if the unsent changes of the last fight are not sent to that fight before another opens, or are sent twice", async () => {
    net.invoke.mockReset();
    net.invoke.mockResolvedValue({ data: { version: 2, state: { combatants_live: [], current_round: 1, active_combatant_index: 0, events_fired: [], lair_fired_rounds: [] }, effects: [], effectFailures: [] }, error: null });
    const store = fightWithUnsent();
    const failed = vi.fn();
    await sendLeftBehind(store, "enc-new", failed);
    expect(net.invoke).toHaveBeenCalledTimes(1);
    expect(net.invoke.mock.calls[0][1].body).toMatchObject({ encounterId: "enc-old", commands: [{ type: "adjust_hp" }] });
    expect(failed).not.toHaveBeenCalled();
  });

  it("fails if changes that could not be sent in time are dropped without telling the DM", async () => {
    net.invoke.mockReset();
    net.invoke.mockResolvedValue({ data: null, error: { message: "Failed to send a request", context: new TypeError("fetch failed") } });
    const store = fightWithUnsent();
    const failed = vi.fn();
    const waiting = sendLeftBehind(store, "enc-new", failed, 3000);
    await vi.advanceTimersByTimeAsync(3000);
    await waiting;
    expect(failed).toHaveBeenCalledTimes(1);
  });

  it("fails if opening the same fight again waits for its own unsent changes, or calls them lost", async () => {
    net.invoke.mockReset();
    net.invoke.mockResolvedValue({ data: null, error: { message: "Failed to send a request", context: new TypeError("fetch failed") } });
    const store = fightWithUnsent();
    const failed = vi.fn();
    // No timers advance: a wait would never end here.
    await sendLeftBehind(store, "enc-old", failed);
    expect(failed).not.toHaveBeenCalled();
  });
});
