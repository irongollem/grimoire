import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchLocationDescriptions } from "./useLocationDescriptions";

const mocks = vi.hoisted(() => ({
  inCalls: [] as string[][],
  error: null as Error | null,
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        in: (_column: string, ids: string[]) => {
          mocks.inCalls.push(ids);
          return Promise.resolve({
            data: mocks.error ? null : ids.map((id) => ({ id, description: `d-${id}` })),
            error: mocks.error,
          });
        },
      }),
    }),
  },
}));

describe("fetchLocationDescriptions", () => {
  beforeEach(() => {
    mocks.inCalls.length = 0;
    mocks.error = null;
  });

  it("reads only the requested rows, keyed by id", async () => {
    const map = await fetchLocationDescriptions(["a", "b"]);
    expect(mocks.inCalls).toEqual([["a", "b"]]);
    expect(map.get("a")).toBe("d-a");
    expect(map.size).toBe(2);
  });

  it("splits a large request into chunks", async () => {
    const ids = Array.from({ length: 230 }, (_, i) => `id-${i}`);
    const map = await fetchLocationDescriptions(ids);
    expect(mocks.inCalls.map((c) => c.length)).toEqual([100, 100, 30]);
    expect(map.size).toBe(230);
  });

  it("throws the database error instead of reporting an empty map", async () => {
    mocks.error = new Error("boom");
    await expect(fetchLocationDescriptions(["a"])).rejects.toThrow("boom");
  });
});
