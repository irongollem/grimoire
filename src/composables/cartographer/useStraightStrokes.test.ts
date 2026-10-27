import { describe, it, expect } from "vitest";
import { ref } from "vue";
import { constrainShapeEnd, isCellPainter, useStraightStrokes } from "./useStraightStrokes";
import type { Tool } from "@/cartographer/tools";

function make(tool: Tool = "brush") {
  const activeTool = ref<Tool>(tool);
  const mapKey = ref("map-a");
  return { activeTool, mapKey, straight: useStraightStrokes({ activeTool, mapKey }) };
}

describe("isCellPainter", () => {
  it("is Tiles, Water and Rock only", () => {
    expect(["floor", "terrain", "solid"].every((t) => isCellPainter(t as Tool))).toBe(true);
    expect(["brush", "wall", "rect", "line"].some((t) => isCellPainter(t as Tool))).toBe(false);
  });
});

describe("constrainShapeEnd", () => {
  it("leaves the end alone without Shift", () => {
    expect(constrainShapeEnd("rect", [0, 0], [5, 2], false)).toEqual([5, 2]);
    expect(constrainShapeEnd("line", [0, 0], [5, 2], false)).toEqual([5, 2]);
  });

  it("makes the rectangle a square and snaps the line to 45 degree steps", () => {
    expect(constrainShapeEnd("rect", [0, 0], [5, 2], true)).toEqual([5, 5]);
    expect(constrainShapeEnd("line", [0, 0], [5, 1], true)).toEqual([5, 0]);
    expect(constrainShapeEnd("line", [0, 0], [4, 5], true)).toEqual([5, 5]);
  });

  it("does not touch other shapes", () => {
    expect(constrainShapeEnd("template", [0, 0], [5, 2], true)).toEqual([5, 2]);
  });
});

describe("brush", () => {
  it("a plain press is just the press", () => {
    const { straight } = make();
    expect(straight.brushPress([2, 2], false)).toEqual([[2, 2]]);
  });

  it("Shift with nothing remembered is just the press", () => {
    const { straight } = make();
    expect(straight.brushPress([2, 2], true)).toEqual([[2, 2]]);
  });

  it("a press without Shift ignores the remembered end", () => {
    const { straight } = make();
    straight.brushEnded([3, 1]);
    expect(straight.brushPress([3, 5], false)).toEqual([[3, 5]]);
  });

  it("holds the pointer on the stroke start until it has moved far enough to mean a direction", () => {
    const { straight } = make();
    straight.brushPress([0, 0], false);
    // 0.4 away and nearly vertical: too small to lock a vertical ray.
    expect(straight.brushTarget([0.1, 0.4], true)).toEqual([0, 0]);
    const along = straight.brushTarget([5, 0.2], true);
    expect(along[0]).toBeCloseTo(5);
    expect(along[1]).toBeCloseTo(0);
  });

  it("Shift+press starts from where the last stroke ended", () => {
    const { straight } = make();
    straight.brushPress([1, 1], false);
    straight.brushEnded([3, 1]);
    straight.beginStroke();
    expect(straight.brushPress([3, 5], true)).toEqual([[3, 1], [3, 5]]);
  });

  it("Shift while dragging snaps to 45 degrees from the stroke start", () => {
    const { straight } = make();
    straight.brushPress([0, 0], false);
    expect(straight.brushTarget([5, 1], true)).toEqual([5, 0]);
    expect(straight.brushTarget([5, 1], false)).toEqual([5, 1]);
  });

  it("snaps from the joined anchor when Shift+press joined", () => {
    const { straight } = make();
    straight.brushEnded([2, 2]);
    straight.brushPress([2, 6], true);
    expect(straight.brushTarget([7, 3], true)[1]).toBeCloseTo(2);
  });

  it("keeps the ray it first chose when the pointer wobbles across a 22.5 degree boundary", () => {
    const { straight } = make();
    straight.brushPress([0, 0], false);
    const first = straight.brushTarget([5, 1], true); // 11 degrees: the flat ray
    expect(first[0]).toBeCloseTo(5);
    expect(first[1]).toBeCloseTo(0);
    const wobble = straight.brushTarget([5, 3], true); // 31 degrees would have been the diagonal
    expect(wobble[0]).toBeCloseTo(5);
    expect(wobble[1]).toBeCloseTo(0);
  });

  it("never runs backwards past the start of a locked ray", () => {
    const { straight } = make();
    straight.brushPress([0, 0], false);
    straight.brushTarget([4, 0], true);
    const back = straight.brushTarget([-3, 1], true);
    expect(back[0]).toBeCloseTo(0);
    expect(back[1]).toBeCloseTo(0);
  });

  it("lets go of the ray with Shift and picks a new one from the pointer on the next press", () => {
    const { straight } = make();
    straight.brushPress([0, 0], false);
    straight.brushTarget([4, 0], true);
    expect(straight.brushTarget([4, 3], false)).toEqual([4, 3]);
    const next = straight.brushTarget([4, 8], true); // straight down from where it was let go
    expect(next[0]).toBeCloseTo(4);
    expect(next[1]).toBeCloseTo(8);
  });

  it("is forgotten when the tool changes", () => {
    const { straight, activeTool } = make();
    straight.brushEnded([3, 1]);
    activeTool.value = "floor";
    expect(straight.brushPress([3, 5], true)).toEqual([[3, 5]]);
  });

  it("is forgotten on Escape", () => {
    const { straight } = make();
    straight.brushEnded([3, 1]);
    straight.forget();
    expect(straight.brushPress([3, 5], true)).toEqual([[3, 5]]);
  });

  it("is forgotten when a different map opens, and kept across a refetch of the same one", () => {
    const { straight, mapKey } = make();
    straight.brushEnded([3, 1]);
    mapKey.value = "map-a";
    expect(straight.brushPress([3, 5], true)).toEqual([[3, 1], [3, 5]]);

    mapKey.value = "map-b";
    expect(straight.brushPress([3, 5], true)).toEqual([[3, 5]]);
  });

});

describe("cell painters", () => {
  it("a plain press is the one cell", () => {
    const { straight } = make("floor");
    expect(straight.cellPress([4, 4], false)).toEqual([[4, 4]]);
  });

  it("Shift+press paints a line from the last painted cell", () => {
    const { straight } = make("floor");
    straight.cellPress([0, 0], false);
    straight.cellDrag([2, 0], false);
    straight.cellEnded();
    straight.beginStroke();
    expect(straight.cellPress([2, 3], true)).toEqual([[2, 0], [2, 1], [2, 2], [2, 3]]);
  });

  it("a press without Shift ignores the remembered cell", () => {
    const { straight } = make("floor");
    straight.cellPress([0, 0], false);
    straight.cellEnded();
    straight.beginStroke();
    expect(straight.cellPress([2, 3], false)).toEqual([[2, 3]]);
  });

  it("without Shift a drag paints the cell under the pointer", () => {
    const { straight } = make("floor");
    straight.cellPress([0, 0], false);
    expect(straight.cellDrag([3, 1], false)).toEqual([[3, 1]]);
  });

  it("Shift while dragging snaps to 45 degrees and leaves no gap on a fast move", () => {
    const { straight } = make("floor");
    straight.cellPress([0, 0], false);
    expect(straight.cellDrag([4, 1], true)).toEqual([[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]]);
  });

  it("keeps painting along the snapped ray from the previous target", () => {
    const { straight } = make("floor");
    straight.cellPress([0, 0], false);
    straight.cellDrag([2, 0], true);
    expect(straight.cellDrag([4, 1], true)).toEqual([[2, 0], [3, 0], [4, 0]]);
  });

  it("keeps the ray it first chose when the pointer wobbles across a 22.5 degree boundary", () => {
    const { straight } = make("floor");
    straight.cellPress([0, 0], false);
    expect(straight.cellDrag([5, 1], true)).toEqual([[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [5, 0]]);
    // (6, 4) alone would snap to the diagonal; the locked ray keeps going along the row.
    expect(straight.cellDrag([6, 4], true)).toEqual([[5, 0], [6, 0]]);
  });

  it("does not run backwards past the start of a locked ray", () => {
    const { straight } = make("floor");
    straight.cellPress([0, 0], false);
    straight.cellDrag([3, 0], true);
    expect(straight.cellDrag([-2, 1], true)).toEqual([[3, 0], [2, 0], [1, 0], [0, 0]]);
  });

  it("lets go of the ray with Shift and picks a new one from the pointer on the next press", () => {
    const { straight } = make("floor");
    straight.cellPress([0, 0], false);
    straight.cellDrag([3, 0], true);
    expect(straight.cellDrag([3, 2], false)).toEqual([[3, 2]]);
    expect(straight.cellDrag([3, 6], true)).toEqual([[3, 2], [3, 3], [3, 4], [3, 5], [3, 6]]);
  });

  it("is forgotten when the tool changes", () => {
    const { straight, activeTool } = make("floor");
    straight.cellPress([0, 0], false);
    straight.cellEnded();
    activeTool.value = "solid";
    expect(straight.cellPress([2, 3], true)).toEqual([[2, 3]]);
  });
});

describe("wall", () => {
  it("has no run without a remembered point or without Shift", () => {
    const { straight } = make("wall");
    expect(straight.runFromAnchor([3, 0], true)).toBeNull();
    straight.noteWallEdge({ x: 0, y: 0, side: "N" });
    straight.wallEnded([1.1, 0.1]);
    expect(straight.runFromAnchor([3, 0], false)).toBeNull();
  });

  it("runs from the end of the last stroke to the nearest vertex, locked to an axis", () => {
    const { straight } = make("wall");
    straight.noteWallEdge({ x: 0, y: 0, side: "N" });
    straight.wallEnded([1.1, 0.1]); // nearer the edge's east end, vertex (1, 0)
    const run = straight.runFromAnchor([3.2, 0.4], true);
    expect(run).toEqual([
      { x: 1, y: 0, side: "N" },
      { x: 2, y: 0, side: "N" },
    ]);
  });

  it("a run becomes the next anchor, so corners chain", () => {
    const { straight } = make("wall");
    straight.noteWallEdge({ x: 0, y: 0, side: "N" });
    straight.wallEnded([1.1, 0.1]);
    straight.runFromAnchor([3, 0], true); // ends at (3, 0)
    expect(straight.runFromAnchor([3, 2], true)).toEqual([
      { x: 3, y: 0, side: "W" },
      { x: 3, y: 1, side: "W" },
    ]);
  });

  it("Shift keeps a drag on the row or column of its first edge", () => {
    const { straight } = make("wall");
    straight.beginStroke();
    straight.noteWallEdge({ x: 2, y: 3, side: "N" });
    expect(straight.wallEdgeOffLine({ x: 4, y: 3, side: "N" }, true)).toBe(false);
    expect(straight.wallEdgeOffLine({ x: 4, y: 4, side: "N" }, true)).toBe(true);
    expect(straight.wallEdgeOffLine({ x: 4, y: 3, side: "W" }, true)).toBe(true);
    // The south edge of the row above is the same line seen from the other cell.
    expect(straight.wallEdgeOffLine({ x: 4, y: 2, side: "S" }, true)).toBe(false);
    expect(straight.wallEdgeOffLine({ x: 4, y: 4, side: "N" }, false)).toBe(false);
  });

  it("the first edge of a stroke fixes its line, and later edges do not move it", () => {
    const { straight } = make("wall");
    straight.beginStroke();
    straight.noteWallEdge({ x: 2, y: 3, side: "N" });
    straight.noteWallEdge({ x: 4, y: 3, side: "N" });
    straight.noteWallEdge({ x: 6, y: 9, side: "N" }); // off the line: still only noted, the origin stays row 3
    expect(straight.wallEdgeOffLine({ x: 8, y: 3, side: "N" }, true)).toBe(false);
    expect(straight.wallEdgeOffLine({ x: 8, y: 9, side: "N" }, true)).toBe(true);
  });

  it("a vertical stroke stays on its column", () => {
    const { straight } = make("wall");
    straight.beginStroke();
    straight.noteWallEdge({ x: 5, y: 1, side: "W" });
    expect(straight.wallEdgeOffLine({ x: 5, y: 4, side: "W" }, true)).toBe(false);
    expect(straight.wallEdgeOffLine({ x: 6, y: 4, side: "W" }, true)).toBe(true);
  });

  it("is forgotten when the tool changes", () => {
    const { straight, activeTool } = make("wall");
    straight.noteWallEdge({ x: 0, y: 0, side: "N" });
    straight.wallEnded([1, 0]);
    activeTool.value = "brush";
    expect(straight.runFromAnchor([3, 0], true)).toBeNull();
  });
});
