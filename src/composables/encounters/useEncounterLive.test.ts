import { describe, expect, it, vi, beforeEach } from "vitest";
import { ref, nextTick } from "vue";

const maybeSingle = vi.fn();
const eq = vi.fn(() => ({ maybeSingle }));
const select = vi.fn(() => ({ eq }));

const single = vi.fn();
const upsertSelect = vi.fn(() => ({ single }));
const upsert = vi.fn(() => ({ select: upsertSelect }));

const neq = vi.fn(() => Promise.resolve({ error: null }));
const updateEq2 = vi.fn(() => ({ neq }));
const updateEq1 = vi.fn(() => ({ eq: updateEq2 }));
const update = vi.fn(() => ({ eq: updateEq1 }));

const from = vi.fn(() => ({ select, upsert, update }));

vi.mock("@/lib/supabase", () => ({
  supabase: { from, channel: () => ({ on: () => ({ subscribe: () => ({}) }) }), removeChannel: vi.fn() },
  getCurrentUser: () => ({ id: "user-1" }),
}));
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => ({ activeCampaignId: "campaign-1" }) }));
vi.mock("@/composables/campaign/useCampaignSession", () => ({
  ensureCampaignSession: vi.fn(async () => ({ id: "session-1", started: false })),
}));

describe("useEncounterLive", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    maybeSingle.mockResolvedValue({ data: null });
  });

  // #833: an unsaved encounter has no id, and the call site used to paper over
  // that with `?? ""` — which reached PostgREST as an empty UUID and returned
  // 400 on every New Encounter.
  it("asks for nothing while the encounter has no id", async () => {
    const { useEncounterLive } = await import("./useEncounterLive");
    useEncounterLive(() => null);
    await nextTick();
    expect(from).not.toHaveBeenCalled();
  });

  it("marks loading finished anyway, so the view is not stuck on a spinner", async () => {
    const { useEncounterLive } = await import("./useEncounterLive");
    const { liveStateLoaded } = useEncounterLive(() => null);
    await nextTick();
    expect(liveStateLoaded.value).toBe(true);
  });

  it("loads once a real id arrives", async () => {
    const { useEncounterLive } = await import("./useEncounterLive");
    const id = ref<string | null>(null);
    useEncounterLive(() => id.value);
    await nextTick();
    expect(from).not.toHaveBeenCalled();

    id.value = "encounter-1";
    await nextTick();
    expect(from).toHaveBeenCalledWith("encounter_state");
    expect(eq).toHaveBeenCalledWith("encounter_id", "encounter-1");
  });

  // The half #833 did not report: the call site passed a plain string evaluated
  // once, so the watcher this composable is built around could never fire and a
  // reused component kept the previous encounter's state.
  it("reloads when the id changes rather than keeping the previous encounter's state", async () => {
    const { useEncounterLive } = await import("./useEncounterLive");
    const id = ref<string | null>("encounter-1");
    useEncounterLive(() => id.value);
    await nextTick();

    id.value = "encounter-2";
    await nextTick();
    expect(eq).toHaveBeenLastCalledWith("encounter_id", "encounter-2");
  });

  it("clears state when the id goes away, rather than showing a stale one as running", async () => {
    const { useEncounterLive } = await import("./useEncounterLive");
    const id = ref<string | null>("encounter-1");
    maybeSingle.mockResolvedValue({ data: { encounter_id: "encounter-1", is_running: true } });
    const { liveState, isLive } = useEncounterLive(() => id.value);
    await nextTick();
    await nextTick();
    expect(isLive.value).toBe(true);

    id.value = null;
    await nextTick();
    expect(liveState.value).toBeNull();
    expect(isLive.value).toBe(false);
  });
});

describe("goLive", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    maybeSingle.mockResolvedValue({ data: null });
    single.mockResolvedValue({
      data: { encounter_id: "encounter-1", is_running: true, fog_mask: null },
      error: null,
    });
  });

  // A second go-live of the same encounter upserts onto the same row, so a
  // `fog_mask` left over from the previous fight would otherwise survive
  // into the new one — and the battle-map view would never re-seed it, since
  // `shouldSeedFog` (fogMask.ts) only fires on `null`. Nulling it here is
  // what makes "never seeded this fight" true again on every fresh go-live.
  it("nulls fog_mask on every go-live so a stale mask from a prior fight can't survive", async () => {
    const { useEncounterLive } = await import("./useEncounterLive");
    const { goLive } = useEncounterLive(() => "encounter-1");
    await nextTick();

    await goLive({ round: 1, activeIndex: 0, combatants: [] });

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ fog_mask: null }),
      { onConflict: "encounter_id" },
    );
  });

  it("starts a fight with no magical darkness", async () => {
    const { useEncounterLive } = await import("./useEncounterLive");
    const { goLive } = useEncounterLive(() => "encounter-1");
    await nextTick();

    await goLive({ round: 1, activeIndex: 0, combatants: [] });

    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ magical_darkness: [] }), { onConflict: "encounter_id" });
  });

  it("writes magical_darkness on a push only when the caller passes it", async () => {
    vi.useFakeTimers();
    try {
      const { useEncounterLive } = await import("./useEncounterLive");
      const { goLive, schedulePush } = useEncounterLive(() => "encounter-1");
      await vi.advanceTimersByTimeAsync(0);
      await goLive({ round: 1, activeIndex: 0, combatants: [] });
      const base = { round: 1, activeIndex: 0, combatants: [], eventsFired: [] };
      const zones = [{ id: "z1", x: 2.5, y: 3, radius: 15 }];

      update.mockClear();
      schedulePush({ ...base, magicalDarkness: zones });
      await vi.advanceTimersByTimeAsync(400);
      expect(update).toHaveBeenLastCalledWith(expect.objectContaining({ magical_darkness: zones }));

      update.mockClear();
      schedulePush(base);
      await vi.advanceTimersByTimeAsync(400);
      expect((update.mock.calls as unknown[][])[0]?.[0]).not.toHaveProperty("magical_darkness");
    } finally {
      vi.useRealTimers();
    }
  });

  it("starts a fight with every door as drawn", async () => {
    const { useEncounterLive } = await import("./useEncounterLive");
    const { goLive } = useEncounterLive(() => "encounter-1");
    await nextTick();

    await goLive({ round: 1, activeIndex: 0, combatants: [] });

    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ door_states: [] }), { onConflict: "encounter_id" });
  });

  it("writes door_states on a push only when the caller passes it", async () => {
    vi.useFakeTimers();
    try {
      const { useEncounterLive } = await import("./useEncounterLive");
      const { goLive, schedulePush } = useEncounterLive(() => "encounter-1");
      await vi.advanceTimersByTimeAsync(0);
      await goLive({ round: 1, activeIndex: 0, combatants: [] });
      const base = { round: 1, activeIndex: 0, combatants: [], eventsFired: [] };
      const doors = [{ edge: "3,2:N", open: true }];

      update.mockClear();
      schedulePush({ ...base, doorStates: doors });
      await vi.advanceTimersByTimeAsync(400);
      expect(update).toHaveBeenLastCalledWith(expect.objectContaining({ door_states: doors }));

      update.mockClear();
      schedulePush(base);
      await vi.advanceTimersByTimeAsync(400);
      expect((update.mock.calls as unknown[][])[0]?.[0]).not.toHaveProperty("door_states");
    } finally {
      vi.useRealTimers();
    }
  });

  // The fight is filed under the session log's row, whether goLive found one
  // open or started an unnumbered one itself.
  it("files the fight under the session log row", async () => {
    const { useEncounterLive } = await import("./useEncounterLive");
    const { goLive } = useEncounterLive(() => "encounter-1");
    await nextTick();

    await goLive({ round: 1, activeIndex: 0, combatants: [] });

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ session_id: "session-1" }),
      { onConflict: "encounter_id" },
    );
  });
});
