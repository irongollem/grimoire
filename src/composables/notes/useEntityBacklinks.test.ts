import { describe, it, expect, beforeEach, vi } from "vitest";
import { defineComponent, h, ref } from "vue";
import { mount, flushPromises } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";

const activeCampaignId = ref<string | null>("campaign-1");

// `useEntityBacklinks` reads the store through `storeToRefs`, which (per
// Pinia's own implementation) only picks up a property whose value is
// itself a ref or reactive — a plain getter unwrapping `.value` doesn't
// qualify, so the mock hands the ref straight through, as
// MonsterDetail.test.ts's campaign-store mock already does.
vi.mock("@/stores/campaign", () => ({
  useCampaignStore: () => ({ activeCampaignId }),
}));

function mentionNode(id: string) {
  return { type: "entityMention", attrs: { id, entityType: "npc", label: "Someone" } };
}
function doc(...nodes: unknown[]) {
  return JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: nodes }] });
}

const mocks = vi.hoisted(() => ({
  rowsByTable: {} as Record<string, unknown[]>,
  calls: [] as { table: string; method: string; args: unknown[] }[],
}));

function makeQueryChain(table: string) {
  const chain = Promise.resolve({ data: mocks.rowsByTable[table] ?? [], error: null }) as
    Promise<{ data: unknown[]; error: null }> & Record<string, (...args: unknown[]) => unknown>;
  for (const method of ["select", "eq", "neq", "like", "or"]) {
    chain[method] = (...args: unknown[]) => {
      mocks.calls.push({ table, method, args });
      return chain;
    };
  }
  return chain;
}

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: (table: string) => makeQueryChain(table),
  },
}));

const { useEntityBacklinks } = await import("@/composables/notes/useEntityBacklinks");

function withQueryClient<T>(setup: () => T): { result: T; unmount: () => void } {
  let result!: T;
  const wrapper = mount(
    defineComponent({
      setup() {
        result = setup();
        return () => h("div");
      },
    }),
    { global: { plugins: [[VueQueryPlugin, { queryClient: new QueryClient() }]] } },
  );
  return { result, unmount: () => wrapper.unmount() };
}

describe("useEntityBacklinks", () => {
  beforeEach(() => {
    activeCampaignId.value = "campaign-1";
    mocks.rowsByTable = {};
    mocks.calls = [];
  });

  it("returns notes confirmed to mention the entity, sorted by title", async () => {
    mocks.rowsByTable.notes = [
      { id: "note-b", title: "Bravo", content: doc(mentionNode("npc-1")) },
      { id: "note-a", title: "Alpha", content: doc(mentionNode("npc-1")) },
    ];
    const { result, unmount } = withQueryClient(() => useEntityBacklinks(ref("npc-1")));
    await flushPromises();
    expect(result.data.value).toEqual([
      { kind: "note", id: "note-a", title: "Alpha", to: "/notes/note-a" },
      { kind: "note", id: "note-b", title: "Bravo", to: "/notes/note-b" },
    ]);
    unmount();
  });

  it("drops a substring-only match that the like filter surfaced but no mention node confirms", async () => {
    mocks.rowsByTable.notes = [
      { id: "note-1", title: "False Positive", content: doc(mentionNode("npc-123")) },
    ];
    const { result, unmount } = withQueryClient(() => useEntityBacklinks(ref("npc-1")));
    await flushPromises();
    expect(result.data.value).toEqual([]);
    unmount();
  });

  it("drops a row with malformed JSON content instead of throwing", async () => {
    mocks.rowsByTable.notes = [{ id: "note-1", title: "Broken", content: "{not json" }];
    const { result, unmount } = withQueryClient(() => useEntityBacklinks(ref("npc-1")));
    await flushPromises();
    expect(result.data.value).toEqual([]);
    unmount();
  });

  it("does not query when there is no entity id", async () => {
    const { result, unmount } = withQueryClient(() => useEntityBacklinks(ref(null)));
    await flushPromises();
    expect(mocks.calls).toEqual([]);
    expect(result.data.value).toBeUndefined();
    unmount();
  });

  it("does not query when there is no active campaign", async () => {
    activeCampaignId.value = null;
    const { result, unmount } = withQueryClient(() => useEntityBacklinks(ref("npc-1")));
    await flushPromises();
    expect(mocks.calls).toEqual([]);
    expect(result.data.value).toBeUndefined();
    unmount();
  });

  it("scopes the notes query to the active campaign and a content substring match", async () => {
    const { unmount } = withQueryClient(() => useEntityBacklinks(ref("npc-1")));
    await flushPromises();
    expect(mocks.calls).toContainEqual({ table: "notes", method: "eq", args: ["campaign_id", "campaign-1"] });
    expect(mocks.calls).toContainEqual({ table: "notes", method: "like", args: ["content", "%npc-1%"] });
    unmount();
  });

  it("returns a confirmed mention from a non-note source (an NPC's lore fields)", async () => {
    mocks.rowsByTable.npcs = [
      {
        id: "npc-2",
        name: "Innkeeper Rosa",
        appearance: null,
        personality: doc(mentionNode("npc-1")),
        backstory: null,
        notes: null,
      },
    ];
    const { result, unmount } = withQueryClient(() => useEntityBacklinks(ref("npc-1")));
    await flushPromises();
    expect(result.data.value).toEqual([
      { kind: "npc", id: "npc-2", title: "Innkeeper Rosa", to: "/npcs/npc-2" },
    ]);
    unmount();
  });

  it("returns a confirmed mention from a quest beat, titled 'quest · beat'", async () => {
    mocks.rowsByTable.quest_beats = [
      {
        id: "beat-1",
        title: "The Ambush",
        quest_id: "quest-1",
        dm_content: doc(mentionNode("npc-1")),
        read_aloud: null,
        how_it_plays: null,
        quest: { title: "The Long Road" },
      },
    ];
    const { result, unmount } = withQueryClient(() => useEntityBacklinks(ref("npc-1")));
    await flushPromises();
    expect(result.data.value).toEqual([
      { kind: "quest-beat", id: "beat-1", title: "The Long Road · The Ambush", to: "/quests/quest-1/beats/beat-1" },
    ]);
    unmount();
  });

  it("returns a confirmed mention from a party member's persona fields", async () => {
    mocks.rowsByTable.party_members = [
      {
        id: "pm-2",
        name: "Aric Stormblade",
        physical_description: null,
        personality_traits: null,
        ideals: null,
        bonds: doc(mentionNode("npc-1")),
        flaws: null,
        notes: null,
      },
    ];
    const { result, unmount } = withQueryClient(() => useEntityBacklinks(ref("npc-1")));
    await flushPromises();
    expect(result.data.value).toEqual([
      { kind: "party-member", id: "pm-2", title: "Aric Stormblade", to: "/party/pm-2" },
    ]);
    unmount();
  });

  it("excludes an entity's own row from its own backlinks (self-mention)", async () => {
    // npc-1 mentioning itself in its own backstory must not appear in npc-1's
    // "Mentioned in" list — the `.neq("id", id)` filter drops it before the
    // like/confirm step ever runs, so the mock never even offers the row a
    // chance to confirm.
    mocks.rowsByTable.npcs = [
      { id: "npc-1", name: "Self Mentioner", appearance: null, personality: null, backstory: doc(mentionNode("npc-1")), notes: null },
    ];
    const { result, unmount } = withQueryClient(() => useEntityBacklinks(ref("npc-1")));
    await flushPromises();
    expect(mocks.calls).toContainEqual({ table: "npcs", method: "neq", args: ["id", "npc-1"] });
    expect(result.data.value).toEqual([]);
    unmount();
  });

  it("drops a location whose description merely contains the id as a substring of an unrelated mention", async () => {
    mocks.rowsByTable.locations = [
      { id: "loc-1", name: "The Sunken Crypt", description: doc(mentionNode("npc-999")) },
    ];
    const { result, unmount } = withQueryClient(() => useEntityBacklinks(ref("npc-99")));
    await flushPromises();
    expect(result.data.value).toEqual([]);
    unmount();
  });
});
