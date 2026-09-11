import { describe, expect, it } from "vitest";
import { useBulkSelection } from "./useBulkSelection";

describe("useBulkSelection", () => {
  it("toggle adds an id and toggling again removes it", () => {
    const b = useBulkSelection();
    b.toggle("a");
    expect(b.isSelected("a")).toBe(true);
    expect(b.count.value).toBe(1);
    b.toggle("a");
    expect(b.isSelected("a")).toBe(false);
    expect(b.count.value).toBe(0);
  });

  it("toggle tracks multiple independent ids", () => {
    const b = useBulkSelection();
    b.toggle("a");
    b.toggle("b");
    expect(b.count.value).toBe(2);
    b.toggle("a");
    expect(b.isSelected("a")).toBe(false);
    expect(b.isSelected("b")).toBe(true);
    expect(b.count.value).toBe(1);
  });

  it("selectAll replaces the selection with exactly the ids given", () => {
    const b = useBulkSelection();
    b.toggle("stale");
    b.selectAll(["x", "y", "z"]);
    expect(b.isSelected("stale")).toBe(false);
    expect([...b.selectedIds.value].sort()).toEqual(["x", "y", "z"]);
    expect(b.count.value).toBe(3);
  });

  it("selectAll with an empty list empties the selection", () => {
    const b = useBulkSelection();
    b.toggle("a");
    b.selectAll([]);
    expect(b.count.value).toBe(0);
  });

  it("clear empties the selection but keeps selecting mode on", () => {
    const b = useBulkSelection();
    b.selecting.value = true;
    b.toggle("a");
    b.clear();
    expect(b.count.value).toBe(0);
    expect(b.selecting.value).toBe(true);
  });

  it("stop clears the selection and exits selection mode", () => {
    const b = useBulkSelection();
    b.selecting.value = true;
    b.toggle("a");
    b.toggle("b");
    b.stop();
    expect(b.count.value).toBe(0);
    expect(b.selecting.value).toBe(false);
  });

  it("count tracks the selection as it changes", () => {
    const b = useBulkSelection();
    expect(b.count.value).toBe(0);
    b.toggle("a");
    expect(b.count.value).toBe(1);
    b.selectAll(["p", "q"]);
    expect(b.count.value).toBe(2);
    b.clear();
    expect(b.count.value).toBe(0);
  });

  it("pruneTo drops a selected id no longer in the valid set and keeps the rest", () => {
    const b = useBulkSelection();
    b.selectAll(["a", "b", "c"]);
    const kept = b.pruneTo(["b", "c", "d"]);
    expect(kept.sort()).toEqual(["b", "c"]);
    expect([...b.selectedIds.value].sort()).toEqual(["b", "c"]);
    expect(b.isSelected("a")).toBe(false);
  });

  it("pruneTo is a no-op when every selected id is still valid", () => {
    const b = useBulkSelection();
    b.selectAll(["a", "b"]);
    const before = b.selectedIds.value;
    const kept = b.pruneTo(["a", "b", "z"]);
    expect(kept.sort()).toEqual(["a", "b"]);
    // Unchanged reference — no reactive churn when nothing was actually dropped.
    expect(b.selectedIds.value).toBe(before);
  });

  it("pruneTo against an empty valid set empties the selection", () => {
    const b = useBulkSelection();
    b.selectAll(["a", "b"]);
    const kept = b.pruneTo([]);
    expect(kept).toEqual([]);
    expect(b.count.value).toBe(0);
  });

  it("pruneTo preserves insertion order for the ids it keeps", () => {
    const b = useBulkSelection();
    b.selectAll(["z", "y", "x"]);
    const kept = b.pruneTo(["x", "y", "z"]);
    expect(kept).toEqual(["z", "y", "x"]);
  });
});
