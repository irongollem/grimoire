// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { createApp, defineComponent, h } from "vue";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});
const mocks = vi.hoisted(() => ({
  sweep: vi.fn(),
  user: { id: "dm-1" } as { id: string } | null,
}));

vi.mock("@/lib/storage", () => ({ deleteUnreferencedByPublicUrl: mocks.sweep }));

vi.mock("@/lib/supabase", () => ({
  supabase: fake.client,
  getCurrentUser: () => mocks.user,
}));

import {
  fetchNoticeBoards,
  fetchNoticeBoardPins,
  fetchCampaignNoticeBoardPins,
  createNoticeBoard,
  createNoticeBoardPin,
  deleteNoticeBoard,
  deleteNoticeBoardPin,
  useUpdateNoticeBoardPin,
  useSetNoticeBoardRevealed,
  usePinNoticeBackUp,
} from "./useNoticeBoards";

const FLAGON = "The Rusty Flagon's board";

function mountWith<T>(qc: QueryClient, setup: () => T): T {
  let out!: T;
  const app = createApp(defineComponent({ setup() { out = setup(); return () => h("div"); } }));
  app.use(VueQueryPlugin, { queryClient: qc });
  app.mount(document.createElement("div"));
  return out;
}

const A = "https://cdn.example.invalid/a.webp";
const B = "https://cdn.example.invalid/b.webp";
const OTHER = "https://cdn.example.invalid/other-board.webp";

beforeEach(() => {
  fake.reset();
  mocks.sweep.mockReset();
  mocks.user = { id: "dm-1" };
});

describe("notice board reads", () => {
  it("lists only the campaign's own boards, by name", async () => {
    fake.seed("notice_boards", [
      { id: "b2", campaign_id: "camp-1", name: "Zed's board" },
      { id: "b1", campaign_id: "camp-1", name: FLAGON },
      { id: "b3", campaign_id: "camp-2", name: "Another table's board" },
    ]);
    expect((await fetchNoticeBoards("camp-1")).map((b) => b.id)).toEqual(["b1", "b2"]);
  });

  it("orders a board's pins by sort_order, then created_at, and leaves other boards' pins out", async () => {
    fake.seed("notice_board_pins", [
      { id: "late", board_id: "b1", sort_order: 1, created_at: "2026-01-02" },
      { id: "tie-new", board_id: "b1", sort_order: 0, created_at: "2026-01-03" },
      { id: "tie-old", board_id: "b1", sort_order: 0, created_at: "2026-01-01" },
      { id: "elsewhere", board_id: "b2", sort_order: 0, created_at: "2026-01-01" },
    ]);
    expect((await fetchNoticeBoardPins("b1")).map((p) => p.id)).toEqual(["tie-old", "tie-new", "late"]);
  });

  it("reads every pin of the campaign for the list cards, and no other campaign's", async () => {
    fake.seed("notice_board_pins", [
      { id: "p1", campaign_id: "camp-1", board_id: "b1", sort_order: 0, created_at: "t" },
      { id: "p2", campaign_id: "camp-1", board_id: "b2", sort_order: 0, created_at: "t" },
      { id: "p3", campaign_id: "camp-2", board_id: "b3", sort_order: 0, created_at: "t" },
    ]);
    expect((await fetchCampaignNoticeBoardPins("camp-1")).map((p) => p.id).sort()).toEqual(["p1", "p2"]);
  });

  it("throws the error instead of reading it as an empty board", async () => {
    fake.failNext("notice_boards", { message: "permission denied" });
    await expect(fetchNoticeBoards("camp-1")).rejects.toMatchObject({ message: "permission denied" });
  });
});

describe("notice board writes", () => {
  it("stamps the signed-in user on a new board and a new pin", async () => {
    await createNoticeBoard({ campaign_id: "camp-1", name: FLAGON });
    await createNoticeBoardPin({
      campaign_id: "camp-1",
      board_id: "b1",
      style: "poster",
      headline: "Grell Ashmantle",
      reward: "50 gold crowns",
    });
    expect(fake.rows("notice_boards")).toMatchObject([{ name: FLAGON, user_id: "dm-1" }]);
    expect(fake.rows("notice_board_pins")).toMatchObject([{ headline: "Grell Ashmantle", user_id: "dm-1" }]);
  });

  it("refuses to create without a signed-in user", async () => {
    mocks.user = null;
    await expect(createNoticeBoard({ campaign_id: "camp-1", name: FLAGON })).rejects.toThrow(/signed-in/);
    await expect(createNoticeBoardPin({ campaign_id: "camp-1", board_id: "b1", style: "poster" })).rejects.toThrow(/signed-in/);
    expect(fake.calls).toEqual([]);
  });

  // presented_at requires is_revealed (a check constraint), so hiding a board must also take it off the table.
  it("hiding a revealed, presented board takes it off the table in the same write", async () => {
    fake.seed("notice_boards", [{ id: "b1", is_revealed: true, presented_at: "2026-01-01T00:00:00Z" }]);
    const qc = new QueryClient();
    await mountWith(qc, () => useSetNoticeBoardRevealed()).mutateAsync({ boardId: "b1", revealed: false });
    expect(fake.rows("notice_boards")).toMatchObject([{ id: "b1", is_revealed: false, presented_at: null }]);
  });

  it("revealing a board leaves it as presented as it was", async () => {
    fake.seed("notice_boards", [{ id: "b1", is_revealed: false, presented_at: null }]);
    await mountWith(new QueryClient(), () => useSetNoticeBoardRevealed()).mutateAsync({ boardId: "b1", revealed: true });
    expect(fake.rows("notice_boards")).toMatchObject([{ id: "b1", is_revealed: true, presented_at: null }]);
  });

  // status 'taken' requires taken_at (a check constraint), so the taken fields clear together.
  it("puts a taken pin back up with every taken field cleared together, and touches no other pin", async () => {
    const taken = { status: "taken", taken_by: "Aria", taken_at: "2026-01-01", taken_session_number: 3 };
    fake.seed("notice_board_pins", [{ id: "p1", ...taken }, { id: "p2", ...taken }]);
    await mountWith(new QueryClient(), () => usePinNoticeBackUp()).mutateAsync("p1");
    expect(fake.rows("notice_board_pins")).toMatchObject([
      { id: "p1", status: "up", taken_by: null, taken_at: null, taken_session_number: null },
      { id: "p2", status: "taken", taken_by: "Aria" },
    ]);
  });

  it("surfaces a failed pin delete and sweeps nothing", async () => {
    fake.seed("notice_board_pins", [{ id: "p1", image_url: A }]);
    fake.failNext("notice_board_pins", { message: "row not found" });
    await expect(deleteNoticeBoardPin("p1")).rejects.toMatchObject({ message: "row not found" });
    expect(mocks.sweep).not.toHaveBeenCalled();
  });

  it("sweeps a deleted pin's picture after the row is gone, and only that pin's", async () => {
    fake.seed("notice_board_pins", [{ id: "p1", image_url: A }, { id: "p2", image_url: B }]);
    await deleteNoticeBoardPin("p1");
    expect(fake.rows("notice_board_pins").map((p) => p.id)).toEqual(["p2"]);
    expect(mocks.sweep).toHaveBeenCalledWith({ urls: [A] });
  });

  it("sweeps every picture of a deleted board's pins and none of another board's", async () => {
    fake.seed("notice_boards", [{ id: "b1" }, { id: "b2" }]);
    fake.seed("notice_board_pins", [
      { id: "p1", board_id: "b1", image_url: A, sort_order: 0, created_at: "t" },
      { id: "p2", board_id: "b1", image_url: null, sort_order: 1, created_at: "t" },
      { id: "p3", board_id: "b1", image_url: B, sort_order: 2, created_at: "t" },
      { id: "p4", board_id: "b2", image_url: OTHER, sort_order: 0, created_at: "t" },
    ]);
    await deleteNoticeBoard("b1");
    expect(fake.rows("notice_boards").map((b) => b.id)).toEqual(["b2"]);
    const swept = mocks.sweep.mock.calls[0]?.[0].urls as (string | null)[];
    expect(swept).toEqual(expect.arrayContaining([A, B]));
    expect(swept).not.toContain(OTHER);
  });

  it("keeps the pictures when the board delete fails", async () => {
    fake.seed("notice_boards", [{ id: "b1" }]);
    fake.seed("notice_board_pins", [{ id: "p1", board_id: "b1", image_url: A, sort_order: 0, created_at: "t" }]);
    fake.failNext("notice_boards", { message: "denied" });
    await expect(deleteNoticeBoard("b1")).rejects.toMatchObject({ message: "denied" });
    expect(mocks.sweep).not.toHaveBeenCalled();
  });
});

describe("updating a pin", () => {
  it("writes the saved row into both pin lists and leaves the refetch to the doorbell", async () => {
    const qc = new QueryClient();
    const before = { id: "p1", x: 0.1, updated_at: "t0" };
    qc.setQueryData(["notice-boards", "pins", "b1"], [before]);
    qc.setQueryData(["notice-boards", "campaign-pins", "camp-1"], [before]);
    const invalidate = vi.spyOn(qc, "invalidateQueries");
    // The server's copy is newer than the cache's, so the saved row (not the optimistic patch) must land.
    fake.seed("notice_board_pins", [{ id: "p1", x: 0.1, updated_at: "t1" }]);
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
    fake.seed("notice_board_pins", [{ id: "p1", x: 0.1, updated_at: "t0" }]);
    fake.failNext("notice_board_pins", { message: "denied" });
    const update = mountWith(qc, () => useUpdateNoticeBoardPin());
    await expect(update.mutateAsync({ id: "p1", update: { x: 0.4 } })).rejects.toMatchObject({ message: "denied" });
    expect(qc.getQueryData(["notice-boards", "pins", "b1"])).toEqual([before]);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["notice-boards"] });
  });
});
