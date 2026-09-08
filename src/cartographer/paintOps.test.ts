import { describe, it, expect } from "vitest";
import * as paintOps from "./paintOps";
import { emptyLayers, cellKey } from "@/types/dungeonMap.types";
import type { PaintContext } from "./paintOps";

function makeCtx(packId = "pack-a"): PaintContext {
  return { layers: emptyLayers(), packId, packVersion: 1 };
}

describe("edgeDirection", () => {
  it("maps N/S to H and E/W to V", () => {
    expect(paintOps.edgeDirection("N")).toBe("H");
    expect(paintOps.edgeDirection("S")).toBe("H");
    expect(paintOps.edgeDirection("E")).toBe("V");
    expect(paintOps.edgeDirection("W")).toBe("V");
  });
});

describe("paintCell / eraseCell", () => {
  it("paints a floor cell and reports the change", () => {
    const ctx = makeCtx();
    expect(paintOps.paintCell(ctx, 1, 2, 3)).toBe(true);
    expect(ctx.layers.floor[cellKey(1, 2)]?.floor).toEqual({ pack_id: "pack-a", pack_version: 1, variant: 3 });
  });

  it("is a no-op when the same pack + variant is already painted", () => {
    const ctx = makeCtx();
    paintOps.paintCell(ctx, 1, 2, 3);
    expect(paintOps.paintCell(ctx, 1, 2, 3)).toBe(false);
  });

  it("repaints when the pack or variant differs", () => {
    const ctx = makeCtx();
    paintOps.paintCell(ctx, 1, 2, 3);
    expect(paintOps.paintCell(ctx, 1, 2, 4)).toBe(true);
  });
});

describe("paintSolidAt / eraseSolidAt", () => {
  it("paints and erases a solid block", () => {
    const ctx = makeCtx();
    expect(paintOps.paintSolidAt(ctx, 0, 0, 2)).toBe(true);
    expect(ctx.layers.solidBlock[cellKey(0, 0)]).toEqual({ pack_id: "pack-a", pack_version: 1, variant: 2 });
    expect(paintOps.paintSolidAt(ctx, 0, 0, 2)).toBe(false); // same variant, no-op
    expect(paintOps.eraseSolidAt(ctx, 0, 0)).toBe(true);
    expect(ctx.layers.solidBlock[cellKey(0, 0)]).toBeUndefined();
  });
});

describe("paintObjectAt", () => {
  it("records the active object category, variant and rotation", () => {
    const ctx = makeCtx();
    expect(paintOps.paintObjectAt(ctx, 3, 4, "objectChest", 2, 90)).toBe(true);
    expect(ctx.layers.object[cellKey(3, 4)]).toEqual({
      pack_id: "pack-a",
      pack_version: 1,
      category: "objectChest",
      variant: 2,
      rotation: 90,
    });
  });

  it("omits rotation entirely when it is 0", () => {
    const ctx = makeCtx();
    paintOps.paintObjectAt(ctx, 3, 4, "objectBarrel", 1, 0);
    const cell = ctx.layers.object[cellKey(3, 4)];
    expect(cell).toEqual({ pack_id: "pack-a", pack_version: 1, category: "objectBarrel", variant: 1 });
    expect(cell).not.toHaveProperty("rotation");
  });

  it("eraseObjectAt removes a previously painted object", () => {
    const ctx = makeCtx();
    paintOps.paintObjectAt(ctx, 3, 4, "objectChest", 2, 0);
    expect(paintOps.eraseObjectAt(ctx, 3, 4)).toBe(true);
    expect(ctx.layers.object[cellKey(3, 4)]).toBeUndefined();
  });
});

describe("erase on an empty cell is a no-op (returns false)", () => {
  it("eraseCell", () => {
    expect(paintOps.eraseCell(makeCtx(), 5, 5)).toBe(false);
  });
  it("eraseSolidAt", () => {
    expect(paintOps.eraseSolidAt(makeCtx(), 5, 5)).toBe(false);
  });
  it("eraseObjectAt", () => {
    expect(paintOps.eraseObjectAt(makeCtx(), 5, 5)).toBe(false);
  });
  it("eraseWallAtCellEdge", () => {
    const stroke = paintOps.createStrokeState();
    expect(paintOps.eraseWallAtCellEdge(makeCtx(), { x: 5, y: 5, side: "N" }, stroke)).toBe(false);
  });
});

describe("paintWallAtCellEdge — direction lock", () => {
  it("commits to the first edge's direction; a later perpendicular edge in the same stroke is ignored", () => {
    const ctx = makeCtx();
    const stroke = paintOps.createStrokeState();
    stroke.active = true;

    // First edge: N side → H direction.
    expect(paintOps.paintWallAtCellEdge(ctx, { x: 0, y: 0, side: "N" }, stroke, 0)).toBe(true);
    expect(stroke.direction).toBe("H");

    // Second edge: W side → V direction, perpendicular to the lock — ignored.
    const before = JSON.stringify(ctx.layers.floor);
    expect(paintOps.paintWallAtCellEdge(ctx, { x: 1, y: 1, side: "W" }, stroke, 0)).toBe(false);
    expect(JSON.stringify(ctx.layers.floor)).toBe(before);

    // A further H edge is still accepted.
    expect(paintOps.paintWallAtCellEdge(ctx, { x: 0, y: 1, side: "N" }, stroke, 0)).toBe(true);
  });

  it("with an inactive stroke, direction is never locked", () => {
    const ctx = makeCtx();
    const stroke = paintOps.createStrokeState(); // active: false

    expect(paintOps.paintWallAtCellEdge(ctx, { x: 0, y: 0, side: "N" }, stroke, 0)).toBe(true);
    // Perpendicular edge — would be rejected if a stroke were active, but it isn't.
    expect(paintOps.paintWallAtCellEdge(ctx, { x: 1, y: 1, side: "W" }, stroke, 0)).toBe(true);
    expect(stroke.direction).toBeNull();
  });
});

describe("paintWallAtCellEdge — stroke dedup", () => {
  it("painting the same canonical edge twice in one stroke changes layers once", () => {
    const ctx = makeCtx();
    const stroke = paintOps.createStrokeState();

    expect(paintOps.paintWallAtCellEdge(ctx, { x: 2, y: 2, side: "N" }, stroke, 3)).toBe(true);
    // Same physical edge, addressed via its "S" alias from the cell above.
    expect(paintOps.paintWallAtCellEdge(ctx, { x: 2, y: 1, side: "S" }, stroke, 5)).toBe(false);
    // The variant from the first paint sticks — the second call never wrote.
    expect(ctx.layers.floor[cellKey(2, 2)]?.wallN?.variant).toBe(3);
  });
});

describe("paintWallAtCellEdge — door preservation and pack-aware wall skip", () => {
  it("preserves an existing door when a wall is painted over it", () => {
    const ctx = makeCtx();
    ctx.layers.floor[cellKey(0, 0)] = {
      wallN: { pack_id: "pack-a", pack_version: 1, type: "doorClosed", variant: 2 },
    };
    const stroke = paintOps.createStrokeState();

    expect(paintOps.paintWallAtCellEdge(ctx, { x: 0, y: 0, side: "N" }, stroke, 9)).toBe(false);
    expect(ctx.layers.floor[cellKey(0, 0)]?.wallN).toEqual({
      pack_id: "pack-a", pack_version: 1, type: "doorClosed", variant: 2,
    });
  });

  it("skips repainting a wall segment already owned by the same pack", () => {
    const ctx = makeCtx();
    ctx.layers.floor[cellKey(0, 0)] = {
      wallN: { pack_id: "pack-a", pack_version: 1, type: "wall", variant: 2 },
    };
    const stroke = paintOps.createStrokeState();

    expect(paintOps.paintWallAtCellEdge(ctx, { x: 0, y: 0, side: "N" }, stroke, 9)).toBe(false);
    expect(ctx.layers.floor[cellKey(0, 0)]?.wallN?.variant).toBe(2);
  });

  it("restyles a wall segment owned by a different pack", () => {
    const ctx = makeCtx("pack-a");
    ctx.layers.floor[cellKey(0, 0)] = {
      wallN: { pack_id: "pack-b", pack_version: 1, type: "wall", variant: 2 },
    };
    const stroke = paintOps.createStrokeState();

    expect(paintOps.paintWallAtCellEdge(ctx, { x: 0, y: 0, side: "N" }, stroke, 9)).toBe(true);
    expect(ctx.layers.floor[cellKey(0, 0)]?.wallN).toEqual({
      pack_id: "pack-a", pack_version: 1, type: "wall", variant: 9,
    });
  });
});

describe("setWallEdgeIfEmpty", () => {
  it("writes a wall when the edge is empty, ignoring stroke tracking entirely", () => {
    const ctx = makeCtx();
    expect(paintOps.setWallEdgeIfEmpty(ctx, { x: 0, y: 0, side: "N" }, 1)).toBe(true);
    // Calling it again on the same, now-occupied edge is a no-op — no stroke object involved.
    expect(paintOps.setWallEdgeIfEmpty(ctx, { x: 0, y: 0, side: "N" }, 7)).toBe(false);
    expect(ctx.layers.floor[cellKey(0, 0)]?.wallN?.variant).toBe(1);
  });

  it("preserves an existing door", () => {
    const ctx = makeCtx();
    ctx.layers.floor[cellKey(0, 0)] = {
      wallN: { pack_id: "pack-a", pack_version: 1, type: "doorClosed", variant: 4 },
    };
    expect(paintOps.setWallEdgeIfEmpty(ctx, { x: 0, y: 0, side: "N" }, 9)).toBe(false);
    expect(ctx.layers.floor[cellKey(0, 0)]?.wallN?.type).toBe("doorClosed");
  });
});

describe("paintDoorAtEdge", () => {
  it("places a new closed door using the caller-supplied variant", () => {
    const ctx = makeCtx();
    const stroke = paintOps.createStrokeState();
    expect(paintOps.paintDoorAtEdge(ctx, { x: 0, y: 0, side: "N" }, stroke, 6)).toBe(true);
    expect(ctx.layers.floor[cellKey(0, 0)]?.wallN).toEqual({
      pack_id: "pack-a", pack_version: 1, type: "doorClosed", variant: 6,
    });
  });

  it("toggles a closed door open, and open back to closed, reusing the stored variant", () => {
    const ctx = makeCtx();
    let stroke = paintOps.createStrokeState();
    paintOps.paintDoorAtEdge(ctx, { x: 0, y: 0, side: "N" }, stroke, 6);

    // New stroke — the dedup set is per-stroke.
    stroke = paintOps.createStrokeState();
    expect(paintOps.paintDoorAtEdge(ctx, { x: 0, y: 0, side: "N" }, stroke, 999)).toBe(true);
    expect(ctx.layers.floor[cellKey(0, 0)]?.wallN).toEqual({
      pack_id: "pack-a", pack_version: 1, type: "doorOpen", variant: 6,
    });

    stroke = paintOps.createStrokeState();
    expect(paintOps.paintDoorAtEdge(ctx, { x: 0, y: 0, side: "N" }, stroke, 999)).toBe(true);
    expect(ctx.layers.floor[cellKey(0, 0)]?.wallN).toEqual({
      pack_id: "pack-a", pack_version: 1, type: "doorClosed", variant: 6,
    });
  });

  it("dedups within one stroke", () => {
    const ctx = makeCtx();
    const stroke = paintOps.createStrokeState();
    expect(paintOps.paintDoorAtEdge(ctx, { x: 0, y: 0, side: "N" }, stroke, 6)).toBe(true);
    expect(paintOps.paintDoorAtEdge(ctx, { x: 0, y: 0, side: "N" }, stroke, 6)).toBe(false);
  });
});

describe("removeDoorAtEdge", () => {
  it("reverts a door to a plain wall, preserving the edge", () => {
    const ctx = makeCtx();
    ctx.layers.floor[cellKey(0, 0)] = {
      wallN: { pack_id: "pack-a", pack_version: 1, type: "doorClosed", variant: 3 },
    };
    expect(paintOps.removeDoorAtEdge(ctx, { x: 0, y: 0, side: "N" }, 8)).toBe(true);
    expect(ctx.layers.floor[cellKey(0, 0)]?.wallN).toEqual({
      pack_id: "pack-a", pack_version: 1, type: "wall", variant: 8,
    });
  });

  it("is a no-op on a plain wall or an empty edge", () => {
    const wallCtx = makeCtx();
    wallCtx.layers.floor[cellKey(0, 0)] = {
      wallN: { pack_id: "pack-a", pack_version: 1, type: "wall", variant: 1 },
    };
    expect(paintOps.removeDoorAtEdge(wallCtx, { x: 0, y: 0, side: "N" }, 8)).toBe(false);

    expect(paintOps.removeDoorAtEdge(makeCtx(), { x: 0, y: 0, side: "N" }, 8)).toBe(false);
  });
});

describe("eraseWallAtCellEdge", () => {
  it("removes a wall segment", () => {
    const ctx = makeCtx();
    ctx.layers.floor[cellKey(0, 0)] = {
      floor: { pack_id: "pack-a", pack_version: 1, variant: 0 },
      wallN: { pack_id: "pack-a", pack_version: 1, type: "wall", variant: 1 },
    };
    const stroke = paintOps.createStrokeState();
    expect(paintOps.eraseWallAtCellEdge(ctx, { x: 0, y: 0, side: "N" }, stroke)).toBe(true);
    expect(ctx.layers.floor[cellKey(0, 0)]?.wallN).toBeUndefined();
    // Cell still has a floor, so it isn't dropped.
    expect(ctx.layers.floor[cellKey(0, 0)]).toBeDefined();
  });

  it("drops the cell entirely once it has no floor and no walls left", () => {
    const ctx = makeCtx();
    ctx.layers.floor[cellKey(0, 0)] = {
      wallN: { pack_id: "pack-a", pack_version: 1, type: "wall", variant: 1 },
    };
    const stroke = paintOps.createStrokeState();
    expect(paintOps.eraseWallAtCellEdge(ctx, { x: 0, y: 0, side: "N" }, stroke)).toBe(true);
    expect(ctx.layers.floor[cellKey(0, 0)]).toBeUndefined();
  });

  it("respects the same direction lock as paintWallAtCellEdge", () => {
    const ctx = makeCtx();
    ctx.layers.floor[cellKey(0, 0)] = {
      floor: { pack_id: "pack-a", pack_version: 1, variant: 0 },
      wallN: { pack_id: "pack-a", pack_version: 1, type: "wall", variant: 1 },
    };
    ctx.layers.floor[cellKey(1, 1)] = {
      floor: { pack_id: "pack-a", pack_version: 1, variant: 0 },
      wallW: { pack_id: "pack-a", pack_version: 1, type: "wall", variant: 1 },
    };
    const stroke = paintOps.createStrokeState();
    stroke.active = true;

    expect(paintOps.eraseWallAtCellEdge(ctx, { x: 0, y: 0, side: "N" }, stroke)).toBe(true);
    expect(stroke.direction).toBe("H");
    // Perpendicular edge — ignored under the direction lock, wall untouched.
    expect(paintOps.eraseWallAtCellEdge(ctx, { x: 1, y: 1, side: "W" }, stroke)).toBe(false);
    expect(ctx.layers.floor[cellKey(1, 1)]?.wallW).toBeDefined();
  });
});
