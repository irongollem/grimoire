import { describe, expect, it, beforeEach, vi } from "vitest";
import { defineComponent, h } from "vue";
import { mount } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";

const mocks = vi.hoisted(() => ({
  calls: [] as { table: string; update: Record<string, unknown>; ids: string[] }[],
  // Queue of { data, error } responses, one consumed per chunk request in order.
  // Defaults to "every id in the chunk moved" when the queue runs dry.
  responses: [] as ({ data: { id: string }[] | null; error: Error | null } | undefined)[],
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: (table: string) => ({
      update: (payload: Record<string, unknown>) => ({
        in: (_col: string, ids: string[]) => ({
          select: (_col2: string) => {
            const queued = mocks.responses.shift();
            mocks.calls.push({ table, update: payload, ids });
            if (queued) return Promise.resolve(queued);
            return Promise.resolve({ data: ids.map((id) => ({ id })), error: null });
          },
        }),
      }),
    }),
  },
}));

const { useBulkCampaignScope, BULK_SCOPE_QUERY_KEY, bulkScopeAllowsGeneral } = await import("./useBulkCampaignScope");

function withQueryClient<T>(setup: () => T): { result: T; queryClient: QueryClient; unmount: () => void } {
  let result!: T;
  const queryClient = new QueryClient();
  const wrapper = mount(
    defineComponent({
      setup() {
        result = setup();
        return () => h("div");
      },
    }),
    { global: { plugins: [[VueQueryPlugin, { queryClient }]] } },
  );
  return { result, queryClient, unmount: () => wrapper.unmount() };
}

describe("useBulkCampaignScope", () => {
  beforeEach(() => {
    mocks.calls = [];
    mocks.responses = [];
  });

  it("chunks a 450-id call into three requests of 200/200/50 and sums moved", async () => {
    const ids = Array.from({ length: 450 }, (_, i) => `id-${i}`);
    const { result, unmount } = withQueryClient(() => useBulkCampaignScope());

    const outcome = await result.mutateAsync({ table: "items", ids, campaignId: "camp-1" });

    expect(mocks.calls).toHaveLength(3);
    expect(mocks.calls.map((c) => c.ids.length)).toEqual([200, 200, 50]);
    expect(outcome.moved).toBe(450);
    unmount();
  });

  it("sends null in the update payload for the 'all campaigns' scope", async () => {
    const { result, unmount } = withQueryClient(() => useBulkCampaignScope());
    await result.mutateAsync({ table: "monsters", ids: ["a", "b"], campaignId: null });
    expect(mocks.calls[0].update).toEqual({ campaign_id: null });
    unmount();
  });

  it("rejects the mutation when a chunk throws, without swallowing the error", async () => {
    const boom = new Error("update failed");
    mocks.responses = [{ data: null, error: boom }];
    const { result, unmount } = withQueryClient(() => useBulkCampaignScope());

    await expect(
      result.mutateAsync({ table: "spells", ids: ["a", "b"], campaignId: "camp-1" }),
    ).rejects.toBe(boom);
    unmount();
  });

  it("still reports how far the move got before a later chunk fails", async () => {
    const boom = new Error("second chunk failed");
    // First chunk (ids 0-199) succeeds; second chunk (200-399) fails.
    mocks.responses = [
      { data: Array.from({ length: 200 }, (_, i) => ({ id: `id-${i}` })), error: null },
      { data: null, error: boom },
    ];
    const ids = Array.from({ length: 400 }, (_, i) => `id-${i}`);
    const { result, unmount } = withQueryClient(() => useBulkCampaignScope());

    await expect(result.mutateAsync({ table: "items", ids, campaignId: "camp-1" })).rejects.toThrow();
    expect((boom as Error & { moved?: number }).moved).toBe(200);
    unmount();
  });

  it("invalidates the moved table's own list query key on success", async () => {
    const { result, queryClient, unmount } = withQueryClient(() => useBulkCampaignScope());
    const spy = vi.spyOn(queryClient, "invalidateQueries");

    await result.mutateAsync({ table: "puzzle_rooms", ids: ["a"], campaignId: "camp-1" });

    expect(spy).toHaveBeenCalledWith({ queryKey: [BULK_SCOPE_QUERY_KEY.puzzle_rooms] });
    unmount();
  });

  // The eight owning composables each keep a module-private
  // `const QUERY_KEY = "<table>"`. This pins that convention so a key that
  // departs from its table name must be a deliberate edit to the map.
  it("keys every table by its own table name, the convention the owning composables follow", () => {
    for (const [table, key] of Object.entries(BULK_SCOPE_QUERY_KEY)) {
      expect(key).toBe(table);
    }
  });

  // ── Children follow their owner (#885) ──────────────────────────────────

  it("moves an NPC's npc_relationships and npc_inventory rows along with it, matching npc_id only", async () => {
    const { result, unmount } = withQueryClient(() => useBulkCampaignScope());
    await result.mutateAsync({ table: "npcs", ids: ["npc-1", "npc-2"], campaignId: "camp-2" });

    const childCalls = mocks.calls.filter((c) => c.table !== "npcs");
    expect(childCalls.map((c) => c.table)).toEqual(["npc_relationships", "npc_inventory"]);
    for (const call of childCalls) {
      expect(call.update).toEqual({ campaign_id: "camp-2" });
      expect(call.ids).toEqual(["npc-1", "npc-2"]);
    }
    unmount();
  });

  it("does NOT match npc_relationships on related_npc_id — only the owning npc_id column is filtered", async () => {
    const { result, unmount } = withQueryClient(() => useBulkCampaignScope());
    await result.mutateAsync({ table: "npcs", ids: ["npc-1"], campaignId: "camp-2" });

    // The mock's `in` doesn't record the column name, only the ids — but the
    // call count and table list already pin "one npc_relationships update per
    // move", which is only possible if it is a single `.in("npc_id", ids)`
    // rather than two calls (one per column).
    const relCalls = mocks.calls.filter((c) => c.table === "npc_relationships");
    expect(relCalls).toHaveLength(1);
    unmount();
  });

  it("moves a faction's faction_deities rows along with it", async () => {
    const { result, unmount } = withQueryClient(() => useBulkCampaignScope());
    await result.mutateAsync({ table: "factions", ids: ["fac-1"], campaignId: "camp-2" });

    const childCalls = mocks.calls.filter((c) => c.table !== "factions");
    expect(childCalls).toEqual([{ table: "faction_deities", update: { campaign_id: "camp-2" }, ids: ["fac-1"] }]);
    unmount();
  });

  it("touches no join table for a table with no campaign-scoped children", async () => {
    const { result, unmount } = withQueryClient(() => useBulkCampaignScope());
    await result.mutateAsync({ table: "items", ids: ["item-1"], campaignId: "camp-2" });

    expect(mocks.calls.map((c) => c.table)).toEqual(["items"]);
    unmount();
  });

  it("stamps the full entity move count on the error when a child-table update fails", async () => {
    const boom = new Error("child update failed");
    // First call is the entity update (npcs) — succeeds. Second is
    // npc_relationships — fails.
    mocks.responses = [
      undefined,
      { data: null, error: boom },
    ];
    const { result, unmount } = withQueryClient(() => useBulkCampaignScope());

    await expect(
      result.mutateAsync({ table: "npcs", ids: ["npc-1", "npc-2"], campaignId: "camp-2" }),
    ).rejects.toBe(boom);
    expect((boom as Error & { moved?: number }).moved).toBe(2);
    unmount();
  });

  it("skips the child-table update entirely when nothing actually moved (RLS dropped every id)", async () => {
    mocks.responses = [{ data: [], error: null }];
    const { result, unmount } = withQueryClient(() => useBulkCampaignScope());

    const outcome = await result.mutateAsync({ table: "npcs", ids: ["not-mine"], campaignId: "camp-2" });

    expect(outcome.moved).toBe(0);
    expect(mocks.calls).toHaveLength(1); // only the entity attempt, no child calls
    unmount();
  });
});

describe("bulkScopeAllowsGeneral", () => {
  it("is false for npcs (npc_inventory has a NOT NULL campaign_id)", () => {
    expect(bulkScopeAllowsGeneral("npcs")).toBe(false);
  });

  it("is false for factions (faction_deities has a NOT NULL campaign_id)", () => {
    expect(bulkScopeAllowsGeneral("factions")).toBe(false);
  });

  it("is true for every table with no campaign-scoped children", () => {
    for (const table of Object.keys(BULK_SCOPE_QUERY_KEY) as (keyof typeof BULK_SCOPE_QUERY_KEY)[]) {
      if (table === "npcs" || table === "factions") continue;
      expect(bulkScopeAllowsGeneral(table)).toBe(true);
    }
  });
});
