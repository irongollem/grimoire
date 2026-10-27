import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, defineComponent, h, type App } from "vue";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});

vi.mock("@/lib/supabase", () => ({ supabase: fake.client, getCurrentUser: () => ({ id: "user-1" }) }));
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => ({ activeCampaignId: "campaign-1" }) }));

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

  it("fails loudly rather than printing zero when the read fails", async () => {
    fake.failNext("npcs", { message: "boom" });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const counts = mount(client, () => useCampaignCounts());
    await vi.waitFor(() => expect(counts.npcs.isError.value).toBe(true));
    expect(counts.npcs.data.value).toBeUndefined();
  });
});
