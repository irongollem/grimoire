import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { createPinia, setActivePinia } from "pinia";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});
vi.mock("@/lib/supabase", () => ({ supabase: fake.client }));

import { groupPlayerWorld, isPassageNew, usePlayerCanon, type PlayerCanonEntry, type PlayerLorePassage } from "./usePlayerCanon";
import { useCampaignStore } from "@/stores/campaign";
import { useAppUiStore } from "@/stores/ui/app";

const entry = (over: Partial<PlayerCanonEntry>): PlayerCanonEntry => ({
  id: "e", part: "truth", premise_kind: null, knowledge: "all", title: "t", body: null, sort_order: 0, image_url: null,
  created_at: "2026-11-01T10:00:00Z", updated_at: "2026-11-01T10:00:00Z", lore_kind: null, world_year: null, world_month: null,
  world_day: null, ...over,
});
const passage = (over: Partial<PlayerLorePassage>): PlayerLorePassage => ({
  id: "p", entry_id: "l1", sort_order: 0, title: "I", body: null, told_at: null, ...over,
});

describe("groupPlayerWorld", () => {
  it("keeps what only this player knows apart from what the table knows", () => {
    const world = groupPlayerWorld(
      [
        entry({ id: "all", knowledge: "all", title: "Known to all" }),
        entry({ id: "mine", knowledge: "some", title: "Only mine" }),
        entry({ id: "sec", part: "secret", knowledge: null }),
      ],
      [],
    );
    expect(world.known.map((e) => e.id)).toEqual(["all"]);
    expect(world.onlyMine.map((e) => e.id)).toEqual(["mine"]);
    expect(world.lore).toEqual([]);
  });

  it("orders lore by its date in the world with undated last, and passages by their order under their entry", () => {
    const world = groupPlayerWorld(
      [
        entry({ id: "undated", part: "lore", knowledge: null, sort_order: 0 }),
        entry({ id: "late", part: "lore", knowledge: null, world_year: 410 }),
        entry({ id: "early", part: "lore", knowledge: null, world_year: 12 }),
      ],
      [
        passage({ id: "b", entry_id: "early", sort_order: 2 }),
        passage({ id: "a", entry_id: "early", sort_order: 1 }),
        passage({ id: "z", entry_id: "late", sort_order: 1 }),
      ],
    );
    expect(world.lore.map((l) => l.entry.id)).toEqual(["early", "late", "undated"]);
    expect(world.lore[0].passages.map((p) => p.id)).toEqual(["a", "b"]);
    expect(world.lore[2].passages).toEqual([]);
  });

  it("dates an entry by its newest passage told to this player, else by the entry itself", () => {
    const world = groupPlayerWorld(
      [entry({ id: "l1", part: "lore", knowledge: null }), entry({ id: "l2", part: "lore", knowledge: null, created_at: "2026-10-01T00:00:00Z" })],
      [
        passage({ id: "a", entry_id: "l1", told_at: "2026-11-02T10:00:00Z" }),
        passage({ id: "b", entry_id: "l1", sort_order: 1, told_at: "2026-11-09T10:00:00Z" }),
        passage({ id: "first", entry_id: "l2", told_at: null }),
      ],
    );
    expect(world.lore.find((l) => l.entry.id === "l1")?.latestAt).toBe("2026-11-09T10:00:00Z");
    expect(world.lore.find((l) => l.entry.id === "l2")?.latestAt).toBe("2026-10-01T00:00:00Z");
  });
});

describe("isPassageNew", () => {
  const visit = new Date("2026-11-05T00:00:00Z");
  it("marks a passage told after the last visit and not one told before it", () => {
    expect(isPassageNew("2026-11-09T10:00:00Z", visit)).toBe(true);
    expect(isPassageNew("2026-11-02T10:00:00Z", visit)).toBe(false);
  });
  it("marks nothing inside an entry the player has never opened, or a passage with no told time", () => {
    expect(isPassageNew("2026-11-09T10:00:00Z", null)).toBe(false);
    expect(isPassageNew(null, visit)).toBe(false);
  });
});

describe("usePlayerCanon", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    fake.reset();
    useCampaignStore().activeCampaignId = "c1";
  });

  function run() {
    let result!: ReturnType<typeof usePlayerCanon>;
    const Host = defineComponent({
      setup() {
        result = usePlayerCanon();
        return () => h("div");
      },
    });
    mount(Host, { global: { plugins: [[VueQueryPlugin, { queryClient: new QueryClient({ defaultOptions: { queries: { retry: false } } }) }]] } });
    return result;
  }

  // The server answers by who is looking, so each read must name the previewed member (or nobody) in both calls.
  function answerFor(memberId: string | null) {
    const ok = (args: Record<string, unknown>) => args.p_campaign_id === "c1" && args.p_preview_member_id === memberId;
    fake.onRpc("get_player_canon", (args) => (ok(args) ? [entry({ id: "t", title: "Heard" })] : []));
    fake.onRpc("get_player_lore_passages", (args) => (ok(args) ? [passage({ id: "p1" })] : []));
  }

  it("a DM previewing a member reads what that member was told, in both reads", async () => {
    const app = useAppUiStore();
    app.dmPreviewMode = true;
    app.dmPreviewPartyMemberId = "pm-9";
    answerFor("pm-9");
    const q = run();
    await flushPromises();
    expect(q.world.value?.known.map((e) => e.id)).toEqual(["t"]);
  });

  it("a real player reads as themself: no member is named", async () => {
    answerFor(null);
    const q = run();
    await flushPromises();
    expect(q.world.value?.known.map((e) => e.id)).toEqual(["t"]);
  });

  it("surfaces a failed read as an error, not as an empty world", async () => {
    fake.failNext("get_player_canon", { message: "boom" });
    fake.onRpc("get_player_canon", () => []);
    fake.onRpc("get_player_lore_passages", () => []);
    const q = run();
    await flushPromises();
    expect(q.error.value).toBeTruthy();
    expect(q.world.value).toBeUndefined();
  });
});
