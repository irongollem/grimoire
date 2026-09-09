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
});
