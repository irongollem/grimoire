import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, ref } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import type { EncounterState, RunCombatant } from "@/types/encounter.types";
import { retryDelayMs, type FightAnswer } from "@/lib/encounters/fightWire";

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
// The store raises its own toasts from the toast stack itself (`@/lib/toast`), with or without a runner.
vi.mock("@/lib/toast", () => ({ toast: { error: toasts.error, info: toasts.info, fromError: (_e: unknown, fallback: string) => fallback } }));
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
import { STUCK_AFTER_FAILURES } from "@/stores/encounterRunPump";
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

const mounted: Array<{ unmount: () => void }> = [];

function mountComposable(onLost = vi.fn(), idRef = ref("enc-1")) {
  let api!: ReturnType<typeof useFightCommands>;
  const wrapper = mount(defineComponent({
    setup() {
      api = useFightCommands(idRef, { onLost });
      return () => null;
    },
  }));
  mounted.push(wrapper);
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
afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
  // The store's pump keeps its page-leave prompt and its retry timer until the store is gone.
  useEncounterRunStore().$dispose();
  vi.useRealTimers();
});

/** Another fight takes over the store, with a change of its own waiting to be sent. */
function store2() {
  const store = useEncounterRunStore();
  store.reset();
  store.startFight(
    { encounterId: "enc-2", encounterName: "Other", factions: [], events: [], traps: [] },
    { combatants: [creature("ogre")], round: 1, activeIndex: 0, eventsFired: [], lairFiredRounds: [], version: 1 },
  );
  store.adjustHp("ogre", -2);
}

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

    // Bug caught: the played character's id never reaching the server, so every party member's reaction is reported as the player's own.
    it("fails if the played member's id is not sent with the turn", async () => {
      attach();
      net.invoke.mockResolvedValue({ data: answer(20, 5), error: null });
      const { api } = mountComposable();
      await flushPromises();
      net.invoke.mockClear();
      net.invoke.mockResolvedValue({ data: answer(20, 6, { effects: [{ type: "turn_taken", turn }] }), error: null });
      await api.takeTurn("ogre", "pm-fresco");
      expect(sent().map((b) => b.commands)).toEqual([[{ type: "take_turn", instanceId: "ogre", playedMemberId: "pm-fresco" }]]);
    });

    it("fails if a replayed batch (no turn_taken effect) is answered with an invented turn", async () => {
      attach();
      net.invoke.mockResolvedValue({ data: answer(20, 5), error: null });
      const { api } = mountComposable();
      await flushPromises();
      net.invoke.mockResolvedValue({ data: answer(20, 6, { applied: false, effects: [] }), error: null });
      expect(await api.takeTurn("ogre")).toEqual({ turn: null, outcomes: [], provokedPlayer: [], reactionOffered: null });
    });

    it("fails if a provoked player is not read out of the reply's effects", async () => {
      attach();
      net.invoke.mockResolvedValue({ data: answer(20, 5), error: null });
      const { api } = mountComposable();
      await flushPromises();
      net.invoke.mockResolvedValue({ data: answer(20, 6, { effects: [{ type: "provoked_player", moverId: "ogre", playerId: "fresco", step: 0 }] }), error: null });
      expect((await api.takeTurn("ogre")).provokedPlayer).toEqual([{ moverId: "ogre", playerId: "fresco" }]);
    });

    const offer = { kind: "shield", reactorId: "fresco", attackerId: "ogre", attack: "Greatclub", roll: { natural: 14, total: 17 }, armorClass: 15, shieldedArmorClass: 20, spell: "Shield", castLevel: 1, spends: "slot" } as const;

    it("fails if a paused turn's offer is not read out of the reply, or the turn is invented beside it", async () => {
      attach();
      net.invoke.mockResolvedValue({ data: answer(20, 5), error: null });
      const { api } = mountComposable();
      await flushPromises();
      net.invoke.mockResolvedValue({ data: answer(20, 6, { effects: [{ type: "reaction_offered", offer }] }), error: null });
      expect(await api.takeTurn("ogre", "pm-fresco")).toEqual({ turn: null, outcomes: [], provokedPlayer: [], reactionOffered: offer });
    });

    it("fails if the answer is not sent alone as answer_reaction, or a second offer in its reply is dropped", async () => {
      attach();
      net.invoke.mockResolvedValue({ data: answer(20, 5), error: null });
      const { api } = mountComposable();
      await flushPromises();
      net.invoke.mockClear();
      net.invoke.mockResolvedValue({ data: answer(20, 6, { effects: [{ type: "reaction_offered", offer }] }), error: null });
      const run = await api.answerReaction("pass");
      expect(sent().map((b) => b.commands)).toEqual([[{ type: "answer_reaction", answer: "pass" }]]);
      expect(run.reactionOffered).toEqual(offer);
    });

    it("fails if provoke does not send the path alone, or does not read the strikes and their rolls from the reply", async () => {
      attach();
      net.invoke.mockResolvedValue({ data: answer(20, 5), error: null });
      const { api } = mountComposable();
      await flushPromises();
      net.invoke.mockClear();
      const path = [{ x: 0, y: 0 }, { x: -1, y: 0 }];
      net.invoke.mockResolvedValue({ data: answer(20, 6, { effects: [{ type: "opportunity", attackerId: "ogre", targetId: "fresco", step: 0 }, { type: "resolved", resolved }] }), error: null });
      const run = await api.provoke("fresco", path);
      expect(sent().map((b) => b.commands)).toEqual([[{ type: "provoke", moverId: "fresco", path }]]);
      expect(run.strikes).toEqual([{ attackerId: "ogre", step: 0 }]);
      expect(run.outcomes).toHaveLength(1);
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

  describe("changes that have not reached the server", () => {
    async function offlineWith(tries: number) {
      const store = attach();
      net.invoke.mockResolvedValue({ data: answer(20, 5), error: null });
      const mounted = mountComposable();
      await flushPromises();
      net.invoke.mockClear();
      net.invoke.mockResolvedValue(offline());
      store.adjustHp("ogre", -4);
      await flushPromises();
      for (let i = 1; i < tries; i++) await vi.advanceTimersByTimeAsync(retryDelayMs(i)); // one more try each
      return { store, ...mounted };
    }

    it("fails if the store does not count the waiting batches and the failed sends in a row, or keeps the failures after a send gets through", async () => {
      const { store } = await offlineWith(2);
      expect(store.unsentBatches).toBe(1);
      expect(store.sendFailures).toBe(2);
      net.invoke.mockResolvedValue({ data: answer(16, 6), error: null });
      await vi.advanceTimersByTimeAsync(retryDelayMs(3));
      expect(store.unsentBatches).toBe(0);
      expect(store.sendFailures).toBe(0);
    });

    it("fails if a batch that keeps failing is never announced, is announced too early, or is announced again on every try", async () => {
      await offlineWith(STUCK_AFTER_FAILURES - 1);
      expect(toasts.error).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(retryDelayMs(STUCK_AFTER_FAILURES - 1));
      expect(toasts.error).toHaveBeenCalledTimes(1);
      expect(toasts.error).toHaveBeenCalledWith(expect.stringContaining("could not be saved"));
      await vi.advanceTimersByTimeAsync(40_000);
      expect(toasts.error).toHaveBeenCalledTimes(1);
      // Announced, not dropped: it is still being sent.
      expect(sent().length).toBeGreaterThan(STUCK_AFTER_FAILURES);
    });

    it("fails if leaving the page is not interrupted while changes are unsent, or still is once they are saved", async () => {
      const { store } = await offlineWith(1);
      const leave = () => {
        const event = new Event("beforeunload", { cancelable: true });
        window.dispatchEvent(event);
        return event.defaultPrevented;
      };
      expect(leave()).toBe(true);
      net.invoke.mockResolvedValue({ data: answer(16, 6), error: null });
      await vi.advanceTimersByTimeAsync(retryDelayMs(1));
      expect(store.hasQueued()).toBe(false);
      expect(leave()).toBe(false);
      net.invoke.mockResolvedValue(offline());
      store.adjustHp("ogre", -1);
      await flushPromises();
      expect(leave()).toBe(true);
    });

    it("fails if leaving the runner with changes unsent drops the page-leave prompt, or stops sending them", async () => {
      // The last attempt on unmount used to be the only one: if it failed nothing retried and nothing warned on a reload.
      const { store, wrapper } = await offlineWith(1);
      wrapper.unmount();
      const leave = () => {
        const event = new Event("beforeunload", { cancelable: true });
        window.dispatchEvent(event);
        return event.defaultPrevented;
      };
      expect(leave()).toBe(true);
      net.invoke.mockResolvedValue({ data: answer(16, 6), error: null });
      await vi.advanceTimersByTimeAsync(retryDelayMs(1));
      await flushPromises();
      expect(store.hasQueued()).toBe(false);
      expect(leave()).toBe(false);
    });

    it("fails if sending stops, or is doubled, once the runner is gone", async () => {
      // One pump: after the runner unmounts the batch is still tried once per backoff, not by a second sender too.
      const { wrapper } = await offlineWith(1);
      const before = net.invoke.mock.calls.length;
      wrapper.unmount();
      await flushPromises();
      await vi.advanceTimersByTimeAsync(retryDelayMs(1) + retryDelayMs(2));
      await flushPromises();
      // Two backoffs, two more tries, whether or not a runner is mounted.
      expect(net.invoke.mock.calls.length - before).toBe(2);
    });

    it("fails if a batch that keeps failing after the runner is gone is never told to the DM", async () => {
      const { wrapper } = await offlineWith(1);
      wrapper.unmount();
      await vi.advanceTimersByTimeAsync(40_000);
      expect(toasts.error).toHaveBeenCalledTimes(1);
      expect(toasts.error).toHaveBeenCalledWith(expect.stringContaining("could not be saved"));
    });

    it("fails if a refusal of changes made in the runner's fight, after the runner is gone, is not told to the DM", async () => {
      const { wrapper, onLost } = await offlineWith(1);
      wrapper.unmount();
      net.invoke.mockResolvedValue(refusal(404, "No such fight."));
      await vi.advanceTimersByTimeAsync(retryDelayMs(1));
      await flushPromises();
      expect(toasts.error).toHaveBeenCalledWith(expect.stringContaining("gone"));
      expect(onLost).not.toHaveBeenCalled();
    });

    it("fails if a batch is posted to the fight the route names when it is sent instead of the fight it was made in", async () => {
      const store = attach();
      net.invoke.mockResolvedValue({ data: answer(20, 5), error: null });
      const route = ref("enc-1");
      mountComposable(vi.fn(), route);
      await flushPromises();
      net.invoke.mockClear();
      net.invoke.mockResolvedValueOnce(offline()).mockResolvedValue({ data: answer(16, 6), error: null });
      store.adjustHp("ogre", -4);
      await flushPromises();
      route.value = "enc-2"; // the route moves on while the batch waits to be retried
      await vi.advanceTimersByTimeAsync(600);
      await flushPromises();
      const targets = net.invoke.mock.calls.map(([, init]) => (init.body as { encounterId: string }).encounterId);
      expect(targets).toEqual(["enc-1", "enc-1"]);
    });

    it("fails if the batches of another fight that has taken over the store go to the runner's fight instead of their own", async () => {
      attach();
      net.invoke.mockResolvedValue({ data: answer(20, 5), error: null });
      mountComposable();
      await flushPromises();
      net.invoke.mockClear();
      store2();
      await flushPromises();
      const targets = net.invoke.mock.calls.map(([, init]) => (init.body as { encounterId: string }).encounterId);
      expect(targets).toEqual(["enc-2"]);
    });
  });

  describe("a runner whose fight is no longer the store's", () => {
    /** The first call named `type` waits for the test to answer it; every batch waits forever. */
    function deferredAlone(type: string) {
      let answerIt!: (reply: unknown) => void;
      const held = new Promise((resolve) => { answerIt = resolve; });
      net.invoke.mockImplementation(async (_name: string, init: { body: { commands: Array<{ type: string }> } }) => {
        if (init.body.commands[0].type === type) return held;
        if (init.body.commands[0].type === "sync_party") return { data: answer(20, 5), error: null };
        return new Promise(() => {});
      });
      return answerIt;
    }

    it("fails if a refusal of the runner's party sync, arriving after another fight took over, drops that fight's changes or sends the runner away", async () => {
      attach();
      net.invoke.mockResolvedValue({ data: answer(20, 5), error: null });
      const { onLost } = mountComposable();
      await flushPromises();
      const answerIt = deferredAlone("sync_party");
      net.invoke.mockClear();
      rings.reconcile[0]("campaign-1"); // a sync of enc-1 goes out and waits
      await flushPromises();
      store2(); // enc-2 takes over the store with a change waiting
      await flushPromises();
      answerIt(refusal(404, "No such fight."));
      await flushPromises();
      expect(useEncounterRunStore().hasQueued()).toBe(true);
      expect(hp(useEncounterRunStore())).toBe(18);
      expect(onLost).not.toHaveBeenCalled();
    });

    it("fails if the answer to the runner's party sync is shown over another fight that took over the store", async () => {
      attach();
      net.invoke.mockResolvedValue({ data: answer(20, 5), error: null });
      mountComposable();
      await flushPromises();
      net.invoke.mockClear();
      const answerIt = deferredAlone("sync_party");
      rings.reconcile[0]("campaign-1");
      await flushPromises();
      store2();
      await flushPromises();
      answerIt({ data: answer(7, 9), error: null });
      await flushPromises();
      expect(hp(useEncounterRunStore())).toBe(18);
    });

    it("fails if the answer to a lifecycle command is shown over another fight that took over the store", async () => {
      attach();
      net.invoke.mockResolvedValue({ data: answer(20, 5), error: null });
      const { api } = mountComposable();
      await flushPromises();
      net.invoke.mockClear();
      const answerIt = deferredAlone("go_private");
      const done = api.lifecycle({ type: "go_private" });
      await flushPromises();
      store2();
      await flushPromises();
      answerIt({ data: answer(7, 9), error: null });
      await done;
      expect(hp(useEncounterRunStore())).toBe(18);
    });

    it("fails if letting go of an ended fight wipes the fight that opened since", () => {
      attach();
      const { api } = mountComposable();
      store2();
      api.releaseFight();
      expect(useEncounterRunStore().linkedEncounterId()).toBe("enc-2");
    });

    it("fails if letting go of the runner's own fight leaves it in the store", () => {
      attach();
      const { api } = mountComposable();
      api.releaseFight();
      expect(useEncounterRunStore().linkedEncounterId()).toBeNull();
    });
  });
});
