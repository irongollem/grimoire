import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h, reactive } from "vue";
import { mount, flushPromises } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";

const mocks = vi.hoisted(() => ({
  inserted: [] as Record<string, unknown>[],
  eqs: [] as [string, unknown][],
  error: null as Error | null,
}));
const store = reactive({ activeCampaignId: "camp-1" as string | null });

vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => store }));
vi.mock("@/lib/supabase", () => ({
  getCurrentUser: () => ({ id: "user-1" }),
  supabase: {
    from: () => ({
      select: () => ({
        eq: (col: string, val: unknown) => {
          mocks.eqs.push([col, val]);
          return { order: () => Promise.resolve({ data: mocks.error ? null : [{ id: "k1" }], error: mocks.error }) };
        },
      }),
      insert: (row: Record<string, unknown>) => {
        mocks.inserted.push(row);
        return { select: () => ({ single: () => Promise.resolve({ data: { id: "new", ...row }, error: null }) }) };
      },
    }),
  },
}));

const { useKinLinks, useCreateKinLink, KIN_LINKS_KEY } = await import("./useKinLinks");

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

describe("useKinLinks", () => {
  beforeEach(() => {
    mocks.inserted = [];
    mocks.eqs = [];
    mocks.error = null;
    store.activeCampaignId = "camp-1";
  });

  it("reads the active campaign's links, scoped in the query itself", async () => {
    const { result, unmount } = withQueryClient(() => useKinLinks());
    await flushPromises();
    expect(mocks.eqs).toEqual([["campaign_id", "camp-1"]]);
    expect(result.data.value).toEqual([{ id: "k1" }]);
    unmount();
  });

  it("surfaces a read error instead of reading it as no links", async () => {
    mocks.error = new Error("denied");
    const { result, unmount } = withQueryClient(() => useKinLinks());
    await flushPromises();
    expect(result.error.value).toBe(mocks.error);
    unmount();
  });

  it("stamps the campaign and the signed-in user on a new link, then refreshes the list", async () => {
    const { result, queryClient, unmount } = withQueryClient(() => useCreateKinLink());
    const spy = vi.spyOn(queryClient, "invalidateQueries");
    await result.mutateAsync({
      from_npc_id: "n1",
      from_party_member_id: null,
      to_npc_id: "n2",
      to_party_member_id: null,
      kind: "spouse",
    });
    expect(mocks.inserted[0]).toMatchObject({ campaign_id: "camp-1", user_id: "user-1", kind: "spouse" });
    expect(spy).toHaveBeenCalledWith({ queryKey: [KIN_LINKS_KEY] });
    unmount();
  });

  it("refuses to create a link with no active campaign", async () => {
    store.activeCampaignId = null;
    const { result, unmount } = withQueryClient(() => useCreateKinLink());
    await expect(
      result.mutateAsync({ from_npc_id: "n1", from_party_member_id: null, to_npc_id: "n2", to_party_member_id: null, kind: "spouse" }),
    ).rejects.toThrow(/campaign/);
    expect(mocks.inserted).toEqual([]);
    unmount();
  });
});
