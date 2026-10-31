import { describe, it, expect } from "vitest";
import { clampBrushRadius, resolveKeyAction, type KeyEventLike, type KeyContext } from "./keymap";

const ev = (over: Partial<KeyEventLike>): KeyEventLike => ({
  key: "a", code: "KeyA", ctrlKey: false, metaKey: false, altKey: false, shiftKey: false,
  targetIsTextEntry: false, ...over,
});

const ctx = (activeTool = "floor"): KeyContext => ({
  activeTool: activeTool as KeyContext["activeTool"],
  tools: [
    { id: "select" },
    { id: "floor", shortcut: "f" },
    { id: "wall", shortcut: "w" },
    { id: "place", shortcut: "o" },
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

  describe("zoom shortcuts", () => {
    it("answers the shared zoom keys with a zoom action", () => {
      expect(resolveKeyAction(ev({ key: "=", code: "Equal", metaKey: true }), ctx())).toEqual({ kind: "zoom", to: "in" });
      expect(resolveKeyAction(ev({ key: "-", code: "Minus", ctrlKey: true }), ctx())).toEqual({ kind: "zoom", to: "out" });
      expect(resolveKeyAction(ev({ key: "0", code: "Digit0", ctrlKey: true }), ctx())).toEqual({ kind: "zoom", to: "fit" });
      expect(resolveKeyAction(ev({ key: "1", code: "Digit1", ctrlKey: true }), ctx())).toEqual({ kind: "zoom", to: "actual" });
      expect(resolveKeyAction(ev({ key: "!", code: "Digit1", shiftKey: true }), ctx())).toEqual({ kind: "zoom", to: "fit" });
    });

    it("plain digits and Alt combos are not zoom shortcuts", () => {
      expect(resolveKeyAction(ev({ key: "1", code: "Digit1" }), ctx())).toBeNull();
      expect(resolveKeyAction(ev({ key: "0", code: "Digit0", ctrlKey: true, altKey: true }), ctx())).toBeNull();
    });

    it("leaves zoom keys alone while typing in a field", () => {
      expect(resolveKeyAction(ev({ key: "0", code: "Digit0", ctrlKey: true, targetIsTextEntry: true }), ctx())).toBeNull();
      expect(resolveKeyAction(ev({ key: "!", code: "Digit1", shiftKey: true, targetIsTextEntry: true }), ctx())).toBeNull();
    });
  });

  it("centres on C", () => {
    expect(resolveKeyAction(ev({ key: "C" }), ctx())).toEqual({ kind: "center" });
  });

  it("rotates the item in hand only while the Place tool is active, ahead of the Eraser's own e", () => {
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

  it("under Select, Escape puts down a pick first; with nothing picked it is the ordinary Escape", () => {
    expect(resolveKeyAction(ev({ key: "Escape" }), { ...ctx("select"), selectionPresent: true })).toEqual({ kind: "clearSelection" });
    expect(resolveKeyAction(ev({ key: "Escape" }), { ...ctx("select"), selectionPresent: false })).toEqual({ kind: "selectTool", tool: "select" });
    expect(resolveKeyAction(ev({ key: "Escape" }), { ...ctx("wall"), selectionPresent: true })).toEqual({ kind: "selectTool", tool: "select" });
  });

  it("Q, E and the bracket keys turn a prop picked under Select, and keep their meaning when none is picked", () => {
    expect(resolveKeyAction(ev({ key: "e" }), { ...ctx("select"), selectedPropInSelect: true })).toEqual({ kind: "rotatePlace", delta: 90 });
    expect(resolveKeyAction(ev({ key: "]" }), { ...ctx("select"), selectedPropInSelect: true })).toEqual({ kind: "rotatePlace", delta: 1 });
    expect(resolveKeyAction(ev({ key: "e" }), ctx("select"))).toEqual({ kind: "selectTool", tool: "eraser" });
  });

  it("Escape is a no-op if the Select tool is disabled", () => {
    const off: KeyContext = { activeTool: "floor", tools: [{ id: "select", disabled: true }, { id: "floor", shortcut: "f" }] };
    expect(resolveKeyAction(ev({ key: "Escape" }), off)).toBeNull();
  });

  it("Escape is a no-op if the Select tool isn't in this context's palette", () => {
    const noSelect: KeyContext = { activeTool: "floor", tools: [{ id: "floor", shortcut: "f" }] };
    expect(resolveKeyAction(ev({ key: "Escape" }), noSelect)).toBeNull();
  });

  describe("Place tool", () => {
    it("is picked by O, and G no longer picks it because G is the grid", () => {
      expect(resolveKeyAction(ev({ key: "o" }), ctx("floor"))).toEqual({ kind: "selectTool", tool: "place" });
      expect(resolveKeyAction(ev({ key: "g" }), ctx("floor"))).toEqual({ kind: "toggleGrid" });
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

// #1125 story 5: the Angled wall run and the selected wall or light have keys of their own.
describe("angled wall and selection keys", () => {
  const withCtx = (activeTool: string, extra: Partial<KeyContext>): KeyContext => ({ ...ctx(activeTool), ...extra });

  it("Enter ends an angled run that is open, and does nothing with no run", () => {
    expect(resolveKeyAction(ev({ key: "Enter" }), withCtx("angledWall", { angledRunOpen: true }))).toEqual({ kind: "finishAngledWall" });
    expect(resolveKeyAction(ev({ key: "Enter" }), withCtx("angledWall", { angledRunOpen: false }))).toBeNull();
  });

  it("Enter means nothing in another tool, even with a run left open", () => {
    expect(resolveKeyAction(ev({ key: "Enter" }), withCtx("wall", { angledRunOpen: true }))).toBeNull();
  });

  it("Escape drops an open angled run and stays in the tool; with no run it goes back to Select", () => {
    expect(resolveKeyAction(ev({ key: "Escape" }), withCtx("angledWall", { angledRunOpen: true }))).toEqual({ kind: "abandonAngledWall" });
    expect(resolveKeyAction(ev({ key: "Escape" }), withCtx("angledWall", { angledRunOpen: false }))).toEqual({ kind: "selectTool", tool: "select" });
  });

  it("Escape in another tool goes back to Select even if a run was left open", () => {
    expect(resolveKeyAction(ev({ key: "Escape" }), withCtx("wall", { angledRunOpen: true }))).toEqual({ kind: "selectTool", tool: "select" });
  });

  it.each(["select", "angledWall", "light"])("Delete and Backspace remove the selection in %s", (tool) => {
    for (const key of ["Delete", "Backspace"]) {
      expect(resolveKeyAction(ev({ key }), withCtx(tool, { selectionDeletable: true }))).toEqual({ kind: "deleteSelected" });
    }
  });

  it("Delete does nothing with nothing selected, or in a tool that has no selection", () => {
    expect(resolveKeyAction(ev({ key: "Delete" }), withCtx("select", { selectionDeletable: false }))).toBeNull();
    expect(resolveKeyAction(ev({ key: "Delete" }), withCtx("floor", { selectionDeletable: true }))).toBeNull();
  });

  it("Delete in Place still removes the selected prop, not the wall selection", () => {
    expect(resolveKeyAction(ev({ key: "Delete" }), withCtx("place", { selectionDeletable: true }))).toEqual({ kind: "deleteDressing" });
  });

  describe("swapping the two tile sets (#1125, like Photoshop's X)", () => {
    const withWrap: KeyContext = { ...ctx(), tools: [...ctx().tools, { id: "wrap", shortcut: "j" }] };

    it("X swaps the sets and J picks Wrap, which used to live on X", () => {
      expect(resolveKeyAction(ev({ key: "x", code: "KeyX" }), withWrap)).toEqual({ kind: "swapTileSets" });
      expect(resolveKeyAction(ev({ key: "j", code: "KeyJ" }), withWrap)).toEqual({ kind: "selectTool", tool: "wrap" });
    });

    it("Shift+X no longer swaps", () => {
      expect(resolveKeyAction(ev({ key: "X", code: "KeyX", shiftKey: true }), withWrap)).toBeNull();
    });

    it("ignores X while typing in a field", () => {
      expect(resolveKeyAction(ev({ key: "x", code: "KeyX", targetIsTextEntry: true }), withWrap)).toBeNull();
    });
  });

  describe("tab keys and the grid key (Map Table frame 18)", () => {
    const tabbed: KeyContext = { ...ctx(), hasLayerTabs: true };

    it("1, 2 and 3 pick Base image, Drawing and Zoning where the map has tabs", () => {
      expect(resolveKeyAction(ev({ key: "1", code: "Digit1" }), tabbed)).toEqual({ kind: "selectLayer", layer: "picture" });
      expect(resolveKeyAction(ev({ key: "2", code: "Digit2" }), tabbed)).toEqual({ kind: "selectLayer", layer: "drawing" });
      expect(resolveKeyAction(ev({ key: "3", code: "Digit3" }), tabbed)).toEqual({ kind: "selectLayer", layer: "plan" });
    });

    it("do nothing on a map with no tabs (the standalone Cartographer)", () => {
      expect(resolveKeyAction(ev({ key: "2", code: "Digit2" }), ctx())).toBeNull();
    });

    it("do nothing while typing a number in a field, or with Ctrl, Meta or Alt held", () => {
      expect(resolveKeyAction(ev({ key: "2", code: "Digit2", targetIsTextEntry: true }), tabbed)).toBeNull();
      expect(resolveKeyAction(ev({ key: "2", code: "Digit2", altKey: true }), tabbed)).toBeNull();
      expect(resolveKeyAction(ev({ key: "3", code: "Digit3", metaKey: true }), tabbed)).toBeNull();
    });

    it("a digit with Shift held is not a tab key, whatever the layout types for it", () => {
      expect(resolveKeyAction(ev({ key: "2", code: "Digit2", shiftKey: true }), tabbed)).toBeNull();
    });

    it("Shift+1 stays zoom-to-fit and is not the Base image tab", () => {
      expect(resolveKeyAction(ev({ key: "!", code: "Digit1", shiftKey: true }), tabbed)).toEqual({ kind: "zoom", to: "fit" });
    });

    it("G toggles the grid on any map, and not while typing or with a modifier", () => {
      expect(resolveKeyAction(ev({ key: "g", code: "KeyG" }), ctx())).toEqual({ kind: "toggleGrid" });
      expect(resolveKeyAction(ev({ key: "g", code: "KeyG", targetIsTextEntry: true }), ctx())).toBeNull();
      expect(resolveKeyAction(ev({ key: "g", code: "KeyG", ctrlKey: true }), ctx())).toBeNull();
    });
  });
});
