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
    await archiveQuestBeat("beat-1");
    expect(mocks.rpc).toHaveBeenCalledOnce();
    expect(mocks.rpc).toHaveBeenCalledWith("archive_quest_beat", { p_beat_id: "beat-1" });
  });

  it("surfaces an RPC failure for safe retry", async () => {
    const error = new Error("archive rolled back");
    mocks.rpc.mockResolvedValue({ error });
    await expect(archiveQuestBeat("beat-1")).rejects.toBe(error);
  });
});
