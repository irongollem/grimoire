import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("@/lib/supabase", () => ({
  supabase: { rpc: mocks.rpc },
}));

import { archiveQuestBeat } from "./useQuestFlow";

describe("archiveQuestBeat", () => {
  beforeEach(() => mocks.rpc.mockReset());

  // #853: several threads can stand on the same archived beat at once, so a
  // single replacement beat/end-runtime pair can no longer say what happens —
  // each thread gets its own entry, beatId null meaning "end this thread".
  it("uses the single transactional archive RPC, one replacement per thread", async () => {
    mocks.rpc.mockResolvedValue({ error: null });
    await archiveQuestBeat({
      id: "beat-1",
      replacements: [
        { threadId: "main", beatId: "beat-2" },
        { threadId: "side", beatId: null },
      ],
    });
    expect(mocks.rpc).toHaveBeenCalledOnce();
    expect(mocks.rpc).toHaveBeenCalledWith("archive_quest_beat", {
      p_beat_id: "beat-1",
      p_replacements: [
        { thread_id: "main", beat_id: "beat-2" },
        { thread_id: "side", beat_id: null },
      ],
    });
  });

  it("sends no replacements when no thread stands on the archived beat", async () => {
    mocks.rpc.mockResolvedValue({ error: null });
    await archiveQuestBeat({ id: "beat-1", replacements: [] });
    expect(mocks.rpc).toHaveBeenCalledWith("archive_quest_beat", { p_beat_id: "beat-1", p_replacements: [] });
  });

  it("surfaces an RPC failure for safe retry", async () => {
    const error = new Error("archive rolled back");
    mocks.rpc.mockResolvedValue({ error });
    await expect(archiveQuestBeat({ id: "beat-1", replacements: [] })).rejects.toBe(error);
  });
});
