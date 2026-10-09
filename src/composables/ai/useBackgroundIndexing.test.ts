import { effectScope, nextTick, reactive, ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";

interface InvokeCall {
  fn: string;
  body: Record<string, unknown>;
}

const mocks = vi.hoisted(() => ({
  /** Audit reply per function; a string is a `skipped` reply, null an error. */
  auditContent: [] as { kind: string; missing: string[]; outdated: string[] }[] | string | null,
  auditMonsters: [] as { kind: string; missing: string[]; outdated: string[] }[] | string | null,
  auditCalls: 0,
  invokeCalls: [] as InvokeCall[],
  rateLimitIds: new Set<string>(),
  reported: [] as unknown[],
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
        // The shape supabase-js gives a non-2xx: `data` null, the body on `error.context`.
        if (ids.some((id) => mocks.rateLimitIds.has(id))) {
          const context = new Response(JSON.stringify({ error: "rate_limited" }), { status: 429 });
          return { data: null, error: Object.assign(new Error("Edge Function returned a non-2xx status code"), { context }) };
        }
        return { data: { embedded: ids, unchanged: [], forbidden: [], notFound: [] }, error: null };
      }),
    },
  },
}));

// Background work runs at once in tests; the real helper waits for idle.
vi.mock("@/lib/afterFirstPaint", () => ({
  afterFirstPaint: (task: () => void) => {
    task();
    return () => {};
  },
}));
vi.mock("@/lib/observability/sentry", () => ({
  reportHandledError: (error: unknown) => mocks.reported.push(error),
}));

const store = reactive({ activeCampaignId: "campaign-1" as string | null });
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => store }));

const { useBackgroundIndexing, indexCampaign, resetBackgroundIndexing, backgroundIndexingSettled } = await import(
  "./useBackgroundIndexing"
);

function run(isDm = ref(true)) {
  const scope = effectScope();
  scope.run(() => useBackgroundIndexing(isDm));
  return scope;
}

beforeEach(() => {
  resetBackgroundIndexing();
  store.activeCampaignId = "campaign-1";
  mocks.auditContent = [];
  mocks.auditMonsters = [];
  mocks.auditCalls = 0;
  mocks.invokeCalls = [];
  mocks.rateLimitIds = new Set();
  mocks.reported = [];
});

describe("useBackgroundIndexing", () => {
  it("indexes what a DM's campaign is missing or has out of date, without being asked", async () => {
    mocks.auditContent = [{ kind: "npc", missing: ["n1"], outdated: ["n2"] }];
    mocks.auditMonsters = [{ kind: "monster", missing: ["m1"], outdated: [] }];
    run();
    await backgroundIndexingSettled();

    expect(mocks.invokeCalls).toEqual([
      { fn: "embed-content", body: { mode: "many", entity: "npc", ids: ["n1", "n2"] } },
      { fn: "embed-monsters", body: { mode: "many", monster_ids: ["m1"] } },
    ]);
  });

  it("indexes a campaign once per session, not on every visit", async () => {
    mocks.auditContent = [{ kind: "note", missing: ["x"], outdated: [] }];
    run();
    await backgroundIndexingSettled();
    store.activeCampaignId = "campaign-2";
    await nextTick();
    store.activeCampaignId = "campaign-1";
    await nextTick();
    await backgroundIndexingSettled();

    // campaign-1 once and campaign-2 once: two audits each (content + monsters).
    expect(mocks.auditCalls).toBe(4);
  });

  it("never runs for a player", async () => {
    run(ref(false));
    await backgroundIndexingSettled();
    expect(mocks.auditCalls).toBe(0);
  });

  it("reports a failed audit to Sentry and shows nothing", async () => {
    mocks.auditContent = null;
    run();
    await backgroundIndexingSettled();
    expect(mocks.reported).toHaveLength(1);
    expect(mocks.invokeCalls).toHaveLength(0);
  });

  it("sends nothing for a child account", async () => {
    mocks.auditContent = "child_account";
    mocks.auditMonsters = "child_account";
    run();
    await backgroundIndexingSettled();
    expect(mocks.invokeCalls).toHaveLength(0);
  });
});

describe("indexCampaign", () => {
  it("stops at the daily allowance and leaves the rest for a later session", async () => {
    mocks.auditContent = [
      { kind: "npc", missing: ["n1"], outdated: [] },
      { kind: "note", missing: ["limit"], outdated: [] },
      { kind: "quest", missing: ["q1"], outdated: [] },
    ];
    mocks.rateLimitIds = new Set(["limit"]);
    const result = await indexCampaign("campaign-1");

    expect(result).toEqual({ indexed: 1, failed: 0, remaining: 2 });
    // The quest batch after the ceiling is never sent.
    expect(mocks.invokeCalls.map((c) => c.body.entity)).toEqual(["npc", "note"]);
  });
});
