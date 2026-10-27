import { beforeEach, describe, expect, it, vi } from "vitest";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});
vi.mock("@/lib/supabase", () => ({ supabase: fake.client }));

import { fetchBeats } from "./useQuestFlow";

beforeEach(() => fake.reset());

// A generated quest writes beats 2..N in one insert, so they share a
// created_at; canvas_x (story position) then id keep the read deterministic.
describe("fetchBeats", () => {
  it("orders by created_at, then canvas_x, then id", async () => {
    fake.seed("quest_beats", [
      { id: "b4", quest_id: "q1", kind: "neutral", created_at: "2026-02-01", canvas_x: 0 },
      { id: "b3-z", quest_id: "q1", kind: "neutral", created_at: "2026-01-01", canvas_x: 200 },
      { id: "b3-a", quest_id: "q1", kind: "neutral", created_at: "2026-01-01", canvas_x: 200 },
      { id: "b2", quest_id: "q1", kind: "neutral", created_at: "2026-01-01", canvas_x: 100 },
    ]);
    expect((await fetchBeats("q1")).map((b) => b.id)).toEqual(["b2", "b3-a", "b3-z", "b4"]);
  });

  it("returns this quest's live beats only: not another quest's, not an archived one", async () => {
    fake.seed("quest_beats", [
      { id: "mine", quest_id: "q1", kind: "social", created_at: "2026-01-01", canvas_x: 0 },
      { id: "gone", quest_id: "q1", kind: "archived", created_at: "2026-01-02", canvas_x: 0 },
      { id: "theirs", quest_id: "q2", kind: "social", created_at: "2026-01-03", canvas_x: 0 },
    ]);
    expect((await fetchBeats("q1")).map((b) => b.id)).toEqual(["mine"]);
  });

  it("throws the read error instead of reading as an empty quest", async () => {
    fake.failNext("quest_beats", { message: "boom" });
    await expect(fetchBeats("q1")).rejects.toMatchObject({ message: "boom" });
  });
});
