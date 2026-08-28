import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("@/lib/supabase", () => ({
  supabase: { rpc: mocks.rpc },
}));

import { archiveQuestBeat } from "./useQuestFlow";

describe("archiveQuestBeat", () => {
  beforeEach(() => mocks.rpc.mockReset());

  it("uses the single transactional archive RPC", async () => {
    mocks.rpc.mockResolvedValue({ error: null });
    await archiveQuestBeat({ id: "beat-1", expectedRuntimeVersion: 7, replacementBeatId: "beat-2" });
    expect(mocks.rpc).toHaveBeenCalledOnce();
    expect(mocks.rpc).toHaveBeenCalledWith("archive_quest_beat", {
      p_beat_id: "beat-1", p_expected_runtime_version: 7,
      p_replacement_beat_id: "beat-2", p_end_runtime: false,
    });
  });

  it("surfaces an RPC failure for safe retry", async () => {
    const error = new Error("archive rolled back");
    mocks.rpc.mockResolvedValue({ error });
    await expect(archiveQuestBeat({ id: "beat-1" })).rejects.toBe(error);
  });
});
