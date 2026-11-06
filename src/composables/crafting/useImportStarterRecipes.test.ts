import { describe, expect, it, vi } from "vitest";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { createApp, defineComponent, h } from "vue";

const mocks = vi.hoisted(() => ({ system: "generic", from: vi.fn() }));
vi.mock("@/lib/supabase", () => ({
  supabase: { from: (...a: unknown[]) => mocks.from(...a), rpc: vi.fn() },
  getCurrentUser: () => ({ id: "u1" }),
}));
vi.mock("@/stores/campaign", () => ({
  useCampaignStore: () => ({ activeCampaignId: "c1", activeGameSystem: mocks.system, activeCampaign: null }),
}));

import { useImportStarterRecipes } from "./useCrafting";

function mountMutation() {
  let out!: ReturnType<typeof useImportStarterRecipes>;
  const app = createApp(
    defineComponent({
      setup() {
        out = useImportStarterRecipes();
        return () => h("div");
      },
    }),
  );
  app.use(VueQueryPlugin, { queryClient: new QueryClient({ defaultOptions: { mutations: { retry: false } } }) });
  app.mount(document.createElement("div"));
  return out;
}

describe("useImportStarterRecipes", () => {
  // #934: the starter recipes resolve against 5e SRD items with a 2014 fallback,
  // which a Generic campaign must never silently receive.
  it("refuses a Generic campaign before reading or writing anything", async () => {
    mocks.system = "generic";
    mocks.from.mockReset();
    await expect(mountMutation().mutateAsync()).rejects.toThrow(/no rules system/);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("goes on to read items in a 5e campaign", async () => {
    mocks.system = "dnd5e-2024";
    mocks.from.mockReset();
    mocks.from.mockImplementation(() => {
      throw new Error("reached the database");
    });
    await expect(mountMutation().mutateAsync()).rejects.toThrow(/reached the database/);
  });
});
