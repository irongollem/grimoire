import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h, reactive } from "vue";
import { mount, flushPromises } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});
const store = reactive({ activeCampaignId: "camp-1" as string | null });
const session = vi.hoisted(() => ({ user: { id: "user-1" } as { id: string } | null }));

vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => store }));
vi.mock("@/lib/supabase", () => ({ supabase: fake.client, getCurrentUser: () => session.user }));

const { useKinLinks, useCreateKinLink, useUpdateKinLink, useDeleteKinLink, KIN_LINKS_KEY } = await import("./useKinLinks");

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

const link = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  campaign_id: "camp-1",
  kind: "spouse",
  created_at: `2026-10-0${id.slice(1)}T00:00:00Z`,
  ...over,
});

const newLink = {
  from_npc_id: "n1",
  from_party_member_id: null,
  to_npc_id: "n2",
  to_party_member_id: null,
  kind: "spouse",
} as const;

beforeEach(() => {
  fake.reset();
  store.activeCampaignId = "camp-1";
  session.user = { id: "user-1" };
});

describe("useKinLinks", () => {
  it("lists the active campaign's links oldest first, never another campaign's", async () => {
    fake.seed("kin_links", [link("k3"), link("k1"), link("k2", { campaign_id: "camp-2" })]);
    const { result, unmount } = withQueryClient(() => useKinLinks());
    await flushPromises();
    expect((result.data.value ?? []).map((l) => l.id)).toEqual(["k1", "k3"]);
    unmount();
  });

  it("surfaces a read error instead of reading it as no links", async () => {
    fake.failNext("kin_links", { message: "denied" });
    const { result, unmount } = withQueryClient(() => useKinLinks());
    await flushPromises();
    expect(result.error.value).toMatchObject({ message: "denied" });
    unmount();
  });

  it("reads nothing without an active campaign", async () => {
    store.activeCampaignId = null;
    fake.seed("kin_links", [link("k1")]);
    const { result, unmount } = withQueryClient(() => useKinLinks());
    await flushPromises();
    expect(result.data.value).toBeUndefined();
    expect(result.error.value).toBeNull();
    expect(fake.calls).toEqual([]);
    unmount();
  });
});

describe("useCreateKinLink", () => {
  it("stamps the campaign and the signed-in user on a new link, then refreshes the list", async () => {
    const { result, queryClient, unmount } = withQueryClient(() => useCreateKinLink());
    const spy = vi.spyOn(queryClient, "invalidateQueries");
    await result.mutateAsync({ ...newLink, id: "k9" } as typeof newLink);
    expect(fake.rows("kin_links")).toEqual([
      expect.objectContaining({ campaign_id: "camp-1", user_id: "user-1", kind: "spouse" }),
    ]);
    expect(spy).toHaveBeenCalledWith({ queryKey: [KIN_LINKS_KEY] });
    unmount();
  });

  it("does not let the caller file the link under another campaign or user", async () => {
    const { result, unmount } = withQueryClient(() => useCreateKinLink());
    await result.mutateAsync({ ...newLink, id: "k9", campaign_id: "camp-2", user_id: "intruder" } as typeof newLink);
    expect(fake.rows("kin_links")[0]).toMatchObject({ campaign_id: "camp-1", user_id: "user-1" });
    unmount();
  });

  it("refuses to create a link with no active campaign or no signed-in user, writing nothing", async () => {
    store.activeCampaignId = null;
    const first = withQueryClient(() => useCreateKinLink());
    await expect(first.result.mutateAsync(newLink)).rejects.toThrow(/campaign/);
    first.unmount();

    store.activeCampaignId = "camp-1";
    session.user = null;
    const second = withQueryClient(() => useCreateKinLink());
    await expect(second.result.mutateAsync(newLink)).rejects.toThrow(/signed out/);
    second.unmount();
    expect(fake.rows("kin_links")).toEqual([]);
  });
});

describe("useUpdateKinLink and useDeleteKinLink", () => {
  it("changes and removes only the link named", async () => {
    fake.seed("kin_links", [link("k1"), link("k2")]);
    const { result: update, unmount: u1 } = withQueryClient(() => useUpdateKinLink());
    await update.mutateAsync({ id: "k1", patch: { kind: "sibling" } });
    expect(fake.rows("kin_links").map((l) => [l.id, l.kind])).toEqual([["k1", "sibling"], ["k2", "spouse"]]);
    u1();

    const { result: del, unmount: u2 } = withQueryClient(() => useDeleteKinLink());
    await del.mutateAsync("k1");
    expect(fake.rows("kin_links").map((l) => l.id)).toEqual(["k2"]);
    u2();
  });

  it("refreshes the list after either, and throws a refusal leaving the link as it was", async () => {
    fake.seed("kin_links", [link("k1")]);
    const { result, queryClient, unmount } = withQueryClient(() => useDeleteKinLink());
    const spy = vi.spyOn(queryClient, "invalidateQueries");
    fake.failNext("kin_links", { message: "denied" });
    await expect(result.mutateAsync("k1")).rejects.toMatchObject({ message: "denied" });
    expect(fake.rows("kin_links")).toHaveLength(1);
    expect(spy).not.toHaveBeenCalled();
    await result.mutateAsync("k1");
    expect(spy).toHaveBeenCalledWith({ queryKey: [KIN_LINKS_KEY] });
    unmount();
  });
});
