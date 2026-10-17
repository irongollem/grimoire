import { describe, it, expect } from "vitest";
import { clampBrushRadius, resolveKeyAction, type KeyEventLike, type KeyContext } from "./keymap";

const ev = (over: Partial<KeyEventLike>): KeyEventLike => ({
  key: "a", ctrlKey: false, metaKey: false, altKey: false, shiftKey: false,
  targetIsTextEntry: false, ...over,
});

const ctx = (activeTool = "floor"): KeyContext => ({
  activeTool: activeTool as KeyContext["activeTool"],
  tools: [
    { id: "select" },
    { id: "floor", shortcut: "f" },
    { id: "wall", shortcut: "w" },
    { id: "place", shortcut: "o", aliases: ["g"] },
    { id: "eraser", shortcut: "e" },
    { id: "brush", shortcut: "v", disabled: true },
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

  it("rotates the item in hand only while the Place tool is active", () => {
    expect(resolveKeyAction(ev({ key: "q" }), ctx("place"))).toEqual({ kind: "rotatePlace", delta: 270 });
    expect(resolveKeyAction(ev({ key: "e" }), ctx("place"))).toEqual({ kind: "rotatePlace", delta: 90 });
    expect(resolveKeyAction(ev({ key: "[" }), ctx("place"))).toEqual({ kind: "rotatePlace", delta: 359 });
    expect(resolveKeyAction(ev({ key: "]" }), ctx("place"))).toEqual({ kind: "rotatePlace", delta: 1 });
    // With another tool active, q/e are free to fall through to tool shortcuts.
    expect(resolveKeyAction(ev({ key: "q" }), ctx("floor"))).toBeNull();
  });

  it("[ and ] shrink and grow the round brush by a quarter cell, and only for the brush", () => {
    expect(resolveKeyAction(ev({ key: "[" }), ctx("brush"))).toEqual({ kind: "resizeBrush", delta: -0.25 });
    expect(resolveKeyAction(ev({ key: "]" }), ctx("brush"))).toEqual({ kind: "resizeBrush", delta: 0.25 });
    expect(resolveKeyAction(ev({ key: "]" }), ctx("floor"))).toBeNull();
  });

  it("clamps the brush radius to its range", () => {
    expect(clampBrushRadius(0.1)).toBe(0.5);
    expect(clampBrushRadius(9)).toBe(6);
    expect(clampBrushRadius(2)).toBe(2);
  });

  it("selects a tool by its shortcut, but not a disabled one", () => {
    expect(resolveKeyAction(ev({ key: "w" }), ctx())).toEqual({ kind: "selectTool", tool: "wall" });
    expect(resolveKeyAction(ev({ key: "v" }), ctx())).toBeNull();
  });

  it("returns null for an unbound key", () => {
    expect(resolveKeyAction(ev({ key: "k" }), ctx())).toBeNull();
  });

  it("Escape always selects the Select tool, whatever tool is active", () => {
    expect(resolveKeyAction(ev({ key: "Escape" }), ctx("wall"))).toEqual({
      kind: "selectTool",
      tool: "select",
    });
    expect(resolveKeyAction(ev({ key: "Escape" }), ctx("place"))).toEqual({
      kind: "selectTool",
      tool: "select",
    });
  });

  it("Escape is a no-op if the Select tool isn't in this context's palette", () => {
    const noSelect: KeyContext = { activeTool: "floor", tools: [{ id: "floor", shortcut: "f" }] };
    expect(resolveKeyAction(ev({ key: "Escape" }), noSelect)).toBeNull();
  });

  describe("Place tool", () => {
    it("turns the prop on q, e, [ and ], ahead of the Eraser's own e", () => {
      expect(resolveKeyAction(ev({ key: "q" }), ctx("place"))).toEqual({ kind: "rotatePlace", delta: 270 });
      expect(resolveKeyAction(ev({ key: "e" }), ctx("place"))).toEqual({ kind: "rotatePlace", delta: 90 });
      expect(resolveKeyAction(ev({ key: "[" }), ctx("place"))).toEqual({ kind: "rotatePlace", delta: 359 });
      expect(resolveKeyAction(ev({ key: "]" }), ctx("place"))).toEqual({ kind: "rotatePlace", delta: 1 });
    });

    it("answers to G as well as O", () => {
      expect(resolveKeyAction(ev({ key: "g" }), ctx("floor"))).toEqual({ kind: "selectTool", tool: "place" });
      expect(resolveKeyAction(ev({ key: "o" }), ctx("floor"))).toEqual({ kind: "selectTool", tool: "place" });
    });

    it("leaves e to the Eraser on every other tool", () => {
      expect(resolveKeyAction(ev({ key: "e" }), ctx("floor"))).toEqual({ kind: "selectTool", tool: "eraser" });
    });

    it("deletes on Delete and Backspace, only in the Place tool", () => {
      expect(resolveKeyAction(ev({ key: "Delete" }), ctx("place"))).toEqual({ kind: "deleteDressing" });
      expect(resolveKeyAction(ev({ key: "Backspace" }), ctx("place"))).toEqual({ kind: "deleteDressing" });
      expect(resolveKeyAction(ev({ key: "Delete" }), ctx("floor"))).toBeNull();
    });

    it("does not delete while typing in a field", () => {
      expect(resolveKeyAction(ev({ key: "Backspace", targetIsTextEntry: true }), ctx("place"))).toBeNull();
    });

    it("Escape puts the armed item down instead of leaving the tool", () => {
      expect(resolveKeyAction(ev({ key: "Escape" }), { ...ctx("place"), placeArmed: true })).toEqual({
        kind: "disarmPlace",
      });
    });

    it("Escape with nothing armed, or on another tool, selects Select as before", () => {
      expect(resolveKeyAction(ev({ key: "Escape" }), ctx("place"))).toEqual({ kind: "selectTool", tool: "select" });
      expect(resolveKeyAction(ev({ key: "Escape" }), { ...ctx("wall"), placeArmed: true })).toEqual({
        kind: "selectTool",
        tool: "select",
      });
    });
  });
});
