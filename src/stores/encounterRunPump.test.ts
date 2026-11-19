// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import type { RunCombatant } from "@/types/encounter.types";
import type { FightAnswer } from "@/lib/encounters/fightWire";

const net = vi.hoisted(() => ({ invoke: vi.fn() }));
const toasts = vi.hoisted(() => ({ error: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { functions: { invoke: net.invoke } } }));
vi.mock("@/composables/useToast", () => ({
  useToast: () => ({ error: toasts.error, info: vi.fn(), fromError: (_e: unknown, fallback: string) => fallback }),
}));

import { useEncounterRunStore } from "@/stores/encounterRun";

function creature(id: string, over: Partial<RunCombatant> = {}): RunCombatant {
  return {
    instance_id: id, type: "monster", name: id, faction_id: "f", initiative: 10, hp: 20, max_hp: 30, ac: "12",
    conditions: [], curses: [], death_saves: { successes: 0, failures: 0 }, dex_mod: 0, ...over,
  };
}

function answer(hp: number, version: number): FightAnswer {
  return {
    applied: true, version, is_running: false, ended_at: null,
    state: { combatants_live: [creature("ogre", { hp })], current_round: 1, active_combatant_index: 0, events_fired: [], lair_fired_rounds: [] },
    effects: [], effectFailures: [],
  };
}

function start(store: ReturnType<typeof useEncounterRunStore>, id: string) {
  store.startFight(
    { encounterId: id, encounterName: id, factions: [], events: [], traps: [] },
    { combatants: [creature("ogre")], round: 1, activeIndex: 0, eventsFired: [], lairFiredRounds: [], version: 1 },
  );
}

const leaveIsStopped = () => {
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
};

describe("the store's batch pump", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.useFakeTimers();
    net.invoke.mockReset();
    toasts.error.mockReset();
  });
  afterEach(() => {
    useEncounterRunStore().$dispose();
    vi.useRealTimers();
  });

  it("fails if a reply that arrives after another fight took over the store is shown as that fight", async () => {
    // The answer to enc-1's batch was adopted whole by whatever the store held, so enc-2 took on enc-1's hit points.
    const store = useEncounterRunStore();
    start(store, "enc-1");
    let reply!: (value: unknown) => void;
    net.invoke.mockReturnValueOnce(new Promise((resolve) => { reply = resolve; })).mockReturnValue(new Promise(() => {}));
    store.adjustHp("ogre", -4);
    await flushPromises();
    store.reset();
    start(store, "enc-2");
    reply({ data: answer(7, 9), error: null });
    await flushPromises();
    expect(store.combatants[0]?.hp).toBe(20);
    expect(store.sendFailures).toBe(0);
  });

  it("fails if putting the fight away leaves the retry timer or the page-leave prompt behind", async () => {
    const store = useEncounterRunStore();
    start(store, "enc-1");
    net.invoke.mockResolvedValue({ data: null, error: { message: "Failed to send a request", context: new TypeError("fetch failed") } });
    store.adjustHp("ogre", -4);
    await flushPromises();
    expect(leaveIsStopped()).toBe(true);
    store.reset();
    await flushPromises();
    expect(leaveIsStopped()).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("fails if disposing the store leaves a listener or a timer on the page", async () => {
    const store = useEncounterRunStore();
    start(store, "enc-1");
    net.invoke.mockResolvedValue({ data: null, error: { message: "Failed to send a request", context: new TypeError("fetch failed") } });
    store.adjustHp("ogre", -4);
    await flushPromises();
    expect(leaveIsStopped()).toBe(true);
    store.$dispose();
    expect(leaveIsStopped()).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("fails if the DM is not told once, with no runner anywhere, that the server will not take their changes", async () => {
    // A refusal that will not change used to be told only by a mounted runner.
    const store = useEncounterRunStore();
    start(store, "enc-1");
    net.invoke.mockResolvedValue({ data: null, error: { message: "non-2xx", context: new Response(JSON.stringify({ error: "No such fight." }), { status: 404 }) } });
    store.adjustHp("ogre", -4);
    await flushPromises();
    expect(toasts.error).toHaveBeenCalledTimes(1);
    expect(toasts.error).toHaveBeenCalledWith(expect.stringContaining("gone"));
    expect(store.hasQueued()).toBe(false);
  });
});
