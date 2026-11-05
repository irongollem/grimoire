// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { createApp, defineComponent, h } from "vue";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});
const mocks = vi.hoisted(() => ({ campaignId: "camp-1" as string | null }));

vi.mock("@/lib/supabase", () => ({ supabase: fake.client, getCurrentUser: () => ({ id: "dm-1" }) }));
vi.mock("@/stores/campaign", () => ({
  useCampaignStore: () => ({ activeCampaignId: mocks.campaignId }),
}));

import {
  fetchBookNooks,
  fetchBookNook,
  saveBookNook,
  StaleNookError,
  useCreateBookNook,
} from "./useBookNooks";

function mountWith<T>(setup: () => T): T {
  let out!: T;
  const app = createApp(defineComponent({ setup() { out = setup(); return () => h("div"); } }));
  app.use(VueQueryPlugin, { queryClient: new QueryClient() });
  app.mount(document.createElement("div"));
  return out;
}

beforeEach(() => {
  fake.reset();
  mocks.campaignId = "camp-1";
});

describe("book nook reads", () => {
  it("lists only the campaign's own nooks, newest first", async () => {
    fake.seed("book_nooks", [
      { id: "n1", campaign_id: "camp-1", updated_at: "2026-11-01T00:00:00Z" },
      { id: "n2", campaign_id: "camp-1", updated_at: "2026-11-03T00:00:00Z" },
      { id: "n3", campaign_id: "camp-2", updated_at: "2026-11-04T00:00:00Z" },
    ]);
    expect((await fetchBookNooks("camp-1")).map((n) => n.id)).toEqual(["n2", "n1"]);
  });

  it("reads one nook by its id, not the first row RLS lets through", async () => {
    fake.seed("book_nooks", [{ id: "n1", title: "Cellar" }, { id: "n2", title: "Hearth" }]);
    expect((await fetchBookNook("n2")).title).toBe("Hearth");
  });

  it("throws a read error instead of reading it as no nooks", async () => {
    fake.failNext("book_nooks", { message: "permission denied" });
    await expect(fetchBookNooks("camp-1")).rejects.toMatchObject({ message: "permission denied" });
  });
});

describe("book nook writes", () => {
  it("creates in the active campaign", async () => {
    const created = await mountWith(() => useCreateBookNook()).mutateAsync({
      title: "Cellar",
      scene: {} as never,
    });
    expect(created).toMatchObject({ campaign_id: "camp-1", title: "Cellar" });
  });

  it("refuses to create with no active campaign", async () => {
    mocks.campaignId = null;
    await expect(
      mountWith(() => useCreateBookNook()).mutateAsync({ title: "x", scene: {} as never }),
    ).rejects.toThrow(/active campaign/);
    expect(fake.rows("book_nooks")).toEqual([]);
  });

  it("bumps the revision on a save from the current one", async () => {
    fake.seed("book_nooks", [{ id: "n1", rev: 3, title: "Old" }]);
    await saveBookNook("n1", 3, { title: "New" });
    expect(fake.rows("book_nooks")).toMatchObject([{ id: "n1", rev: 4, title: "New" }]);
  });

  // The rev filter is the guard: without it the stale tab overwrites the newer save.
  it("a save from a stale tab throws StaleNookError and changes nothing", async () => {
    fake.seed("book_nooks", [{ id: "n1", rev: 5, title: "Saved elsewhere" }]);
    await expect(saveBookNook("n1", 3, { title: "Stale" })).rejects.toBeInstanceOf(StaleNookError);
    expect(fake.rows("book_nooks")).toMatchObject([{ rev: 5, title: "Saved elsewhere" }]);
  });
});
