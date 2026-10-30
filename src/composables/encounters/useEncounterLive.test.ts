import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { defineComponent, nextTick, ref } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import type { EncounterState, RunCombatant } from "@/types/encounter.types";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});
const session = vi.hoisted(() => ({ activeCampaignId: "campaign-1" as string | null, started: false }));
const rings = vi.hoisted(() => ({
  ring: [] as ((r: { campaignId: string; table: string }) => void)[],
  reconcile: [] as ((campaignId: string) => void)[],
}));

vi.mock("@/lib/supabase", () => ({
  supabase: fake.client,
  getCurrentUser: () => ({ id: "user-1" }),
}));
vi.mock("@/stores/campaign", () => ({
  useCampaignStore: () => ({
    get activeCampaignId() {
      return session.activeCampaignId;
    },
  }),
}));
vi.mock("@/composables/campaign/useCampaignSession", () => ({
  ensureCampaignSession: vi.fn(async () => ({ id: "session-1", started: session.started })),
}));
vi.mock("@/lib/campaignLiveSync/rings", () => ({
  onCampaignRing: (_tables: string[], listener: (r: { campaignId: string; table: string }) => void) => {
    rings.ring.push(listener);
    return () => {
      rings.ring.splice(rings.ring.indexOf(listener), 1);
    };
  },
  onCampaignReconcile: (listener: (campaignId: string) => void) => {
    rings.reconcile.push(listener);
    return () => {
      rings.reconcile.splice(rings.reconcile.indexOf(listener), 1);
    };
  },
}));

import { liveRevision, liveState, updateCombatantPosition, useEncounterLive, usePlayerEncounterLive } from "./useEncounterLive";

const tokenAt = (instance_id: string, position: { x: number; y: number } | null) =>
  ({ instance_id, position }) as Partial<RunCombatant> as RunCombatant;

const stateRow = (encounter_id: string, over: Record<string, unknown> = {}) => ({
  id: `state-${encounter_id}`,
  encounter_id,
  campaign_id: "campaign-1",
  is_running: true,
  current_round: 1,
  active_combatant_index: 0,
  combatants_live: [],
  events_fired: [],
  fog_mask: null,
  magical_darkness: [],
  door_states: [],
  ...over,
});

beforeEach(() => {
  fake.reset();
  session.activeCampaignId = "campaign-1";
  session.started = false;
  rings.ring.length = 0;
  rings.reconcile.length = 0;
  liveState.value = null;
});

describe("useEncounterLive loading", () => {
  const calls = () => fake.calls.filter((c) => c.target === "encounter_state");

  // #833: an unsaved encounter has no id, and the call site used to paper over
  // that with `?? ""`, which reached PostgREST as an empty UUID and returned
  // 400 on every New Encounter.
  it("asks for nothing while the encounter has no id, yet marks loading finished so the view is not stuck", async () => {
    const { liveStateLoaded } = useEncounterLive(() => null);
    await nextTick();
    expect(calls()).toEqual([]);
    expect(liveStateLoaded.value).toBe(true);
  });

  it("loads the encounter's own row once a real id arrives, and not another encounter's", async () => {
    fake.seed("encounter_state", [stateRow("encounter-2", { current_round: 9 }), stateRow("encounter-1", { current_round: 3 })]);
    const id = ref<string | null>(null);
    useEncounterLive(() => id.value);
    await nextTick();
    expect(calls()).toEqual([]);

    id.value = "encounter-1";
    await flushPromises();
    expect(liveState.value).toMatchObject({ encounter_id: "encounter-1", current_round: 3 });
  });

  // The half #833 did not report: a reused component kept the previous encounter's state.
  it("reloads when the id changes rather than keeping the previous encounter's state", async () => {
    fake.seed("encounter_state", [stateRow("encounter-1"), stateRow("encounter-2")]);
    const id = ref<string | null>("encounter-1");
    useEncounterLive(() => id.value);
    await flushPromises();
    expect(liveState.value?.encounter_id).toBe("encounter-1");

    id.value = "encounter-2";
    await flushPromises();
    expect(liveState.value?.encounter_id).toBe("encounter-2");
  });

  it("clears state when the id goes away, rather than showing a stale one as running", async () => {
    fake.seed("encounter_state", [stateRow("encounter-1")]);
    const id = ref<string | null>("encounter-1");
    const { isLive } = useEncounterLive(() => id.value);
    await flushPromises();
    expect(isLive.value).toBe(true);

    id.value = null;
    await flushPromises();
    expect(liveState.value).toBeNull();
    expect(isLive.value).toBe(false);
  });

  it("is not live when the row on screen belongs to another encounter or has ended", async () => {
    fake.seed("encounter_state", [stateRow("encounter-1", { is_running: false })]);
    const ended = useEncounterLive(() => "encounter-1");
    await flushPromises();
    expect(ended.isLive.value).toBe(false);

    liveState.value = stateRow("encounter-2") as unknown as EncounterState;
    expect(ended.isLive.value).toBe(false);
  });
});

describe("goLive", () => {
  const rowOf = (id: string) => fake.rows("encounter_state").find((r) => r.encounter_id === id);

  // A second go-live of the same encounter upserts onto the same row, so a mask,
  // darkness or door left from the previous fight would survive into the new one.
  it("starts a repeat fight clean: no fog mask, no magical darkness, every door as drawn", async () => {
    fake.seed("encounter_state", [
      stateRow("encounter-1", {
        is_running: false,
        fog_mask: "1,1;1,2",
        magical_darkness: [{ id: "z1", x: 1, y: 1, radius: 15 }],
        door_states: [{ edge: "3,2:N", open: true }],
        events_fired: ["old"],
      }),
    ]);
    const { goLive } = useEncounterLive(() => "encounter-1");
    await flushPromises();

    await goLive({ round: 1, activeIndex: 0, combatants: [] });

    expect(rowOf("encounter-1")).toMatchObject({
      is_running: true,
      fog_mask: null,
      magical_darkness: [],
      door_states: [],
      events_fired: [],
    });
    expect(fake.rows("encounter_state")).toHaveLength(1);
  });

  it("files the fight under the session log row, the caller and the campaign, and reports whether it started the session", async () => {
    session.started = true;
    const { goLive } = useEncounterLive(() => "encounter-1");
    await flushPromises();

    const result = await goLive({ round: 2, activeIndex: 1, combatants: [tokenAt("a", null)] });

    expect(result).toEqual({ startedSession: true });
    expect(rowOf("encounter-1")).toMatchObject({
      session_id: "session-1",
      user_id: "user-1",
      campaign_id: "campaign-1",
      current_round: 2,
      active_combatant_index: 1,
    });
    expect(liveState.value?.encounter_id).toBe("encounter-1");
  });

  it("keeps one live encounter per campaign: stops the others there, leaves another campaign's fight running", async () => {
    fake.seed("encounter_state", [
      stateRow("encounter-0"),
      stateRow("elsewhere", { campaign_id: "campaign-2" }),
    ]);
    const { goLive } = useEncounterLive(() => "encounter-1");
    await flushPromises();

    await goLive({ round: 1, activeIndex: 0, combatants: [] });

    expect(rowOf("encounter-0")?.is_running).toBe(false);
    expect(rowOf("elsewhere")?.is_running).toBe(true);
    expect(rowOf("encounter-1")?.is_running).toBe(true);
  });

  it("does nothing without an active campaign", async () => {
    session.activeCampaignId = null;
    const { goLive } = useEncounterLive(() => "encounter-1");
    await flushPromises();

    expect(await goLive({ round: 1, activeIndex: 0, combatants: [] })).toEqual({ startedSession: false });
    expect(fake.rows("encounter_state")).toEqual([]);
  });

  it("throws the upsert's error and leaves the other fight running", async () => {
    fake.seed("encounter_state", [stateRow("encounter-0")]);
    const { goLive } = useEncounterLive(() => "encounter-1");
    await flushPromises();
    fake.failNext("encounter_state", { message: "denied" });

    await expect(goLive({ round: 1, activeIndex: 0, combatants: [] })).rejects.toMatchObject({ message: "denied" });
    expect(rowOf("encounter-0")?.is_running).toBe(true);
  });
});

describe("pushing state", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  async function live(over: Record<string, unknown> = {}) {
    fake.seed("encounter_state", [stateRow("encounter-1", over)]);
    const api = useEncounterLive(() => "encounter-1");
    await vi.advanceTimersByTimeAsync(0);
    return api;
  }
  const base = { round: 4, activeIndex: 2, combatants: [] as RunCombatant[], eventsFired: ["e1"] };
  const updates = () => fake.calls.filter((c) => c.target === "encounter_state" && c.op === "update");

  it("collapses a burst of pushes into one write of the last state", async () => {
    const { schedulePush } = await live();
    schedulePush({ ...base, round: 2 });
    schedulePush({ ...base, round: 3 });
    schedulePush(base);
    await vi.advanceTimersByTimeAsync(400);
    expect(updates()).toHaveLength(1);
    expect(fake.rows("encounter_state")[0]).toMatchObject({ current_round: 4, active_combatant_index: 2, events_fired: ["e1"] });
    expect(liveState.value).toMatchObject({ current_round: 4 });
  });

  it("lets a position written by a map window win over the runner's stale one", async () => {
    const { schedulePush } = await live({
      combatants_live: [tokenAt("moved", { x: 5, y: 5 }), tokenAt("unplaced", null)],
    });
    schedulePush({ ...base, combatants: [tokenAt("moved", { x: 0, y: 0 }), tokenAt("unplaced", { x: 1, y: 1 })] });
    await vi.advanceTimersByTimeAsync(400);
    const stored = fake.rows("encounter_state")[0]!.combatants_live as RunCombatant[];
    expect(stored.map((c) => [c.instance_id, c.position])).toEqual([
      ["moved", { x: 5, y: 5 }],
      ["unplaced", { x: 1, y: 1 }],
    ]);
  });

  // #1120: a second map window writes the map's own state. Riding the roster
  // push, it wrote its stale copy of the roster over the runner's last change.
  it.each([
    ["fogMask", "fog_mask", "1,1"],
    ["magicalDarkness", "magical_darkness", [{ id: "z1", x: 2.5, y: 3, radius: 15 }]],
    ["doorStates", "door_states", [{ edge: "3,2:N", open: true }]],
  ])("writes %s on its own, leaving the roster as the runner left it", async (key, column, value) => {
    const { scheduleMapPush } = await live({ current_round: 5, combatants_live: [tokenAt("g1", null)] });
    scheduleMapPush({ [key]: value });
    await vi.advanceTimersByTimeAsync(400);
    expect(fake.rows("encounter_state")[0]).toMatchObject({ [column]: value, current_round: 5, combatants_live: [tokenAt("g1", null)] });
    expect(liveState.value?.[column as "fog_mask"]).toEqual(value);
  });

  it("keeps every part of the map's state changed within one burst, not just the last", async () => {
    const { scheduleMapPush } = await live();
    scheduleMapPush({ fogMask: "1,1" });
    scheduleMapPush({ doorStates: [{ edge: "3,2:N", open: true }] });
    await vi.advanceTimersByTimeAsync(400);
    expect(updates()).toHaveLength(1);
    expect(fake.rows("encounter_state")[0]).toMatchObject({ fog_mask: "1,1", door_states: [{ edge: "3,2:N", open: true }] });
  });

  // Leaving the runner for the battle map unmounts it, and dropping its pending
  // push kept the last HP change from the players.
  it("sends a pending push when the runner unmounts, rather than dropping it", async () => {
    fake.seed("encounter_state", [stateRow("encounter-1")]);
    let api!: ReturnType<typeof useEncounterLive>;
    const wrapper = mount(defineComponent({ setup() { api = useEncounterLive(() => "encounter-1"); return () => null; } }));
    await vi.advanceTimersByTimeAsync(0);
    api.schedulePush({ ...base, round: 7 });
    wrapper.unmount();
    await vi.advanceTimersByTimeAsync(0);
    expect(fake.rows("encounter_state")[0]!.current_round).toBe(7);
  });

  it("writes nothing when no encounter is live", async () => {
    const { schedulePush } = useEncounterLive(() => "encounter-1");
    await vi.advanceTimersByTimeAsync(0);
    schedulePush(base);
    await vi.advanceTimersByTimeAsync(400);
    expect(updates()).toEqual([]);
  });
});

describe("endLive", () => {
  it("stops only this encounter and clears the live state", async () => {
    fake.seed("encounter_state", [stateRow("encounter-1"), stateRow("encounter-2")]);
    const { endLive } = useEncounterLive(() => "encounter-1");
    await flushPromises();
    await endLive();
    expect(fake.rows("encounter_state").map((r) => [r.encounter_id, r.is_running])).toEqual([
      ["encounter-1", false],
      ["encounter-2", true],
    ]);
    expect(liveState.value).toBeNull();
  });

  it("keeps the fight on screen when stopping it fails", async () => {
    fake.seed("encounter_state", [stateRow("encounter-1")]);
    const { endLive } = useEncounterLive(() => "encounter-1");
    await flushPromises();
    fake.failNext("encounter_state", { message: "denied" });
    await expect(endLive()).rejects.toMatchObject({ message: "denied" });
    expect(liveState.value?.encounter_id).toBe("encounter-1");
  });
});

describe("usePlayerEncounterLive", () => {
  const playerView = (encounter_id: string) => stateRow(encounter_id);

  function mountPlayer(campaignId: () => string | null) {
    let api!: ReturnType<typeof usePlayerEncounterLive>;
    const wrapper = mount(defineComponent({ setup() { api = usePlayerEncounterLive(campaignId); return () => null; } }));
    return { api, wrapper };
  }

  it("reads the player-safe projection of the campaign and re-reads on that campaign's ring, not another's", async () => {
    let served = [playerView("e1")];
    fake.onRpc("get_player_encounter_state", () => served);
    const { api, wrapper } = mountPlayer(() => "campaign-1");
    await flushPromises();
    expect(api.liveState.value?.encounter_id).toBe("e1");
    expect(api.liveStateLoaded.value).toBe(true);

    served = [playerView("e2")];
    rings.ring.forEach((fire) => fire({ campaignId: "campaign-9", table: "encounter_state" }));
    await flushPromises();
    expect(api.liveState.value?.encounter_id).toBe("e1");

    rings.ring.forEach((fire) => fire({ campaignId: "campaign-1", table: "encounter_state" }));
    await flushPromises();
    expect(api.liveState.value?.encounter_id).toBe("e2");

    served = [];
    rings.reconcile.forEach((fire) => fire("campaign-1"));
    await flushPromises();
    expect(api.liveState.value).toBeNull();
    wrapper.unmount();
  });

  it("keeps the fight on screen when a re-read fails", async () => {
    vi.useFakeTimers();
    try {
      fake.onRpc("get_player_encounter_state", () => [playerView("e1")]);
      const { api, wrapper } = mountPlayer(() => "campaign-1");
      await vi.advanceTimersByTimeAsync(0);
      expect(api.liveState.value?.encounter_id).toBe("e1");

      fake.failNext("get_player_encounter_state", { message: "network" });
      rings.ring.forEach((fire) => fire({ campaignId: "campaign-1", table: "encounter_state" }));
      // The failure is reported from a timer so Sentry sees it.
      await expect(vi.advanceTimersByTimeAsync(0)).rejects.toMatchObject({ message: "network" });
      expect(api.liveState.value?.encounter_id).toBe("e1");
      wrapper.unmount();
    } finally {
      vi.useRealTimers();
    }
  });

  it("never lets a slow answer for the campaign just left replace the one now active", async () => {
    let releaseFirst: (rows: unknown[]) => void = () => {};
    fake.onRpc("get_player_encounter_state", (args) =>
      args.p_campaign_id === "campaign-1"
        ? new Promise((resolve) => { releaseFirst = resolve; })
        : [playerView("second")],
    );
    const id = ref<string | null>("campaign-1");
    const { api, wrapper } = mountPlayer(() => id.value);
    await nextTick();
    id.value = "campaign-2";
    await flushPromises();
    expect(api.liveState.value?.encounter_id).toBe("second");

    releaseFirst([playerView("first")]);
    await flushPromises();
    expect(api.liveState.value?.encounter_id).toBe("second");
    wrapper.unmount();
  });

  it("clears the fight and stops listening when the campaign goes away", async () => {
    fake.onRpc("get_player_encounter_state", () => [playerView("e1")]);
    const id = ref<string | null>("campaign-1");
    const { api, wrapper } = mountPlayer(() => id.value);
    await flushPromises();
    expect(rings.ring).toHaveLength(1);

    id.value = null;
    await flushPromises();
    expect(api.liveState.value).toBeNull();
    expect(rings.ring).toHaveLength(0);
    wrapper.unmount();
  });
});

describe("following the live row", () => {
  // Followers are shared across the module, so a test that failed before
  // unmounting would leave the next one listening through its listener.
  const mounted: { unmount(): void }[] = [];
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    mounted.splice(0).forEach((w) => w.unmount());
    vi.useRealTimers();
  });

  const ringRow = () => rings.ring.forEach((fire) => fire({ campaignId: "campaign-1", table: "encounter_state" }));
  const setRow = async (over: Record<string, unknown>) => {
    await fake.client.from("encounter_state").update(over).eq("encounter_id", "encounter-1");
  };

  async function mountLive(follow: boolean, over: Record<string, unknown> = {}) {
    fake.seed("encounter_state", [stateRow("encounter-1", over)]);
    let api!: ReturnType<typeof useEncounterLive>;
    const wrapper = mount(defineComponent({ setup() { api = useEncounterLive(() => "encounter-1", { follow }); return () => null; } }));
    mounted.push(wrapper);
    await vi.advanceTimersByTimeAsync(0);
    return { api, wrapper };
  }

  // #1120: the map in a second window loaded the row once and froze there.
  it("re-reads the row when the campaign rings, so a window that follows the fight sees the runner's changes", async () => {
    await mountLive(true);
    const before = liveRevision.value;
    await setRow({ current_round: 4 });
    ringRow();
    await vi.advanceTimersByTimeAsync(0);
    expect(liveState.value?.current_round).toBe(4);
    expect(liveRevision.value).toBe(before + 1);
  });

  it("does not listen for a page that only needs to stop a fight", async () => {
    await mountLive(false);
    expect(rings.ring).toHaveLength(0);
  });

  it("stops listening once the last follower leaves", async () => {
    const first = await mountLive(true);
    const second = mount(defineComponent({ setup() { useEncounterLive(() => "encounter-1", { follow: true }); return () => null; } }));
    expect(rings.ring).toHaveLength(1);
    first.wrapper.unmount();
    mounted.length = 0;
    expect(rings.ring).toHaveLength(1);
    second.unmount();
    expect(rings.ring).toHaveLength(0);
  });

  // A ring from someone else landing while a brush stroke waits to be written
  // handed back the row without the stroke, and the fog flashed back.
  it("holds a read back while this tab has a write pending, then reads once it is written", async () => {
    const { api } = await mountLive(true);
    api.scheduleMapPush({ fogMask: "2,2" });
    await setRow({ current_round: 6 });
    ringRow();
    await vi.advanceTimersByTimeAsync(0);
    expect(liveState.value?.current_round).toBe(1);

    await vi.advanceTimersByTimeAsync(400);
    expect(liveState.value).toMatchObject({ current_round: 6, fog_mask: "2,2" });
  });

  it("does not even ask for the row while a write is pending", async () => {
    const { api } = await mountLive(true);
    const reads = () => fake.calls.filter((c) => c.target === "encounter_state" && c.op === "select").length;
    const before = reads();
    api.scheduleMapPush({ fogMask: "2,2" });
    ringRow();
    await vi.advanceTimersByTimeAsync(0);
    expect(reads()).toBe(before);
  });

  it("drops a read that a write overtook in flight, and reads again after it", async () => {
    const { api } = await mountLive(true);
    await setRow({ current_round: 6 });
    ringRow();
    api.scheduleMapPush({ fogMask: "2,2" });
    await vi.advanceTimersByTimeAsync(0);
    expect(liveState.value?.current_round).toBe(1);
    await vi.advanceTimersByTimeAsync(400);
    expect(liveState.value).toMatchObject({ current_round: 6, fog_mask: "2,2" });
  });

  // A door opened a minute after a brush stroke re-sent the stroke's mask, over
  // whatever the other window had brushed since.
  it("sends each part of the map's state once, not again with the next change", async () => {
    const { api } = await mountLive(true);
    api.scheduleMapPush({ fogMask: "1,1" });
    await vi.advanceTimersByTimeAsync(400);
    await setRow({ fog_mask: "9,9" });
    api.scheduleMapPush({ doorStates: [] });
    await vi.advanceTimersByTimeAsync(400);
    expect(fake.rows("encounter_state")[0]!.fog_mask).toBe("9,9");
  });

  it("shows a token where the DM put it at once, and writes it through the position function", async () => {
    const moves: unknown[] = [];
    fake.onRpc("update_combatant_position", (args) => { moves.push(args); return null; });
    const { api } = await mountLive(true, { combatants_live: [tokenAt("g1", { x: 0, y: 0 })] });
    const moving = api.moveToken("g1", { x: 4, y: 2 });
    expect(liveState.value?.combatants_live[0]?.position).toEqual({ x: 4, y: 2 });
    await moving;
    expect(moves).toEqual([{ p_encounter_state_id: "state-encounter-1", p_instance_id: "g1", p_position: { x: 4, y: 2 } }]);
  });

  it("puts a refused move back where the row has it, and says so", async () => {
    const { api } = await mountLive(true, { combatants_live: [tokenAt("g1", { x: 0, y: 0 })] });
    fake.failNext("update_combatant_position", { code: "P0001", message: "not a member of this campaign" });
    await expect(api.moveToken("g1", { x: 4, y: 2 })).rejects.toMatchObject({ code: "P0001" });
    await vi.advanceTimersByTimeAsync(0);
    expect(liveState.value?.combatants_live[0]?.position).toEqual({ x: 0, y: 0 });
  });
});

describe("updateCombatantPosition", () => {
  it("raises the server's refusal to move a token the caller does not own", async () => {
    fake.failNext("update_combatant_position", { code: "42501", message: "not your token" });
    await expect(updateCombatantPosition("s1", "inst-1", { x: 1, y: 1 })).rejects.toMatchObject({ code: "42501" });
  });
});
