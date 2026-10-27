import { describe, expect, it } from "vitest";
import { inReadingOrder, reorderWrites } from "./readingOrder";

const pin = (id: string, status: "up" | "taken" | "draft", sort_order: number) => ({ id, status, sort_order });

describe("inReadingOrder", () => {
  it("reads what is up first, then taken stubs, then drafts, each by sort_order", () => {
    const pins = [pin("taken", "taken", 3), pin("c", "up", 4), pin("draft", "draft", 0), pin("a", "up", 1), pin("b", "up", 2)];
    expect(inReadingOrder(pins).map((p) => p.id)).toEqual(["a", "b", "c", "taken", "draft"]);
  });

  it("keeps the arrival order of rows that tie", () => {
    expect(inReadingOrder([pin("first", "up", 0), pin("second", "up", 0)]).map((p) => p.id)).toEqual(["first", "second"]);
  });
});

describe("reorderWrites", () => {
  it("trades two numbers and ignores taken notices among them", () => {
    const pins = [pin("a", "up", 1), pin("b", "up", 2), pin("taken", "taken", 3), pin("c", "up", 4)];
    expect(reorderWrites(pins, "c", -1)).toEqual([
      { id: "c", sort_order: 2 },
      { id: "b", sort_order: 4 },
    ]);
  });

  it("cannot move the last pin on the board down into the taken stubs behind it", () => {
    const pins = [pin("a", "up", 1), pin("taken", "taken", 2)];
    expect(reorderWrites(pins, "a", 1)).toEqual([]);
  });

  it("renumbers from zero when ties would swallow the move, writing only what changes", () => {
    const pins = [pin("a", "up", 0), pin("b", "up", 0), pin("c", "up", 2)];
    expect(reorderWrites(pins, "a", 1)).toEqual([
      { id: "a", sort_order: 1 },
    ]);
  });

  it("does nothing past either end", () => {
    const pins = [pin("a", "up", 0), pin("b", "up", 1)];
    expect(reorderWrites(pins, "a", -1)).toEqual([]);
    expect(reorderWrites(pins, "b", 1)).toEqual([]);
  });
});
