import { describe, expect, it, beforeEach, vi } from "vitest";
import { defineComponent, h } from "vue";
import { mount } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";

const mocks = vi.hoisted(() => ({
  calls: [] as { table: string; update: Record<string, unknown>; ids: string[] }[],
  // Queue of { data, error } responses, one consumed per chunk request in order.
  // Defaults to "every id in the chunk moved" when the queue runs dry.
  responses: [] as ({ data: { id: string }[] | null; error: Error | null } | undefined)[],
  // kin_links rows the move finds for an NPC end, and what it deleted.
  kinRows: [] as { id: string; from_npc_id: string | null; to_npc_id: string | null }[],
  kinDeleted: [] as string[],
  // world_links rows the move finds for an end, and what it deleted.
  linkRows: [] as { id: string; from_id: string; to_id: string; from_kind?: string; to_kind?: string; from_npc_id: string | null; to_npc_id: string | null; from_faction_id: string | null; to_faction_id: string | null }[],
  linkDeleted: [] as string[],
  // campaign_id of an end that stayed behind, by id; an id not listed belongs to the old campaign.
  endCampaign: {} as Record<string, string | null>,
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: (table: string) => ({
      select: (_cols: string) => ({
        in: (col: string, ids: string[]) =>
          col === "id" && table !== "world_links"
            ? Promise.resolve({
                data: ids.map((id) => ({ id, campaign_id: id in mocks.endCampaign ? mocks.endCampaign[id] : "camp-old" })),
                error: null,
              })
            : table === "world_links"
            ? Promise.resolve({
                data: mocks.linkRows.filter((r) => ids.includes(r[col as "from_npc_id" | "to_npc_id" | "from_faction_id" | "to_faction_id"] as string)),
                error: null,
              })
            : Promise.resolve({ data: mocks.kinRows.filter((r) => ids.includes(r[col as "from_npc_id" | "to_npc_id"] as string)), error: null }),
      }),
      delete: () => ({
        in: (_col: string, ids: string[]) => ({
          select: () => {
            (table === "world_links" ? mocks.linkDeleted : mocks.kinDeleted).push(...ids);
            return Promise.resolve({ data: ids.map((id) => ({ id })), error: null });
          },
        }),
      }),
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
    mocks.kinRows = [];
    mocks.kinDeleted = [];
    mocks.linkRows = [];
    mocks.linkDeleted = [];
    mocks.endCampaign = {};
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

  it("moves an NPC's npc_inventory rows along with it", async () => {
    const { result, unmount } = withQueryClient(() => useBulkCampaignScope());
    await result.mutateAsync({ table: "npcs", ids: ["npc-1", "npc-2"], campaignId: "camp-2" });

    const childCalls = mocks.calls.filter((c) => c.table !== "npcs");
    expect(childCalls.map((c) => c.table)).toEqual(["npc_inventory"]);
    for (const call of childCalls) {
      expect(call.update).toEqual({ campaign_id: "camp-2" });
      expect(call.ids).toEqual(["npc-1", "npc-2"]);
    }
    unmount();
  });

  it("re-stamps a world link whose two ends both moved, and deletes one that would span two campaigns", async () => {
    const link = (id: string, from: string, to: string) => ({
      id,
      from_id: from,
      to_id: to,
      from_kind: "npc",
      to_kind: "npc",
      from_npc_id: from,
      to_npc_id: to,
      from_faction_id: null,
      to_faction_id: null,
    });
    mocks.linkRows = [
      link("both", "npc-1", "npc-2"),
      link("left-behind", "npc-1", "fac-9"),
      link("to-pc", "npc-9", "npc-2"),
    ];
    const { result, unmount } = withQueryClient(() => useBulkCampaignScope());
    const outcome = await result.mutateAsync({ table: "npcs", ids: ["npc-1", "npc-2"], campaignId: "camp-2" });

    expect(outcome.worldLinksRemoved).toBe(2);
    expect(mocks.linkDeleted.sort()).toEqual(["left-behind", "to-pc"]);
    const linkUpdates = mocks.calls.filter((c) => c.table === "world_links");
    expect(linkUpdates).toEqual([{ table: "world_links", update: { campaign_id: "camp-2" }, ids: ["both"] }]);
    unmount();
  });

  it("keeps a link between two moved factions and drops one to an NPC that stayed", async () => {
    mocks.linkRows = [
      { id: "pair", from_id: "fac-1", to_id: "fac-2", from_kind: "faction", to_kind: "faction", from_npc_id: null, to_npc_id: null, from_faction_id: "fac-1", to_faction_id: "fac-2" },
      { id: "to-npc", from_id: "fac-1", to_id: "npc-1", from_kind: "faction", to_kind: "npc", from_npc_id: null, to_npc_id: "npc-1", from_faction_id: "fac-1", to_faction_id: null },
    ];
    const { result, unmount } = withQueryClient(() => useBulkCampaignScope());
    const outcome = await result.mutateAsync({ table: "factions", ids: ["fac-1", "fac-2"], campaignId: "camp-2" });

    expect(outcome.worldLinksRemoved).toBe(1);
    expect(mocks.linkDeleted).toEqual(["to-npc"]);
    expect(mocks.calls.filter((c) => c.table === "world_links")).toEqual([
      { table: "world_links", update: { campaign_id: "camp-2" }, ids: ["pair"] },
    ]);
    unmount();
  });

  it("keeps a link from a moved NPC to a general item, deity or place, and to one already in the target campaign", async () => {
    mocks.linkRows = [
      { id: "to-item", from_id: "npc-1", to_id: "item-1", from_kind: "npc", to_kind: "item", from_npc_id: "npc-1", to_npc_id: null, from_faction_id: null, to_faction_id: null },
      { id: "to-deity", from_id: "npc-1", to_id: "deity-1", from_kind: "npc", to_kind: "deity", from_npc_id: "npc-1", to_npc_id: null, from_faction_id: null, to_faction_id: null },
      { id: "to-there", from_id: "npc-1", to_id: "loc-2", from_kind: "npc", to_kind: "location", from_npc_id: "npc-1", to_npc_id: null, from_faction_id: null, to_faction_id: null },
      { id: "to-old", from_id: "npc-1", to_id: "loc-1", from_kind: "npc", to_kind: "location", from_npc_id: "npc-1", to_npc_id: null, from_faction_id: null, to_faction_id: null },
    ];
    mocks.endCampaign = { "item-1": null, "deity-1": null, "loc-2": "camp-2" };
    const { result, unmount } = withQueryClient(() => useBulkCampaignScope());
    const outcome = await result.mutateAsync({ table: "npcs", ids: ["npc-1"], campaignId: "camp-2" });

    expect(outcome.worldLinksRemoved).toBe(1);
    expect(mocks.linkDeleted).toEqual(["to-old"]);
    expect(mocks.calls.filter((c) => c.table === "world_links")).toEqual([
      { table: "world_links", update: { campaign_id: "camp-2" }, ids: ["to-item", "to-deity", "to-there"] },
    ]);
    unmount();
  });

  it("deletes every world link of an entity moved to the general scope, which holds none", async () => {
    mocks.linkRows = [
      { id: "pair", from_id: "fac-1", to_id: "fac-2", from_kind: "faction", to_kind: "faction", from_npc_id: null, to_npc_id: null, from_faction_id: "fac-1", to_faction_id: "fac-2" },
    ];
    const { result, unmount } = withQueryClient(() => useBulkCampaignScope());
    await result.mutateAsync({ table: "factions", ids: ["fac-1", "fac-2"], campaignId: null });

    expect(mocks.linkDeleted).toEqual(["pair"]);
    expect(mocks.calls.some((c) => c.table === "world_links")).toBe(false);
    unmount();
  });

  it("re-stamps a kin link whose two NPCs both moved, and deletes one that would span two campaigns", async () => {
    mocks.kinRows = [
      { id: "both", from_npc_id: "npc-1", to_npc_id: "npc-2" },
      { id: "left-behind", from_npc_id: "npc-1", to_npc_id: "npc-9" },
      { id: "to-pc", from_npc_id: "npc-2", to_npc_id: null },
    ];
    const { result, unmount } = withQueryClient(() => useBulkCampaignScope());
    const outcome = await result.mutateAsync({ table: "npcs", ids: ["npc-1", "npc-2"], campaignId: "camp-2" });

    expect(outcome.familyLinksRemoved).toBe(2);
    expect(mocks.kinDeleted.sort()).toEqual(["left-behind", "to-pc"]);
    const kinUpdates = mocks.calls.filter((c) => c.table === "kin_links");
    expect(kinUpdates).toEqual([{ table: "kin_links", update: { campaign_id: "camp-2" }, ids: ["both"] }]);
    unmount();
  });

  it("deletes every kin link of an NPC moved to the general scope, which holds none", async () => {
    mocks.kinRows = [{ id: "both", from_npc_id: "npc-1", to_npc_id: "npc-2" }];
    const { result, unmount } = withQueryClient(() => useBulkCampaignScope());
    await result.mutateAsync({ table: "npcs", ids: ["npc-1", "npc-2"], campaignId: null });

    expect(mocks.kinDeleted).toEqual(["both"]);
    expect(mocks.calls.some((c) => c.table === "kin_links")).toBe(false);
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
    // npc_inventory — fails.
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
  it("is false for npcs (npc_inventory and world links have a NOT NULL campaign_id)", () => {
    expect(bulkScopeAllowsGeneral("npcs")).toBe(false);
  });

  it("is false for factions (a world link has a NOT NULL campaign_id)", () => {
    expect(bulkScopeAllowsGeneral("factions")).toBe(false);
  });

  it("is true for every table with no campaign-scoped children", () => {
    for (const table of Object.keys(BULK_SCOPE_QUERY_KEY) as (keyof typeof BULK_SCOPE_QUERY_KEY)[]) {
      if (table === "npcs" || table === "factions") continue;
      expect(bulkScopeAllowsGeneral(table)).toBe(true);
    }
  });
});
