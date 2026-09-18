import { defineComponent, h, ref } from "vue";
import { mount, flushPromises } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";

const activeCampaignId = ref<string | null>("campaign-1");
vi.mock("@/stores/campaign", () => ({
  useCampaignStore: () => ({
    get activeCampaignId() { return activeCampaignId.value; },
  }),
}));

const mocks = vi.hoisted(() => ({
  currentUser: { id: "user-1" } as { id: string } | null,
  // One canned { data, error } result per table this composable reads.
  tableData: {} as Record<string, { data: unknown[] | null; error: { message: string } | null }>,
  calls: [] as { table: string; eqCalls: [string, unknown][] }[],
}));

/** Chainable stand-in for supabase-js's PostgrestFilterBuilder — same idiom
 *  as `useLocations.test.ts`'s own `makeQueryChain`: a genuine resolved
 *  `Promise` with filter methods attached, never a hand-rolled `then` (which
 *  oxlint's no-thenable rule flags), so `await` on the chain or on any
 *  method's own return value both resolve to this table's canned result. */
function makeQueryChain(table: string, call: { table: string; eqCalls: [string, unknown][] }) {
  const result = mocks.tableData[table] ?? { data: [], error: null };
  const chain = Promise.resolve(result) as
    Promise<{ data: unknown[] | null; error: { message: string } | null }> & Record<string, (...args: unknown[]) => unknown>;
  for (const method of ["select", "not", "is"]) {
    chain[method] = () => chain;
  }
  chain.eq = (col: unknown, value: unknown) => {
    call.eqCalls.push([col as string, value]);
    return chain;
  };
  return chain;
}

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: (table: string) => {
      const call = { table, eqCalls: [] as [string, unknown][] };
      mocks.calls.push(call);
      return makeQueryChain(table, call);
    },
  },
  getCurrentUser: () => mocks.currentUser,
}));

import { useImportSourceOptions } from "./useImportSourceOptions";

function open() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let api!: ReturnType<typeof useImportSourceOptions>;
  mount(
    defineComponent({
      setup() {
        api = useImportSourceOptions();
        return () => h("div");
      },
    }),
    { global: { plugins: [[VueQueryPlugin, { queryClient }]] } },
  );
  return { api: () => api };
}

beforeEach(() => {
  activeCampaignId.value = "campaign-1";
  mocks.currentUser = { id: "user-1" };
  mocks.tableData = {
    monsters: { data: [], error: null },
    items: { data: [], error: null },
    spells: { data: [], error: null },
  };
  mocks.calls = [];
});

describe("useImportSourceOptions", () => {
  it("merges the DM's own source titles across monsters/items/spells, ranked by use", async () => {
    mocks.tableData.monsters = {
      data: [
        { source: "Icewind Dale: Rime of the Frostmaiden", campaign_id: "campaign-1" },
        { source: "Icewind Dale: Rime of the Frostmaiden", campaign_id: "campaign-1" },
      ],
      error: null,
    };
    mocks.tableData.items = { data: [{ source: "Curse of Strahd", campaign_id: "campaign-1" }], error: null };

    const { api } = open();
    await flushPromises();

    expect(api().options.value).toEqual([
      { value: "Icewind Dale: Rime of the Frostmaiden", count: 2 },
      { value: "Curse of Strahd", count: 1 },
    ]);
  });

  it("queries every table scoped to the current user only", async () => {
    const { api } = open();
    await flushPromises();
    void api();

    for (const call of mocks.calls) {
      expect(call.eqCalls).toContainEqual(["user_id", "user-1"]);
    }
    expect(mocks.calls.map((c) => c.table).sort()).toEqual(["items", "monsters", "spells"]);
  });

  it("returns nothing when signed out, rather than querying with no user", async () => {
    mocks.currentUser = null;
    mocks.tableData.monsters = { data: [{ source: "Should Not Appear", campaign_id: "campaign-1" }], error: null };

    const { api } = open();
    await flushPromises();

    expect(api().options.value).toEqual([]);
  });

  it("prefills the most-used title in the active campaign", async () => {
    mocks.tableData.monsters = {
      data: [
        { source: "Icewind Dale: Rime of the Frostmaiden", campaign_id: "other-campaign" },
        { source: "Icewind Dale: Rime of the Frostmaiden", campaign_id: "other-campaign" },
        { source: "Curse of Strahd", campaign_id: "campaign-1" },
      ],
      error: null,
    };

    const { api } = open();
    await flushPromises();

    expect(api().defaultSourceTitle.value).toBe("Curse of Strahd");
  });

  it("falls back to null when there is no active campaign to prefill against", async () => {
    activeCampaignId.value = null;
    mocks.tableData.monsters = { data: [{ source: "Curse of Strahd", campaign_id: "campaign-1" }], error: null };

    const { api } = open();
    await flushPromises();

    expect(api().defaultSourceTitle.value).toBeNull();
  });
});
