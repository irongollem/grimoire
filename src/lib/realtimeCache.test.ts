import { describe, expect, it } from "vitest";
import { QueryClient } from "@tanstack/vue-query";
import { applyRealtimeRow } from "@/lib/realtimeCache";

interface Row { id: string; campaign_id: string; group: string; name: string }

const reducer = {
  rootKey: "rows",
  include: (key: readonly unknown[]) => key[1] !== "projected",
  matches: (key: readonly unknown[], row: Row) => key[1] === row.campaign_id && (!key[2] || key[2] === row.group),
  compare: (a: Row, b: Row) => a.name.localeCompare(b.name),
};

describe("applyRealtimeRow", () => {
  it("moves complete rows between matching loaded lists without touching projections", () => {
    const qc = new QueryClient();
    const oldRow: Row = { id: "1", campaign_id: "c", group: "a", name: "Zulu" };
    const newRow: Row = { ...oldRow, group: "b", name: "Alpha" };
    qc.setQueryData(["rows", "c", "a"], [oldRow]);
    qc.setQueryData(["rows", "c", "b"], []);
    qc.setQueryData(["rows", "projected", "c"], [oldRow]);

    applyRealtimeRow(qc, { eventType: "UPDATE", old: oldRow, new: newRow }, reducer);

    expect(qc.getQueryData(["rows", "c", "a"])).toEqual([]);
    expect(qc.getQueryData(["rows", "c", "b"])).toEqual([newRow]);
    expect(qc.getQueryData(["rows", "projected", "c"])).toEqual([oldRow]);
  });

  it("does not create an unloaded list from an insert", () => {
    const qc = new QueryClient();
    const row: Row = { id: "1", campaign_id: "c", group: "a", name: "Alpha" };

    applyRealtimeRow(qc, { eventType: "INSERT", old: {}, new: row }, reducer);

    expect(qc.getQueryData(["rows", "c", "a"])).toBeUndefined();
  });
});
