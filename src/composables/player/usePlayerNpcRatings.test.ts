import { flushPromises, mount } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent } from "vue";
import { safeLocalStorage } from "@/lib/safeLocalStorage";
import { useCampaignStore } from "@/stores/campaign";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});
vi.mock("@/lib/supabase", () => ({ supabase: fake.client, getCurrentUser: () => ({ id: "me" }) }));

import {
  LEGACY_NPC_RATING_KEY,
  planLegacyNpcRatingBackfill,
  readLegacyNpcRating,
  usePlayerNpcRatings,
} from "./usePlayerNpcRatings";

function storage(values: Record<string, string>): Pick<Storage, "getItem"> {
  return { getItem: (key) => values[key] ?? null };
}

describe("legacy NPC rating backfill", () => {
  it("accepts only complete ratings from one to five", () => {
    const local = storage({
      [`${LEGACY_NPC_RATING_KEY}one`]: "1",
      [`${LEGACY_NPC_RATING_KEY}five`]: "5",
      [`${LEGACY_NPC_RATING_KEY}zero`]: "0",
      [`${LEGACY_NPC_RATING_KEY}large`]: "6",
      [`${LEGACY_NPC_RATING_KEY}decimal`]: "3.5",
      [`${LEGACY_NPC_RATING_KEY}junk`]: "nope",
    });

    expect(readLegacyNpcRating(local, "one")).toBe(1);
    expect(readLegacyNpcRating(local, "five")).toBe(5);
    expect(readLegacyNpcRating(local, "zero")).toBe(0);
    expect(readLegacyNpcRating(local, "large")).toBe(0);
    expect(readLegacyNpcRating(local, "decimal")).toBe(0);
    expect(readLegacyNpcRating(local, "junk")).toBe(0);
  });

  it("builds rows only for rated NPCs visible in the active campaign", () => {
    const local = storage({
      [`${LEGACY_NPC_RATING_KEY}npc-a`]: "4",
      [`${LEGACY_NPC_RATING_KEY}npc-hidden`]: "5",
    });

    expect(planLegacyNpcRatingBackfill(local, [{ id: "npc-a" }, { id: "npc-b" }], "user-1", "campaign-1"))
      .toEqual([{ user_id: "user-1", campaign_id: "campaign-1", npc_id: "npc-a", rating: 4 }]);
  });
});

describe("usePlayerNpcRatings", () => {
  const rating = (npc_id: string, rating: number, over: Record<string, unknown> = {}) => ({
    user_id: "me",
    campaign_id: "c1",
    npc_id,
    rating,
    ...over,
  });

  function run(npcs?: () => { id: string }[]) {
    let out!: ReturnType<typeof usePlayerNpcRatings>;
    mount(
      defineComponent({ setup() { out = usePlayerNpcRatings(npcs); return () => null; } }),
      { global: { plugins: [[VueQueryPlugin, { queryClient: new QueryClient({ defaultOptions: { queries: { retry: false } } }) }]] } },
    );
    return out;
  }

  beforeEach(() => {
    fake.reset();
    safeLocalStorage().clear();
    setActivePinia(createPinia());
    useCampaignStore().activeCampaignId = "c1";
  });

  it("shows only my ratings in this campaign, never another player's or another campaign's", async () => {
    fake.seed("player_npc_ratings", [
      rating("a", 4),
      rating("a-theirs", 2, { user_id: "someone-else" }),
      rating("a-elsewhere", 3, { campaign_id: "c2" }),
    ]);
    const r = run();
    await flushPromises();
    expect([...r.ratingMap.value.entries()]).toEqual([["a", 4]]);
    expect(r.getRating("a-theirs")).toBe(0);
  });

  it("rating an NPC stores one rating for me; picking the same stars again clears it", async () => {
    fake.seed("player_npc_ratings", [rating("a", 2, { user_id: "someone-else" })]);
    const r = run();
    await flushPromises();
    r.setRating("a", 4);
    await vi.waitFor(() => expect(r.getRating("a")).toBe(4));
    await flushPromises();
    expect(fake.rows("player_npc_ratings").filter((x) => x.user_id === "me")).toMatchObject([{ npc_id: "a", rating: 4, campaign_id: "c1" }]);

    r.setRating("a", 4);
    await vi.waitFor(() => expect(r.getRating("a")).toBe(0));
    await flushPromises();
    // Clearing mine leaves the other player's rating of the same NPC alone.
    expect(fake.rows("player_npc_ratings")).toMatchObject([{ user_id: "someone-else", npc_id: "a", rating: 2 }]);
  });

  it("puts the rating back, and the old local value, when the write fails", async () => {
    safeLocalStorage().setItem(`${LEGACY_NPC_RATING_KEY}a`, "3");
    const r = run();
    await flushPromises();
    expect(r.getRating("a")).toBe(3);
    fake.failNext("player_npc_ratings", { message: "network" });
    r.setRating("a", 5);
    await flushPromises();
    expect(r.getRating("a")).toBe(3);
    expect(safeLocalStorage().getItem(`${LEGACY_NPC_RATING_KEY}a`)).toBe("3");
  });

  it("uploads ratings kept in this browser for the NPCs the player can see, keeps a rating the server already has, and then drops the local copy", async () => {
    safeLocalStorage().setItem(`${LEGACY_NPC_RATING_KEY}a`, "4");
    safeLocalStorage().setItem(`${LEGACY_NPC_RATING_KEY}b`, "5");
    safeLocalStorage().setItem(`${LEGACY_NPC_RATING_KEY}hidden`, "5");
    fake.seed("player_npc_ratings", [rating("b", 1)]);
    const r = run(() => [{ id: "a" }, { id: "b" }]);
    await flushPromises();
    const mine = Object.fromEntries(fake.rows("player_npc_ratings").map((x) => [x.npc_id, x.rating]));
    expect(mine).toEqual({ a: 4, b: 1 });
    expect(r.getRating("b")).toBe(1);
    expect(safeLocalStorage().getItem(`${LEGACY_NPC_RATING_KEY}a`)).toBeNull();
    expect(safeLocalStorage().getItem(`${LEGACY_NPC_RATING_KEY}hidden`)).toBe("5");
  });

  it("keeps the local ratings when the upload fails, so a later visit can retry", async () => {
    safeLocalStorage().setItem(`${LEGACY_NPC_RATING_KEY}a`, "4");
    fake.failNext("player_npc_ratings", { message: "network" }, { after: 1 });
    run(() => [{ id: "a" }]);
    await flushPromises();
    expect(fake.rows("player_npc_ratings")).toEqual([]);
    expect(safeLocalStorage().getItem(`${LEGACY_NPC_RATING_KEY}a`)).toBe("4");
  });
});
