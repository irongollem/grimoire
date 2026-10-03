import { describe, expect, it } from "vitest";
import { useKeyedRecordDrafts } from "./useKeyedRecordDrafts";

interface Row {
  id: string;
  name: string;
  cost: number;
}

function setup() {
  return useKeyedRecordDrafts<Row, { name: string; cost: number }>((r) => ({ name: r.name, cost: r.cost }));
}

describe("useKeyedRecordDrafts", () => {
  it("seeds a new row and takes fresh server values for untouched fields", () => {
    const k = setup();
    k.sync("a", { id: "a", name: "A", cost: 1 });
    k.sync("a", { id: "a", name: "A", cost: 5 });
    expect(k.drafts.a).toEqual({ name: "A", cost: 5 });
    expect(k.changes("a", (d) => d)).toEqual({});
  });

  it("keeps an edit, sends only the touched column, and flags a conflict", () => {
    const k = setup();
    k.sync("a", { id: "a", name: "A", cost: 1 });
    k.drafts.a!.name = "Mine";
    k.sync("a", { id: "a", name: "Theirs", cost: 9 });
    expect(k.drafts.a).toEqual({ name: "Mine", cost: 9 });
    expect(k.changes("a", (d) => d)).toEqual({ name: "Mine" });
    expect(k.conflicts.a).toEqual(["name"]);
  });

  it("commits and resets one row without disturbing another", () => {
    const k = setup();
    k.sync("a", { id: "a", name: "A", cost: 1 });
    k.sync("b", { id: "b", name: "B", cost: 2 });
    k.drafts.a!.cost = 10;
    k.drafts.b!.cost = 20;
    k.commit("a");
    k.sync("a", { id: "a", name: "A", cost: 10 });
    k.sync("b", { id: "b", name: "B", cost: 2 });
    expect(k.drafts.b!.cost).toBe(20);
    expect(k.changes("b", (d) => d)).toEqual({ cost: 20 });
    k.reset("b");
    expect(k.drafts.b!.cost).toBe(2);
  });
});
