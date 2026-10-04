import { describe, expect, it, vi } from "vitest";
import { refusalReason, writeBatchIsolatingFailures } from "./batchWrite";

describe("writeBatchIsolatingFailures", () => {
  it("writes every row in one request when nothing is refused", async () => {
    const writeMany = vi.fn(async (rows: number[]) => rows.map((n) => n * 10));
    const outcome = await writeBatchIsolatingFailures([1, 2, 3], writeMany);
    expect(writeMany).toHaveBeenCalledTimes(1);
    expect(outcome).toEqual({ written: [10, 20, 30], refused: [] });
  });

  it("sends nothing for an empty list", async () => {
    const writeMany = vi.fn(async () => []);
    expect(await writeBatchIsolatingFailures([], writeMany)).toEqual({ written: [], refused: [] });
    expect(writeMany).not.toHaveBeenCalled();
  });

  it("falls back to one request per row when the batch is refused, so one bad row costs only itself", async () => {
    const bad = { message: "refused by trigger" };
    const writeMany = vi.fn(async (rows: number[]) => {
      if (rows.includes(2)) throw bad;
      return rows.map((n) => n * 10);
    });
    const outcome = await writeBatchIsolatingFailures([1, 2, 3], writeMany);
    expect(writeMany).toHaveBeenCalledTimes(4); // the batch, then each row
    expect(outcome.written.sort()).toEqual([10, 30]);
    expect(outcome.refused).toEqual([{ item: 2, error: bad }]);
  });

  it("does not retry a single refused row", async () => {
    const writeMany = vi.fn(async () => { throw new Error("no"); });
    const outcome = await writeBatchIsolatingFailures(["only"], writeMany);
    expect(writeMany).toHaveBeenCalledTimes(1);
    expect(outcome.refused).toHaveLength(1);
  });

  it("accepts a write that returns nothing", async () => {
    const outcome = await writeBatchIsolatingFailures([1, 2], async () => {});
    expect(outcome).toEqual({ written: [], refused: [] });
  });
});

describe("refusalReason", () => {
  it("reads a Supabase error's message, which is not an Error instance", () => {
    expect(refusalReason({ message: "violates check" })).toBe("violates check");
    expect(refusalReason(new Error("boom"))).toBe("boom");
    expect(refusalReason("??")).toBe("the write was refused");
  });
});
