import { describe, expect, it, beforeEach, vi } from "vitest";
import { defineComponent, h } from "vue";
import { mount } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";

const mocks = vi.hoisted(() => ({
  // Per-table queue of { data, error } responses for a select().in() read —
  // one shift() per chunked request. Defaults to an empty result when dry.
  selectResponses: new Map<string, ({ data: unknown[] | null; error: Error | null } | undefined)[]>(),
  selectCalls: [] as { table: string; columns: string; ids: string[] }[],
  // The enabled-sources read is `.select().eq()`, not `.in()` — a different
  // shape, so it gets its own queue and call log.
  eqResponses: new Map<string, ({ data: unknown[] | null; error: Error | null } | undefined)[]>(),
  eqCalls: [] as { table: string; columns: string; column: string; value: unknown }[],
  // Queue of { data, error } for an insert().select() write, one per chunk.
  insertResponses: [] as ({ data: { id: string }[] | null; error: Error | null } | undefined)[],
  insertCalls: [] as { table: string; rows: Record<string, unknown>[] }[],
  currentUserId: "user-1" as string | null,
  queueItemEmbedding: vi.fn(),
  queueMonsterEmbedding: vi.fn(),
  invalidateQuota: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: (table: string) => ({
      select: (columns: string) => ({
        in: (_col: string, ids: string[]) => {
          mocks.selectCalls.push({ table, columns, ids });
          const queue = mocks.selectResponses.get(table);
          const next = queue?.shift();
          if (next) return Promise.resolve(next);
          return Promise.resolve({ data: [], error: null });
        },
        eq: (column: string, value: unknown) => {
          mocks.eqCalls.push({ table, columns, column, value });
          const next = mocks.eqResponses.get(table)?.shift();
          if (next) return Promise.resolve(next);
          return Promise.resolve({ data: [], error: null });
        },
      }),
      insert: (rows: Record<string, unknown>[]) => ({
        select: (_col: string) => {
          mocks.insertCalls.push({ table, rows });
          const queued = mocks.insertResponses.shift();
          if (queued) return Promise.resolve(queued);
          return Promise.resolve({ data: rows.map((_, i) => ({ id: `new-${table}-${i}` })), error: null });
        },
      }),
    }),
  },
  getCurrentUser: () => (mocks.currentUserId ? { id: mocks.currentUserId } : null),
}));

vi.mock("@/composables/items/useItems", () => ({ queueItemEmbedding: mocks.queueItemEmbedding }));
vi.mock("@/composables/monsters/useMonsters", () => ({ queueMonsterEmbedding: mocks.queueMonsterEmbedding }));
vi.mock("@/composables/billing/useQuota", () => ({ useInvalidateQuota: () => mocks.invalidateQuota }));

const { useCopyToCampaign, planCopy } = await import("./useCopyToCampaign");
const { BULK_SCOPE_QUERY_KEY } = await import("./useBulkCampaignScope");

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

function queueSelect(table: string, data: unknown[], error: Error | null = null) {
  const queue = mocks.selectResponses.get(table) ?? [];
  queue.push({ data, error });
  mocks.selectResponses.set(table, queue);
}

beforeEach(() => {
  mocks.selectResponses = new Map();
  mocks.selectCalls = [];
  mocks.eqResponses = new Map();
  mocks.eqCalls = [];
  mocks.insertResponses = [];
  mocks.insertCalls = [];
  mocks.currentUserId = "user-1";
  mocks.queueItemEmbedding.mockReset();
  mocks.queueMonsterEmbedding.mockReset();
  mocks.invalidateQuota.mockReset();
});

describe("planCopy", () => {
  it("resolves referenced rows and reports what would be dropped, without writing anything", async () => {
    queueSelect("items", [{ id: "i1", spell_ids: ["spell-other"] }]);
    queueSelect("spells", [{ id: "spell-other", name: "Mage Hand", campaign_id: "camp-other" }]);

    const { dropped } = await planCopy({ table: "items", ids: ["i1"], targetCampaignId: "camp-target" });

    expect(dropped).toEqual([{ label: "Linked spells", names: ["Mage Hand"], removedEntries: false }]);
    expect(mocks.insertCalls).toHaveLength(0);
  });

  it("merges the same label across multiple rows into one report", async () => {
    queueSelect("items", [
      { id: "i1", spell_ids: ["spell-other"] },
      { id: "i2", spell_ids: ["spell-other-2"] },
    ]);
    queueSelect("spells", [
      { id: "spell-other", name: "Mage Hand", campaign_id: "camp-other" },
      { id: "spell-other-2", name: "Light", campaign_id: "camp-other" },
    ]);

    const { dropped } = await planCopy({ table: "items", ids: ["i1", "i2"], targetCampaignId: "camp-target" });

    expect(dropped).toEqual([{ label: "Linked spells", names: ["Mage Hand", "Light"], removedEntries: false }]);
  });

  it("skips the referenced lookup entirely when a row has nothing to resolve", async () => {
    queueSelect("traps", [{ id: "t1", name: "Pit trap" }]);
    const { dropped } = await planCopy({ table: "traps", ids: ["t1"], targetCampaignId: "camp-target" });
    expect(dropped).toEqual([]);
    expect(mocks.selectCalls.map((c) => c.table)).toEqual(["traps"]);
  });
});

describe("useCopyToCampaign", () => {
  it("inserts the planned payloads and reports how many copied", async () => {
    queueSelect("traps", [{ id: "t1", name: "Pit trap", campaign_id: "camp-source" }]);
    const { result, unmount } = withQueryClient(() => useCopyToCampaign());

    const outcome = await result.mutateAsync({ table: "traps", ids: ["t1"], targetCampaignId: "camp-target" });

    expect(outcome).toEqual({ copied: 1, dropped: [], needsSources: null });
    expect(mocks.insertCalls).toHaveLength(1);
    expect(mocks.insertCalls[0].table).toBe("traps");
    expect(mocks.insertCalls[0].rows[0]).toMatchObject({ campaign_id: "camp-target", user_id: "user-1" });
    expect(mocks.insertCalls[0].rows[0]).not.toHaveProperty("id");
    unmount();
  });

  it("chunks source reads and the insert itself at 200, mirroring useBulkCampaignScope", async () => {
    const ids = Array.from({ length: 450 }, (_, i) => `id-${i}`);
    const rows = ids.map((id) => ({ id, name: id, campaign_id: "camp-source" }));
    // fetchRows chunks the source read at 200 too.
    queueSelect("traps", rows.slice(0, 200));
    queueSelect("traps", rows.slice(200, 400));
    queueSelect("traps", rows.slice(400, 450));

    const { result, unmount } = withQueryClient(() => useCopyToCampaign());
    const outcome = await result.mutateAsync({ table: "traps", ids, targetCampaignId: "camp-target" });

    expect(mocks.selectCalls.filter((c) => c.table === "traps").map((c) => c.ids.length)).toEqual([200, 200, 50]);
    expect(mocks.insertCalls.map((c) => c.rows.length)).toEqual([200, 200, 50]);
    expect(outcome.copied).toBe(450);
    unmount();
  });

  it("queues an embedding for each newly inserted item, not for a table with no embedding corpus", async () => {
    queueSelect("items", [{ id: "i1", spell_ids: [] }]);
    mocks.insertResponses = [{ data: [{ id: "new-item-1" }], error: null }];
    const { result, unmount } = withQueryClient(() => useCopyToCampaign());

    await result.mutateAsync({ table: "items", ids: ["i1"], targetCampaignId: "camp-target" });

    expect(mocks.queueItemEmbedding).toHaveBeenCalledWith("new-item-1");
    expect(mocks.queueMonsterEmbedding).not.toHaveBeenCalled();
    unmount();
  });

  it("queues an embedding for each newly inserted monster", async () => {
    queueSelect("monsters", [{ id: "m1", lair_location_id: null }]);
    mocks.insertResponses = [{ data: [{ id: "new-monster-1" }], error: null }];
    const { result, unmount } = withQueryClient(() => useCopyToCampaign());

    await result.mutateAsync({ table: "monsters", ids: ["m1"], targetCampaignId: "camp-target" });

    expect(mocks.queueMonsterEmbedding).toHaveBeenCalledWith("new-monster-1");
    expect(mocks.queueItemEmbedding).not.toHaveBeenCalled();
    unmount();
  });

  it("never queues an embedding for the other six tables", async () => {
    queueSelect("traps", [{ id: "t1" }]);
    const { result, unmount } = withQueryClient(() => useCopyToCampaign());
    await result.mutateAsync({ table: "traps", ids: ["t1"], targetCampaignId: "camp-target" });
    expect(mocks.queueItemEmbedding).not.toHaveBeenCalled();
    expect(mocks.queueMonsterEmbedding).not.toHaveBeenCalled();
    unmount();
  });

  it("invalidates the table's own list query key on success", async () => {
    queueSelect("puzzle_rooms", [{ id: "p1" }]);
    const { result, queryClient, unmount } = withQueryClient(() => useCopyToCampaign());
    const spy = vi.spyOn(queryClient, "invalidateQueries");

    await result.mutateAsync({ table: "puzzle_rooms", ids: ["p1"], targetCampaignId: "camp-target" });

    expect(spy).toHaveBeenCalledWith({ queryKey: [BULK_SCOPE_QUERY_KEY.puzzle_rooms] });
    unmount();
  });

  it("also invalidates quota for monsters and puzzle_rooms — the two enforce_quota tables", async () => {
    queueSelect("monsters", [{ id: "m1" }]);
    const { result, unmount } = withQueryClient(() => useCopyToCampaign());
    await result.mutateAsync({ table: "monsters", ids: ["m1"], targetCampaignId: "camp-target" });
    expect(mocks.invalidateQuota).toHaveBeenCalledWith("monsters");
    unmount();
  });

  it("does not touch quota invalidation for a table with no quota trigger", async () => {
    queueSelect("items", [{ id: "i1", spell_ids: [] }]);
    const { result, unmount } = withQueryClient(() => useCopyToCampaign());
    await result.mutateAsync({ table: "items", ids: ["i1"], targetCampaignId: "camp-target" });
    expect(mocks.invalidateQuota).not.toHaveBeenCalled();
    unmount();
  });

  it("rejects the mutation on a quota_exceeded error without swallowing it", async () => {
    queueSelect("monsters", [{ id: "m1" }]);
    const boom = new Error("quota_exceeded");
    mocks.insertResponses = [{ data: null, error: boom }];
    const { result, unmount } = withQueryClient(() => useCopyToCampaign());

    await expect(
      result.mutateAsync({ table: "monsters", ids: ["m1"], targetCampaignId: "camp-target" }),
    ).rejects.toBe(boom);
    unmount();
  });
});

// #598: a library reference travels intact, but a campaign only *sees* a
// library source it has enabled — so a species copied into a campaign that has
// not enabled that source arrives granting a spell it cannot look up. Reported,
// never dropped: the fix is one toggle in the target campaign.
describe("planCopy — unenabled library sources", () => {
  const LIBRARY_SPECIES = {
    id: "sp1",
    name: "Ashen Elf",
    granted_spells: [{ spell_id: "srd_fireball", spell_name: "Fireball" }],
  };

  it("names the content and the source when the target has not enabled it", async () => {
    mocks.selectResponses.set("species", [{ data: [LIBRARY_SPECIES], error: null }]);
    mocks.selectResponses.set("library_spells", [
      { data: [{ id: "srd_fireball", name: "Fireball", source: "toh", source_title: "Tome of Heroes" }], error: null },
    ]);
    mocks.eqResponses.set("campaign_enabled_sources", [{ data: [{ source_slug: "srd-2014" }], error: null }]);

    const { needsSources, dropped } = await planCopy({ table: "species", ids: ["sp1"], targetCampaignId: "camp-target" });

    expect(needsSources).toEqual({ names: ["Fireball"], sources: ["Tome of Heroes"] });
    // Reported, not dropped — the two reports are distinct on purpose.
    expect(dropped).toEqual([]);
  });

  it("says nothing when the target campaign already has that source", async () => {
    mocks.selectResponses.set("species", [{ data: [LIBRARY_SPECIES], error: null }]);
    mocks.selectResponses.set("library_spells", [
      { data: [{ id: "srd_fireball", name: "Fireball", source: "toh", source_title: "Tome of Heroes" }], error: null },
    ]);
    mocks.eqResponses.set("campaign_enabled_sources", [{ data: [{ source_slug: "toh" }], error: null }]);

    const { needsSources } = await planCopy({ table: "species", ids: ["sp1"], targetCampaignId: "camp-target" });
    expect(needsSources).toBeNull();
  });

  it("does not consult enabled sources at all when copying to all campaigns", async () => {
    mocks.selectResponses.set("species", [{ data: [LIBRARY_SPECIES], error: null }]);

    // "All campaigns" is not a campaign, so there is no enabled-source list
    // that could make this true — the question is not asked rather than guessed.
    const { needsSources } = await planCopy({ table: "species", ids: ["sp1"], targetCampaignId: null });
    expect(needsSources).toBeNull();
    expect(mocks.eqCalls).toEqual([]);
    expect(mocks.selectCalls.some((c) => c.table === "library_spells")).toBe(false);
  });

  it("skips both reads entirely when nothing in the selection points at library content", async () => {
    mocks.selectResponses.set("traps", [{ data: [{ id: "t1", name: "Pit" }], error: null }]);
    const { needsSources } = await planCopy({ table: "traps", ids: ["t1"], targetCampaignId: "camp-target" });
    expect(needsSources).toBeNull();
    expect(mocks.eqCalls).toEqual([]);
  });
});
