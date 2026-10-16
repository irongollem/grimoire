import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("@/lib/supabase", () => ({ supabase: { rpc: mocks.rpc } }));

import { fetchPlayerNoticeBoards, takeNoticeBoardPin } from "./usePlayerNoticeBoards";

beforeEach(() => mocks.rpc.mockReset());

describe("fetchPlayerNoticeBoards", () => {
  it("asks the projection for the campaign's boards", async () => {
    const boards = [{ id: "b1", name: "The Rusty Flagon's board", presented_at: null, pins: [] }];
    mocks.rpc.mockResolvedValue({ data: boards, error: null });
    expect(await fetchPlayerNoticeBoards("camp-1")).toEqual(boards);
    expect(mocks.rpc).toHaveBeenCalledWith("get_player_notice_boards", { p_campaign_id: "camp-1" });
  });

  it("throws rather than showing a failed read as a bare wall", async () => {
    const error = new Error("not a member");
    mocks.rpc.mockResolvedValue({ data: null, error });
    await expect(fetchPlayerNoticeBoards("camp-1")).rejects.toBe(error);
  });
});

describe("takeNoticeBoardPin", () => {
  it("returns taken, with the quest the notice offered", async () => {
    const result = { outcome: "taken", taken_by_name: "Aria", quest_id: "q1", handout_id: null };
    mocks.rpc.mockResolvedValue({ data: result, error: null });
    expect(await takeNoticeBoardPin("pin-grell")).toEqual(result);
    expect(mocks.rpc).toHaveBeenCalledWith("take_notice_board_pin", { p_pin_id: "pin-grell" });
  });

  it("treats losing the race as an answer, not an error", async () => {
    const result = { outcome: "already_taken", taken_by_name: "Brom", quest_id: null, handout_id: "h1" };
    mocks.rpc.mockResolvedValue({ data: result, error: null });
    await expect(takeNoticeBoardPin("pin-grell")).resolves.toEqual(result);
  });

  it("throws a real failure", async () => {
    const error = new Error("board is not presented");
    mocks.rpc.mockResolvedValue({ data: null, error });
    await expect(takeNoticeBoardPin("pin-grell")).rejects.toBe(error);
  });
});
