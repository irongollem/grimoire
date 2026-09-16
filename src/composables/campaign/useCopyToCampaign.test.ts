import { describe, expect, it, beforeEach, vi } from "vitest";
import { defineComponent, h } from "vue";
import { mount } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";

const mocks = vi.hoisted(() => ({
  // Per-table queue of { data, error } responses for a select().in() read —
  // one shift() per chunked request. Defaults to an empty result when dry.
  // A join table can be queried more than once (once per match column — see
  // JOIN_TABLES_FOR_ENTITY), so a table's queue is consumed strictly in call
  // order, which is deterministic: `fetchRows` fires its `.in()` before its
  // first `await`, so `Promise.all`'s callers land in the array-literal order
  // the caller constructed them in, not in resolution order.
  selectResponses: new Map<string, ({ data: unknown[] | null; error: Error | null } | undefined)[]>(),
  selectCalls: [] as { table: string; columns: string; column: string; ids: string[] }[],
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
  queueNpcEmbedding: vi.fn(),
  queueFactionEmbedding: vi.fn(),
  invalidateQuota: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: (table: string) => ({
      select: (columns: string) => ({
        in: (col: string, ids: string[]) => {
          mocks.selectCalls.push({ table, columns, column: col, ids });
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
vi.mock("@/composables/npcs/useNpcs", () => ({ queueNpcEmbedding: mocks.queueNpcEmbedding }));
vi.mock("@/composables/factions/useFactions", () => ({ queueFactionEmbedding: mocks.queueFactionEmbedding }));
vi.mock("@/composables/billing/useQuota", () => ({ useInvalidateQuota: () => mocks.invalidateQuota }));

const { useCopyToCampaign, loadCopySources, planCopyFor, resolveUnenabledSources } = await import("./useCopyToCampaign");
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
  mocks.queueNpcEmbedding.mockReset();
  mocks.queueFactionEmbedding.mockReset();
  mocks.invalidateQuota.mockReset();
});

// #875 wave 2: the fetch (source rows + referenced rows, once) and the plan
// (pure, per target) are now separate — `loadCopySources` does the fetching,
// `planCopyFor` does the deciding, with no further request between two calls
// against the same loaded sources.
describe("loadCopySources + planCopyFor", () => {
  it("resolves referenced rows and plans a target, reporting what would be dropped", async () => {
    queueSelect("items", [{ id: "i1", spell_ids: ["spell-other"] }]);
    queueSelect("spells", [{ id: "spell-other", name: "Mage Hand", campaign_id: "camp-other" }]);

    const sources = await loadCopySources({ table: "items", ids: ["i1"] });
    const { dropped } = planCopyFor(sources, "camp-target");

    expect(dropped).toEqual([
      {
        label: "Linked spells",
        names: ["Mage Hand"],
        removedEntries: false,
        entryNoun: { singular: "linked spell", plural: "linked spells" },
      },
    ]);
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

    const sources = await loadCopySources({ table: "items", ids: ["i1", "i2"] });
    const { dropped } = planCopyFor(sources, "camp-target");

    expect(dropped).toEqual([
      {
        label: "Linked spells",
        names: ["Mage Hand", "Light"],
        removedEntries: false,
        entryNoun: { singular: "linked spell", plural: "linked spells" },
      },
    ]);
  });

  it("skips the referenced lookup entirely when a row has nothing to resolve", async () => {
    queueSelect("traps", [{ id: "t1", name: "Pit trap" }]);
    const sources = await loadCopySources({ table: "traps", ids: ["t1"] });
    const { dropped } = planCopyFor(sources, "camp-target");
    expect(dropped).toEqual([]);
    expect(mocks.selectCalls.map((c) => c.table)).toEqual(["traps"]);
  });

  // #875 F5/F21: this is the whole point of the split — a DM trying several
  // targets in the picker must not re-fetch on every change.
  it("is pure: planning two different targets from the same loaded sources needs no further fetch", async () => {
    queueSelect("monsters", [{ id: "m1", lair_location_id: "loc-1" }]);
    queueSelect("locations", [{ id: "loc-1", name: "The Sunken Keep", campaign_id: "camp-a" }]);

    const sources = await loadCopySources({ table: "monsters", ids: ["m1"] });
    const selectCallsAfterLoad = mocks.selectCalls.length;

    const forA = planCopyFor(sources, "camp-a");
    const forB = planCopyFor(sources, "camp-b");

    expect(forA.dropped).toEqual([]); // visible from camp-a
    expect(forB.dropped).toHaveLength(1); // not visible from camp-b
    expect(mocks.selectCalls).toHaveLength(selectCallsAfterLoad);
  });

  it("throws when there is no signed-in user, rather than planning an ownerless copy", async () => {
    mocks.currentUserId = null;
    queueSelect("traps", [{ id: "t1" }]);
    await expect(loadCopySources({ table: "traps", ids: ["t1"] })).rejects.toThrow(/sign in/i);
  });
});

// #885: npcs/factions batches carry join rows (relationships, memberships, …)
// that reference each other, so loadCopySources fetches more than the eight
// original tables ever needed, and planCopyFor hands the whole batch to
// buildCopySetPlan instead of looping buildCopyPlan per row. The planner
// itself (buildCopySetPlan, buildJoinRowPayload) is S1's and tested in
// copyToCampaign.test.ts — these tests are about the fetch/plan wiring this
// story owns: which tables get queried, on which column, and that the result
// reaches buildCopySetPlan intact.
describe("loadCopySources + planCopyFor — npcs/factions batches (#885)", () => {
  it("fetches a batch's join rows across every match column and dedupes a row found from both endpoints", async () => {
    queueSelect("npcs", [
      { id: "n1", name: "Aric", campaign_id: "camp-a" },
      { id: "n2", name: "Bel", campaign_id: "camp-a" },
    ]);
    // npc_relationships is queried once per match column (npc_id,
    // related_npc_id) — the SAME row names n1 as npc_id and n2 as
    // related_npc_id, so it comes back from both queries.
    const rel = { id: "rel-1", npc_id: "n1", related_npc_id: "n2", campaign_id: "camp-a", label: "Allies" };
    queueSelect("npc_relationships", [rel]);
    queueSelect("npc_relationships", [rel]);
    queueSelect("npc_inventory", []);
    queueSelect("faction_npcs", []);

    const sources = await loadCopySources({ table: "npcs", ids: ["n1", "n2"] });

    expect(sources.joinRows).toEqual([{ table: "npc_relationships", row: rel }]);
    expect(mocks.selectCalls.filter((c) => c.table === "npc_relationships").map((c) => c.column)).toEqual([
      "npc_id",
      "related_npc_id",
    ]);
  });

  it("fetches no join rows at all, with no extra request, for a table that never produces one", async () => {
    queueSelect("traps", [{ id: "t1", name: "Pit trap" }]);
    const sources = await loadCopySources({ table: "traps", ids: ["t1"] });
    expect(sources.joinRows).toEqual([]);
    expect(mocks.selectCalls.map((c) => c.table)).toEqual(["traps"]);
  });

  it("resolves what a join row points at OUTSIDE the batch, not just what the entity rows themselves reference", async () => {
    const npcRow = { id: "n1", name: "Aric", campaign_id: null };
    queueSelect("npcs", [npcRow]); // source rows fetch
    queueSelect("npc_relationships", []); // npc_id
    queueSelect("npc_relationships", []); // related_npc_id
    queueSelect("npc_inventory", []);
    // n1 belongs to a faction that is NOT part of this (npcs-only) batch.
    queueSelect("faction_npcs", [{ id: "fn-1", faction_id: "fac-outside", npc_id: "n1" }]);
    // The referenced-rows lookup phase queries both endpoints the join row
    // names, including the in-batch one — redundant but harmless (rule 1's
    // idMap check wins over it at plan time), so it needs a response too.
    queueSelect("factions", [{ id: "fac-outside", name: "The Harpers", campaign_id: "camp-other" }]);
    queueSelect("npcs", [npcRow]);

    const sources = await loadCopySources({ table: "npcs", ids: ["n1"] });

    expect(sources.referenced.get("fac-outside")).toEqual({
      id: "fac-outside",
      name: "The Harpers",
      campaignId: "camp-other",
    });
  });

  it("plans a batch of npcs via buildCopySetPlan: mints ids and rewrites the relationship's endpoints to them", async () => {
    queueSelect("npcs", [
      { id: "n1", name: "Aric", campaign_id: "camp-a" },
      { id: "n2", name: "Bel", campaign_id: "camp-a" },
    ]);
    queueSelect("npc_relationships", [
      { id: "rel-1", npc_id: "n1", related_npc_id: "n2", campaign_id: "camp-a", label: "Allies" },
    ]);
    queueSelect("npc_relationships", []);
    queueSelect("npc_inventory", []);
    queueSelect("faction_npcs", []);

    const sources = await loadCopySources({ table: "npcs", ids: ["n1", "n2"] });
    const plan = planCopyFor(sources, "camp-target");

    expect(plan.payloads).toHaveLength(2);
    const [p1, p2] = plan.payloads;
    // A batch copy mints its own ids up front (buildCopySetPlan) rather than
    // letting Postgres assign them, because the relationship below has to be
    // able to name the copy before it's inserted.
    expect(p1.id).not.toBe("n1");
    expect(p2.id).not.toBe("n2");

    expect(plan.linkPayloads.npc_relationships).toHaveLength(1);
    const [relPayload] = plan.linkPayloads.npc_relationships!;
    expect(relPayload.npc_id).toBe(p1.id);
    expect(relPayload.related_npc_id).toBe(p2.id);
  });

  it("keeps the eight original tables on the per-row buildCopyPlan path — linkPayloads is always {}", async () => {
    queueSelect("traps", [{ id: "t1", name: "Pit trap" }]);
    const sources = await loadCopySources({ table: "traps", ids: ["t1"] });
    const plan = planCopyFor(sources, "camp-target");
    expect(plan.linkPayloads).toEqual({});
  });
});

describe("useCopyToCampaign", () => {
  it("inserts the already-planned payloads and reports how many copied", async () => {
    const { result, unmount } = withQueryClient(() => useCopyToCampaign());
    const payloads = [{ name: "Pit trap", campaign_id: "camp-target", user_id: "user-1" }];

    const outcome = await result.mutateAsync({ table: "traps", payloads, linkPayloads: {}, dropped: [], needsSources: null });

    expect(outcome).toEqual({ copied: 1, linked: 0, dropped: [], needsSources: null });
    expect(mocks.insertCalls).toHaveLength(1);
    expect(mocks.insertCalls[0].table).toBe("traps");
    expect(mocks.insertCalls[0].rows).toEqual(payloads);
    unmount();
  });

  it("chunks the insert itself at 200, mirroring useBulkCampaignScope", async () => {
    const payloads = Array.from({ length: 450 }, (_, i) => ({ id: `p-${i}` }));
    const { result, unmount } = withQueryClient(() => useCopyToCampaign());

    const outcome = await result.mutateAsync({ table: "traps", payloads, linkPayloads: {}, dropped: [], needsSources: null });

    expect(mocks.insertCalls.map((c) => c.rows.length)).toEqual([200, 200, 50]);
    expect(outcome.copied).toBe(450);
    unmount();
  });

  it("carries the plan's dropped and needsSources straight through to the result", async () => {
    const dropped = [
      {
        label: "Linked spells",
        names: ["Mage Hand"],
        removedEntries: false,
        entryNoun: { singular: "linked spell", plural: "linked spells" },
      },
    ];
    const needsSources = { names: ["Fireball"], sources: ["Tome of Heroes"] };
    const { result, unmount } = withQueryClient(() => useCopyToCampaign());

    const outcome = await result.mutateAsync({ table: "items", payloads: [{}], linkPayloads: {}, dropped, needsSources });

    expect(outcome.dropped).toBe(dropped);
    expect(outcome.needsSources).toBe(needsSources);
    unmount();
  });

  it("queues an embedding for each newly inserted item, not for a table with no embedding corpus", async () => {
    mocks.insertResponses = [{ data: [{ id: "new-item-1" }], error: null }];
    const { result, unmount } = withQueryClient(() => useCopyToCampaign());

    await result.mutateAsync({ table: "items", payloads: [{}], linkPayloads: {}, dropped: [], needsSources: null });

    // Embeddings are queued in the background after the copy resolves — the
    // mutation never waits on them — so the assertion has to.
    await vi.waitFor(() => expect(mocks.queueItemEmbedding).toHaveBeenCalledWith("new-item-1"));
    expect(mocks.queueMonsterEmbedding).not.toHaveBeenCalled();
    unmount();
  });

  it("queues an embedding for each newly inserted monster", async () => {
    mocks.insertResponses = [{ data: [{ id: "new-monster-1" }], error: null }];
    const { result, unmount } = withQueryClient(() => useCopyToCampaign());

    await result.mutateAsync({ table: "monsters", payloads: [{}], linkPayloads: {}, dropped: [], needsSources: null });

    await vi.waitFor(() => expect(mocks.queueMonsterEmbedding).toHaveBeenCalledWith("new-monster-1"));
    expect(mocks.queueItemEmbedding).not.toHaveBeenCalled();
    unmount();
  });

  it("never queues an embedding for the other six tables", async () => {
    const { result, unmount } = withQueryClient(() => useCopyToCampaign());
    await result.mutateAsync({ table: "traps", payloads: [{}], linkPayloads: {}, dropped: [], needsSources: null });
    expect(mocks.queueItemEmbedding).not.toHaveBeenCalled();
    expect(mocks.queueMonsterEmbedding).not.toHaveBeenCalled();
    expect(mocks.queueNpcEmbedding).not.toHaveBeenCalled();
    expect(mocks.queueFactionEmbedding).not.toHaveBeenCalled();
    unmount();
  });

  // #875 F20: each 200-row insert chunk commits independently. Queuing
  // embeddings only after the WHOLE loop finished meant a later chunk's
  // failure exited before any embedding was queued at all — leaving the
  // first chunk's rows, which had already committed, unembedded until the
  // next admin backfill. Queuing right after each chunk's own insert fixes
  // that: the first chunk's ids must be queued even though the mutation as a
  // whole still rejects.
  it("queues embeddings for an earlier chunk's inserted ids even when a later chunk fails", async () => {
    const chunk1Ids = Array.from({ length: 200 }, (_, i) => `new-item-${i}`);
    mocks.insertResponses = [
      { data: chunk1Ids.map((id) => ({ id })), error: null },
      { data: null, error: new Error("insert failed") },
    ];
    const payloads = Array.from({ length: 250 }, (_, i) => ({ id: `p-${i}` }));
    const { result, unmount } = withQueryClient(() => useCopyToCampaign());

    await expect(
      result.mutateAsync({ table: "items", payloads, linkPayloads: {}, dropped: [], needsSources: null }),
    ).rejects.toThrow("insert failed");

    await vi.waitFor(() => expect(mocks.queueItemEmbedding).toHaveBeenCalledTimes(200));
    for (const id of chunk1Ids) expect(mocks.queueItemEmbedding).toHaveBeenCalledWith(id);
    unmount();
  });

  it("invalidates the table's own list query key on success", async () => {
    const { result, queryClient, unmount } = withQueryClient(() => useCopyToCampaign());
    const spy = vi.spyOn(queryClient, "invalidateQueries");

    await result.mutateAsync({ table: "puzzle_rooms", payloads: [{}], linkPayloads: {}, dropped: [], needsSources: null });

    expect(spy).toHaveBeenCalledWith({ queryKey: [BULK_SCOPE_QUERY_KEY.puzzle_rooms] });
    unmount();
  });

  it("also invalidates quota for monsters and puzzle_rooms — two of the four enforce_quota tables", async () => {
    const { result, unmount } = withQueryClient(() => useCopyToCampaign());
    await result.mutateAsync({ table: "monsters", payloads: [{}], linkPayloads: {}, dropped: [], needsSources: null });
    expect(mocks.invalidateQuota).toHaveBeenCalledWith("monsters");
    unmount();
  });

  it("does not touch quota invalidation for a table with no quota trigger", async () => {
    const { result, unmount } = withQueryClient(() => useCopyToCampaign());
    await result.mutateAsync({ table: "items", payloads: [{}], linkPayloads: {}, dropped: [], needsSources: null });
    expect(mocks.invalidateQuota).not.toHaveBeenCalled();
    unmount();
  });

  it("rejects the mutation on a quota_exceeded error without swallowing it", async () => {
    const boom = new Error("quota_exceeded");
    mocks.insertResponses = [{ data: null, error: boom }];
    const { result, unmount } = withQueryClient(() => useCopyToCampaign());

    await expect(
      result.mutateAsync({ table: "monsters", payloads: [{}], linkPayloads: {}, dropped: [], needsSources: null }),
    ).rejects.toBe(boom);
    unmount();
  });
});

// #885: npcs/factions batches carry `linkPayloads` — insert order, the
// `linked` count, quota and the join tables' own query-key invalidation are
// all new behaviour this story owns (the planner itself is S1's).
describe("useCopyToCampaign — npcs/factions batches (#885)", () => {
  it("inserts the entity rows before the join rows and reports both counts", async () => {
    mocks.insertResponses = [
      { data: [{ id: "new-n1" }, { id: "new-n2" }], error: null }, // npcs insert
      { data: [{ id: "new-rel-1" }], error: null }, // npc_relationships insert
    ];
    const { result, unmount } = withQueryClient(() => useCopyToCampaign());
    const payloads = [{ id: "new-n1", name: "Aric" }, { id: "new-n2", name: "Bel" }];
    const linkPayloads = { npc_relationships: [{ npc_id: "new-n1", related_npc_id: "new-n2" }] };

    const outcome = await result.mutateAsync({ table: "npcs", payloads, linkPayloads, dropped: [], needsSources: null });

    // The order matters: a join row names an entity's minted id, so it must
    // not be written before that entity actually exists.
    expect(mocks.insertCalls.map((c) => c.table)).toEqual(["npcs", "npc_relationships"]);
    expect(outcome).toEqual({ copied: 2, linked: 1, dropped: [], needsSources: null });
    unmount();
  });

  it("never reaches the join-row insert when the entity insert itself fails", async () => {
    mocks.insertResponses = [{ data: null, error: new Error("insert failed") }];
    const { result, unmount } = withQueryClient(() => useCopyToCampaign());
    const linkPayloads = { npc_relationships: [{ npc_id: "new-n1", related_npc_id: "new-n2" }] };

    await expect(
      result.mutateAsync({ table: "npcs", payloads: [{ id: "new-n1" }], linkPayloads, dropped: [], needsSources: null }),
    ).rejects.toThrow("insert failed");

    // A join row must never be written pointing at an entity insert that
    // didn't happen — the loop that would write it is never reached.
    expect(mocks.insertCalls.map((c) => c.table)).toEqual(["npcs"]);
    unmount();
  });

  it("sums linked across more than one join table", async () => {
    mocks.insertResponses = [
      { data: [{ id: "new-f1" }], error: null }, // factions insert
      { data: [{ id: "new-fn-1" }, { id: "new-fn-2" }], error: null }, // faction_npcs
      { data: [{ id: "new-fd-1" }], error: null }, // faction_deities
    ];
    const { result, unmount } = withQueryClient(() => useCopyToCampaign());
    const linkPayloads = {
      faction_npcs: [{ faction_id: "new-f1", npc_id: "n1" }, { faction_id: "new-f1", npc_id: "n2" }],
      faction_deities: [{ faction_id: "new-f1", deity_id: "d1" }],
    };

    const outcome = await result.mutateAsync({
      table: "factions",
      payloads: [{ id: "new-f1" }],
      linkPayloads,
      dropped: [],
      needsSources: null,
    });

    expect(outcome.linked).toBe(3);
    unmount();
  });

  it("queues an embedding for each newly inserted npc", async () => {
    mocks.insertResponses = [{ data: [{ id: "new-npc-1" }], error: null }];
    const { result, unmount } = withQueryClient(() => useCopyToCampaign());

    await result.mutateAsync({ table: "npcs", payloads: [{}], linkPayloads: {}, dropped: [], needsSources: null });

    await vi.waitFor(() => expect(mocks.queueNpcEmbedding).toHaveBeenCalledWith("new-npc-1"));
    expect(mocks.queueFactionEmbedding).not.toHaveBeenCalled();
    unmount();
  });

  it("queues an embedding for each newly inserted faction", async () => {
    mocks.insertResponses = [{ data: [{ id: "new-faction-1" }], error: null }];
    const { result, unmount } = withQueryClient(() => useCopyToCampaign());

    await result.mutateAsync({ table: "factions", payloads: [{}], linkPayloads: {}, dropped: [], needsSources: null });

    await vi.waitFor(() => expect(mocks.queueFactionEmbedding).toHaveBeenCalledWith("new-faction-1"));
    expect(mocks.queueNpcEmbedding).not.toHaveBeenCalled();
    unmount();
  });

  it("also invalidates quota for npcs and factions — the other two of the four enforce_quota tables", async () => {
    const { result: npcResult, unmount: unmountNpc } = withQueryClient(() => useCopyToCampaign());
    await npcResult.mutateAsync({ table: "npcs", payloads: [{}], linkPayloads: {}, dropped: [], needsSources: null });
    expect(mocks.invalidateQuota).toHaveBeenCalledWith("npcs");
    unmountNpc();

    const { result: factionResult, unmount: unmountFaction } = withQueryClient(() => useCopyToCampaign());
    await factionResult.mutateAsync({ table: "factions", payloads: [{}], linkPayloads: {}, dropped: [], needsSources: null });
    expect(mocks.invalidateQuota).toHaveBeenCalledWith("factions");
    unmountFaction();
  });

  it("invalidates a join table's own list query only when the batch actually created a row in it", async () => {
    const { result, queryClient, unmount } = withQueryClient(() => useCopyToCampaign());
    const spy = vi.spyOn(queryClient, "invalidateQueries");
    // faction_npcs is present as a key but empty — a batch can plan a join
    // table with nothing surviving in it (every row dropped) — so its query
    // must NOT be invalidated on the strength of the key merely existing.
    const linkPayloads = { npc_relationships: [{ npc_id: "a", related_npc_id: "b" }], faction_npcs: [] };

    await result.mutateAsync({ table: "npcs", payloads: [{}], linkPayloads, dropped: [], needsSources: null });

    expect(spy).toHaveBeenCalledWith({ queryKey: ["npc_relationships"] });
    expect(spy).not.toHaveBeenCalledWith({ queryKey: ["faction-npcs"] });
    unmount();
  });

  it("invalidates a join table reachable from both endpoints under both its query keys", async () => {
    const { result, queryClient, unmount } = withQueryClient(() => useCopyToCampaign());
    const spy = vi.spyOn(queryClient, "invalidateQueries");
    const linkPayloads = { faction_npcs: [{ faction_id: "f1", npc_id: "n1" }] };

    await result.mutateAsync({ table: "factions", payloads: [{}], linkPayloads, dropped: [], needsSources: null });

    expect(spy).toHaveBeenCalledWith({ queryKey: ["faction-npcs"] });
    expect(spy).toHaveBeenCalledWith({ queryKey: ["npc-factions"] });
    unmount();
  });

  it("invalidates nothing join-related when linkPayloads is {} — the legacy eight tables' shape", async () => {
    const { result, queryClient, unmount } = withQueryClient(() => useCopyToCampaign());
    const spy = vi.spyOn(queryClient, "invalidateQueries");

    await result.mutateAsync({ table: "items", payloads: [{}], linkPayloads: {}, dropped: [], needsSources: null });

    expect(spy).toHaveBeenCalledTimes(1); // just the table's own BULK_SCOPE_QUERY_KEY
    unmount();
  });
});

// #598: a library reference travels intact, but a campaign only *sees* a
// library source it has enabled — so a species copied into a campaign that has
// not enabled that source arrives granting a spell it cannot look up. Reported,
// never dropped: the fix is one toggle in the target campaign.
describe("resolveUnenabledSources — unenabled library sources", () => {
  const LIBRARY_SPECIES = {
    id: "sp1",
    name: "Ashen Elf",
    granted_spells: [{ spell_id: "srd_fireball", spell_name: "Fireball" }],
  };

  it("names the content and the source when the target has not enabled it", async () => {
    queueSelect("species", [LIBRARY_SPECIES]);
    const sources = await loadCopySources({ table: "species", ids: ["sp1"] });
    mocks.selectResponses.set("library_spells", [
      { data: [{ id: "srd_fireball", name: "Fireball", source: "toh", source_title: "Tome of Heroes" }], error: null },
    ]);
    mocks.eqResponses.set("campaign_enabled_sources", [{ data: [{ source_slug: "srd-2014" }], error: null }]);

    const notice = await resolveUnenabledSources("species", sources.sourceRows, "camp-target");

    expect(notice).toEqual({ names: ["Fireball"], sources: ["Tome of Heroes"] });
  });

  it("says nothing when the target campaign already has that source", async () => {
    queueSelect("species", [LIBRARY_SPECIES]);
    const sources = await loadCopySources({ table: "species", ids: ["sp1"] });
    mocks.selectResponses.set("library_spells", [
      { data: [{ id: "srd_fireball", name: "Fireball", source: "toh", source_title: "Tome of Heroes" }], error: null },
    ]);
    mocks.eqResponses.set("campaign_enabled_sources", [{ data: [{ source_slug: "toh" }], error: null }]);

    const notice = await resolveUnenabledSources("species", sources.sourceRows, "camp-target");
    expect(notice).toBeNull();
  });

  it("does not consult enabled sources at all when copying to all campaigns", async () => {
    queueSelect("species", [LIBRARY_SPECIES]);
    const sources = await loadCopySources({ table: "species", ids: ["sp1"] });

    // "All campaigns" is not a campaign, so there is no enabled-source list
    // that could make this true — the question is not asked rather than guessed.
    const notice = await resolveUnenabledSources("species", sources.sourceRows, null);
    expect(notice).toBeNull();
    expect(mocks.eqCalls).toEqual([]);
    expect(mocks.selectCalls.some((c) => c.table === "library_spells")).toBe(false);
  });

  it("skips both reads entirely when nothing in the selection points at library content", async () => {
    queueSelect("traps", [{ id: "t1", name: "Pit" }]);
    const sources = await loadCopySources({ table: "traps", ids: ["t1"] });
    const notice = await resolveUnenabledSources("traps", sources.sourceRows, "camp-target");
    expect(notice).toBeNull();
    expect(mocks.eqCalls).toEqual([]);
  });
});
