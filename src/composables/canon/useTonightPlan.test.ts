import { describe, expect, it } from "vitest";
import { pinFor, reorderedPins } from "./useTonightPlan";

describe("reorderedPins", () => {
  const stored = (orders: Record<string, number>) => (id: string) => orders[id];

  // Bug caught: moving a pin swapping with the wrong neighbour, or writing every pin when two changed.
  it("swaps a pin with its neighbour and writes only the two that moved", () => {
    expect(reorderedPins(["a", "b", "c"], "b", -1, stored({ a: 0, b: 1, c: 2 }))).toEqual([{ id: "b", sort_order: 0 }, { id: "a", sort_order: 1 }]);
  });
  // Bug caught (#1279 review): after unpinning left gaps (5, 6, 7), moving the third up wrote 1 and 2 and left the
  // first at 5, so the first pin jumped to the end.
  it("renumbers every pin whose stored order no longer matches, when unpinning left gaps", () => {
    expect(reorderedPins(["a", "b", "c"], "c", -1, stored({ a: 5, b: 6, c: 7 }))).toEqual([
      { id: "a", sort_order: 0 },
      { id: "c", sort_order: 1 },
      { id: "b", sort_order: 2 },
    ]);
  });
  // Bug caught: moving the first pin up (or last down) writing a bad order.
  it("does nothing at the ends", () => {
    expect(reorderedPins(["a", "b"], "a", -1, stored({ a: 0, b: 1 }))).toEqual([]);
    expect(reorderedPins(["a", "b"], "b", 1, stored({ a: 0, b: 1 }))).toEqual([]);
  });
});

describe("pinFor", () => {
  const pin = (over: object) => ({ id: "p", user_id: "u", campaign_id: "c", clue_id: null, passage_id: null, step_id: null, entry_id: null, sort_order: 0, created_at: "", updated_at: "", ...over });
  // Bug caught: a clue's pin matching a step with the same id column value, so Pin toggles the wrong row.
  it("matches on the column the target names", () => {
    const pins = [pin({ id: "p1", step_id: "x" })];
    expect(pinFor(pins, { clue_id: "x" })).toBeUndefined();
    expect(pinFor(pins, { step_id: "x" })?.id).toBe("p1");
  });
});
