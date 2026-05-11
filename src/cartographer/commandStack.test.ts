import { describe, it, expect, beforeEach } from "vitest";
import { CommandStack, type Command } from "./commandStack";

// A simple test fixture: a counter that we increment / decrement via commands.
// We track applies and reverts via side-effect on the counter, which is what
// the real Cartographer commands do against the layers ref.

function makeIncCommand(counter: { value: number }, n = 1): Command {
  return {
    apply: () => { counter.value += n; },
    revert: () => { counter.value -= n; },
  };
}

describe("CommandStack", () => {
  let stack: CommandStack;
  let counter: { value: number };

  beforeEach(() => {
    stack = new CommandStack();
    counter = { value: 0 };
  });

  it("starts empty: nothing to undo or redo", () => {
    expect(stack.canUndo()).toBe(false);
    expect(stack.canRedo()).toBe(false);
  });

  it("apply() runs the command and pushes it onto the undo stack", () => {
    stack.apply(makeIncCommand(counter, 5));
    expect(counter.value).toBe(5);
    expect(stack.canUndo()).toBe(true);
    expect(stack.canRedo()).toBe(false);
  });

  it("undo() reverts the most recent command", () => {
    stack.apply(makeIncCommand(counter, 5));
    stack.apply(makeIncCommand(counter, 3));
    expect(counter.value).toBe(8);
    stack.undo();
    expect(counter.value).toBe(5);
    stack.undo();
    expect(counter.value).toBe(0);
    expect(stack.canUndo()).toBe(false);
  });

  it("redo() re-applies a previously undone command", () => {
    stack.apply(makeIncCommand(counter, 5));
    stack.apply(makeIncCommand(counter, 3));
    stack.undo();
    stack.undo();
    expect(counter.value).toBe(0);
    stack.redo();
    expect(counter.value).toBe(5);
    stack.redo();
    expect(counter.value).toBe(8);
    expect(stack.canRedo()).toBe(false);
  });

  it("a new apply() after undo() clears the redo stack", () => {
    stack.apply(makeIncCommand(counter, 5));
    stack.apply(makeIncCommand(counter, 3));
    stack.undo();                                    // back to 5, redo has [3]
    expect(stack.canRedo()).toBe(true);
    stack.apply(makeIncCommand(counter, 2));         // → 7; the +3 is gone
    expect(counter.value).toBe(7);
    expect(stack.canRedo()).toBe(false);
  });

  it("undo() on an empty stack is a no-op (no throw)", () => {
    expect(() => stack.undo()).not.toThrow();
    expect(counter.value).toBe(0);
  });

  it("redo() on an empty redo stack is a no-op (no throw)", () => {
    expect(() => stack.redo()).not.toThrow();
  });

  it("clear() empties both stacks", () => {
    stack.apply(makeIncCommand(counter, 1));
    stack.apply(makeIncCommand(counter, 1));
    stack.undo();
    stack.clear();
    expect(stack.canUndo()).toBe(false);
    expect(stack.canRedo()).toBe(false);
  });

  it("respects an optional capacity, dropping the OLDEST command when full", () => {
    const small = new CommandStack(2);
    small.apply(makeIncCommand(counter, 1));         // counter=1, stack=[+1]
    small.apply(makeIncCommand(counter, 2));         // counter=3, stack=[+1,+2]
    small.apply(makeIncCommand(counter, 4));         // counter=7, stack=[+2,+4] (+1 dropped)
    small.undo();                                     // counter=3
    small.undo();                                     // counter=1 (was the bottom)
    expect(counter.value).toBe(1);
    expect(small.canUndo()).toBe(false);              // +1 was dropped, can't go further back
  });
});
