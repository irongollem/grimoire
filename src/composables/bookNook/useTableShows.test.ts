// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { createApp, defineComponent, h } from "vue";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});
const store = vi.hoisted(() => ({
  activeCampaignId: "camp-1" as string | null,
  activeCampaign: { id: "camp-1", table_shows: "map" } as { id: string; table_shows: string } | null,
}));
vi.mock("@/lib/supabase", () => ({ supabase: fake.client }));
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => store }));

import { useTableShows } from "./useTableShows";

function mountWith<T>(setup: () => T): T {
  let out!: T;
  const app = createApp(defineComponent({ setup() { out = setup(); return () => h("div"); } }));
  app.use(VueQueryPlugin, { queryClient: new QueryClient() });
  app.mount(document.createElement("div"));
  return out;
}

beforeEach(() => {
  fake.reset();
  store.activeCampaignId = "camp-1";
  store.activeCampaign = { id: "camp-1", table_shows: "map" };
});

describe("useTableShows", () => {
  it("reads the active campaign's setting", () => {
    expect(mountWith(() => useTableShows()).tableShows.value).toBe("map");
  });

  it("writes only the active campaign's row and updates the store", async () => {
    fake.seed("campaigns", [{ id: "camp-1", table_shows: "map" }, { id: "camp-2", table_shows: "map" }]);
    await mountWith(() => useTableShows()).setTableShows("picture");
    expect(fake.rows("campaigns")).toMatchObject([{ table_shows: "picture" }, { table_shows: "map" }]);
    expect(store.activeCampaign?.table_shows).toBe("picture");
  });

  it("refuses to write with no active campaign", async () => {
    store.activeCampaignId = null;
    await expect(mountWith(() => useTableShows()).setTableShows("picture")).rejects.toThrow(/active campaign/);
  });
});
