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
  /** Audit reply per function; a string is a `skipped` reply, null an error. */
  auditContent: [] as { kind: string; missing: string[]; outdated: string[] }[] | string | null,
  auditMonsters: [] as { kind: string; missing: string[]; outdated: string[] }[] | string | null,
  invokeCalls: [] as InvokeCall[],
  auditCalls: 0,
  failIds: new Set<string>(),
  rateLimitIds: new Set<string>(),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    functions: {
      invoke: vi.fn(async (fn: string, opts: { body: Record<string, unknown> }) => {
        if (opts.body.mode === "audit") {
          mocks.auditCalls += 1;
          const reply = fn === "embed-monsters" ? mocks.auditMonsters : mocks.auditContent;
          if (reply === null) return { data: null, error: new Error("audit failed") };
          if (typeof reply === "string") return { data: { skipped: reply }, error: null };
          return { data: { kinds: reply }, error: null };
        }
        mocks.invokeCalls.push({ fn, body: opts.body });
        const ids = (opts.body.ids ?? opts.body.monster_ids) as string[];
        // The shape supabase-js really gives a non-2xx: `data` null, the body
        // unread on `error.context`. Mocked as `data: { error }` this test once
        // passed while the real 429 was never recognised.
        if (ids.some((id) => mocks.rateLimitIds.has(id))) {
          const context = new Response(JSON.stringify({ error: "rate_limited" }), { status: 429 });
          return { data: null, error: Object.assign(new Error("Edge Function returned a non-2xx status code"), { context }) };
        }
        if (ids.some((id) => mocks.failIds.has(id))) return { data: null, error: new Error("embed failed") };
        // The many-mode reply: per-id, as the server sends it. Counting is
        // done from these lists, so a bare `{ ok: true }` would count nothing.
        return { data: { embedded: ids, unchanged: [], forbidden: [], notFound: [] }, error: null };
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

import { useStaleEmbeddings, STALE_EMBEDDING_KIND_LABELS } from "./useStaleEmbeddings";

type Audit = { kind: string; missing: string[]; outdated: string[] }[];

/** Shorthand: a content audit reply listing `ids` as missing for one kind. */
function missingOf(kind: string, ids: string[]): Audit {
  return [{ kind, missing: ids, outdated: [] }];
}

/** Mounts the composable inside a real component so its `useQuery` has a
 *  query client to attach to — same helper shape as useDashboardLayout.test.ts. */
function open() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let api!: ReturnType<typeof useStaleEmbeddings>;
  mount(
    defineComponent({
      setup() {
        api = useStaleEmbeddings();
        return () => h("div");
      },
    }),
    { global: { plugins: [[VueQueryPlugin, { queryClient }]] } },
  );
  return { api: () => api };
}

beforeEach(() => {
  mocks.campaignId = "campaign-1";
  mocks.auditContent = [];
  mocks.auditMonsters = [];
  mocks.invokeCalls = [];
  mocks.auditCalls = 0;
  mocks.failIds = new Set();
  mocks.rateLimitIds = new Set();
});

describe("useStaleEmbeddings", () => {
  it("totals the missing count across every kind", async () => {
    mocks.auditContent = [
      { kind: "item", missing: ["i1", "i2"], outdated: [] },
      { kind: "npc", missing: ["n1"], outdated: [] },
    ];
    mocks.auditMonsters = [{ kind: "monster", missing: [], outdated: [] }];
    const { api } = open();
    await flushPromises();

    expect(api().total.value).toBe(3);
  });

  it("merges both functions' audits into one row list in a stable kind order", async () => {
    mocks.auditContent = [
      { kind: "quest", missing: ["q1"], outdated: [] },
      { kind: "npc", missing: ["n1", "n2"], outdated: ["n3"] },
    ];
    mocks.auditMonsters = missingOf("monster", ["m1"]);
    const { api } = open();
    await flushPromises();

    expect(api().counts.value.map((r) => r.kind)).toEqual(["npc", "monster", "quest"]);
    expect(api().total.value).toBe(5);
    expect(api().outdatedTotal.value).toBe(1);
  });

  it("feeds missing then outdated ids to the indexer", async () => {
    mocks.auditContent = [{ kind: "note", missing: ["a"], outdated: ["b", "c"] }];
    const { api } = open();
    await flushPromises();

    expect(api().counts.value).toEqual([{ kind: "note", missing: 1, outdated: 2, ids: ["a", "b", "c"] }]);
    await api().indexAll();
    expect(mocks.invokeCalls).toContainEqual({
      fn: "embed-content",
      body: { mode: "many", entity: "note", ids: ["a", "b", "c"] },
    });
  });

  it("offers nothing to a child account", async () => {
    mocks.auditContent = "child_account";
    mocks.auditMonsters = "child_account";
    const { api } = open();
    await flushPromises();

    expect(api().counts.value).toEqual([]);
    expect(api().total.value).toBe(0);
  });

  it("surfaces an audit error as a query error and offers nothing", async () => {
    mocks.auditContent = null;
    const { api } = open();
    await flushPromises();

    expect(api().isError.value).toBe(true);
    expect(api().total.value).toBe(0);
  });

  // The spec is explicit: a failed row must not abort the run. With N
  // independent network calls, "indexed 2, 1 failed" is the normal shape of
  // a partial success, not an error state that should stop the remaining rows.
  it("keeps going past a failed batch and reports the partial result", async () => {
    // 150 items = two requests (100 + 50); the first contains the failing id.
    const items = Array.from({ length: 150 }, (_, i) => `i${i}`);
    mocks.auditContent = missingOf("item", items);
    mocks.failIds = new Set(["i2"]);
    const { api } = open();
    await flushPromises();

    const result = await api().indexAll();

    expect(result).toEqual({ indexed: 50, failed: 100, remaining: 0 });
    // Both batches were attempted -- the failure in the first did not stop the second.
    expect(mocks.invokeCalls.map((c) => (c.body.ids as string[]).length)).toEqual([100, 50]);
    expect(api().progress.value).toEqual({ done: 150, total: 150 });
    expect(api().isRunning.value).toBe(false);
  });

  it("routes monsters through embed-monsters and every other kind through embed-content", async () => {
    mocks.auditContent = [
      { kind: "item", missing: ["i1"], outdated: [] },
      { kind: "npc", missing: ["n1"], outdated: [] },
      { kind: "quest", missing: ["q1"], outdated: [] },
    ];
    mocks.auditMonsters = missingOf("monster", ["m1"]);
    const { api } = open();
    await flushPromises();

    await api().indexAll();

    expect(mocks.invokeCalls).toContainEqual({
      fn: "embed-content",
      body: { mode: "many", entity: "quest", ids: ["q1"] },
    });
    expect(STALE_EMBEDDING_KIND_LABELS.quest).toBe("quests");

    expect(mocks.invokeCalls).toContainEqual({
      fn: "embed-monsters",
      body: { mode: "many", monster_ids: ["m1"] },
    });
    expect(mocks.invokeCalls).toContainEqual({
      fn: "embed-content",
      body: { mode: "many", entity: "item", ids: ["i1"] },
    });
    expect(mocks.invokeCalls).toContainEqual({
      fn: "embed-content",
      body: { mode: "many", entity: "npc", ids: ["n1"] },
    });
  });

  // indexAll() re-checks right before spending N network calls (see the doc
  // comment in useStaleEmbeddings.ts) rather than trusting whatever the
  // card/banner last rendered -- so it audits again, not just once at
  // mount.
  it("refetches counts before indexing rather than trusting the cached render", async () => {
    mocks.auditContent = missingOf("item", ["i1"]);
    const { api } = open();
    await flushPromises();
    const auditCallsAtMount = mocks.auditCalls;

    await api().indexAll();

    expect(mocks.auditCalls).toBeGreaterThan(auditCallsAtMount);
  });

  // A 429 is the account's daily ceiling, not this row's problem — every
  // remaining row would hit it too. Grinding through them to report a
  // thousand failures would be both slower and a lie: nothing is lost, the
  // rows stay listed, and tomorrow's run finishes them.
  it("stops at the daily ceiling instead of failing every remaining row", async () => {
    const items = Array.from({ length: 250 }, (_, i) => `i${i}`);
    mocks.auditContent = missingOf("item", items);
    // The second request (ids 100..199) is the one the ceiling rejects.
    mocks.rateLimitIds = new Set(["i150"]);
    const { api } = open();
    await flushPromises();

    const result = await api().indexAll();

    // The first 100 went through; the rejected chunk and the one after it
    // are still unindexed, so `remaining` is 150.
    expect(result).toEqual({ indexed: 100, failed: 0, remaining: 150 });
    // The third request was never sent -- that is the whole point of stopping.
    expect(mocks.invokeCalls).toHaveLength(2);
  });

  it("embeds monsters in one many request per 100, and stops at the ceiling", async () => {
    const monsters = Array.from({ length: 250 }, (_, i) => `m${i}`);
    mocks.auditMonsters = missingOf("monster", monsters);
    mocks.rateLimitIds = new Set(["m150"]);
    const { api } = open();
    await flushPromises();

    const result = await api().indexAll();

    expect(result).toEqual({ indexed: 100, failed: 0, remaining: 150 });
    expect(mocks.invokeCalls.map((c) => [c.fn, (c.body.monster_ids as string[]).length])).toEqual([
      ["embed-monsters", 100],
      ["embed-monsters", 100],
    ]);
  });
});
