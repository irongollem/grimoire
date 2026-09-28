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
  rows: [] as { id: string; title: string; content: string | null }[],
  calls: [] as { method: string; args: unknown[] }[],
}));

function makeQueryChain() {
  const chain = Promise.resolve({ data: mocks.rows, error: null }) as
    Promise<{ data: unknown[]; error: null }> & Record<string, (...args: unknown[]) => unknown>;
  for (const method of ["select", "eq", "like"]) {
    chain[method] = (...args: unknown[]) => {
      mocks.calls.push({ method, args });
      return chain;
    };
  }
  return chain;
}

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: () => ({
      select: (...args: unknown[]) => {
        mocks.calls.push({ method: "select", args });
        return makeQueryChain();
      },
    }),
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
    mocks.rows = [];
    mocks.calls = [];
  });

  it("returns notes confirmed to mention the entity, sorted by title", async () => {
    mocks.rows = [
      { id: "note-b", title: "Bravo", content: doc(mentionNode("npc-1")) },
      { id: "note-a", title: "Alpha", content: doc(mentionNode("npc-1")) },
    ];
    const { result, unmount } = withQueryClient(() => useEntityBacklinks(ref("npc-1")));
    await flushPromises();
    expect(result.data.value).toEqual([
      { id: "note-a", title: "Alpha" },
      { id: "note-b", title: "Bravo" },
    ]);
    unmount();
  });

  it("drops a substring-only match that the like filter surfaced but no mention node confirms", async () => {
    mocks.rows = [
      { id: "note-1", title: "False Positive", content: doc(mentionNode("npc-123")) },
    ];
    const { result, unmount } = withQueryClient(() => useEntityBacklinks(ref("npc-1")));
    await flushPromises();
    expect(result.data.value).toEqual([]);
    unmount();
  });

  it("drops a row with malformed JSON content instead of throwing", async () => {
    mocks.rows = [{ id: "note-1", title: "Broken", content: "{not json" }];
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

  it("scopes the query to the active campaign and a content substring match", async () => {
    const { unmount } = withQueryClient(() => useEntityBacklinks(ref("npc-1")));
    await flushPromises();
    expect(mocks.calls).toContainEqual({ method: "eq", args: ["campaign_id", "campaign-1"] });
    expect(mocks.calls).toContainEqual({ method: "like", args: ["content", "%npc-1%"] });
    unmount();
  });
});
