import { defineComponent, h } from "vue";
import { mount, flushPromises } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";

interface InvokeCall {
  fn: string;
  body: Record<string, unknown>;
}

const mocks = vi.hoisted(() => ({
  campaignId: "campaign-1" as string | null,
  countsData: [] as { kind: string; missing: number; ids: string[] }[],
  invokeCalls: [] as InvokeCall[],
  rpcCalls: 0,
  failIds: new Set<string>(),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    rpc: vi.fn(async () => {
      mocks.rpcCalls += 1;
      return { data: mocks.countsData, error: null };
    }),
    functions: {
      invoke: vi.fn(async (fn: string, opts: { body: Record<string, unknown> }) => {
        mocks.invokeCalls.push({ fn, body: opts.body });
        const id = (opts.body.id ?? opts.body.monster_id) as string;
        if (mocks.failIds.has(id)) return { data: null, error: new Error("embed failed") };
        return { data: { ok: true }, error: null };
      }),
    },
  },
}));

vi.mock("@/stores/campaign", () => ({
  useCampaignStore: () => ({
    get activeCampaignId() {
      return mocks.campaignId;
    },
  }),
}));

import { useUnembeddedContent } from "./useUnembeddedContent";

/** Mounts the composable inside a real component so its `useQuery` has a
 *  query client to attach to — same helper shape as useDashboardLayout.test.ts. */
function open() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let api!: ReturnType<typeof useUnembeddedContent>;
  mount(
    defineComponent({
      setup() {
        api = useUnembeddedContent();
        return () => h("div");
      },
    }),
    { global: { plugins: [[VueQueryPlugin, { queryClient }]] } },
  );
  return { api: () => api };
}

beforeEach(() => {
  mocks.campaignId = "campaign-1";
  mocks.countsData = [];
  mocks.invokeCalls = [];
  mocks.rpcCalls = 0;
  mocks.failIds = new Set();
});

describe("useUnembeddedContent", () => {
  it("totals the missing count across every kind", async () => {
    mocks.countsData = [
      { kind: "item", missing: 2, ids: ["i1", "i2"] },
      { kind: "npc", missing: 1, ids: ["n1"] },
      { kind: "monster", missing: 0, ids: [] },
    ];
    const { api } = open();
    await flushPromises();

    expect(api().total.value).toBe(3);
  });

  // The spec is explicit: a failed row must not abort the run. With N
  // independent network calls, "indexed 2, 1 failed" is the normal shape of
  // a partial success, not an error state that should stop the remaining rows.
  it("keeps going past a failed row and reports the partial result", async () => {
    mocks.countsData = [{ kind: "item", missing: 3, ids: ["i1", "i2", "i3"] }];
    mocks.failIds = new Set(["i2"]);
    const { api } = open();
    await flushPromises();

    const result = await api().indexAll();

    expect(result).toEqual({ indexed: 2, failed: 1 });
    // All three were attempted -- the failure on i2 did not short-circuit i3.
    expect(mocks.invokeCalls.map((c) => c.body.id)).toEqual(["i1", "i2", "i3"]);
    expect(api().progress.value).toEqual({ done: 3, total: 3 });
    expect(api().isRunning.value).toBe(false);
  });

  it("routes monsters through embed-monsters and every other kind through embed-content", async () => {
    mocks.countsData = [
      { kind: "item", missing: 1, ids: ["i1"] },
      { kind: "npc", missing: 1, ids: ["n1"] },
      { kind: "monster", missing: 1, ids: ["m1"] },
    ];
    const { api } = open();
    await flushPromises();

    await api().indexAll();

    expect(mocks.invokeCalls).toContainEqual({
      fn: "embed-monsters",
      body: { mode: "single", monster_id: "m1" },
    });
    expect(mocks.invokeCalls).toContainEqual({
      fn: "embed-content",
      body: { mode: "single", entity: "item", id: "i1" },
    });
    expect(mocks.invokeCalls).toContainEqual({
      fn: "embed-content",
      body: { mode: "single", entity: "npc", id: "n1" },
    });
  });

  // indexAll() re-checks right before spending N network calls (see the doc
  // comment in useUnembeddedContent.ts) rather than trusting whatever the
  // card/banner last rendered -- so it calls the RPC again, not just once at
  // mount.
  it("refetches counts before indexing rather than trusting the cached render", async () => {
    mocks.countsData = [{ kind: "item", missing: 1, ids: ["i1"] }];
    const { api } = open();
    await flushPromises();
    const rpcCallsAtMount = mocks.rpcCalls;

    await api().indexAll();

    expect(mocks.rpcCalls).toBeGreaterThan(rpcCallsAtMount);
  });
});
