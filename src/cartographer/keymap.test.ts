import { describe, it, expect } from "vitest";
import { resolveKeyAction, type KeyEventLike, type KeyContext } from "./keymap";

const ev = (over: Partial<KeyEventLike>): KeyEventLike => ({
  key: "a", ctrlKey: false, metaKey: false, altKey: false, shiftKey: false,
  targetIsTextEntry: false, ...over,
});

const ctx = (activeTool = "floor"): KeyContext => ({
  activeTool: activeTool as KeyContext["activeTool"],
  tools: [
    { id: "floor", shortcut: "f" },
    { id: "wall", shortcut: "w" },
    { id: "stamp", shortcut: "s" },
    { id: "cave", shortcut: "v", disabled: true },
  ],
});

describe("resolveKeyAction", () => {
  it("ignores everything while typing in a field", () => {
    expect(resolveKeyAction(ev({ key: "f", targetIsTextEntry: true }), ctx())).toBeNull();
    expect(resolveKeyAction(ev({ key: "z", ctrlKey: true, targetIsTextEntry: true }), ctx())).toBeNull();
  });

  it("maps ctrl/cmd+z to undo and shift+ctrl/cmd+z to redo", () => {
    expect(resolveKeyAction(ev({ key: "z", ctrlKey: true }), ctx())).toEqual({ kind: "undo" });
    expect(resolveKeyAction(ev({ key: "Z", metaKey: true }), ctx())).toEqual({ kind: "undo" });
    expect(resolveKeyAction(ev({ key: "z", metaKey: true, shiftKey: true }), ctx())).toEqual({ kind: "redo" });
  });

  it("leaves alt+ctrl+z to the OS", () => {
    expect(resolveKeyAction(ev({ key: "z", ctrlKey: true, altKey: true }), ctx())).toBeNull();
  });

  it("leaves other modified keys alone so OS shortcuts still work", () => {
    expect(resolveKeyAction(ev({ key: "f", ctrlKey: true }), ctx())).toBeNull();
    expect(resolveKeyAction(ev({ key: "f", metaKey: true }), ctx())).toBeNull();
    expect(resolveKeyAction(ev({ key: "f", altKey: true }), ctx())).toBeNull();
  });

  it("centres on C", () => {
    expect(resolveKeyAction(ev({ key: "C" }), ctx())).toEqual({ kind: "center" });
  });

  it("rotates the stamp only while the stamp tool is active", () => {
    expect(resolveKeyAction(ev({ key: "q" }), ctx("stamp"))).toEqual({ kind: "rotateStamp", delta: 270 });
    expect(resolveKeyAction(ev({ key: "e" }), ctx("stamp"))).toEqual({ kind: "rotateStamp", delta: 90 });
    expect(resolveKeyAction(ev({ key: "[" }), ctx("stamp"))).toEqual({ kind: "rotateStamp", delta: 359 });
    expect(resolveKeyAction(ev({ key: "]" }), ctx("stamp"))).toEqual({ kind: "rotateStamp", delta: 1 });
    // With another tool active, q/e are free to fall through to tool shortcuts.
    expect(resolveKeyAction(ev({ key: "q" }), ctx("floor"))).toBeNull();
  });

  it("selects a tool by its shortcut, but not a disabled one", () => {
    expect(resolveKeyAction(ev({ key: "w" }), ctx())).toEqual({ kind: "selectTool", tool: "wall" });
    expect(resolveKeyAction(ev({ key: "v" }), ctx())).toBeNull();
  });

  it("returns null for an unbound key", () => {
    expect(resolveKeyAction(ev({ key: "k" }), ctx())).toBeNull();
  });
});
