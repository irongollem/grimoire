import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h, reactive, ref } from "vue";
import { mount, flushPromises } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import type { TypeChoice } from "@/lib/worldLinks/connections";
import type { Connection } from "@/types/connections.types";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});
const embed = vi.hoisted(() => vi.fn());
const store = reactive({ activeCampaignId: "camp-1" as string | null });

vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => store }));
vi.mock("@/lib/queueEmbeddings", () => ({ queueEmbeddingsInBackground: embed }));
vi.mock("@/lib/supabase", () => ({ supabase: fake.client, getCurrentUser: () => ({ id: "user-1" }) }));

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
/** A stored world_links row from `n1` to `n2`, in the columns the table keeps. */
const npcLink = (over: Record<string, unknown> = {}) => ({
  id: "row-1",
  campaign_id: "camp-1",
  from_kind: "npc",
  from_npc_id: "n1",
  to_kind: "npc",
  to_npc_id: "n2",
  type: "friend",
  note: "",
  player_visible_to: [],
  ...over,
});

beforeEach(() => {
  fake.reset();
  embed.mockClear();
  store.activeCampaignId = "camp-1";
});

describe("useCampaignLinks", () => {
  it("returns the active campaign's links, never another campaign's", async () => {
    fake.seed("world_links", [npcLink({ id: "mine" }), npcLink({ id: "theirs", campaign_id: "camp-2" })]);
    const { result, unmount } = withQueryClient(() => api.useCampaignLinks());
    await vi.waitFor(() => expect(result.data.value?.map((l) => l.id)).toEqual(["mine"]));
    unmount();
  });

  it("stays idle without a campaign", async () => {
    store.activeCampaignId = null;
    const { unmount } = withQueryClient(() => api.useCampaignLinks());
    await flushPromises();
    expect(fake.calls).toEqual([]);
    unmount();
  });

  it("reports a failed read instead of an empty web", async () => {
    fake.failNext("world_links", { message: "boom" });
    const { result, unmount } = withQueryClient(() => api.useCampaignLinks());
    await vi.waitFor(() => expect(result.isError.value).toBe(true));
    unmount();
  });
});

describe("useCampaignLinkEnds", () => {
  it("reads nothing while disabled, then only the active campaign's links", async () => {
    fake.seed("world_links", [npcLink({ id: "mine" }), npcLink({ id: "theirs", campaign_id: "camp-2" })]);
    const enabled = ref(false);
    const { result, unmount } = withQueryClient(() => api.useCampaignLinkEnds(enabled));
    await flushPromises();
    expect(fake.calls).toEqual([]);
    enabled.value = true;
    await vi.waitFor(() => expect(result.data.value).toHaveLength(1));
    unmount();
  });
});

describe("useUpdateTieAudience", () => {
  const audienceOf = (table: string, id: string) => fake.rows(table).find((r) => r.id === id)?.player_visible_to;

  beforeEach(() => {
    fake.seed("world_links", [npcLink({ id: "row-1" }), npcLink({ id: "row-2" })]);
    fake.seed("faction_npcs", [{ id: "m-1", player_visible_to: [] }, { id: "m-2", player_visible_to: [] }]);
    fake.seed("faction_party_members", [{ id: "m-1", player_visible_to: [] }]);
  });

  it("writes a link's audience to that link only", async () => {
    const { result, unmount } = withQueryClient(() => api.useUpdateTieAudience());
    await result.mutateAsync({ connection: conn({}), subject: npc, playerVisibleTo: ["pc1"] });
    expect(audienceOf("world_links", "row-1")).toEqual(["pc1"]);
    expect(audienceOf("world_links", "row-2")).toEqual([]);
    unmount();
  });

  it("writes a membership's audience to the table of its person, seen from either side", async () => {
    const { result, unmount } = withQueryClient(() => api.useUpdateTieAudience());
    await result.mutateAsync({
      connection: conn({ source: "membership", row_id: "m-1", other_kind: "faction", other_id: "f1" }),
      subject: npc,
      playerVisibleTo: ["pc1"],
    });
    await result.mutateAsync({
      connection: conn({ source: "membership", row_id: "m-2", other_kind: "npc", other_id: "n9" }),
      subject: { kind: "faction", id: "f1" },
      playerVisibleTo: ["pc2"],
    });
    await result.mutateAsync({
      connection: conn({ source: "membership", row_id: "m-1", other_kind: "party_member", other_id: "p9" }),
      subject: { kind: "faction", id: "f1" },
      playerVisibleTo: ["pc3"],
    });
    expect(audienceOf("faction_npcs", "m-1")).toEqual(["pc1"]);
    expect(audienceOf("faction_npcs", "m-2")).toEqual(["pc2"]);
    expect(audienceOf("faction_party_members", "m-1")).toEqual(["pc3"]);
    unmount();
  });

  it("refuses a tie whose record has no audience of its own", async () => {
    const { result, unmount } = withQueryClient(() => api.useUpdateTieAudience());
    await expect(
      result.mutateAsync({ connection: conn({ source: "kin" }), subject: npc, playerVisibleTo: [] }),
    ).rejects.toThrow();
    unmount();
  });
});

describe("useCreateConnection", () => {
  const other = { kind: "location", id: "l1", name: "Harrow" } as const;
  const stance = (id: string, over: Record<string, unknown> = {}) => ({
    id,
    campaign_id: "camp-1",
    from_kind: "faction",
    from_id: "f1",
    to_kind: "faction",
    to_id: "f2",
    type: "ally",
    note: "kept",
    ...over,
  });
  const rival = {
    subject: { kind: "faction", id: "f1" },
    other: { kind: "faction", id: "f2", name: "Toll-men" },
    choice: choice({ key: "rival", exclusive: true, pair: "faction_faction" }),
  } as const;

  it("changes the type of a faction's existing stance towards that faction instead of adding a second one", async () => {
    fake.seed("world_links", [stance("stance-1")]);
    const { result, unmount } = withQueryClient(() => api.useCreateConnection());
    await result.mutateAsync(rival);
    expect(fake.rows("world_links")).toMatchObject([{ id: "stance-1", type: "rival", note: "kept" }]);
    unmount();
  });

  it("adds a stance when the faction holds none towards that one, whatever it holds towards others or in other campaigns", async () => {
    fake.seed("world_links", [
      stance("to-other-faction", { to_id: "f3" }),
      stance("other-campaign", { campaign_id: "camp-2" }),
      stance("reverse-direction", { from_id: "f2", to_id: "f1" }),
      stance("from-another-faction", { from_id: "f9" }),
    ]);
    const { result, unmount } = withQueryClient(() => api.useCreateConnection());
    await result.mutateAsync(rival);
    const links = fake.rows("world_links");
    expect(links).toHaveLength(5);
    expect(links.filter((l) => l.type === "rival")).toHaveLength(1);
    expect(links.find((l) => l.id === "to-other-faction")?.type).toBe("ally");
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
    expect(fake.rows("world_links")).toMatchObject([
      {
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
      },
    ]);
    // What a thing is tied to is part of what it says: both ends are re-embedded.
    expect(embed).toHaveBeenCalledWith("npc", ["n1"]);
    expect(embed).toHaveBeenCalledWith("location", ["l1"]);
    unmount();
  });

  it("sends no note, told line or audience that was not given, so the table defaults hold", async () => {
    const { result, unmount } = withQueryClient(() => api.useCreateConnection());
    await result.mutateAsync({ subject: npc, other, choice: choice({ key: "works_at" }) });
    const [row] = fake.rows("world_links");
    expect(row).not.toHaveProperty("note");
    expect(row).not.toHaveProperty("told");
    expect(row).not.toHaveProperty("player_visible_to");
    unmount();
  });

  it("writes a membership with the default role, to the table for the person's kind", async () => {
    const { result, unmount } = withQueryClient(() => api.useCreateConnection());
    await result.mutateAsync({
      subject: { kind: "party_member", id: "pc1" },
      other: { kind: "faction", id: "f1", name: "Guild" },
      choice: choice({ key: "member_of", home: "membership", family: "record" }),
    });
    expect(fake.rows("faction_party_members")).toMatchObject([
      { party_member_id: "pc1", faction_id: "f1", role: "Member", user_id: "user-1" },
    ]);
    expect(fake.rows("faction_npcs")).toEqual([]);
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
    expect(fake.rows("faction_npcs")).toMatchObject([{ npc_id: "n9", faction_id: "f1", role: "Patron" }]);
    unmount();
  });

  it("stores a child as the other person's parent link", async () => {
    const { result, unmount } = withQueryClient(() => api.useCreateConnection());
    await result.mutateAsync({
      subject: npc,
      other: { kind: "npc", id: "n2", name: "Brenna" },
      choice: choice({ key: "parent_of", home: "kin", subjectIsFrom: false, family: "record" }),
    });
    expect(fake.rows("kin_links")).toMatchObject([
      { kind: "parent", from_npc_id: "n2", to_npc_id: "n1", campaign_id: "camp-1", user_id: "user-1" },
    ]);
    unmount();
  });

  it("sets a single column on the owning row and no other", async () => {
    fake.seed("npcs", [{ id: "n1", location_id: null }, { id: "n2", location_id: null }]);
    fake.seed("locations", [{ id: "l1", npc_owner_id: null }, { id: "l2", npc_owner_id: null }]);
    const { result, unmount } = withQueryClient(() => api.useCreateConnection());
    await result.mutateAsync({ subject: npc, other, choice: choice({ key: "lives_in", home: "npc_home", single: true }) });
    await result.mutateAsync({
      subject: { kind: "location", id: "l1" },
      other: { kind: "npc", id: "n1", name: "Harl" },
      choice: choice({ key: "keeps", home: "keeper", subjectIsFrom: false }),
    });
    expect(fake.rows("npcs")).toEqual([{ id: "n1", location_id: "l1" }, { id: "n2", location_id: null }]);
    expect(fake.rows("locations")).toEqual([{ id: "l1", npc_owner_id: "n1" }, { id: "l2", npc_owner_id: null }]);
    unmount();
  });

  it("writes a pack row with the item's name, looked up when the item is the subject", async () => {
    fake.seed("items", [{ id: "i1", name: "Moon Blade" }, { id: "i2", name: "Wrong Item" }]);
    const { result, unmount } = withQueryClient(() => api.useCreateConnection());
    await result.mutateAsync({
      subject: { kind: "item", id: "i1" },
      other: { kind: "party_member", id: "pc1", name: "Ysolde" },
      choice: choice({ key: "carries", home: "inventory", subjectIsFrom: false }),
    });
    expect(fake.rows("party_inventory")).toMatchObject([
      { carried_by: "pc1", item_id: "i1", name: "Moon Blade", quantity: 1, campaign_id: "camp-1" },
    ]);
    unmount();
  });

  it("takes the item's name from the picked item without a lookup when the item is the other end", async () => {
    const { result, unmount } = withQueryClient(() => api.useCreateConnection());
    await result.mutateAsync({
      subject: npc,
      other: { kind: "item", id: "i7", name: "Lantern" },
      choice: choice({ key: "carries", home: "inventory" }),
    });
    expect(fake.rows("npc_inventory")).toMatchObject([{ npc_id: "n1", item_id: "i7", name: "Lantern" }]);
    expect(fake.calls.some((c) => c.target === "items")).toBe(false);
    unmount();
  });

  it("refuses a quest record and writes nothing", async () => {
    const { result, unmount } = withQueryClient(() => api.useCreateConnection());
    await expect(
      result.mutateAsync({ subject: npc, other, choice: choice({ key: "quest_giver", home: "quest" }) }),
    ).rejects.toThrow(/quest/);
    expect(fake.calls.filter((c) => c.op !== "select")).toEqual([]);
    unmount();
  });

  it("throws the database error and writes nothing", async () => {
    fake.failNext("world_links", { message: "boom" });
    const { result, unmount } = withQueryClient(() => api.useCreateConnection());
    await expect(result.mutateAsync({ subject: npc, other, choice: choice({ key: "works_at" }) })).rejects.toMatchObject({
      message: "boom",
    });
    expect(fake.rows("world_links")).toEqual([]);
    unmount();
  });
});

describe("useUpdateLink", () => {
  it("patches only what it is given, on that link only", async () => {
    fake.seed("world_links", [npcLink({ id: "lk1", note: "dm only" }), npcLink({ id: "lk2" })]);
    const { result, unmount } = withQueryClient(() => api.useUpdateLink());
    await result.mutateAsync({ id: "lk1", told: "now known", playerVisibleTo: [] });
    expect(fake.rows("world_links")).toMatchObject([
      { id: "lk1", note: "dm only", told: "now known", player_visible_to: [] },
      { id: "lk2", note: "" },
    ]);
    expect(fake.rows("world_links")[1]).not.toHaveProperty("told");
    unmount();
  });
});

describe("useRemoveConnection", () => {
  it("deletes a link and no other", async () => {
    fake.seed("world_links", [npcLink({ id: "row-1" }), npcLink({ id: "row-2" })]);
    const { result, unmount } = withQueryClient(() => api.useRemoveConnection());
    await result.mutateAsync({ connection: conn({}), subject: npc });
    expect(fake.rows("world_links").map((l) => l.id)).toEqual(["row-2"]);
    unmount();
  });

  it("clears a single column while it still names the far end", async () => {
    fake.seed("npcs", [{ id: "n1", location_id: "l1" }]);
    const { result, unmount } = withQueryClient(() => api.useRemoveConnection());
    await result.mutateAsync({
      connection: conn({ source: "npc_home", row_id: "n1", type: "lives_in", other_kind: "location", other_id: "l1" }),
      subject: npc,
    });
    expect(fake.rows("npcs")).toEqual([{ id: "n1", location_id: null }]);
    unmount();
  });

  it("leaves a column alone once someone has re-pointed it at another place", async () => {
    fake.seed("npcs", [{ id: "n1", location_id: "l9" }]);
    const { result, unmount } = withQueryClient(() => api.useRemoveConnection());
    await result.mutateAsync({
      connection: conn({ source: "npc_home", row_id: "n1", type: "lives_in", other_kind: "location", other_id: "l1" }),
      subject: npc,
    });
    expect(fake.rows("npcs")).toEqual([{ id: "n1", location_id: "l9" }]);
    unmount();
  });

  it("deletes the membership row from the person's table when seen from the faction", async () => {
    fake.seed("faction_party_members", [{ id: "m1" }, { id: "m2" }]);
    fake.seed("faction_npcs", [{ id: "m1" }]);
    const { result, unmount } = withQueryClient(() => api.useRemoveConnection());
    await result.mutateAsync({
      connection: conn({ source: "membership", row_id: "m1", other_kind: "party_member", other_id: "pc1", outward: false }),
      subject: { kind: "faction", id: "f1" },
    });
    expect(fake.rows("faction_party_members")).toEqual([{ id: "m2" }]);
    expect(fake.rows("faction_npcs")).toEqual([{ id: "m1" }]);
    unmount();
  });

  it("deletes an NPC's membership from the NPC table when seen from the faction", async () => {
    fake.seed("faction_party_members", [{ id: "m1" }]);
    fake.seed("faction_npcs", [{ id: "m1" }]);
    const { result, unmount } = withQueryClient(() => api.useRemoveConnection());
    await result.mutateAsync({
      connection: conn({ source: "membership", row_id: "m1", other_kind: "npc", other_id: "n1", outward: false }),
      subject: { kind: "faction", id: "f1" },
    });
    expect(fake.rows("faction_npcs")).toEqual([]);
    expect(fake.rows("faction_party_members")).toEqual([{ id: "m1" }]);
    unmount();
  });

  it("clears a keeper from the location row only while it is still that keeper", async () => {
    fake.seed("locations", [{ id: "l1", npc_owner_id: "n1" }, { id: "l2", npc_owner_id: "n8" }]);
    const { result, unmount } = withQueryClient(() => api.useRemoveConnection());
    await result.mutateAsync({
      connection: conn({ source: "keeper", row_id: "l1", other_kind: "location", other_id: "l1" }),
      subject: npc,
    });
    expect(fake.rows("locations")).toEqual([{ id: "l1", npc_owner_id: null }, { id: "l2", npc_owner_id: "n8" }]);
    unmount();
  });

  it("refuses to remove a quest's tie from here", async () => {
    const { result, unmount } = withQueryClient(() => api.useRemoveConnection());
    await expect(result.mutateAsync({ connection: conn({ source: "quest" }), subject: npc })).rejects.toThrow(/quest/);
    unmount();
  });
});

describe("useRetypeConnection", () => {
  it("changes a link's type in place and leaves its ends alone when the direction holds", async () => {
    fake.seed("world_links", [npcLink()]);
    const { result, unmount } = withQueryClient(() => api.useRetypeConnection());
    await result.mutateAsync({ connection: conn({}), subject: npc, choice: choice({ key: "ally" }) });
    expect(fake.rows("world_links")).toEqual([npcLink({ type: "ally" })]);
    unmount();
  });

  it("re-aims a link when the direction flips, clearing the old ends", async () => {
    fake.seed("world_links", [npcLink({ type: "mentor_of", from_location_id: "stale" })]);
    const { result, unmount } = withQueryClient(() => api.useRetypeConnection());
    await result.mutateAsync({
      connection: conn({ type: "mentor_of", outward: true }),
      subject: npc,
      choice: choice({ key: "mentor_of", subjectIsFrom: false }),
    });
    expect(fake.rows("world_links")).toMatchObject([
      { type: "mentor_of", from_kind: "npc", from_npc_id: "n2", to_kind: "npc", to_npc_id: "n1", from_location_id: null },
    ]);
    unmount();
  });

  describe("a kin row, in place", () => {
    const kinRow = (over: Record<string, unknown>) => ({
      id: "k1",
      kind: "sibling",
      from_npc_id: "n1",
      to_npc_id: "n2",
      from_party_member_id: null,
      to_party_member_id: null,
      parent_role: null,
      adoptive: false,
      ...over,
    });

    it("becomes a parent link pointing from the other person to the subject", async () => {
      fake.seed("kin_links", [kinRow({})]);
      const { result, unmount } = withQueryClient(() => api.useRetypeConnection());
      await result.mutateAsync({
        connection: conn({ source: "kin", row_id: "k1", type: "sibling_of" }),
        subject: npc,
        choice: choice({ key: "parent_of", home: "kin", subjectIsFrom: false, family: "record" }),
      });
      expect(fake.rows("kin_links")).toMatchObject([{ id: "k1", kind: "parent", from_npc_id: "n2", to_npc_id: "n1" }]);
      unmount();
    });

    it("keeps a parent's father or mother role across a flip of direction", async () => {
      fake.seed("kin_links", [kinRow({ kind: "parent", parent_role: "mother", adoptive: true })]);
      const { result, unmount } = withQueryClient(() => api.useRetypeConnection());
      await result.mutateAsync({
        connection: conn({ source: "kin", row_id: "k1", type: "parent_of", role: "mother" }),
        subject: npc,
        choice: choice({ key: "parent_of", home: "kin", subjectIsFrom: false, family: "record" }),
      });
      expect(fake.rows("kin_links")).toMatchObject([{ kind: "parent", parent_role: "mother", adoptive: true, from_npc_id: "n2" }]);
      unmount();
    });

    it("clears the parent role and adoption when it stops being a parent link", async () => {
      fake.seed("kin_links", [kinRow({ kind: "parent", parent_role: "father", adoptive: true })]);
      const { result, unmount } = withQueryClient(() => api.useRetypeConnection());
      await result.mutateAsync({
        connection: conn({ source: "kin", row_id: "k1", type: "parent_of", role: "father" }),
        subject: npc,
        choice: choice({ key: "sibling_of", home: "kin", family: "record" }),
      });
      expect(fake.rows("kin_links")).toMatchObject([{ kind: "sibling", parent_role: null, adoptive: false }]);
      unmount();
    });
  });

  it("across homes writes the new tie with the note carried over, then removes the old one", async () => {
    fake.seed("world_links", [npcLink({ note: "kept" })]);
    const { result, unmount } = withQueryClient(() => api.useRetypeConnection());
    await result.mutateAsync({
      connection: conn({ note: "kept" }),
      subject: npc,
      choice: choice({ key: "sibling_of", home: "kin", family: "record" }),
    });
    expect(fake.rows("world_links")).toEqual([]);
    expect(fake.rows("kin_links")).toMatchObject([{ kind: "sibling", note: "kept" }]);
    unmount();
  });

  it("keeps the old tie when the new one fails", async () => {
    fake.seed("world_links", [npcLink()]);
    fake.failNext("kin_links", { message: "boom" });
    const { result, unmount } = withQueryClient(() => api.useRetypeConnection());
    await expect(
      result.mutateAsync({ connection: conn({}), subject: npc, choice: choice({ key: "sibling_of", home: "kin", family: "record" }) }),
    ).rejects.toMatchObject({ message: "boom" });
    expect(fake.rows("world_links")).toHaveLength(1);
    unmount();
  });
});
