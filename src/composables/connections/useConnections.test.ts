import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h, reactive, ref } from "vue";
import { mount, flushPromises } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import type { TypeChoice } from "@/lib/worldLinks/connections";
import type { Connection } from "@/types/connections.types";

interface Op {
  table: string;
  verb: "select" | "insert" | "update" | "delete";
  values?: Record<string, unknown>;
  eqs: [string, unknown][];
}

const mocks = vi.hoisted(() => ({
  ops: [] as { table: string; verb: string; values?: Record<string, unknown>; eqs: [string, unknown][] }[],
  failOn: null as string | null,
  held: [] as { id: string }[],
  embed: vi.fn(),
}));
const store = reactive({ activeCampaignId: "camp-1" as string | null });

vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => store }));
vi.mock("@/lib/queueEmbeddings", () => ({ queueEmbeddingsInBackground: mocks.embed }));
vi.mock("@/lib/supabase", () => ({
  getCurrentUser: () => ({ id: "user-1" }),
  supabase: {
    rpc: () => Promise.resolve({ data: [], error: null }),
    from: (table: string) => {
      const op = { table, verb: "select", eqs: [] as [string, unknown][] } as Op;
      mocks.ops.push(op);
      const result = () => {
        const error = mocks.failOn === `${op.verb}:${table}` ? new Error("boom") : null;
        const rows = op.table === "world_links" && op.verb === "select" ? mocks.held : [];
        return { data: error ? null : op.table === "items" ? { name: "Moon Blade" } : rows, error };
      };
      const chain: Record<string, unknown> = {
        select: () => chain,
        order: () => chain,
        limit: () => chain,
        single: () => Promise.resolve(result()),
        insert: (values: Record<string, unknown>) => {
          op.verb = "insert";
          op.values = values;
          return chain;
        },
        update: (values: Record<string, unknown>) => {
          op.verb = "update";
          op.values = values;
          return chain;
        },
        delete: () => {
          op.verb = "delete";
          return chain;
        },
        eq: (col: string, val: unknown) => {
          op.eqs.push([col, val]);
          return chain;
        },
        // oxlint-disable-next-line unicorn/no-thenable -- the query builder is awaited without a terminal call
        then: (resolve: (v: unknown) => unknown) => Promise.resolve(result()).then(resolve),
      };
      return chain;
    },
  },
}));

const api = await import("./useConnections");

function withQueryClient<T>(setup: () => T) {
  let result!: T;
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
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

const writes = () => mocks.ops.filter((o) => o.verb !== "select");

const npc = { kind: "npc", id: "n1" } as const;
const choice = (over: Partial<TypeChoice> & Pick<TypeChoice, "key">): TypeChoice => ({
  word: over.key,
  subjectIsFrom: true,
  family: "bond",
  common: false,
  pair: "person_person",
  ...over,
});
const conn = (over: Partial<Connection>): Connection => ({
  source: "link",
  row_id: "row-1",
  type: "friend",
  outward: true,
  other_kind: "npc",
  other_id: "n2",
  other_name: "Wren",
  other_image: null,
  note: null,
  told: null,
  player_visible_to: null,
  ai_provenance: null,
  role: null,
  status: null,
  ...over,
});

beforeEach(() => {
  mocks.ops = [];
  mocks.failOn = null;
  mocks.held = [];
  mocks.embed.mockClear();
  store.activeCampaignId = "camp-1";
});

describe("useCampaignLinks", () => {
  it("reads the active campaign's links, scoped in the query itself", async () => {
    const { unmount } = withQueryClient(() => api.useCampaignLinks());
    await flushPromises();
    expect(mocks.ops[0]).toMatchObject({ table: "world_links", eqs: [["campaign_id", "camp-1"]] });
    unmount();
  });

  it("stays idle without a campaign", async () => {
    store.activeCampaignId = null;
    const { unmount } = withQueryClient(() => api.useCampaignLinks());
    await flushPromises();
    expect(mocks.ops).toEqual([]);
    unmount();
  });
});

describe("useUpdateTieAudience", () => {
  it("writes a link's audience to world_links and a membership's to the table of its person", async () => {
    const { result, unmount } = withQueryClient(() => api.useUpdateTieAudience());
    await result.mutateAsync({ connection: conn({}), subject: npc, playerVisibleTo: ["pc1"] });
    await result.mutateAsync({
      connection: conn({ source: "membership", row_id: "m-1", other_kind: "faction", other_id: "f1" }),
      subject: npc,
      playerVisibleTo: ["pc1"],
    });
    await result.mutateAsync({
      connection: conn({ source: "membership", row_id: "m-2", other_kind: "npc", other_id: "n9" }),
      subject: { kind: "faction", id: "f1" },
      playerVisibleTo: [],
    });
    await result.mutateAsync({
      connection: conn({ source: "membership", row_id: "m-3", other_kind: "party_member", other_id: "p9" }),
      subject: { kind: "faction", id: "f1" },
      playerVisibleTo: [],
    });
    expect(writes().map((w) => [w.table, w.values, w.eqs])).toEqual([
      ["world_links", { player_visible_to: ["pc1"] }, [["id", "row-1"]]],
      ["faction_npcs", { player_visible_to: ["pc1"] }, [["id", "m-1"]]],
      ["faction_npcs", { player_visible_to: [] }, [["id", "m-2"]]],
      ["faction_party_members", { player_visible_to: [] }, [["id", "m-3"]]],
    ]);
    await expect(result.mutateAsync({ connection: conn({ source: "kin" }), subject: npc, playerVisibleTo: [] })).rejects.toThrow();
    unmount();
  });
});

describe("useCampaignLinkEnds", () => {
  it("reads nothing while disabled, then only the ends of the campaign's links", async () => {
    const enabled = ref(false);
    const { unmount } = withQueryClient(() => api.useCampaignLinkEnds(enabled));
    await flushPromises();
    expect(mocks.ops).toEqual([]);
    enabled.value = true;
    await flushPromises();
    expect(mocks.ops[0]).toMatchObject({ table: "world_links", eqs: [["campaign_id", "camp-1"]] });
    unmount();
  });
});

describe("useCreateConnection", () => {
  const other = { kind: "location", id: "l1", name: "Harrow" } as const;

  it("changes the type of a faction's existing stance instead of inserting a second one", async () => {
    mocks.held = [{ id: "stance-1" }];
    const { result, unmount } = withQueryClient(() => api.useCreateConnection());
    await result.mutateAsync({
      subject: { kind: "faction", id: "f1" },
      other: { kind: "faction", id: "f2", name: "Toll-men" },
      choice: choice({ key: "rival", exclusive: true, pair: "faction_faction" }),
    });
    expect(writes()).toEqual([
      expect.objectContaining({ table: "world_links", verb: "update", values: { type: "rival" }, eqs: [["id", "stance-1"]] }),
    ]);
    unmount();
  });

  it("inserts a stance when the faction holds none towards that one", async () => {
    const { result, unmount } = withQueryClient(() => api.useCreateConnection());
    await result.mutateAsync({
      subject: { kind: "faction", id: "f1" },
      other: { kind: "faction", id: "f2", name: "Toll-men" },
      choice: choice({ key: "rival", exclusive: true, pair: "faction_faction" }),
    });
    expect(writes().map((w) => w.verb)).toEqual(["insert"]);
    unmount();
  });

  it("writes a plain link in the stored direction with its note, told line and visibility", async () => {
    const { result, unmount } = withQueryClient(() => api.useCreateConnection());
    await result.mutateAsync({
      subject: npc,
      other,
      choice: choice({ key: "works_at" }),
      note: "secret",
      told: "known",
      playerVisibleTo: ["pc1"],
    });
    expect(writes()).toEqual([
      expect.objectContaining({
        table: "world_links",
        verb: "insert",
        values: expect.objectContaining({
          from_kind: "npc",
          from_npc_id: "n1",
          to_kind: "location",
          to_location_id: "l1",
          type: "works_at",
          note: "secret",
          told: "known",
          player_visible_to: ["pc1"],
          campaign_id: "camp-1",
          user_id: "user-1",
        }),
      }),
    ]);
    expect(mocks.embed).toHaveBeenCalledWith("npc", ["n1"]);
    expect(mocks.embed).toHaveBeenCalledWith("location", ["l1"]);
    unmount();
  });

  it("writes a membership with the default role, to the table for the person's kind", async () => {
    const { result, unmount } = withQueryClient(() => api.useCreateConnection());
    await result.mutateAsync({
      subject: { kind: "party_member", id: "pc1" },
      other: { kind: "faction", id: "f1", name: "Guild" },
      choice: choice({ key: "member_of", home: "membership", family: "record" }),
    });
    expect(writes()[0]).toMatchObject({
      table: "faction_party_members",
      values: { party_member_id: "pc1", faction_id: "f1", role: "Member", user_id: "user-1" },
    });
    unmount();
  });

  it("reads a faction's sheet adding a member the same way round", async () => {
    const { result, unmount } = withQueryClient(() => api.useCreateConnection());
    await result.mutateAsync({
      subject: { kind: "faction", id: "f1" },
      other: { kind: "npc", id: "n9", name: "Harl" },
      choice: choice({ key: "member_of", home: "membership", subjectIsFrom: false, family: "record" }),
      role: "Patron",
    });
    expect(writes()[0]).toMatchObject({ table: "faction_npcs", values: { npc_id: "n9", faction_id: "f1", role: "Patron" } });
    unmount();
  });

  it("stores a child as the other person's parent link", async () => {
    const { result, unmount } = withQueryClient(() => api.useCreateConnection());
    await result.mutateAsync({
      subject: npc,
      other: { kind: "npc", id: "n2", name: "Brenna" },
      choice: choice({ key: "parent_of", home: "kin", subjectIsFrom: false, family: "record" }),
    });
    expect(writes()[0]).toMatchObject({
      table: "kin_links",
      values: { kind: "parent", from_npc_id: "n2", to_npc_id: "n1", campaign_id: "camp-1", user_id: "user-1" },
    });
    unmount();
  });

  it("sets a single column on the owning row", async () => {
    const { result, unmount } = withQueryClient(() => api.useCreateConnection());
    await result.mutateAsync({ subject: npc, other, choice: choice({ key: "lives_in", home: "npc_home", single: true }) });
    await result.mutateAsync({
      subject: { kind: "location", id: "l1" },
      other: { kind: "npc", id: "n1", name: "Harl" },
      choice: choice({ key: "keeps", home: "keeper", subjectIsFrom: false }),
    });
    expect(writes()).toEqual([
      expect.objectContaining({ table: "npcs", verb: "update", values: { location_id: "l1" }, eqs: [["id", "n1"]] }),
      expect.objectContaining({ table: "locations", verb: "update", values: { npc_owner_id: "n1" }, eqs: [["id", "l1"]] }),
    ]);
    unmount();
  });

  it("writes a pack row with the item's name, fetching it when the item is the subject", async () => {
    const { result, unmount } = withQueryClient(() => api.useCreateConnection());
    await result.mutateAsync({
      subject: { kind: "item", id: "i1" },
      other: { kind: "party_member", id: "pc1", name: "Ysolde" },
      choice: choice({ key: "carries", home: "inventory", subjectIsFrom: false }),
    });
    expect(writes()[0]).toMatchObject({
      table: "party_inventory",
      values: { carried_by: "pc1", item_id: "i1", name: "Moon Blade", quantity: 1, campaign_id: "camp-1" },
    });
    unmount();
  });

  it("refuses a quest record and writes nothing", async () => {
    const { result, unmount } = withQueryClient(() => api.useCreateConnection());
    await expect(
      result.mutateAsync({ subject: npc, other, choice: choice({ key: "quest_giver", home: "quest" }) }),
    ).rejects.toThrow(/quest/);
    expect(writes()).toEqual([]);
    unmount();
  });

  it("throws the database error", async () => {
    mocks.failOn = "insert:world_links";
    const { result, unmount } = withQueryClient(() => api.useCreateConnection());
    await expect(result.mutateAsync({ subject: npc, other, choice: choice({ key: "works_at" }) })).rejects.toThrow("boom");
    unmount();
  });
});

describe("useUpdateLink", () => {
  it("patches only what it is given", async () => {
    const { result, unmount } = withQueryClient(() => api.useUpdateLink());
    await result.mutateAsync({ id: "lk1", told: "now known", playerVisibleTo: [] });
    expect(writes()[0]).toMatchObject({
      table: "world_links",
      values: { told: "now known", player_visible_to: [] },
      eqs: [["id", "lk1"]],
    });
    expect(writes()[0]?.values).not.toHaveProperty("note");
    unmount();
  });
});

describe("useRemoveConnection", () => {
  it("deletes a link", async () => {
    const { result, unmount } = withQueryClient(() => api.useRemoveConnection());
    await result.mutateAsync({ connection: conn({}), subject: npc });
    expect(writes()).toEqual([expect.objectContaining({ table: "world_links", verb: "delete", eqs: [["id", "row-1"]] })]);
    unmount();
  });

  it("clears a single column only while it still names the far end", async () => {
    const { result, unmount } = withQueryClient(() => api.useRemoveConnection());
    await result.mutateAsync({
      connection: conn({ source: "npc_home", row_id: "n1", type: "lives_in", other_kind: "location", other_id: "l1" }),
      subject: npc,
    });
    expect(writes()[0]).toMatchObject({
      table: "npcs",
      verb: "update",
      values: { location_id: null },
      eqs: [["id", "n1"], ["location_id", "l1"]],
    });
    unmount();
  });

  it("deletes the membership row from the person's table when seen from the faction", async () => {
    const { result, unmount } = withQueryClient(() => api.useRemoveConnection());
    await result.mutateAsync({
      connection: conn({ source: "membership", row_id: "m1", other_kind: "party_member", other_id: "pc1", outward: false }),
      subject: { kind: "faction", id: "f1" },
    });
    expect(writes()[0]).toMatchObject({ table: "faction_party_members", verb: "delete", eqs: [["id", "m1"]] });
    unmount();
  });

  it("clears a keeper from the location row, from either side", async () => {
    const { result, unmount } = withQueryClient(() => api.useRemoveConnection());
    await result.mutateAsync({
      connection: conn({ source: "keeper", row_id: "l1", other_kind: "location", other_id: "l1" }),
      subject: npc,
    });
    expect(writes()[0]).toMatchObject({ table: "locations", values: { npc_owner_id: null }, eqs: [["id", "l1"], ["npc_owner_id", "n1"]] });
    unmount();
  });
});

describe("useRetypeConnection", () => {
  it("changes a link's type in one update and leaves the ends alone when the direction holds", async () => {
    const { result, unmount } = withQueryClient(() => api.useRetypeConnection());
    await result.mutateAsync({ connection: conn({}), subject: npc, choice: choice({ key: "ally" }) });
    expect(writes()).toEqual([expect.objectContaining({ table: "world_links", verb: "update", values: { type: "ally" } })]);
    unmount();
  });

  it("re-aims a link in the same statement when the direction flips", async () => {
    const { result, unmount } = withQueryClient(() => api.useRetypeConnection());
    await result.mutateAsync({
      connection: conn({ type: "mentor_of", outward: true }),
      subject: npc,
      choice: choice({ key: "mentor_of", subjectIsFrom: false }),
    });
    expect(writes()).toHaveLength(1);
    expect(writes()[0]?.values).toMatchObject({
      type: "mentor_of",
      from_kind: "npc",
      from_npc_id: "n2",
      to_kind: "npc",
      to_npc_id: "n1",
      from_location_id: null,
      to_faction_id: null,
    });
    unmount();
  });

  it("retypes a kin row in place", async () => {
    const { result, unmount } = withQueryClient(() => api.useRetypeConnection());
    await result.mutateAsync({
      connection: conn({ source: "kin", row_id: "k1", type: "sibling_of" }),
      subject: npc,
      choice: choice({ key: "parent_of", home: "kin", subjectIsFrom: false, family: "record" }),
    });
    expect(writes()).toEqual([
      expect.objectContaining({
        table: "kin_links",
        verb: "update",
        values: expect.objectContaining({ kind: "parent", from_npc_id: "n2", to_npc_id: "n1" }),
        eqs: [["id", "k1"]],
      }),
    ]);
    unmount();
  });

  it("across homes writes the new tie first, carries the note, then removes the old one", async () => {
    const { result, unmount } = withQueryClient(() => api.useRetypeConnection());
    await result.mutateAsync({
      connection: conn({ note: "kept" }),
      subject: npc,
      choice: choice({ key: "sibling_of", home: "kin", family: "record" }),
    });
    expect(writes().map((o) => `${o.verb}:${o.table}`)).toEqual(["insert:kin_links", "delete:world_links"]);
    expect(writes()[0]?.values).toMatchObject({ note: "kept", kind: "sibling" });
    unmount();
  });

  it("keeps the old tie when the new one fails", async () => {
    mocks.failOn = "insert:kin_links";
    const { result, unmount } = withQueryClient(() => api.useRetypeConnection());
    await expect(
      result.mutateAsync({ connection: conn({}), subject: npc, choice: choice({ key: "sibling_of", home: "kin", family: "record" }) }),
    ).rejects.toThrow("boom");
    expect(writes().map((o) => o.verb)).toEqual(["insert"]);
    unmount();
  });
});
