import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, ref } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import type { EncounterState, RunCombatant } from "@/types/encounter.types";
import type { FightAnswer } from "@/lib/encounters/fightWire";

const net = vi.hoisted(() => ({ invoke: vi.fn() }));
const toasts = vi.hoisted(() => ({ error: vi.fn(), info: vi.fn() }));
const rings = vi.hoisted(() => ({
  ring: [] as ((r: { campaignId: string; table: string }) => void)[],
  reconcile: [] as ((campaignId: string) => void)[],
}));

vi.mock("@/lib/supabase", () => ({ supabase: { functions: { invoke: net.invoke } } }));
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => ({ activeCampaignId: "campaign-1" }) }));
vi.mock("@/composables/useToast", () => ({
  useToast: () => ({ error: toasts.error, info: toasts.info, fromError: (_e: unknown, fallback: string) => fallback }),
}));
vi.mock("@/lib/campaignLiveSync/rings", () => ({
  onCampaignRing: (_tables: string[], listener: (r: { campaignId: string; table: string }) => void) => {
    rings.ring.push(listener);
    return () => rings.ring.splice(rings.ring.indexOf(listener), 1);
  },
  onCampaignReconcile: (listener: (campaignId: string) => void) => {
    rings.reconcile.push(listener);
    return () => rings.reconcile.splice(rings.reconcile.indexOf(listener), 1);
  },
}));

import { liveState, liveRevision } from "@/composables/encounters/useEncounterLive";
import { useEncounterRunStore } from "@/stores/encounterRun";
import { useFightCommands } from "./useFightCommands";

function creature(id: string, over: Partial<RunCombatant> = {}): RunCombatant {
  return {
    instance_id: id, type: "monster", name: id, faction_id: "f", initiative: 10, hp: 20, max_hp: 30, ac: "12",
    conditions: [], curses: [], death_saves: { successes: 0, failures: 0 }, dex_mod: 0, ...over,
  };
}

/** What the function answers: the fight with the ogre at `hp`. */
function answer(hp: number, version: number, over: Partial<FightAnswer> = {}): FightAnswer {
  return {
    applied: true, version, is_running: false, ended_at: null,
    state: { combatants_live: [creature("ogre", { hp })], current_round: 1, active_combatant_index: 0, events_fired: [], lair_fired_rounds: [] },
    effects: [], effectFailures: [], ...over,
  };
}

/** What supabase-js does with a non-2xx: an error whose `context` is the unread Response. */
const refusal = (status: number, error: string) => ({ data: null, error: { message: "non-2xx", context: new Response(JSON.stringify({ error }), { status }) } });
const offline = () => ({ data: null, error: { message: "Failed to send a request", context: new TypeError("fetch failed") } });

const sent = () => net.invoke.mock.calls.map(([, init]) => init.body as { batchId: string; commands: Array<{ type: string }> });

function mountComposable(onLost = vi.fn()) {
  let api!: ReturnType<typeof useFightCommands>;
  const wrapper = mount(defineComponent({
    setup() {
      api = useFightCommands(ref("enc-1"), { onLost });
      return () => null;
    },
  }));
  return { api, wrapper, onLost };
}

function attach() {
  const store = useEncounterRunStore();
  store.startFight(
    { encounterId: "enc-1", encounterName: "Ambush", factions: [], events: [], traps: [] },
    { combatants: [creature("ogre")], round: 1, activeIndex: 0, eventsFired: [], lairFiredRounds: [], version: 5 },
  );
  return store;
}

const hp = (store: ReturnType<typeof useEncounterRunStore>) => store.combatants[0]?.hp;

beforeEach(() => {
  setActivePinia(createPinia());
  vi.useFakeTimers();
  net.invoke.mockReset();
  toasts.error.mockReset();
  rings.ring.length = 0;
  rings.reconcile.length = 0;
  liveState.value = null;
});
afterEach(() => vi.useRealTimers());

describe("useFightCommands", () => {
  it("fails if commands made in one burst are not sent as one batch, or the screen waits for the reply to show them", async () => {
    const store = attach();
    net.invoke.mockResolvedValue({ data: answer(20, 5), error: null });
    mountComposable();
    await flushPromises(); // the party sync of mounting
    net.invoke.mockClear();
    net.invoke.mockResolvedValue({ data: answer(13, 6), error: null });
    store.adjustHp("ogre", -4);
    store.adjustHp("ogre", -3);
    expect(hp(store)).toBe(13); // shown before any reply
    await flushPromises();
    expect(sent()).toHaveLength(1);
    expect(sent()[0].commands.map((c) => c.type)).toEqual(["adjust_hp", "adjust_hp"]);
  });

  it("fails if a retry after a network failure gets a new batch id, or a command made meanwhile is merged into the batch already sent", async () => {
    const store = attach();
    net.invoke.mockResolvedValue({ data: answer(20, 5), error: null });
    mountComposable();
    await flushPromises();
    net.invoke.mockClear();
    net.invoke.mockResolvedValueOnce(offline()).mockResolvedValue({ data: answer(12, 6), error: null });
    store.adjustHp("ogre", -4);
    await flushPromises(); // first try fails, now backing off
    store.adjustHp("ogre", -4);
    expect(hp(store)).toBe(12); // keeps working while offline
    await vi.advanceTimersByTimeAsync(600);
    await flushPromises();
    const bodies = sent();
    expect(bodies).toHaveLength(3);
    expect(bodies[1].batchId).toBe(bodies[0].batchId);
    expect(bodies[1].commands).toHaveLength(1);
    expect(bodies[2].batchId).not.toBe(bodies[0].batchId);
  });

  it("fails if a 409 'this fight has ended' keeps retrying or keeps the pending commands, or does not tell the DM", async () => {
    const store = attach();
    net.invoke.mockResolvedValue({ data: answer(20, 5), error: null });
    const { onLost } = mountComposable();
    await flushPromises();
    net.invoke.mockClear();
    net.invoke.mockResolvedValue(refusal(409, "This fight has ended."));
    store.adjustHp("ogre", -4);
    await flushPromises();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(sent()).toHaveLength(1);
    expect(store.hasQueued()).toBe(false);
    expect(hp(store)).toBe(20);
    expect(toasts.error).toHaveBeenCalledWith(expect.stringContaining("ended"));
    expect(onLost).toHaveBeenCalled();
  });

  it("fails if a 409 'kept changing' is given up on instead of retried", async () => {
    const store = attach();
    net.invoke.mockResolvedValue({ data: answer(20, 5), error: null });
    mountComposable();
    await flushPromises();
    net.invoke.mockClear();
    net.invoke.mockResolvedValueOnce(refusal(409, "The fight kept changing under this command; try again.")).mockResolvedValue({ data: answer(16, 6), error: null });
    store.adjustHp("ogre", -4);
    await flushPromises();
    await vi.advanceTimersByTimeAsync(600);
    await flushPromises();
    expect(sent()).toHaveLength(2);
    expect(toasts.error).not.toHaveBeenCalled();
  });

  it("fails if a lifecycle command goes before the commands made earlier, or not alone", async () => {
    const store = attach();
    net.invoke.mockResolvedValue({ data: answer(20, 5), error: null });
    const { api } = mountComposable();
    await flushPromises();
    net.invoke.mockClear();
    net.invoke.mockResolvedValue({ data: answer(16, 6), error: null });
    store.adjustHp("ogre", -4);
    const done = api.lifecycle({ type: "go_live", sessionId: "s1" });
    await flushPromises();
    await done;
    expect(sent().map((b) => b.commands.map((c) => c.type))).toEqual([["adjust_hp"], ["go_live"]]);
  });

  it("fails if a runner that ended its fight still answers the sheets' rings with a sync (the DM was told their changes were lost)", async () => {
    attach();
    net.invoke.mockResolvedValue({ data: answer(20, 5), error: null });
    const { api } = mountComposable();
    await flushPromises();
    await api.lifecycle({ type: "end_combat", siteId: null });
    await flushPromises();
    net.invoke.mockClear();
    // Ending the fight wrote every character's row; each write rings.
    rings.ring[0]({ campaignId: "campaign-1", table: "party_members" });
    rings.ring[0]({ campaignId: "campaign-1", table: "party_members" });
    await flushPromises();
    expect(sent()).toEqual([]);
    expect(toasts.error).not.toHaveBeenCalled();
  });

  it("fails if a ring on the party's rows is not answered with a party sync sent alone", async () => {
    attach();
    net.invoke.mockResolvedValue({ data: answer(20, 5), error: null });
    mountComposable();
    await flushPromises();
    net.invoke.mockClear();
    rings.ring[0]({ campaignId: "campaign-1", table: "party_members" });
    rings.ring[0]({ campaignId: "campaign-1", table: "party_members" });
    await flushPromises();
    // A burst is one sync, and another campaign's ring is none.
    expect(sent().map((b) => b.commands.map((c) => c.type))).toEqual([["sync_party"]]);
    rings.ring[0]({ campaignId: "other", table: "party_members" });
    await flushPromises();
    expect(sent()).toHaveLength(1);
  });

  it("fails if a ring's read of a newer row is not taken as the confirmed fight", async () => {
    const store = attach();
    net.invoke.mockResolvedValue({ data: answer(20, 5), error: null });
    mountComposable();
    await flushPromises();
    liveState.value = {
      id: "row", encounter_id: "enc-1", campaign_id: "campaign-1", user_id: "u", is_running: true, current_round: 1, active_combatant_index: 0,
      combatants_live: [creature("ogre", { hp: 9 })], events_fired: [], magical_darkness: [], started_at: null, updated_at: "",
      version: 6, applied_command_ids: [], lair_fired_rounds: [],
    } satisfies EncounterState;
    liveRevision.value++;
    await flushPromises();
    expect(hp(store)).toBe(9);
  });

  describe("takeTurn", () => {
    const turn = { instanceId: "ogre", optionId: "o1", kind: "attack", summary: "Attack Fresco with Greatclub", reason: "Nearest.", picked: "rules" } as const;
    const resolved = { kind: "concentration", instanceId: "fresco", dc: 10, natural: 12, total: 12, maintained: true } as const;

    it("fails if the turn and each roll are not read out of the reply's effects, or the command is not sent alone for that creature", async () => {
      attach();
      net.invoke.mockResolvedValue({ data: answer(20, 5), error: null });
      const { api } = mountComposable();
      await flushPromises();
      net.invoke.mockClear();
      net.invoke.mockResolvedValue({ data: answer(20, 6, { effects: [{ type: "turn_taken", turn }, { type: "resolved", resolved }, { type: "resolved", resolved }] }), error: null });
      const run = await api.takeTurn("ogre");
      expect(sent().map((b) => b.commands)).toEqual([[{ type: "take_turn", instanceId: "ogre" }]]);
      expect(run.turn).toEqual(turn);
      expect(run.outcomes).toHaveLength(2);
    });

    it("fails if a replayed batch (no turn_taken effect) is answered with an invented turn", async () => {
      attach();
      net.invoke.mockResolvedValue({ data: answer(20, 5), error: null });
      const { api } = mountComposable();
      await flushPromises();
      net.invoke.mockResolvedValue({ data: answer(20, 6, { applied: false, effects: [] }), error: null });
      expect(await api.takeTurn("ogre")).toEqual({ turn: null, outcomes: [] });
    });

    it("fails if the server's refusal is swallowed instead of thrown with its sentence", async () => {
      attach();
      net.invoke.mockResolvedValue({ data: answer(20, 5), error: null });
      const { api } = mountComposable();
      await flushPromises();
      net.invoke.mockResolvedValue(refusal(400, "Ogre is at 0 hit points."));
      await expect(api.takeTurn("ogre")).rejects.toThrow("Ogre is at 0 hit points.");
    });
  });
});
