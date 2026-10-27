import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { createApp, defineComponent, h } from "vue";
import { createPinia, setActivePinia } from "pinia";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});
const session = vi.hoisted(() => ({ user: { id: "u1" } as { id: string } | null }));

vi.mock("@/lib/supabase", () => ({ supabase: fake.client, getCurrentUser: () => session.user }));

import { useCampaignStore } from "@/stores/campaign";
import { useReadMarkers, useMarkRead } from "./useReadItems";

function mountWith<T>(qc: QueryClient, setup: () => T): T {
  let out!: T;
  const app = createApp(
    defineComponent({
      setup() {
        out = setup();
        return () => h("div");
      },
    }),
  );
  app.use(VueQueryPlugin, { queryClient: qc });
  app.mount(document.createElement("div"));
  return out;
}

const marker = (entity_type: string, entity_id: string, over: Record<string, unknown> = {}) => ({
  user_id: "u1",
  campaign_id: "c1",
  entity_type,
  entity_id,
  read_at: "2026-10-01T00:00:00Z",
  ...over,
});

beforeEach(() => {
  fake.reset();
  session.user = { id: "u1" };
  setActivePinia(createPinia());
  useCampaignStore().activeCampaignId = "c1";
});

describe("useReadMarkers", () => {
  it("reads only my markers in this campaign for the asked types, never another member's, another campaign's or another type's", async () => {
    fake.seed("player_read_items", [
      marker("quest", "q1"),
      marker("quest", "q-theirs", { user_id: "u2" }),
      marker("quest", "q-elsewhere", { campaign_id: "c2" }),
      marker("monster", "m1"),
    ]);
    const r = mountWith(new QueryClient(), () => useReadMarkers(["quest", "puzzle"]));
    await vi.waitFor(() => expect(r.data.value).toBeDefined());
    expect([...(r.data.value?.keys() ?? [])]).toEqual(["quest:q1"]);
    // read after the update: not new; same id under another type: no marker
    expect(r.isNew("quest", "q1", "2026-09-01T00:00:00Z")).toBe(false);
    expect(r.isNew("puzzle", "q1", "2026-09-01T00:00:00Z")).toBe(true);
  });

  it("the same set of types in any order is one request", async () => {
    const qc = new QueryClient();
    const [a, b] = mountWith(qc, () => [useReadMarkers(["quest", "puzzle"]), useReadMarkers(["puzzle", "quest"])] as const);
    await vi.waitFor(() => expect(a.data.value && b.data.value).toBeDefined());
    expect(fake.calls.filter((c) => c.op === "select")).toHaveLength(1);
  });

  it("a failed read is an error, not 'nothing is read'", async () => {
    fake.failNext("player_read_items", { message: "network" });
    const r = mountWith(new QueryClient({ defaultOptions: { queries: { retry: false } } }), () => useReadMarkers(["quest"]));
    await vi.waitFor(() => expect(r.isError.value).toBe(true));
  });

  // The read-state rules: an item is new once it changed after the player last read it.
  it.each([
    ["an unread item changed after the feature launched", undefined, "2026-09-01T00:00:00Z", true],
    ["an unread item last changed before the feature launched", undefined, "2026-04-01T00:00:00Z", false],
    ["an item read before it was edited", "2026-10-01T00:00:00Z", "2026-10-02T00:00:00Z", true],
    ["an item edited before it was read", "2026-10-01T00:00:00Z", "2026-09-30T00:00:00Z", false],
    ["an item edited at the very moment it was read", "2026-10-01T00:00:00Z", "2026-10-01T00:00:00Z", false],
    ["an unread item with no edit date", undefined, undefined, false],
    ["a read item with no edit date", "2026-10-01T00:00:00Z", undefined, false],
  ])("isNew: %s", async (_label, readAt, updatedAt, expected) => {
    if (readAt) fake.seed("player_read_items", [marker("quest", "q1", { read_at: readAt })]);
    const r = mountWith(new QueryClient(), () => useReadMarkers(["quest"]));
    await vi.waitFor(() => expect(r.data.value).toBeDefined());
    expect(r.isNew("quest", "q1", updatedAt)).toBe(expected);
  });
});

describe("useMarkRead", () => {
  function setup() {
    return mountWith(new QueryClient({ defaultOptions: { queries: { retry: false } } }), () => ({
      markers: useReadMarkers(["quest", "puzzle"]),
      mark: useMarkRead(),
    }));
  }

  it("marks an item read for me in this campaign, in the shared entry at once, for its own type only", async () => {
    const { markers, mark } = setup();
    await vi.waitFor(() => expect(markers.data.value).toBeDefined());
    expect(markers.isNew("quest", "q9", "2026-09-01T00:00:00Z")).toBe(true);
    mark.mutate({ entityType: "quest", entityId: "q9" });
    await vi.waitFor(() => expect(markers.isNew("quest", "q9", "2026-09-01T00:00:00Z")).toBe(false));
    expect(markers.isNew("puzzle", "q9", "2026-09-01T00:00:00Z")).toBe(true);
    await vi.waitFor(() => expect(fake.rows("player_read_items")).toHaveLength(1));
    expect(fake.rows("player_read_items")[0]).toMatchObject({ user_id: "u1", campaign_id: "c1", entity_type: "quest", entity_id: "q9" });
  });

  it("marking again moves the one marker forward rather than adding a second", async () => {
    fake.seed("player_read_items", [marker("quest", "q9")]);
    const { markers, mark } = setup();
    await vi.waitFor(() => expect(markers.data.value).toBeDefined());
    mark.mutate({ entityType: "quest", entityId: "q9" });
    await vi.waitFor(() => expect(mark.isSuccess.value).toBe(true));
    const rows = fake.rows("player_read_items");
    expect(rows).toHaveLength(1);
    expect(rows[0].read_at).not.toBe("2026-10-01T00:00:00Z");
  });

  it("marking another item keeps both markers, and leaves a cached entry for other types alone", async () => {
    const qc = new QueryClient();
    const { markers, mark, monsters } = mountWith(qc, () => ({
      markers: useReadMarkers(["quest", "puzzle"]),
      monsters: useReadMarkers(["monster"]),
      mark: useMarkRead(),
    }));
    await vi.waitFor(() => expect(markers.data.value && monsters.data.value).toBeDefined());
    mark.mutate({ entityType: "quest", entityId: "q1" });
    await vi.waitFor(() => expect(mark.isSuccess.value).toBe(true));
    mark.mutate({ entityType: "quest", entityId: "q2" });
    await vi.waitFor(() => expect(fake.rows("player_read_items")).toHaveLength(2));
    expect([...(monsters.data.value?.keys() ?? [])]).toEqual([]);
  });

  it("writes nothing when no campaign is active", async () => {
    const { markers, mark } = setup();
    await vi.waitFor(() => expect(markers.data.value).toBeDefined());
    useCampaignStore().activeCampaignId = null;
    mark.mutate({ entityType: "quest", entityId: "q9" });
    await vi.waitFor(() => expect(mark.isSuccess.value).toBe(true));
    expect(fake.rows("player_read_items")).toEqual([]);
  });

  it("puts the item back to unread when the write fails", async () => {
    const { markers, mark } = setup();
    await vi.waitFor(() => expect(markers.data.value).toBeDefined());
    fake.failNext("player_read_items", { message: "network" });
    mark.mutate({ entityType: "quest", entityId: "q9" });
    await vi.waitFor(() => expect(mark.isError.value).toBe(true));
    expect(markers.isNew("quest", "q9", "2026-09-01T00:00:00Z")).toBe(true);
  });

  it("writes nothing when nobody is signed in", async () => {
    const { markers, mark } = setup();
    await vi.waitFor(() => expect(markers.data.value).toBeDefined());
    session.user = null;
    mark.mutate({ entityType: "quest", entityId: "q9" });
    await vi.waitFor(() => expect(mark.isSuccess.value).toBe(true));
    expect(fake.rows("player_read_items")).toEqual([]);
  });
});
