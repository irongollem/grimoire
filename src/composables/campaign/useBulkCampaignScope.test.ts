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

const { useBulkCampaignScope, BULK_SCOPE_QUERY_KEY } = await import("./useBulkCampaignScope");

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
});
