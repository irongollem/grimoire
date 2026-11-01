import { describe, expect, it } from "vitest";
import type { Ctx2D } from "@/cartographer/dressing";
import { paintWallNodes, type WallNodeMarks } from "./drawWallNodes";

interface Call {
  op: string;
  args: number[];
  stroke: string;
}

function recorder(): { ctx: Ctx2D; calls: Call[] } {
  const calls: Call[] = [];
  const state = { strokeStyle: "", fillStyle: "", lineWidth: 0, lineCap: "" };
  const rec = (op: string) => (...args: number[]) => calls.push({ op, args, stroke: state.strokeStyle });
  const ctx = Object.assign(state, {
    save: () => {},
    restore: () => {},
    beginPath: () => {},
    closePath: () => {},
    fill: () => {},
    moveTo: rec("moveTo"),
    lineTo: rec("lineTo"),
    arc: rec("arc"),
    stroke: rec("stroke"),
  });
  return { ctx: ctx as unknown as Ctx2D, calls };
}

const marks: WallNodeMarks = {
  bones: [{ id: "0,0>4,0", a: "0,0", b: "4,0" }],
  nodes: [
    { id: "0,0", x: 0, y: 0, smooth: true },
    { id: "4,0", x: 4, y: 0, smooth: true },
  ],
};

describe("paintWallNodes", () => {
  it("draws the bone in screen pixels, shifted by the viewport (a pan must not leave the highlight behind)", () => {
    const { ctx, calls } = recorder();
    paintWallNodes(ctx, marks, 50, { x: 20, y: 10 });
    expect(calls.find((c) => c.op === "moveTo")?.args).toEqual([-20, -10]);
    expect(calls.find((c) => c.op === "lineTo")?.args).toEqual([180, -10]);
  });

  it("marks the dragged node with a larger handle than its neighbours (the drag must be readable)", () => {
    const { ctx, calls } = recorder();
    paintWallNodes(ctx, { ...marks, draggedNode: "4,0" }, 50, { x: 0, y: 0 });
    const radii = calls.filter((c) => c.op === "arc").map((c) => c.args[2]);
    expect(radii[1]).toBeGreaterThan(radii[0]);
  });

  it("rings a node it would join differently from a plain grid landing", () => {
    const join = recorder();
    paintWallNodes(join.ctx, { ...marks, snap: { kind: "node", point: [2, 2], node: "2,2" } }, 50, { x: 0, y: 0 });
    const grid = recorder();
    paintWallNodes(grid.ctx, { ...marks, snap: { kind: "grid", point: [2, 2] } }, 50, { x: 0, y: 0 });
    const lastStroke = (calls: Call[]): string => calls.filter((c) => c.op === "stroke").at(-1)!.stroke;
    expect(lastStroke(join.calls)).not.toBe(lastStroke(grid.calls));
  });

  it("draws a curved bone along its curve, not along the chord between its nodes", () => {
    const { ctx, calls } = recorder();
    const curved: WallNodeMarks = { ...marks, bones: [{ id: "0,0>4,0", a: "0,0", b: "4,0", path: [[0, 0], [1, 1], [3, 1], [4, 0]] }] };
    paintWallNodes(ctx, curved, 50, { x: 0, y: 0 });
    expect(calls.filter((c) => c.op === "lineTo").map((c) => c.args)).toEqual([[50, 50], [150, 50], [200, 0]]);
  });

  it("draws a smooth node round and a corner node square, so the two kinds read apart", () => {
    const { ctx, calls } = recorder();
    paintWallNodes(ctx, { ...marks, nodes: [{ id: "0,0", x: 0, y: 0, smooth: true }, { id: "4,0", x: 4, y: 0, smooth: false }] }, 50, { x: 0, y: 0 });
    expect(calls.filter((c) => c.op === "arc")).toHaveLength(1);
    // The square is four corners: three lineTo after its moveTo, beyond the bone's own.
    expect(calls.filter((c) => c.op === "lineTo").length).toBeGreaterThanOrEqual(4);
  });
});
