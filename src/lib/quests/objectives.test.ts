import { describe, expect, it } from "vitest";
import { countObjectivesComplete, isObjectiveResolved, nextObjectiveStatus } from "./objectives";

describe("quest objective status", () => {
  it("cycles the manual control back to open rather than stranding it", () => {
    expect(nextObjectiveStatus("pending")).toBe("complete");
    expect(nextObjectiveStatus("complete")).toBe("failed");
    // A DM who over-clicks must be able to keep clicking back to the start.
    expect(nextObjectiveStatus("failed")).toBe("pending");
  });

  it("raises a dormant objective on click, but never as part of the three-way cycle", () => {
    // Dormant has exactly one way out, and it is not reachable by clicking any
    // of pending/complete/failed — nothing in the cycle above should ever land
    // back on dormant.
    expect(nextObjectiveStatus("dormant")).toBe("pending");
    expect([nextObjectiveStatus("pending"), nextObjectiveStatus("complete"), nextObjectiveStatus("failed")])
      .not.toContain("dormant");
  });

  it("counts only completions, and treats failure as resolved", () => {
    const objectives = [{ status: "complete" as const }, { status: "failed" as const }, { status: "pending" as const }];
    // A failed objective is settled but is not progress — the tally the party
    // reads must not credit it.
    expect(countObjectivesComplete(objectives)).toBe(1);
    expect(objectives.map(isObjectiveResolved)).toEqual([true, true, false]);
  });

  it("treats a dormant objective as the least resolved thing there is", () => {
    // Dormant means "not yet raised" — it must never read as resolved, which
    // is exactly backwards (it is the state a branch never taken sits in
    // forever). isObjectiveResolved must say so positively, not by negating
    // "pending", or a state added after this one silently mis-classifies.
    expect(isObjectiveResolved({ status: "dormant" })).toBe(false);
    expect(countObjectivesComplete([{ status: "dormant" as const }])).toBe(0);
  });
});
