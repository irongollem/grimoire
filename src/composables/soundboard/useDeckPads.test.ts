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

  // Fails if the cleanup delete's error is dropped: an empty pad would stay and nobody would hear of it.
  it("reports both errors when the cleanup delete also fails", async () => {
    fake.failNext("soundboard_pad_takes", { message: "takes boom" });
    fake.failNext("soundboard_pads", { message: "cleanup boom" }, { after: 1 });
    const { result } = inApp(() => useCreatePad());
    const failure = await result
      .mutateAsync({ pad: { page_id: "pg", lane: 3, grid_row: 0 }, soundIds: ["s-a"] })
      .catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(AggregateError);
    expect((failure as AggregateError).errors).toMatchObject([{ message: "takes boom" }, { message: "cleanup boom" }]);
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

  // Fails if the reorder goes back to one write per take: not atomic, and a ring per take.
  it("reorders with one RPC call carrying the ids in order", async () => {
    fake.onRpc("reorder_soundboard_pad_takes", () => null);
    const { result } = inApp(() => useReorderTakes());
    await result.mutateAsync({ padId: "p1", takeIds: ["t2", "t1", "t3"] });
    const rpcCalls = fake.calls.filter((c) => c.target === "reorder_soundboard_pad_takes");
    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0]?.payload).toEqual({ p_pad_id: "p1", p_take_ids: ["t2", "t1", "t3"] });
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

  // Fails if the client rebuilds the whole lanes array: a concurrent edit to another lane would be lost.
  it("sends only the one lane's patch to the server", async () => {
    fake.onRpc("update_soundboard_page_lane", () => null);
    const { result } = setup();
    await result.mutateAsync({ pageId: "pg", laneIndex: 1, patch: { rule: "together" } });
    const rpcCalls = fake.calls.filter((c) => c.target === "update_soundboard_page_lane");
    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0]?.payload).toEqual({ p_page_id: "pg", p_lane: 1, p_patch: { rule: "together" } });
  });

  it("throws the server's refusal", async () => {
    fake.failNext("update_soundboard_page_lane", { message: "bad lane" });
    const { result } = setup();
    await expect(result.mutateAsync({ pageId: "pg", laneIndex: 0, patch: { name: "" } })).rejects.toMatchObject({
      message: "bad lane",
    });
  });
});
