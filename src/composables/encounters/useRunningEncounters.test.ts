import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent } from "vue";
import { mount, flushPromises } from "@vue/test-utils";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});
const session = vi.hoisted(() => ({ activeCampaignId: "camp-1" as string | null }));
const selectedColumns: string[] = vi.hoisted(() => []);
const rings = vi.hoisted(() => ({
  ring: [] as ((r: { campaignId: string; table: string }) => void)[],
  reconcile: [] as ((campaignId: string) => void)[],
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    // Delegates to the fake, noting the column list: that list is the property under test below.
    from: (table: string) => {
      const query = fake.client.from(table);
      const select = query.select.bind(query);
      query.select = (columns?: string, options?: Parameters<typeof select>[1]) => {
        if (columns !== undefined) selectedColumns.push(columns);
        return select(columns, options);
      };
      return query;
    },
  },
  getCurrentUser: () => ({ id: "user-1" }),
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
vi.mock("@/stores/campaign", () => ({
  useCampaignStore: () => ({
    get activeCampaignId() {
      return session.activeCampaignId;
    },
  }),
}));
vi.mock("@/composables/campaign/useCampaignSession", () => ({ ensureCampaignSession: vi.fn() }));

const { useRunningEncounters } = await import("./useEncounterLive");

const row = (encounter_id: string, over: Record<string, unknown> = {}) => ({
  encounter_id,
  campaign_id: "camp-1",
  is_running: true,
  current_round: 2,
  active_combatant_index: 0,
  combatants_live: [],
  ...over,
});

describe("useRunningEncounters", () => {
  let wrapper: ReturnType<typeof mount> | null = null;

  beforeEach(() => {
    fake.reset();
    selectedColumns.length = 0;
    rings.ring.length = 0;
    rings.reconcile.length = 0;
    session.activeCampaignId = "camp-1";
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

  it("lists this campaign's running encounters only, not ended ones or another campaign's", async () => {
    fake.seed("encounter_state", [
      row("enc-1"),
      row("enc-2", { is_running: false }),
      row("enc-3", { campaign_id: "camp-2" }),
    ]);
    const api = mountIt();
    await flushPromises();
    expect(api.runningStates.value.map((s) => s.encounter_id)).toEqual(["enc-1"]);
    expect(api.isEncounterRunning("enc-1")).toBe(true);
    expect(api.isEncounterRunning("enc-2")).toBe(false);
    expect(api.runningLoaded.value).toBe(true);
  });

  it("reads only the columns the running-list surfaces use, never the fog mask", async () => {
    mountIt();
    await flushPromises();
    const columns = selectedColumns[0]!;
    expect(columns).toContain("combatants_live");
    expect(columns).not.toContain("fog_mask");
    expect(columns).not.toContain("*");
  });

  it("re-reads when this campaign's encounter_state rings, and ignores another campaign's ring", async () => {
    const api = mountIt();
    await flushPromises();
    expect(api.anyRunning.value).toBe(false);

    fake.seed("encounter_state", [row("enc-1")]);
    rings.ring.forEach((fire) => fire({ campaignId: "camp-2", table: "encounter_state" }));
    await flushPromises();
    expect(api.anyRunning.value).toBe(false);

    rings.ring.forEach((fire) => fire({ campaignId: "camp-1", table: "encounter_state" }));
    await flushPromises();
    expect(api.firstRunning.value?.encounter_id).toBe("enc-1");
  });

  it("answers a burst of rings with one read in flight and exactly one more behind it", async () => {
    mountIt();
    await flushPromises();
    const before = selectedColumns.length;
    for (let i = 0; i < 3; i++) rings.ring.forEach((fire) => fire({ campaignId: "camp-1", table: "encounter_state" }));
    await flushPromises();
    expect(selectedColumns.length - before).toBe(2);
  });

  it("keeps the previous list when a re-read fails, and reports the error", async () => {
    fake.seed("encounter_state", [row("enc-1")]);
    const api = mountIt();
    await flushPromises();
    expect(api.anyRunning.value).toBe(true);

    vi.useFakeTimers();
    fake.failNext("encounter_state", { message: "network" });
    rings.ring.forEach((fire) => fire({ campaignId: "camp-1", table: "encounter_state" }));
    await flushPromises();
    expect(api.anyRunning.value).toBe(true);
    expect(api.firstRunning.value?.encounter_id).toBe("enc-1");
    expect(() => vi.runAllTimers()).toThrow();
  });
});
