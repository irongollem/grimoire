import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, defineComponent, h, type App } from "vue";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});

vi.mock("@/lib/supabase", () => ({ supabase: fake.client, getCurrentUser: () => ({ id: "user-1" }) }));
const store = await vi.hoisted(async () => {
  const { ref } = await import("vue");
  return { rowLoaded: ref(true) };
});
vi.mock("@/stores/campaign", () => ({
  useCampaignStore: () => ({
    activeCampaignId: "campaign-1",
    // Reactive so the row can land after mount, as on a cold load.
    get activeCampaign() { return store.rowLoaded.value ? { id: "campaign-1", user_id: "user-1" } : null; },
  }),
}));

import { useCampaignCounts } from "./useCampaignCounts";

let apps: App[] = [];
function mount<T>(client: QueryClient, setup: () => T): T {
  let out!: T;
  const app = createApp(defineComponent({ setup() { out = setup(); return () => h("div"); } }));
  app.use(VueQueryPlugin, { queryClient: client });
  app.mount(document.createElement("div"));
  apps.push(app);
  return out;
}

const rows = (n: number, campaign_id: string, prefix: string) => Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i}`, campaign_id }));

describe("useCampaignCounts (#999)", () => {
  beforeEach(() => {
    fake.reset();
    fake.seed("npcs", [...rows(12, "campaign-1", "n"), ...rows(5, "campaign-2", "other-n")]);
    fake.seed("encounters", [...rows(3, "campaign-1", "e"), ...rows(4, "campaign-2", "other-e")]);
    fake.seed("locations", rows(7, "campaign-1", "l"));
    store.rowLoaded.value = true;
  });
  afterEach(() => {
    apps.forEach((a) => a.unmount());
    apps = [];
  });

  it("counts this campaign's NPCs and encounters only", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const counts = mount(client, () => useCampaignCounts());
    await vi.waitFor(() => expect(counts.locations.data.value).toBe(7));
    expect(counts.npcs.data.value).toBe(12);
    expect(counts.encounters.data.value).toBe(3);
  });

  // Bug: the places count went out with owner null before the campaign row landed, then again with the owner: the dashboard sent the same HEAD twice on every cold load.
  it("counts places once, only after the campaign row is known", async () => {
    store.rowLoaded.value = false;
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const counts = mount(client, () => useCampaignCounts());
    await vi.waitFor(() => expect(counts.npcs.data.value).toBe(12));
    expect(fake.calls.filter((c) => c.target === "locations")).toEqual([]);
    store.rowLoaded.value = true;
    await vi.waitFor(() => expect(counts.locations.data.value).toBe(7));
    expect(fake.calls.filter((c) => c.target === "locations")).toHaveLength(1);
  });

  it("fails loudly rather than printing zero when the read fails", async () => {
    fake.failNext("npcs", { message: "boom" });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const counts = mount(client, () => useCampaignCounts());
    await vi.waitFor(() => expect(counts.npcs.isError.value).toBe(true));
    expect(counts.npcs.data.value).toBeUndefined();
  });
});
