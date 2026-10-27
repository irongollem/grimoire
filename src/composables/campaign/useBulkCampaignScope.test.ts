import { describe, expect, it, beforeEach, vi } from "vitest";
import { defineComponent, h } from "vue";
import { mount } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});

vi.mock("@/lib/supabase", () => ({ supabase: fake.client }));

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

const campaignOf = (table: string) => Object.fromEntries(fake.rows(table).map((r) => [r.id, r.campaign_id]));
const rowsOf = (count: number, prefix: string, campaign_id: string | null = "camp-old") =>
  Array.from({ length: count }, (_, i) => ({ id: `${prefix}${i}`, campaign_id }));

describe("useBulkCampaignScope", () => {
  beforeEach(() => fake.reset());

  it("moves 450 ids in three requests of 200/200/50 and leaves rows outside the selection alone", async () => {
    fake.seed("items", [...rowsOf(450, "id-"), { id: "not-selected", campaign_id: "camp-old" }]);
    const ids = Array.from({ length: 450 }, (_, i) => `id-${i}`);
    const { result, unmount } = withQueryClient(() => useBulkCampaignScope());

    const outcome = await result.mutateAsync({ table: "items", ids, campaignId: "camp-1" });

    expect(outcome.moved).toBe(450);
    expect(fake.rows("items").filter((r) => r.campaign_id === "camp-1")).toHaveLength(450);
    expect(campaignOf("items")["not-selected"]).toBe("camp-old");
    // A long id list travels in the URL, so the request count is the property.
    expect(fake.calls.filter((c) => c.op === "update")).toHaveLength(3);
    unmount();
  });

  it("sends the rows to 'all campaigns' with null", async () => {
    fake.seed("monsters", rowsOf(2, "m"));
    const { result, unmount } = withQueryClient(() => useBulkCampaignScope());
    await result.mutateAsync({ table: "monsters", ids: ["m0", "m1"], campaignId: null });
    expect(campaignOf("monsters")).toEqual({ m0: null, m1: null });
    unmount();
  });

  it("rejects the mutation when a chunk throws, saying how far it got", async () => {
    fake.seed("items", rowsOf(400, "id-"));
    // First chunk (ids 0-199) lands; the second (200-399) fails.
    fake.failNext("items", { message: "second chunk failed" }, { after: 1 });
    const ids = Array.from({ length: 400 }, (_, i) => `id-${i}`);
    const { result, unmount } = withQueryClient(() => useBulkCampaignScope());

    const failure = await result.mutateAsync({ table: "items", ids, campaignId: "camp-1" }).catch((e: unknown) => e);

    expect(failure).toMatchObject({ message: "second chunk failed", moved: 200 });
    expect(fake.rows("items").filter((r) => r.campaign_id === "camp-1")).toHaveLength(200);
    unmount();
  });

  it("invalidates the moved table's own list query key on success", async () => {
    fake.seed("puzzle_rooms", rowsOf(1, "a"));
    const { result, queryClient, unmount } = withQueryClient(() => useBulkCampaignScope());
    const spy = vi.spyOn(queryClient, "invalidateQueries");

    await result.mutateAsync({ table: "puzzle_rooms", ids: ["a0"], campaignId: "camp-1" });

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

  it("moves an NPC's npc_inventory rows along with it, and no other NPC's", async () => {
    fake.seed("npcs", rowsOf(3, "npc-"));
    fake.seed("npc_inventory", [
      { id: "i0", npc_id: "npc-0", campaign_id: "camp-old" },
      { id: "i1", npc_id: "npc-1", campaign_id: "camp-old" },
      { id: "i2", npc_id: "npc-2", campaign_id: "camp-old" },
    ]);
    const { result, unmount } = withQueryClient(() => useBulkCampaignScope());
    await result.mutateAsync({ table: "npcs", ids: ["npc-0", "npc-1"], campaignId: "camp-2" });

    expect(campaignOf("npc_inventory")).toEqual({ i0: "camp-2", i1: "camp-2", i2: "camp-old" });
    unmount();
  });

  const worldLink = (id: string, from: { kind: string; id: string }, to: { kind: string; id: string }) => ({
    id,
    campaign_id: "camp-old",
    from_kind: from.kind,
    from_id: from.id,
    to_kind: to.kind,
    to_id: to.id,
    from_npc_id: from.kind === "npc" ? from.id : null,
    to_npc_id: to.kind === "npc" ? to.id : null,
    from_faction_id: from.kind === "faction" ? from.id : null,
    to_faction_id: to.kind === "faction" ? to.id : null,
  });

  it("re-stamps a world link whose two ends both moved, and deletes one that would span two campaigns", async () => {
    fake.seed("npcs", [{ id: "npc-1", campaign_id: "camp-old" }, { id: "npc-2", campaign_id: "camp-old" }]);
    fake.seed("factions", [{ id: "fac-9", campaign_id: "camp-old" }]);
    fake.seed("world_links", [
      worldLink("both", { kind: "npc", id: "npc-1" }, { kind: "npc", id: "npc-2" }),
      worldLink("left-behind", { kind: "npc", id: "npc-1" }, { kind: "faction", id: "fac-9" }),
      worldLink("to-unreadable", { kind: "npc", id: "npc-9" }, { kind: "npc", id: "npc-2" }),
    ]);
    const { result, unmount } = withQueryClient(() => useBulkCampaignScope());
    const outcome = await result.mutateAsync({ table: "npcs", ids: ["npc-1", "npc-2"], campaignId: "camp-2" });

    // An end that cannot be read is not known to be general: its link goes rather than span two campaigns.
    expect(outcome.worldLinksRemoved).toBe(2);
    expect(campaignOf("world_links")).toEqual({ both: "camp-2" });
    unmount();
  });

  it("keeps a link between two moved factions and drops one to an NPC that stayed", async () => {
    fake.seed("factions", [{ id: "fac-1", campaign_id: "camp-old" }, { id: "fac-2", campaign_id: "camp-old" }]);
    fake.seed("npcs", [{ id: "npc-1", campaign_id: "camp-old" }]);
    fake.seed("world_links", [
      worldLink("pair", { kind: "faction", id: "fac-1" }, { kind: "faction", id: "fac-2" }),
      worldLink("to-npc", { kind: "faction", id: "fac-1" }, { kind: "npc", id: "npc-1" }),
    ]);
    const { result, unmount } = withQueryClient(() => useBulkCampaignScope());
    const outcome = await result.mutateAsync({ table: "factions", ids: ["fac-1", "fac-2"], campaignId: "camp-2" });

    expect(outcome.worldLinksRemoved).toBe(1);
    expect(campaignOf("world_links")).toEqual({ pair: "camp-2" });
    unmount();
  });

  it("keeps a link from a moved NPC to a general item, deity or place, and to one already in the target campaign, and drops one to a place in the old campaign", async () => {
    fake.seed("npcs", [{ id: "npc-1", campaign_id: "camp-old" }]);
    fake.seed("items", [{ id: "item-1", campaign_id: null }]);
    fake.seed("deities", [{ id: "deity-1", campaign_id: null }]);
    fake.seed("locations", [{ id: "loc-2", campaign_id: "camp-2" }, { id: "loc-1", campaign_id: "camp-old" }]);
    fake.seed("world_links", [
      worldLink("to-item", { kind: "npc", id: "npc-1" }, { kind: "item", id: "item-1" }),
      worldLink("to-deity", { kind: "npc", id: "npc-1" }, { kind: "deity", id: "deity-1" }),
      worldLink("to-there", { kind: "npc", id: "npc-1" }, { kind: "location", id: "loc-2" }),
      worldLink("to-old", { kind: "npc", id: "npc-1" }, { kind: "location", id: "loc-1" }),
    ]);
    const { result, unmount } = withQueryClient(() => useBulkCampaignScope());
    const outcome = await result.mutateAsync({ table: "npcs", ids: ["npc-1"], campaignId: "camp-2" });

    expect(outcome.worldLinksRemoved).toBe(1);
    expect(campaignOf("world_links")).toEqual({ "to-item": "camp-2", "to-deity": "camp-2", "to-there": "camp-2" });
    unmount();
  });

  it("deletes every world link of an entity moved to the general scope, which holds none", async () => {
    fake.seed("factions", [{ id: "fac-1", campaign_id: "camp-old" }, { id: "fac-2", campaign_id: "camp-old" }]);
    fake.seed("world_links", [worldLink("pair", { kind: "faction", id: "fac-1" }, { kind: "faction", id: "fac-2" })]);
    const { result, unmount } = withQueryClient(() => useBulkCampaignScope());
    await result.mutateAsync({ table: "factions", ids: ["fac-1", "fac-2"], campaignId: null });

    expect(fake.rows("world_links")).toEqual([]);
    unmount();
  });

  it("leaves another entity's world links alone", async () => {
    fake.seed("factions", [{ id: "fac-1", campaign_id: "camp-old" }, { id: "fac-3", campaign_id: "camp-old" }, { id: "fac-4", campaign_id: "camp-old" }]);
    fake.seed("world_links", [worldLink("elsewhere", { kind: "faction", id: "fac-3" }, { kind: "faction", id: "fac-4" })]);
    const { result, unmount } = withQueryClient(() => useBulkCampaignScope());
    await result.mutateAsync({ table: "factions", ids: ["fac-1"], campaignId: "camp-2" });
    expect(campaignOf("world_links")).toEqual({ elsewhere: "camp-old" });
    unmount();
  });

  it("re-stamps a kin link whose two NPCs both moved, and deletes one that would span two campaigns", async () => {
    fake.seed("npcs", [{ id: "npc-1", campaign_id: "camp-old" }, { id: "npc-2", campaign_id: "camp-old" }]);
    fake.seed("kin_links", [
      { id: "both", campaign_id: "camp-old", from_npc_id: "npc-1", to_npc_id: "npc-2" },
      { id: "left-behind", campaign_id: "camp-old", from_npc_id: "npc-1", to_npc_id: "npc-9" },
      { id: "to-pc", campaign_id: "camp-old", from_npc_id: "npc-2", to_npc_id: null },
      { id: "points-in", campaign_id: "camp-old", from_npc_id: "npc-9", to_npc_id: "npc-1" },
      { id: "unrelated", campaign_id: "camp-old", from_npc_id: "npc-7", to_npc_id: "npc-8" },
    ]);
    const { result, unmount } = withQueryClient(() => useBulkCampaignScope());
    const outcome = await result.mutateAsync({ table: "npcs", ids: ["npc-1", "npc-2"], campaignId: "camp-2" });

    expect(outcome.familyLinksRemoved).toBe(3);
    expect(campaignOf("kin_links")).toEqual({ both: "camp-2", unrelated: "camp-old" });
    unmount();
  });

  it("deletes every kin link of an NPC moved to the general scope, which holds none", async () => {
    fake.seed("npcs", [{ id: "npc-1", campaign_id: "camp-old" }, { id: "npc-2", campaign_id: "camp-old" }]);
    fake.seed("kin_links", [{ id: "both", campaign_id: "camp-old", from_npc_id: "npc-1", to_npc_id: "npc-2" }]);
    const { result, unmount } = withQueryClient(() => useBulkCampaignScope());
    await result.mutateAsync({ table: "npcs", ids: ["npc-1", "npc-2"], campaignId: null });

    expect(fake.rows("kin_links")).toEqual([]);
    unmount();
  });

  it("touches no join table for a table with no campaign-scoped children", async () => {
    fake.seed("items", [{ id: "item-1", campaign_id: "camp-old" }]);
    const { result, unmount } = withQueryClient(() => useBulkCampaignScope());
    await result.mutateAsync({ table: "items", ids: ["item-1"], campaignId: "camp-2" });

    expect(fake.calls.map((c) => c.target)).toEqual(["items"]);
    unmount();
  });

  it("stamps the full entity move count on the error when a child-table update fails", async () => {
    fake.seed("npcs", rowsOf(2, "npc-"));
    fake.seed("npc_inventory", [{ id: "i0", npc_id: "npc-0", campaign_id: "camp-old" }]);
    // The entity update, kin_links and world_links reads pass; npc_inventory fails.
    fake.failNext("npc_inventory", { message: "child update failed" });
    const { result, unmount } = withQueryClient(() => useBulkCampaignScope());

    const failure = await result.mutateAsync({ table: "npcs", ids: ["npc-0", "npc-1"], campaignId: "camp-2" }).catch((e: unknown) => e);

    expect(failure).toMatchObject({ message: "child update failed", moved: 2 });
    unmount();
  });

  it("skips the child tables entirely when nothing actually moved (RLS dropped every id)", async () => {
    // The caller owns none of these ids, so the update reports no row back.
    const { result, unmount } = withQueryClient(() => useBulkCampaignScope());

    const outcome = await result.mutateAsync({ table: "npcs", ids: ["not-mine"], campaignId: "camp-2" });

    expect(outcome.moved).toBe(0);
    expect(fake.calls.map((c) => c.target)).toEqual(["npcs"]);
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
