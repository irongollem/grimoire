import { describe, expect, it, vi, beforeEach } from "vitest";
import { ref, nextTick } from "vue";

const maybeSingle = vi.fn();
const eq = vi.fn(() => ({ maybeSingle }));
const select = vi.fn(() => ({ eq }));
const from = vi.fn(() => ({ select }));

vi.mock("@/lib/supabase", () => ({ supabase: { from, channel: () => ({ on: () => ({ subscribe: () => ({}) }) }), removeChannel: vi.fn() } }));
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => ({ activeCampaignId: "campaign-1" }) }));

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
