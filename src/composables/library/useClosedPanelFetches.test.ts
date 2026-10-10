import { defineComponent, h, ref } from "vue";
import { mount, flushPromises } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";

// #972: a panel that stays mounted behind a closed lid (the chat, the AI
// generators) runs these hooks on every page. Closed, they must send nothing.

const mocks = vi.hoisted(() => ({ tables: [] as string[], rpcs: [] as string[] }));

vi.mock("@/lib/supabase", () => {
  const builder = (table: string) => {
    mocks.tables.push(table);
    // A real promise carrying the chain methods, so it is awaitable without a hand-made thenable.
    const b: Promise<{ data: unknown[]; error: null }> & Record<string, unknown> = Object.assign(
      Promise.resolve({ data: [], error: null }),
      {} as Record<string, unknown>,
    );
    for (const m of ["select", "eq", "in", "or", "order", "range", "limit"]) b[m] = () => b;
    return b;
  };
  return {
    getCurrentUser: () => ({ id: "user-1" }),
    supabase: {
      from: builder,
      rpc: (name: string) => {
        mocks.rpcs.push(name);
        return Promise.resolve({ data: [], error: null });
      },
    },
  };
});
vi.mock("@/composables/library/useEnabledSources", () => ({
  useLibrarySourceSlugs: () => ({ slugs: ref<string[] | null>(["srd-2024"]), isLoading: ref(false) }),
}));
vi.mock("@/composables/rules/useRuleset", () => ({ useTableRuleset: () => ({ ruleset: ref("2024") }) }));
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => ({ activeCampaignId: null }) }));
vi.mock("@/stores/ui/app", () => ({ useAppUiStore: () => ({ dmPreviewMode: false }) }));
vi.mock("@/stores/auth", () => ({ useAuthStore: () => ({ isAppAdmin: false }) }));
vi.mock("@/composables/useToast", () => ({ useToast: () => ({ show: vi.fn() }) }));

import { usePlayerItemProjection } from "@/composables/items/useItems";

function run(setup: () => unknown) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  mount(
    defineComponent({
      setup() {
        setup();
        return () => h("div");
      },
    }),
    { global: { plugins: [[VueQueryPlugin, { queryClient }]] } },
  );
}

beforeEach(() => {
  mocks.tables.length = 0;
  mocks.rpcs.length = 0;
});

describe("closed panels fetch nothing (#972)", () => {
  it("usePlayerItemProjection with enabled false sends no request", async () => {
    run(() => usePlayerItemProjection(() => ({ enabled: false })));
    await flushPromises();
    expect(mocks.tables).toEqual([]);
    expect(mocks.rpcs).toEqual([]);
  });

  it("usePlayerItemProjection reads the projection and never the library", async () => {
    run(() => usePlayerItemProjection());
    await flushPromises();
    expect(mocks.rpcs).toEqual(["get_player_visible_items"]);
    expect(mocks.tables).not.toContain("library_items");
  });
});
