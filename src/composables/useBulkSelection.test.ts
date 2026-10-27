import { describe, expect, it } from "vitest";
import { useBulkSelection } from "./useBulkSelection";

describe("useBulkSelection", () => {
  it("toggle adds an id, toggling again removes it, and ids are independent", () => {
    const b = useBulkSelection();
    b.toggle("a");
    b.toggle("b");
    expect(b.count.value).toBe(2);
    b.toggle("a");
    expect(b.isSelected("a")).toBe(false);
    expect(b.isSelected("b")).toBe(true);
    expect(b.count.value).toBe(1);
  });

  it("selectAll replaces the selection with exactly the ids given, and an empty list empties it", () => {
    const b = useBulkSelection();
    b.toggle("stale");
    b.selectAll(["x", "y", "z"]);
    expect(b.isSelected("stale")).toBe(false);
    expect([...b.selectedIds.value].sort()).toEqual(["x", "y", "z"]);
    b.selectAll([]);
    expect(b.count.value).toBe(0);
  });

  it("clear empties the selection but keeps selecting mode on; stop leaves the mode too", () => {
    const b = useBulkSelection();
    b.selecting.value = true;
    b.toggle("a");
    b.clear();
    expect(b.count.value).toBe(0);
    expect(b.selecting.value).toBe(true);

    b.toggle("a");
    b.stop();
    expect(b.count.value).toBe(0);
    expect(b.selecting.value).toBe(false);
  });

  // A filter edit or a refetch can hide a selected row; its id must not reach a batched write.
  it("pruneTo drops a selected id no longer in the valid set and keeps the rest, in selection order", () => {
    const b = useBulkSelection();
    b.selectAll(["z", "a", "y"]);
    const kept = b.pruneTo(["y", "z", "d"]);
    expect(kept).toEqual(["z", "y"]);
    expect([...b.selectedIds.value]).toEqual(["z", "y"]);
    expect(b.isSelected("a")).toBe(false);
  });

  it("pruneTo against an empty valid set empties the selection", () => {
    const b = useBulkSelection();
    b.selectAll(["a", "b"]);
    expect(b.pruneTo([])).toEqual([]);
    expect(b.count.value).toBe(0);
  });

  it("pruneTo leaves the selection untouched (same reference) when every id is still valid", () => {
    const b = useBulkSelection();
    b.selectAll(["a", "b"]);
    const before = b.selectedIds.value;
    expect(b.pruneTo(new Set(["a", "b", "z"])).sort()).toEqual(["a", "b"]);
    expect(b.selectedIds.value).toBe(before);
  });
});
