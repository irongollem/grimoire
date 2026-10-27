import { beforeEach, describe, expect, it, vi } from "vitest";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});
vi.mock("@/lib/supabase", () => ({ supabase: fake.client }));

import { archiveQuestBeat } from "./useQuestFlow";

beforeEach(() => fake.reset());

describe("archiveQuestBeat", () => {
  // #853: several threads can stand on the same archived beat at once, so a
  // single replacement beat/end-runtime pair can no longer say what happens:
  // each thread gets its own entry, beatId null meaning "end this thread".
  it("sends one replacement per thread, a null beat meaning end that thread", async () => {
    let seen: Record<string, unknown> = {};
    fake.onRpc("archive_quest_beat", (args) => {
      seen = args;
      return null;
    });
    await archiveQuestBeat({
      id: "beat-1",
      replacements: [
        { threadId: "main", beatId: "beat-2" },
        { threadId: "side", beatId: null },
      ],
    });
    expect(seen).toMatchObject({
      p_beat_id: "beat-1",
      p_replacements: [
        { thread_id: "main", beat_id: "beat-2" },
        { thread_id: "side", beat_id: null },
      ],
    });
  });

  it("surfaces an RPC failure for safe retry", async () => {
    fake.failNext("archive_quest_beat", { message: "archive rolled back" });
    await expect(archiveQuestBeat({ id: "beat-1", replacements: [] })).rejects.toMatchObject({
      message: "archive rolled back",
    });
  });
});
