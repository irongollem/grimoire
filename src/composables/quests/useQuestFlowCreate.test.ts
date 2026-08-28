import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { rpc: mocks.rpc } }));

import { createQuestBeatWithRoute } from "./useQuestFlow";

describe("createQuestBeatWithRoute", () => {
  beforeEach(() => mocks.rpc.mockReset());

  it("creates the beat and optional incoming route through one RPC", async () => {
    mocks.rpc.mockResolvedValue({ data: { id: "new-beat" }, error: null });
    await expect(createQuestBeatWithRoute({
      questId: "quest-1", title: "The bargain", kind: "social", canvasX: 320, canvasY: 40,
      sourceBeatId: "source-1", edgeLabel: "Accepts",
    })).resolves.toEqual({ id: "new-beat" });
    expect(mocks.rpc).toHaveBeenCalledWith("create_quest_beat_with_route", {
      p_quest_id: "quest-1", p_title: "The bargain", p_kind: "social", p_canvas_x: 320,
      p_canvas_y: 40, p_source_beat_id: "source-1", p_edge_label: "Accepts",
    });
  });

  it("surfaces transaction failure without attempting client rollback", async () => {
    const error = new Error("route rejected");
    mocks.rpc.mockResolvedValue({ data: null, error });
    await expect(createQuestBeatWithRoute({
      questId: "quest-1", title: "Orphan", kind: "neutral", canvasX: 0, canvasY: 0,
    })).rejects.toBe(error);
    expect(mocks.rpc).toHaveBeenCalledOnce();
  });
});
