import { describe, expect, it } from "vitest";
import { TOOLS, TOOL_FAMILIES } from "./workbenchTools";
import { resolveKeyAction } from "@/cartographer/keymap";

describe("Freehand wall tool entry (#1197)", () => {
  it("P selects the Freehand tool (G is the grid toggle, which the keymap answers before any tool letter)", () => {
    // Resolves the key against the real palette, so a missing shortcut or a clash with another tool's letter fails here.
    const action = resolveKeyAction(
      { key: "p", code: "KeyP", ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, targetIsTextEntry: false },
      { activeTool: "select", tools: TOOLS },
    );
    expect(action).toEqual({ kind: "selectTool", tool: "freehandWall" });
  });

  it("no two tools share a shortcut letter", () => {
    const letters = TOOLS.map((t) => t.shortcut).filter((s): s is string => s !== undefined);
    expect(new Set(letters).size).toBe(letters.length);
  });

  it("sits in the Walls family after the Angled wall", () => {
    const walls = TOOL_FAMILIES.find((f) => f.id === "walls");
    expect(walls?.tools.slice(-2)).toEqual(["angledWall", "freehandWall"]);
  });
});
