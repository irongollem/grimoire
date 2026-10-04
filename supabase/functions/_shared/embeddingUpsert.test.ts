import { describe, expect, it } from "vitest";
import { chunkRows, upsertEmbeddingsInChunks } from "./embeddingUpsert.ts";

function fakeClient(failOnCall?: number) {
  const calls: Array<{ table: string; rows: number; onConflict: string }> = [];
  return {
    calls,
    from: (table: string) => ({
      upsert: (rows: Record<string, unknown>[], { onConflict }: { onConflict: string }) => {
        calls.push({ table, rows: rows.length, onConflict });
        return Promise.resolve({ error: calls.length === failOnCall ? { message: "canceling statement due to statement timeout" } : null });
      },
    }),
  };
}

const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ library_monster_id: `m${i}` }));

describe("chunkRows", () => {
  it("splits into full chunks and a remainder", () => {
    expect(chunkRows([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunkRows([], 20)).toEqual([]);
  });
});

describe("upsertEmbeddingsInChunks", () => {
  it("writes a 100-row batch as five statements of twenty", async () => {
    const client = fakeClient();
    const result = await upsertEmbeddingsInChunks(client, "library_monster_embeddings", rows(100), "library_monster_id");
    expect(result).toEqual({ stored: 100, error: null });
    expect(client.calls.map((c) => c.rows)).toEqual([20, 20, 20, 20, 20]);
    expect(client.calls.every((c) => c.onConflict === "library_monster_id")).toBe(true);
  });

  it("stops at the first failing chunk and reports what was stored before it", async () => {
    const client = fakeClient(3);
    const result = await upsertEmbeddingsInChunks(client, "library_monster_embeddings", rows(100), "library_monster_id");
    expect(result.stored).toBe(40);
    expect(result.error?.message).toMatch(/statement timeout/);
    expect(client.calls).toHaveLength(3);
  });
});
