import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h } from "vue";
import { mount, flushPromises } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { DEFAULT_LANES } from "@/lib/audio/deck/deckModel";
import type { SoundboardPage } from "@/types/sound.types";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});
const session = vi.hoisted(() => ({ campaignId: "camp-1" as string | null }));

vi.mock("@/lib/supabase", () => ({ supabase: fake.client }));
vi.mock("@/stores/campaign", () => ({
  useCampaignStore: () => ({
    get activeCampaignId() {
      return session.campaignId;
    },
  }),
}));
vi.mock("@/stores/auth", () => ({ useAuthStore: () => ({ user: { id: "user-1" } }) }));
vi.mock("pinia", async (orig) => ({
  ...(await orig<typeof import("pinia")>()),
  storeToRefs: (store: { activeCampaignId: string | null }) => ({
    activeCampaignId: {
      get value() {
        return store.activeCampaignId;
      },
    },
  }),
}));

import {
  useAddTake,
  useCreatePad,
  useDeckPads,
  useMovePad,
  useRemoveTake,
  useReorderTakes,
} from "./useDeckPads";
import { useUpdatePageLane } from "./useSoundboardPages";

function inApp<T>(setup: (qc: QueryClient) => T) {
  let result!: T;
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  mount(
    defineComponent({
      setup() {
        result = setup(queryClient);
        return () => h("div");
      },
    }),
    { global: { plugins: [[VueQueryPlugin, { queryClient }]] } },
  );
  return { result, queryClient };
}

beforeEach(() => {
  fake.reset();
  session.campaignId = "camp-1";
});

describe("useDeckPads", () => {
  it("reads only the active campaign's pads, with takes in position order", async () => {
    fake.seed("soundboard_pads", [
      {
        id: "p1",
        campaign_id: "camp-1",
        takes: [
          { id: "t2", position: 1 },
          { id: "t1", position: 0 },
        ],
      },
      { id: "p2", campaign_id: "camp-2", takes: [] },
    ]);
    const { result } = inApp(() => useDeckPads());
    await flushPromises();
    expect(result.data.value?.map((p) => p.id)).toEqual(["p1"]);
    expect(result.data.value?.[0]?.takes.map((t) => t.id)).toEqual(["t1", "t2"]);
  });

  it("surfaces the database error instead of an empty deck", async () => {
    fake.failNext("soundboard_pads", { message: "boom" });
    const { result } = inApp(() => useDeckPads());
    await flushPromises();
    expect(result.error.value).toMatchObject({ message: "boom" });
    expect(result.data.value).toBeUndefined();
  });
});

describe("useCreatePad", () => {
  it("inserts the sounds as takes in the order given, on the new pad", async () => {
    const { result } = inApp(() => useCreatePad());
    const pad = await result.mutateAsync({
      pad: { page_id: "pg", lane: 3, grid_row: 0 },
      soundIds: ["s-a", "s-b", "s-c"],
    });
    expect(fake.rows("soundboard_pads")).toMatchObject([{ id: pad.id, campaign_id: "camp-1", user_id: "user-1" }]);
    const takes = fake.rows("soundboard_pad_takes");
    expect(takes.map((t) => [t.sound_id, t.position, t.pad_id])).toEqual([
      ["s-a", 0, pad.id],
      ["s-b", 1, pad.id],
      ["s-c", 2, pad.id],
    ]);
  });

  it("makes a pad with no takes when no sounds are given (a scene pad)", async () => {
    const { result } = inApp(() => useCreatePad());
    await result.mutateAsync({ pad: { page_id: "pg", lane: 1, grid_row: 0, playlist_id: "pl" } });
    expect(fake.rows("soundboard_pad_takes")).toEqual([]);
  });

  it("removes the new pad again when its takes cannot be written, so no empty sound pad is left on the board", async () => {
    fake.failNext("soundboard_pad_takes", { message: "takes boom" });
    const { result } = inApp(() => useCreatePad());
    await expect(
      result.mutateAsync({ pad: { page_id: "pg", lane: 3, grid_row: 0 }, soundIds: ["s-a"] }),
    ).rejects.toMatchObject({ message: "takes boom" });
    expect(fake.rows("soundboard_pads")).toEqual([]);
  });

  it("refuses to create without a campaign", async () => {
    session.campaignId = null;
    const { result } = inApp(() => useCreatePad());
    await expect(result.mutateAsync({ pad: { page_id: "pg", lane: 0, grid_row: 0 } })).rejects.toThrow();
    expect(fake.rows("soundboard_pads")).toEqual([]);
  });
});

describe("takes", () => {
  it("adds a take after the current last one", async () => {
    fake.seed("soundboard_pad_takes", [
      { id: "t1", pad_id: "p1", sound_id: "s1", position: 0 },
      { id: "t2", pad_id: "p1", sound_id: "s2", position: 4 },
      { id: "x", pad_id: "other", sound_id: "s9", position: 9 },
    ]);
    const { result } = inApp(() => useAddTake());
    await result.mutateAsync({ padId: "p1", soundId: "s3" });
    expect(fake.rows("soundboard_pad_takes").find((t) => t.sound_id === "s3")?.position).toBe(5);
  });

  it("starts a take-less pad at position 0", async () => {
    const { result } = inApp(() => useAddTake());
    await result.mutateAsync({ padId: "p1", soundId: "s3" });
    expect(fake.rows("soundboard_pad_takes")[0]?.position).toBe(0);
  });

  it("removes only the named take", async () => {
    fake.seed("soundboard_pad_takes", [
      { id: "t1", pad_id: "p1", position: 0 },
      { id: "t2", pad_id: "p1", position: 1 },
    ]);
    const { result } = inApp(() => useRemoveTake());
    await result.mutateAsync("t1");
    expect(fake.rows("soundboard_pad_takes").map((t) => t.id)).toEqual(["t2"]);
  });

  it("reorders by the given id order and leaves another pad's take alone", async () => {
    fake.seed("soundboard_pad_takes", [
      { id: "t1", pad_id: "p1", position: 0 },
      { id: "t2", pad_id: "p1", position: 1 },
      { id: "foreign", pad_id: "p2", position: 7 },
    ]);
    const { result } = inApp(() => useReorderTakes());
    await result.mutateAsync({ padId: "p1", takeIds: ["t2", "t1", "foreign"] });
    const pos = Object.fromEntries(fake.rows("soundboard_pad_takes").map((t) => [t.id, t.position]));
    expect(pos).toEqual({ t1: 1, t2: 0, foreign: 7 });
  });
});

describe("useMovePad", () => {
  it("calls the swap RPC with the slot", async () => {
    fake.onRpc("move_soundboard_pad", () => null);
    const { result } = inApp(() => useMovePad());
    await result.mutateAsync({ padId: "p1", pageId: "pg", lane: 2, row: 5 });
    expect(fake.calls.at(-1)?.payload).toEqual({ p_pad_id: "p1", p_page_id: "pg", p_lane: 2, p_row: 5 });
  });

  it("throws the RPC's error", async () => {
    fake.failNext("move_soundboard_pad", { message: "nope" });
    const { result } = inApp(() => useMovePad());
    await expect(result.mutateAsync({ padId: "p1", pageId: "pg", lane: 2, row: 5 })).rejects.toMatchObject({
      message: "nope",
    });
  });
});

describe("useUpdatePageLane", () => {
  const page = { id: "pg", campaign_id: "camp-1", lanes: DEFAULT_LANES } as Partial<SoundboardPage> as SoundboardPage;

  function setup() {
    fake.seed("soundboard_pages", [{ id: "pg", campaign_id: "camp-1", lanes: DEFAULT_LANES }]);
    const app = inApp(() => useUpdateLane());
    app.queryClient.setQueryData(["soundboard_pages", "camp-1"], [page]);
    return app;
  }
  const useUpdateLane = () => useUpdatePageLane();

  it("replaces just the one lane and keeps the other seven", async () => {
    const { result } = setup();
    await result.mutateAsync({ pageId: "pg", laneIndex: 1, patch: { rule: "together" } });
    const saved = fake.rows("soundboard_pages")[0]?.lanes as typeof DEFAULT_LANES;
    expect(saved[1]).toEqual({ name: "Place", rule: "together", feed: "place" });
    expect(saved.filter((_, i) => i !== 1)).toEqual(DEFAULT_LANES.filter((_, i) => i !== 1));
  });

  // Fails if the feed is not taken off the lane that had it: the save would carry
  // one feed in two lanes and the database CHECK would refuse it.
  it("moves a feed off the lane that had it", async () => {
    const { result } = setup();
    await result.mutateAsync({ pageId: "pg", laneIndex: 3, patch: { feed: "music" } });
    const saved = fake.rows("soundboard_pages")[0]?.lanes as typeof DEFAULT_LANES;
    expect(saved[3]?.feed).toBe("music");
    expect(saved[0]?.feed).toBeNull();
  });

  it("refuses an empty name before it reaches the database", async () => {
    const { result } = setup();
    await expect(result.mutateAsync({ pageId: "pg", laneIndex: 0, patch: { name: "" } })).rejects.toThrow();
    expect(fake.rows("soundboard_pages")[0]?.lanes).toEqual(DEFAULT_LANES);
  });

  it("refuses a page that is not in the cache", async () => {
    const { result } = setup();
    await expect(result.mutateAsync({ pageId: "ghost", laneIndex: 0, patch: { name: "x" } })).rejects.toThrow();
  });
});
