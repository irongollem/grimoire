import { describe, expect, it, vi } from "vitest";
import { createIdBatcher } from "./batchById";

interface Row {
  id: string;
  name: string;
}

function make(maxBatch?: number, present: string[] = ["a", "b", "c"]) {
  const fetchMany = vi.fn(async (ids: string[]): Promise<Row[]> =>
    ids.filter((id) => present.includes(id)).map((id) => ({ id, name: id.toUpperCase() })),
  );
  return { fetchMany, batcher: createIdBatcher<Row>({ fetchMany, idOf: (r) => r.id, maxBatch }) };
}

describe("createIdBatcher", () => {
  it("sends ids requested in the same tick as one request", async () => {
    const { fetchMany, batcher } = make();
    const [a, b] = await Promise.all([batcher.load("a"), batcher.load("b")]);
    expect(fetchMany).toHaveBeenCalledTimes(1);
    expect(fetchMany).toHaveBeenCalledWith(["a", "b"]);
    expect(a?.name).toBe("A");
    expect(b?.name).toBe("B");
  });

  it("coalesces across microtask turns within one macrotask", async () => {
    const { fetchMany, batcher } = make();
    const first = batcher.load("a");
    await Promise.resolve();
    await Promise.resolve();
    const second = batcher.load("b");
    await Promise.all([first, second]);
    expect(fetchMany).toHaveBeenCalledTimes(1);
  });

  it("dedupes an id requested twice and answers both callers", async () => {
    const { fetchMany, batcher } = make();
    const [one, two] = await Promise.all([batcher.load("a"), batcher.load("a")]);
    expect(fetchMany).toHaveBeenCalledWith(["a"]);
    expect(one).toBe(two);
  });

  it("splits a window larger than maxBatch into chunks", async () => {
    const present = ["1", "2", "3", "4", "5"];
    const { fetchMany, batcher } = make(2, present);
    const rows = await Promise.all(present.map((id) => batcher.load(id)));
    expect(fetchMany.mock.calls.map(([ids]) => ids)).toEqual([["1", "2"], ["3", "4"], ["5"]]);
    expect(rows.map((r) => r?.id)).toEqual(present);
  });

  it("resolves an id with no row as null without failing its neighbours", async () => {
    const { batcher } = make();
    const [a, missing] = await Promise.all([batcher.load("a"), batcher.load("zzz")]);
    expect(a?.id).toBe("a");
    expect(missing).toBeNull();
  });

  it("rejects every caller in a chunk when its fetch fails, and spares other chunks", async () => {
    const boom = new Error("boom");
    const fetchMany = vi.fn(async (ids: string[]): Promise<Row[]> => {
      if (ids.includes("a")) throw boom;
      return ids.map((id) => ({ id, name: id }));
    });
    const batcher = createIdBatcher<Row>({ fetchMany, idOf: (r) => r.id, maxBatch: 2 });
    const results = await Promise.allSettled([
      batcher.load("a"),
      batcher.load("b"),
      batcher.load("c"),
    ]);
    expect(results[0]).toEqual({ status: "rejected", reason: boom });
    expect(results[1]).toEqual({ status: "rejected", reason: boom });
    expect(results[2]).toMatchObject({ status: "fulfilled", value: { id: "c" } });
  });

  it("sends separate requests for separate ticks", async () => {
    const { fetchMany, batcher } = make();
    await batcher.load("a");
    await batcher.load("b");
    expect(fetchMany).toHaveBeenCalledTimes(2);
  });

  it("loadMany returns only the rows that exist", async () => {
    const { fetchMany, batcher } = make();
    const map = await batcher.loadMany(["a", "a", "b", "nope"]);
    expect(fetchMany).toHaveBeenCalledWith(["a", "b", "nope"]);
    expect([...map.keys()]).toEqual(["a", "b"]);
  });
});
