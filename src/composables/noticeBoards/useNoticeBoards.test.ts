// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { createApp, defineComponent, h } from "vue";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  sweep: vi.fn(),
  user: { id: "dm-1" } as { id: string } | null,
}));

vi.mock("@/lib/storage", () => ({ deleteUnreferencedByPublicUrl: mocks.sweep }));

vi.mock("@/lib/supabase", () => ({
  supabase: { from: mocks.from },
  getCurrentUser: () => mocks.user,
}));

import {
  fetchNoticeBoards,
  fetchNoticeBoardPins,
  fetchCampaignNoticeBoardPins,
  createNoticeBoard,
  createNoticeBoardPin,
  updateNoticeBoard,
  updateNoticeBoardPin,
  deleteNoticeBoard,
  deleteNoticeBoardPin,
  useUpdateNoticeBoardPin,
} from "./useNoticeBoards";

const FLAGON = "The Rusty Flagon's board";

/** A chainable stand-in: every builder step returns the chain, and the chain itself is the awaited result. */
function chain(result: { data: unknown; error: unknown }) {
  const promise = Promise.resolve(result);
  const methods = {} as Record<"select" | "eq" | "order" | "insert" | "update" | "delete" | "single", ReturnType<typeof vi.fn>>;
  const c = Object.assign(promise, methods);
  for (const m of ["select", "eq", "order", "insert", "update", "delete", "single"] as const) c[m] = vi.fn(() => c);
  return c;
}

beforeEach(() => {
  mocks.from.mockReset();
  mocks.sweep.mockReset();
  mocks.user = { id: "dm-1" };
});

describe("notice board reads", () => {
  it("lists a campaign's boards by name and names the campaign itself", async () => {
    const c = chain({ data: [{ id: "b1", name: FLAGON }], error: null });
    mocks.from.mockReturnValue(c);
    expect(await fetchNoticeBoards("camp-1")).toEqual([{ id: "b1", name: FLAGON }]);
    expect(mocks.from).toHaveBeenCalledWith("notice_boards");
    expect(c.eq).toHaveBeenCalledWith("campaign_id", "camp-1");
    expect(c.order).toHaveBeenCalledWith("name", { ascending: true });
  });

  it("orders a board's pins by sort_order, then created_at", async () => {
    const c = chain({ data: [], error: null });
    mocks.from.mockReturnValue(c);
    await fetchNoticeBoardPins("b1");
    expect(c.eq).toHaveBeenCalledWith("board_id", "b1");
    expect(c.order).toHaveBeenNthCalledWith(1, "sort_order", { ascending: true });
    expect(c.order).toHaveBeenNthCalledWith(2, "created_at", { ascending: true });
  });

  it("reads every pin of the campaign for the list cards", async () => {
    const c = chain({ data: [], error: null });
    mocks.from.mockReturnValue(c);
    await fetchCampaignNoticeBoardPins("camp-1");
    expect(c.eq).toHaveBeenCalledWith("campaign_id", "camp-1");
  });

  it("throws the error instead of reading it as an empty board", async () => {
    const error = new Error("permission denied");
    mocks.from.mockReturnValue(chain({ data: null, error }));
    await expect(fetchNoticeBoards("camp-1")).rejects.toBe(error);
    await expect(fetchNoticeBoardPins("b1")).rejects.toBe(error);
  });
});

describe("notice board writes", () => {
  it("stamps the signed-in user on a new board and a new pin", async () => {
    const c = chain({ data: { id: "b1" }, error: null });
    mocks.from.mockReturnValue(c);
    await createNoticeBoard({ campaign_id: "camp-1", name: FLAGON });
    expect(c.insert).toHaveBeenCalledWith({ campaign_id: "camp-1", name: FLAGON, user_id: "dm-1" });
    await createNoticeBoardPin({
      campaign_id: "camp-1",
      board_id: "b1",
      style: "poster",
      headline: "Grell Ashmantle",
      reward: "50 gold crowns",
    });
    expect(c.insert).toHaveBeenLastCalledWith(
      expect.objectContaining({ headline: "Grell Ashmantle", reward: "50 gold crowns", user_id: "dm-1" }),
    );
  });

  it("refuses to create without a signed-in user", async () => {
    mocks.user = null;
    await expect(createNoticeBoard({ campaign_id: "camp-1", name: FLAGON })).rejects.toThrow(/signed-in/);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("un-revealing clears presented_at in the same update", async () => {
    // The mutation's payload, as useSetNoticeBoardRevealed builds it: presented_at requires is_revealed.
    const c = chain({ data: { id: "b1" }, error: null });
    mocks.from.mockReturnValue(c);
    await updateNoticeBoard("b1", { is_revealed: false, presented_at: null });
    expect(c.update).toHaveBeenCalledWith({ is_revealed: false, presented_at: null });
    expect(c.eq).toHaveBeenCalledWith("id", "b1");
  });

  it("puts a taken pin back up with every taken field cleared together", async () => {
    const c = chain({ data: { id: "p1" }, error: null });
    mocks.from.mockReturnValue(c);
    await updateNoticeBoardPin("p1", { status: "up", taken_by: null, taken_at: null, taken_session_number: null });
    expect(c.update).toHaveBeenCalledWith({ status: "up", taken_by: null, taken_at: null, taken_session_number: null });
  });

  it("surfaces a failed delete", async () => {
    const error = new Error("row not found");
    mocks.from.mockReturnValue(chain({ data: null, error }));
    await expect(deleteNoticeBoardPin("p1")).rejects.toBe(error);
    expect(mocks.sweep).not.toHaveBeenCalled();
  });

  it("sweeps a deleted pin's picture after the row is gone, keeping any file another row holds", async () => {
    const c = chain({ data: [{ image_url: "https://cdn.example.invalid/dungeon-feature-images/u/a.webp" }], error: null });
    mocks.from.mockReturnValue(c);
    await deleteNoticeBoardPin("p1");
    expect(c.select).toHaveBeenCalledWith("image_url");
    expect(mocks.sweep).toHaveBeenCalledWith({ urls: ["https://cdn.example.invalid/dungeon-feature-images/u/a.webp"] });
  });

  it("sweeps every picture of a deleted board's pins, read before the cascade removes them", async () => {
    const pins = chain({
      data: [{ image_url: "https://cdn.example.invalid/a.webp" }, { image_url: null }, { image_url: "https://cdn.example.invalid/b.webp" }],
      error: null,
    });
    const gone = chain({ data: null, error: null });
    mocks.from.mockReturnValueOnce(pins).mockReturnValueOnce(gone);
    await deleteNoticeBoard("b1");
    expect(mocks.from).toHaveBeenNthCalledWith(1, "notice_board_pins");
    expect(mocks.from).toHaveBeenNthCalledWith(2, "notice_boards");
    expect(mocks.sweep).toHaveBeenCalledWith({
      urls: ["https://cdn.example.invalid/a.webp", null, "https://cdn.example.invalid/b.webp"],
    });
  });

  it("keeps the pictures when the board delete fails", async () => {
    const error = new Error("denied");
    mocks.from.mockReturnValueOnce(chain({ data: [{ image_url: "https://cdn.example.invalid/a.webp" }], error: null }));
    mocks.from.mockReturnValueOnce(chain({ data: null, error }));
    await expect(deleteNoticeBoard("b1")).rejects.toBe(error);
    expect(mocks.sweep).not.toHaveBeenCalled();
  });
});

describe("pin cache shape", () => {
  it("is a plain QueryClient key under the notice-boards root", () => {
    // The optimistic update keys off key[1]; guard the names it relies on.
    const qc = new QueryClient();
    qc.setQueryData(["notice-boards", "pins", "b1"], [{ id: "p1", x: 0.1 }]);
    expect(qc.getQueriesData({ queryKey: ["notice-boards"] })).toHaveLength(1);
  });
});

describe("updating a pin", () => {
  function mountWith<T>(qc: QueryClient, setup: () => T): T {
    let out!: T;
    const app = createApp(defineComponent({ setup() { out = setup(); return () => h("div"); } }));
    app.use(VueQueryPlugin, { queryClient: qc });
    app.mount(document.createElement("div"));
    return out;
  }

  it("writes the saved row into both pin lists and leaves the refetch to the doorbell", async () => {
    const qc = new QueryClient();
    const before = { id: "p1", x: 0.1, updated_at: "t0" };
    qc.setQueryData(["notice-boards", "pins", "b1"], [before]);
    qc.setQueryData(["notice-boards", "campaign-pins", "camp-1"], [before]);
    const invalidate = vi.spyOn(qc, "invalidateQueries");
    mocks.from.mockReturnValue(chain({ data: { id: "p1", x: 0.4, updated_at: "t1" }, error: null }));
    const update = mountWith(qc, () => useUpdateNoticeBoardPin());
    await update.mutateAsync({ id: "p1", update: { x: 0.4 } });
    expect(qc.getQueryData(["notice-boards", "pins", "b1"])).toEqual([{ id: "p1", x: 0.4, updated_at: "t1" }]);
    expect(qc.getQueryData(["notice-boards", "campaign-pins", "camp-1"])).toEqual([{ id: "p1", x: 0.4, updated_at: "t1" }]);
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("puts the pin back and refetches when the write fails", async () => {
    const qc = new QueryClient();
    const before = { id: "p1", x: 0.1, updated_at: "t0" };
    qc.setQueryData(["notice-boards", "pins", "b1"], [before]);
    const invalidate = vi.spyOn(qc, "invalidateQueries");
    mocks.from.mockReturnValue(chain({ data: null, error: new Error("denied") }));
    const update = mountWith(qc, () => useUpdateNoticeBoardPin());
    await expect(update.mutateAsync({ id: "p1", update: { x: 0.4 } })).rejects.toThrow("denied");
    expect(qc.getQueryData(["notice-boards", "pins", "b1"])).toEqual([before]);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["notice-boards"] });
  });
});
