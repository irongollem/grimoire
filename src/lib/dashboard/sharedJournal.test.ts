import { describe, it, expect } from "vitest";
import { buildSharedJournalRows, type SharedJournalInput } from "./sharedJournal";

function entry(over: Partial<SharedJournalInput> & { id: string }): SharedJournalInput {
  return {
    title: `Entry ${over.id}`,
    content: "",
    user_id: "u-nessa",
    created_at: "2026-08-01T00:00:00Z",
    updated_at: "2026-08-01T00:00:00Z",
    ...over,
  };
}

const NAMES = new Map([
  ["u-nessa", "Nessa"],
  ["u-orin", "Orin"],
]);

const unreadAll = () => true;

describe("buildSharedJournalRows", () => {
  it("has nothing to show when no entries are shared", () => {
    expect(buildSharedJournalRows([], NAMES, unreadAll, 5)).toEqual([]);
  });

  it("keeps only the entries the reader has not seen", () => {
    const entries = [entry({ id: "a" }), entry({ id: "b" })];
    const rows = buildSharedJournalRows(entries, NAMES, (e) => e.id === "b", 5);
    expect(rows.map((r) => r.id)).toEqual(["b"]);
  });

  it("orders by last edit, newest first", () => {
    const entries = [
      entry({ id: "old", updated_at: "2026-07-01T00:00:00Z" }),
      entry({ id: "new", updated_at: "2026-08-20T00:00:00Z" }),
      entry({ id: "mid", updated_at: "2026-08-02T00:00:00Z" }),
    ];
    expect(buildSharedJournalRows(entries, NAMES, unreadAll, 5).map((r) => r.id)).toEqual([
      "new",
      "mid",
      "old",
    ]);
  });

  it("applies the limit after ordering, not before", () => {
    const entries = [
      entry({ id: "old", updated_at: "2026-01-01T00:00:00Z" }),
      entry({ id: "new", updated_at: "2026-08-20T00:00:00Z" }),
    ];
    expect(buildSharedJournalRows(entries, NAMES, unreadAll, 1).map((r) => r.id)).toEqual(["new"]);
  });

  it("names the author from the campaign roster", () => {
    const rows = buildSharedJournalRows([entry({ id: "a", user_id: "u-orin" })], NAMES, unreadAll, 5);
    expect(rows[0]?.authorName).toBe("Orin");
  });

  // A player who leaves still has entries in the campaign. Naming the gap
  // beats an empty byline, and matches the downtime board's own marker.
  it("marks an author who is no longer in the campaign", () => {
    const rows = buildSharedJournalRows([entry({ id: "a", user_id: "u-gone" })], NAMES, unreadAll, 5);
    expect(rows[0]?.authorName).toBe("??? (removed)");
  });

  it.each([
    ["a null title", null],
    ["an empty title", ""],
    ["a whitespace title", "   "],
  ])("calls %s what the journal list calls it", (_label, title) => {
    const rows = buildSharedJournalRows([entry({ id: "a", title })], NAMES, unreadAll, 5);
    expect(rows[0]?.title).toBe("Untitled entry");
  });

  it("does not mutate the array it was given", () => {
    const entries = [
      entry({ id: "a", updated_at: "2026-01-01T00:00:00Z" }),
      entry({ id: "b", updated_at: "2026-09-01T00:00:00Z" }),
    ];
    buildSharedJournalRows(entries, NAMES, unreadAll, 5);
    expect(entries.map((e) => e.id)).toEqual(["a", "b"]);
  });
});
