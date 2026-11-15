import { describe, expect, it, vi } from "vitest";
import { repairWhenKeyed, type RunDeps } from "./nameRepairRun";
import type { JudgeResult } from "./typesafe";

const offered = [{ name: "Skeleton Archer" }];
const near = { names: [{ name: "Skeletal Archers" }], offered, context: "c" };

const pick: JudgeResult = {
  model: "m",
  inputTokens: 40,
  answers: { entry: { type: "choice", choice: "Skeleton Archer", confidence: 0.9, probabilities: { "Skeleton Archer": 0.9 } } },
};

function deps(over: Partial<RunDeps> = {}): RunDeps {
  return {
    getKey: vi.fn().mockResolvedValue("key"),
    judge: vi.fn().mockResolvedValue(pick),
    record: vi.fn().mockResolvedValue(undefined),
    ...over,
  };
}

describe("repairWhenKeyed", () => {
  it("makes no call and writes no spend when there is no typesafe key (the feature is off until a row exists)", async () => {
    const d = deps({ getKey: vi.fn().mockResolvedValue(undefined) });
    const r = (await repairWhenKeyed([near], d))[0];
    expect(r.size).toBe(0);
    expect(d.judge).not.toHaveBeenCalled();
    expect(d.record).not.toHaveBeenCalled();
  });

  it("does not even read the key when every name is already an offered name", async () => {
    const d = deps();
    await repairWhenKeyed([{ ...near, names: [{ name: "skeleton archer" }] }], d);
    expect(d.getKey).not.toHaveBeenCalled();
  });

  it("a failed key read repairs nothing and does not throw", async () => {
    const d = deps({ getKey: vi.fn().mockRejectedValue(new Error("db down")) });
    expect((await repairWhenKeyed([near], d))[0].size).toBe(0);
    expect(d.judge).not.toHaveBeenCalled();
  });

  it("repairs and records the spend exactly once", async () => {
    const d = deps();
    const r = (await repairWhenKeyed([{ ...near, names: [{ name: "Skeletal Archers" }, { name: "Skeleton Archers" }] }], d))[0];
    expect(r.get("Skeletal Archers")).toBe("Skeleton Archer");
    expect(d.record).toHaveBeenCalledTimes(1);
    expect(d.record).toHaveBeenCalledWith(80);
  });

  it("records nothing when no judgment finished", async () => {
    const d = deps({ judge: vi.fn().mockRejectedValue(new Error("boom")) });
    expect((await repairWhenKeyed([near], d))[0].size).toBe(0);
    expect(d.record).not.toHaveBeenCalled();
  });

  it("a failed ledger write still returns the repairs", async () => {
    const d = deps({ record: vi.fn().mockRejectedValue(new Error("ledger")) });
    expect((await repairWhenKeyed([near], d))[0].get("Skeletal Archers")).toBe("Skeleton Archer");
  });

  it("keeps each group's repairs apart and records one spend row for all of them", async () => {
    const d = deps();
    const places = { names: [{ name: "Skeletal Archers" }], offered: [{ name: "Skeleton Archer" }], context: "c" };
    const people = { names: [{ name: "Gobbo" }], offered: [{ name: "Tom" }], context: "c" };
    const [a, b] = await repairWhenKeyed([places, people], d);
    expect(a.get("Skeletal Archers")).toBe("Skeleton Archer");
    expect(b.size).toBe(0);
    expect(d.record).toHaveBeenCalledTimes(1);
  });
});
