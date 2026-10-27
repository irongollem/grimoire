import { beforeEach, describe, expect, it, vi } from "vitest";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});
vi.mock("@/lib/supabase", () => ({ supabase: fake.client }));

import { createQuestBeatWithRoute } from "./useQuestFlow";

beforeEach(() => fake.reset());

describe("createQuestBeatWithRoute", () => {
  // The x and y of a canvas drop are both numbers, so the types cannot tell a
  // swap from the real thing.
  it("creates the beat and its incoming route through one RPC, x and y in their own places", async () => {
    let seen: Record<string, unknown> = {};
    fake.onRpc("create_quest_beat_with_route", (args) => {
      seen = args;
      return { id: "new-beat" };
    });
    await expect(
      createQuestBeatWithRoute({
        questId: "quest-1", title: "The bargain", kind: "social", canvasX: 320, canvasY: 40,
        sourceBeatId: "source-1",
      }),
    ).resolves.toEqual({ id: "new-beat" });
    expect(seen).toMatchObject({ p_canvas_x: 320, p_canvas_y: 40, p_source_beat_id: "source-1" });
  });

  it("surfaces a transaction failure instead of resolving with nothing", async () => {
    fake.failNext("create_quest_beat_with_route", { message: "route rejected" });
    await expect(
      createQuestBeatWithRoute({ questId: "quest-1", title: "Orphan", kind: "neutral", canvasX: 0, canvasY: 0 }),
    ).rejects.toMatchObject({ message: "route rejected" });
  });
});
