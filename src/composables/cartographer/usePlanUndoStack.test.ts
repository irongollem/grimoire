import { beforeEach, describe, expect, it, vi } from "vitest";
import { usePlanUndoStack } from "./usePlanUndoStack";
import { useToast } from "@/composables/useToast";

function entry(label: string) {
  const undo = vi.fn(async () => {});
  const redo = vi.fn(async () => {});
  return { label, undo, redo };
}

describe("usePlanUndoStack", () => {
  // `toasts` is a module-level singleton (see useToast.ts), shared by every
  // caller — clear it per test so a previous test's toast isn't mistaken
  // for this one's.
  const { toasts } = useToast();
  beforeEach(() => { toasts.value = []; });

  it("starts with nothing to undo or redo", () => {
    const stack = usePlanUndoStack();
    expect(stack.canUndo.value).toBe(false);
    expect(stack.canRedo.value).toBe(false);
  });

  it("undo replays the inverse and moves the entry to the redo side", async () => {
    const stack = usePlanUndoStack();
    const e = entry("create region");
    stack.push(e);
    expect(stack.canUndo.value).toBe(true);

    await stack.undo();
    expect(e.undo).toHaveBeenCalledOnce();
    expect(stack.canUndo.value).toBe(false);
    expect(stack.canRedo.value).toBe(true);
  });

  it("redo replays the forward action and moves the entry back", async () => {
    const stack = usePlanUndoStack();
    const e = entry("create region");
    stack.push(e);
    await stack.undo();
    await stack.redo();
    expect(e.redo).toHaveBeenCalledOnce();
    expect(stack.canUndo.value).toBe(true);
    expect(stack.canRedo.value).toBe(false);
  });

  it("pushing a new entry clears the redo stack", async () => {
    const stack = usePlanUndoStack();
    stack.push(entry("first"));
    await stack.undo();
    expect(stack.canRedo.value).toBe(true);
    stack.push(entry("second"));
    expect(stack.canRedo.value).toBe(false);
  });

  it("puts the entry back on the undo stack if the inverse mutation rejects, and tells the DM (finding 3)", async () => {
    const stack = usePlanUndoStack();
    const e = { label: "flaky", undo: vi.fn(async () => { throw new Error("network"); }), redo: vi.fn(async () => {}) };
    stack.push(e);
    await stack.undo();
    expect(stack.canUndo.value).toBe(true);
    expect(stack.canRedo.value).toBe(false);
    // The docblock used to claim the mutation composable already toasted —
    // it doesn't (`usePlanPalette.ts`'s closures call `mutateAsync` bare),
    // so a rejected undo used to fail with no feedback at all.
    expect(toasts.value).toHaveLength(1);
    expect(toasts.value[0]).toMatchObject({ type: "error", message: "network" });
  });

  it("a retry after a toasted failure can still succeed, leaving the stack consistent", async () => {
    const stack = usePlanUndoStack();
    let fail = true;
    const e = { label: "flaky", undo: vi.fn(async () => { if (fail) throw new Error("network"); }), redo: vi.fn(async () => {}) };
    stack.push(e);

    await stack.undo(); // fails, toasts, re-queues
    expect(stack.canUndo.value).toBe(true);
    expect(toasts.value).toHaveLength(1);

    fail = false;
    await stack.undo(); // the next Ctrl+Z can still act on it
    expect(e.undo).toHaveBeenCalledTimes(2);
    expect(stack.canUndo.value).toBe(false);
    expect(stack.canRedo.value).toBe(true);
  });

  it("a rejected redo also toasts and puts the entry back on the redo stack", async () => {
    const stack = usePlanUndoStack();
    const e = { label: "flaky", undo: vi.fn(async () => {}), redo: vi.fn(async () => { throw new Error("RLS denial"); }) };
    stack.push(e);
    await stack.undo();
    expect(stack.canRedo.value).toBe(true);

    await stack.redo();
    expect(stack.canRedo.value).toBe(true); // still there for a retry
    expect(stack.canUndo.value).toBe(false);
    expect(toasts.value).toHaveLength(1);
    expect(toasts.value[0]).toMatchObject({ type: "error", message: "RLS denial" });
  });

  it("undoes the latest action first and redoes in the order they were undone", async () => {
    const stack = usePlanUndoStack();
    const order: string[] = [];
    const record = (label: string) => ({
      label,
      undo: async () => { order.push(`undo ${label}`); },
      redo: async () => { order.push(`redo ${label}`); },
    });
    stack.push(record("first"));
    stack.push(record("second"));
    await stack.undo();
    await stack.undo();
    await stack.redo();
    await stack.redo();
    expect(order).toEqual(["undo second", "undo first", "redo first", "redo second"]);
  });

  it("ignores a second undo or redo while one is still running, so one entry is never replayed twice", async () => {
    const stack = usePlanUndoStack();
    let release!: () => void;
    const slow = {
      label: "slow",
      undo: vi.fn(() => new Promise<void>((resolve) => { release = resolve; })),
      redo: vi.fn(async () => {}),
    };
    const other = entry("other");
    stack.push(other);
    stack.push(slow);
    const pending = stack.undo();
    expect(stack.busy.value).toBe(true);
    await stack.undo(); // dropped: the stack is busy, so "other" is not undone underneath it
    await stack.redo();
    release();
    await pending;
    expect(stack.busy.value).toBe(false);
    expect(other.undo).not.toHaveBeenCalled();
    expect(slow.redo).not.toHaveBeenCalled();
    expect(stack.canRedo.value).toBe(true);
  });

  it("ignores a second redo while one is still running", async () => {
    const stack = usePlanUndoStack();
    let release!: () => void;
    const slow = { label: "slow", undo: vi.fn(async () => {}), redo: vi.fn(() => new Promise<void>((resolve) => { release = resolve; })) };
    const other = entry("other");
    stack.push(slow);
    stack.push(other);
    await stack.undo(); // other
    await stack.undo(); // slow
    const pending = stack.redo(); // redoes slow, the older entry, and waits
    await stack.redo(); // dropped
    release();
    await pending;
    expect(slow.redo).toHaveBeenCalledOnce();
    expect(other.redo).not.toHaveBeenCalled();
  });

  it("undo and redo on an empty stack are no-ops", async () => {
    const stack = usePlanUndoStack();
    await expect(stack.undo()).resolves.toBeUndefined();
    await expect(stack.redo()).resolves.toBeUndefined();
  });

  it("clear empties both stacks", async () => {
    const stack = usePlanUndoStack();
    stack.push(entry("a"));
    await stack.undo();
    stack.clear();
    expect(stack.canUndo.value).toBe(false);
    expect(stack.canRedo.value).toBe(false);
  });
});
