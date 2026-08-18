import { describe, expect, it } from "vitest";
import { countObjectivesComplete, isObjectiveResolved, nextObjectiveStatus } from "./objectives";

describe("quest objective status", () => {
  it("cycles the manual control back to open rather than stranding it", () => {
    expect(nextObjectiveStatus("pending")).toBe("complete");
    expect(nextObjectiveStatus("complete")).toBe("failed");
    // A DM who over-clicks must be able to keep clicking back to the start.
    expect(nextObjectiveStatus("failed")).toBe("pending");
  });

  it("counts only completions, and treats failure as resolved", () => {
    const objectives = [{ status: "complete" as const }, { status: "failed" as const }, { status: "pending" as const }];
    // A failed objective is settled but is not progress — the tally the party
    // reads must not credit it.
    expect(countObjectivesComplete(objectives)).toBe(1);
    expect(objectives.map(isObjectiveResolved)).toEqual([true, true, false]);
  });
});
