import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ from: vi.fn() }));

vi.mock("@/lib/supabase", () => ({
  supabase: { from: mocks.from, rpc: vi.fn() },
}));

import { fetchBeats } from "./useQuestFlow";

// A generated quest writes beats 2..N in one insert, so they share a
// created_at; canvas_x (story position) then id keep the read deterministic.
describe("fetchBeats ordering", () => {
  beforeEach(() => mocks.from.mockReset());

  it("orders by created_at, then canvas_x, then id", async () => {
    const calls: Array<[string, unknown]> = [];
    const chain: Record<string, unknown> = {};
    chain.select = vi.fn(() => chain);
    chain.eq = vi.fn(() => chain);
    chain.neq = vi.fn(() => chain);
    chain.order = vi.fn((column: string, opts: unknown) => {
      calls.push([column, opts]);
      return calls.length === 3 ? Promise.resolve({ data: [{ id: "b1" }], error: null }) : chain;
    });
    mocks.from.mockReturnValue(chain);

    expect(await fetchBeats("q1")).toEqual([{ id: "b1" }]);
    expect(mocks.from).toHaveBeenCalledWith("quest_beats");
    expect(calls).toEqual([
      ["created_at", { ascending: true }],
      ["canvas_x", { ascending: true }],
      ["id", { ascending: true }],
    ]);
  });
});
