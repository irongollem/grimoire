import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent } from "vue";
import { mount, flushPromises } from "@vue/test-utils";

const result = vi.fn();
const select = vi.fn((_columns: string) => ({
  eq: () => ({ eq: () => result() }),
}));
let ringListener: (() => void) | null = null;

vi.mock("@/lib/supabase", () => ({
  supabase: { from: () => ({ select }) },
  getCurrentUser: () => ({ id: "user-1" }),
}));
vi.mock("@/lib/campaignLiveSync/rings", () => ({
  onCampaignRing: (_tables: string[], listener: (ring: { campaignId: string; table: string }) => void) => {
    ringListener = () => listener({ campaignId: "camp-1", table: "encounter_state" });
    return () => {};
  },
  onCampaignReconcile: () => () => {},
}));
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => ({ activeCampaignId: "camp-1" }) }));
vi.mock("@/composables/campaign/useCampaignSession", () => ({ ensureCampaignSession: vi.fn() }));

const { useRunningEncounters } = await import("./useEncounterLive");

const running = { encounter_id: "enc-1", is_running: true, current_round: 2, active_combatant_index: 0, combatants_live: [] };

describe("useRunningEncounters", () => {
  let wrapper: ReturnType<typeof mount> | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    result.mockReset();
  });
  // The composable is a module-level singleton, kept alive by its mounted users.
  afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    vi.useRealTimers();
  });

  function mountIt() {
    let api!: ReturnType<typeof useRunningEncounters>;
    wrapper = mount(defineComponent({ setup() { api = useRunningEncounters(); return () => null; } }));
    return api;
  }

  it("reads only the columns the running-list surfaces use, never the fog mask", async () => {
    result.mockResolvedValue({ data: [running], error: null });
    mountIt();
    await flushPromises();
    const columns = select.mock.calls[0]![0];
    expect(columns).toContain("combatants_live");
    expect(columns).not.toContain("fog_mask");
    expect(columns).not.toContain("*");
  });

  it("keeps the previous list when a re-read fails, and reports the error", async () => {
    result.mockResolvedValueOnce({ data: [running], error: null });
    const api = mountIt();
    await flushPromises();
    expect(api.anyRunning.value).toBe(true);

    vi.useFakeTimers();
    const failure = new Error("network");
    result.mockResolvedValueOnce({ data: null, error: failure });
    ringListener!();
    await flushPromises();
    expect(api.anyRunning.value).toBe(true);
    expect(api.firstRunning.value?.encounter_id).toBe("enc-1");
    expect(() => vi.runAllTimers()).toThrow(failure);
  });
});
