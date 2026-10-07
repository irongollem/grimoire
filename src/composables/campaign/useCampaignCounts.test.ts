import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, defineComponent, h, type App } from "vue";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";

const mocks = vi.hoisted(() => ({
  calls: [] as { table: string; columns: string; options: unknown }[],
  results: {} as Record<string, { count: number | null; error: unknown }>,
}));

/** `.select(cols, { head: true })` then any filter, resolving to the table's `{ count, error }`. */
function chain(table: string): unknown {
  return new Proxy({}, {
    get(_target, prop) {
      if (prop === "then") return (resolve: (v: unknown) => unknown) => resolve(mocks.results[table]);
      return () => chain(table);
    },
  });
}

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: (table: string) => ({
      select: (columns: string, options: unknown) => {
        mocks.calls.push({ table, columns, options });
        return chain(table);
      },
    }),
  },
}));
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

describe("useCampaignCounts (#999)", () => {
  beforeEach(() => {
    mocks.calls.length = 0;
    mocks.results = {
      npcs: { count: 12, error: null },
      encounters: { count: 3, error: null },
      locations: { count: 7, error: null },
    };
  });
  afterEach(() => {
    apps.forEach((a) => a.unmount());
    apps = [];
  });

  it("asks the database to count, reading no rows", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const counts = mount(client, () => useCampaignCounts());
    await vi.waitFor(() => expect(counts.locations.data.value).toBe(7));
    expect(counts.npcs.data.value).toBe(12);
    expect(counts.encounters.data.value).toBe(3);
    expect(mocks.calls).toHaveLength(3);
    for (const call of mocks.calls) expect(call.options).toEqual({ count: "exact", head: true });
  });

  it("fails loudly rather than printing zero when a count is missing", async () => {
    mocks.results.npcs = { count: null, error: null };
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const counts = mount(client, () => useCampaignCounts());
    await vi.waitFor(() => expect(counts.npcs.isError.value).toBe(true));
    expect(counts.npcs.data.value).toBeUndefined();
  });
});
