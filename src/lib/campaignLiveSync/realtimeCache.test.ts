import { describe, expect, it } from "vitest";
import { QueryClient } from "@tanstack/vue-query";
import { applyRealtimeRow, mergeRealtimeUpdate } from "@/lib/campaignLiveSync/realtimeCache";

interface Row { id: string; campaign_id: string; group: string; name: string }

const reducer = {
  rootKey: "rows",
  include: (key: readonly unknown[]) => key[1] !== "projected",
  matches: (key: readonly unknown[], row: Row) => key[1] === row.campaign_id && (!key[2] || key[2] === row.group),
  compare: (a: Row, b: Row) => a.name.localeCompare(b.name),
};

describe("mergeRealtimeUpdate", () => {
  it("keeps a key the UPDATE payload omitted (TOASTed, unchanged)", () => {
    const cached = { id: "1", campaign_id: "c", group: "a", name: "Zulu" };
    // Realtime omits the key entirely for an unchanged out-of-line column —
    // simulated here by leaving `name` off the incoming object.
    const incoming = { id: "1", campaign_id: "c", group: "b" } as unknown as Row;

    expect(mergeRealtimeUpdate(cached, incoming)).toEqual({ id: "1", campaign_id: "c", group: "b", name: "Zulu" });
  });

  it("lets an explicit null in the payload overwrite the cached value", () => {
    const cached = { id: "1", campaign_id: "c", group: "a", name: "Zulu" };
    const incoming = { id: "1", campaign_id: "c", group: "a", name: null } as unknown as Row;

    expect(mergeRealtimeUpdate(cached, incoming)).toEqual({ id: "1", campaign_id: "c", group: "a", name: null });
  });
});

describe("applyRealtimeRow", () => {
  it("merges a partial UPDATE onto the cached row in an already-loaded list", () => {
    const qc = new QueryClient();
    const cached: Row = { id: "1", campaign_id: "c", group: "a", name: "Zulu" };
    qc.setQueryData(["rows", "c", "a"], [cached]);
    // `name` omitted — Realtime's shape for an unchanged TOASTed column.
    const partial = { id: "1", campaign_id: "c", group: "a" } as unknown as Row;

    applyRealtimeRow(qc, { eventType: "UPDATE", old: cached, new: partial }, reducer);

    expect(qc.getQueryData(["rows", "c", "a"])).toEqual([cached]);
  });

  it("merges a partial UPDATE onto a single-object cache", () => {
    const qc = new QueryClient();
    const cached: Row = { id: "1", campaign_id: "c", group: "a", name: "Zulu" };
    qc.setQueryData(["rows", "1"], cached);
    const partial = { id: "1", campaign_id: "c", group: "a" } as unknown as Row;
    const objectReducer = {
      ...reducer,
      include: (key: readonly unknown[]) => key.length === 2,
      matches: () => true,
    };

    applyRealtimeRow(qc, { eventType: "UPDATE", old: cached, new: partial }, objectReducer);

    expect(qc.getQueryData(["rows", "1"])).toEqual(cached);
  });

  it("invalidates rather than inserts an UPDATE for a row absent from a matching list", () => {
    const qc = new QueryClient();
    const oldRow: Row = { id: "1", campaign_id: "c", group: "a", name: "Zulu" };
    const newRow: Row = { ...oldRow, group: "b", name: "Alpha" };
    qc.setQueryData(["rows", "c", "a"], [oldRow]);
    // Loaded but does not yet hold a copy of row "1" — a realistic partial
    // payload (Realtime could have omitted an unchanged TOASTed column) must
    // not be spliced straight into it.
    qc.setQueryData(["rows", "c", "b"], []);
    qc.setQueryData(["rows", "projected", "c"], [oldRow]);

    applyRealtimeRow(qc, { eventType: "UPDATE", old: oldRow, new: newRow }, reducer);

    expect(qc.getQueryData(["rows", "c", "a"])).toEqual([]);
    expect(qc.getQueryData(["rows", "c", "b"])).toEqual([]);
    expect(qc.getQueryState(["rows", "c", "b"])?.isInvalidated).toBe(true);
    expect(qc.getQueryData(["rows", "projected", "c"])).toEqual([oldRow]);
    expect(qc.getQueryState(["rows", "projected", "c"])?.isInvalidated).toBe(false);
  });

  it("does not create an unloaded list from an insert", () => {
    const qc = new QueryClient();
    const row: Row = { id: "1", campaign_id: "c", group: "a", name: "Alpha" };

    applyRealtimeRow(qc, { eventType: "INSERT", old: {}, new: row }, reducer);

    expect(qc.getQueryData(["rows", "c", "a"])).toBeUndefined();
  });

  it("inserts a complete INSERT row directly into an already-loaded matching list", () => {
    const qc = new QueryClient();
    qc.setQueryData(["rows", "c", "a"], []);
    const row: Row = { id: "1", campaign_id: "c", group: "a", name: "Alpha" };

    applyRealtimeRow(qc, { eventType: "INSERT", old: {}, new: row }, reducer);

    expect(qc.getQueryData(["rows", "c", "a"])).toEqual([row]);
  });

  it("removes a row on DELETE from every loaded matching cache", () => {
    const qc = new QueryClient();
    const row: Row = { id: "1", campaign_id: "c", group: "a", name: "Alpha" };
    qc.setQueryData(["rows", "c", "a"], [row]);
    qc.setQueryData(["rows", "1"], row);

    applyRealtimeRow(qc, { eventType: "DELETE", old: { id: "1" }, new: {} as Row }, {
      ...reducer,
      include: () => true,
      matches: () => true,
    });

    expect(qc.getQueryData(["rows", "c", "a"])).toEqual([]);
    expect(qc.getQueryCache().find({ queryKey: ["rows", "1"], exact: true })).toBeUndefined();
  });
});
