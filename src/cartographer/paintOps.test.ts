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

  it("paints a brushed cell back to a whole square, dropping its mask", () => {
    const ctx = makeCtx();
    const floor = { pack_id: "pack-a", pack_version: 1, variant: 3 };
    ctx.layers.floor[cellKey(1, 2)] = { floor };
    ctx.layers.area[cellKey(1, 2)] = { ...floor, mask: "00000000ffffffff" };
    expect(paintOps.paintCell(ctx, 1, 2, 3)).toBe(true);
    expect(ctx.layers.area[cellKey(1, 2)]).toBeUndefined();
    expect(ctx.layers.floor[cellKey(1, 2)]?.floor).toEqual(floor);
  });

  it("erases a brushed cell, with or without floor", () => {
    const ctx = makeCtx();
    const ref = { pack_id: "pack-a", pack_version: 1, variant: 0 };
    ctx.layers.floor[cellKey(0, 0)] = { floor: ref };
    ctx.layers.area[cellKey(0, 0)] = { ...ref, mask: "00ffffffffffffff" };
    ctx.layers.area[cellKey(1, 0)] = { ...ref, mask: "000000000000000f" };
    expect(paintOps.eraseCell(ctx, 0, 0)).toBe(true);
    expect(paintOps.eraseCell(ctx, 1, 0)).toBe(true);
    expect(ctx.layers.area).toEqual({});
    expect(ctx.layers.floor).toEqual({});
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

describe("eraseWallAtCellEdge on a cell that lacks that wall", () => {
  const stroke = () => paintOps.createStrokeState();

  it("changes nothing and reports nothing when the cell has floor but no such wall", () => {
    const ctx = makeCtx();
    const ref = { pack_id: "pack-a", pack_version: 1, variant: 0 };
    ctx.layers.floor[cellKey(2, 2)] = { floor: ref };
    expect(paintOps.eraseWallAtCellEdge(ctx, { x: 2, y: 2, side: "N" }, stroke())).toBe(false);
    expect(paintOps.eraseWallAtCellEdge(ctx, { x: 2, y: 2, side: "W" }, stroke())).toBe(false);
    expect(ctx.layers.floor[cellKey(2, 2)]).toEqual({ floor: ref });
  });

  it("leaves the other wall alone: no north wall to erase beside a west wall, and the reverse", () => {
    const ctx = makeCtx();
    const wall = { pack_id: "pack-a", pack_version: 1, variant: 0, type: "wall" as const };
    ctx.layers.floor[cellKey(2, 2)] = { wallW: wall };
    ctx.layers.floor[cellKey(5, 5)] = { wallN: wall };
    expect(paintOps.eraseWallAtCellEdge(ctx, { x: 2, y: 2, side: "N" }, stroke())).toBe(false);
    expect(paintOps.eraseWallAtCellEdge(ctx, { x: 5, y: 5, side: "W" }, stroke())).toBe(false);
    expect(ctx.layers.floor[cellKey(2, 2)]).toEqual({ wallW: wall });
    expect(ctx.layers.floor[cellKey(5, 5)]).toEqual({ wallN: wall });
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

describe("dressing ops", () => {
  it("places a prop on top, normalising the rotation", () => {
    const { layers } = makeCtx();
    expect(paintOps.placeDressing(layers, { prop_id: "bed", x: 2, y: 3, rotation: -90 }, "a")).toBe(true);
    expect(paintOps.placeDressing(layers, { prop_id: "table", x: 0, y: 0, rotation: 450 }, "b")).toBe(true);
    expect(layers.dressing.a).toEqual({ prop_id: "bed", x: 2, y: 3, rotation: 270, z: 0 });
    expect(layers.dressing.b).toEqual({ prop_id: "table", x: 0, y: 0, rotation: 90, z: 1 });
  });

  it("refuses to place over an existing id", () => {
    const { layers } = makeCtx();
    paintOps.placeDressing(layers, { prop_id: "bed", x: 0, y: 0, rotation: 0 }, "a");
    expect(paintOps.placeDressing(layers, { prop_id: "bed", x: 5, y: 5, rotation: 0 }, "a")).toBe(false);
    expect(layers.dressing.a.x).toBe(0);
  });

  it("replaces the dressing object instead of mutating it", () => {
    const { layers } = makeCtx();
    paintOps.placeDressing(layers, { prop_id: "bed", x: 0, y: 0, rotation: 0 }, "a");
    const before = layers.dressing;
    paintOps.moveDressing(layers, "a", 4, 4);
    expect(layers.dressing).not.toBe(before);
    expect(before.a.x).toBe(0);
    expect(layers.dressing.a).toMatchObject({ x: 4, y: 4 });
  });

  it("reports no change for a missing id or an unchanged value", () => {
    const { layers } = makeCtx();
    paintOps.placeDressing(layers, { prop_id: "bed", x: 1, y: 1, rotation: 0 }, "a");
    expect(paintOps.moveDressing(layers, "nope", 0, 0)).toBe(false);
    expect(paintOps.moveDressing(layers, "a", 1, 1)).toBe(false);
    expect(paintOps.rotateDressing(layers, "nope", 90)).toBe(false);
    expect(paintOps.rotateDressing(layers, "a", 360)).toBe(false);
    expect(paintOps.removeDressing(layers, "nope")).toBe(false);
  });

  it("rotates and removes", () => {
    const { layers } = makeCtx();
    paintOps.placeDressing(layers, { prop_id: "bed", x: 1, y: 1, rotation: 0 }, "a");
    expect(paintOps.rotateDressing(layers, "a", -45)).toBe(true);
    expect(layers.dressing.a.rotation).toBe(315);
    expect(paintOps.removeDressing(layers, "a")).toBe(true);
    expect(layers.dressing).toEqual({});
  });
});

describe("terrain", () => {
  it("paints water and the floor under it when the cell has none", () => {
    const ctx = makeCtx();
    expect(paintOps.paintTerrainAt(ctx, 1, 2, 4, 7)).toBe(true);
    expect(ctx.layers.terrain[cellKey(1, 2)]).toEqual({ pack_id: "pack-a", pack_version: 1, variant: 4 });
    expect(ctx.layers.floor[cellKey(1, 2)]?.floor?.variant).toBe(7);
  });

  it("keeps an existing floor, and a cell with only walls still gains one", () => {
    const ctx = makeCtx();
    paintOps.paintCell(ctx, 0, 0, 1);
    paintOps.paintTerrainAt(ctx, 0, 0, 4, 7);
    expect(ctx.layers.floor[cellKey(0, 0)]?.floor?.variant).toBe(1);

    paintOps.paintWallAtCellEdge(ctx, { x: 5, y: 5, side: "N" }, paintOps.createStrokeState(), 0);
    paintOps.paintTerrainAt(ctx, 5, 5, 4, 7);
    expect(ctx.layers.floor[cellKey(5, 5)]?.floor?.variant).toBe(7);
    expect(ctx.layers.floor[cellKey(5, 5)]?.wallN).toBeDefined();
  });

  it("is a no-op for the same water, and erases only the water", () => {
    const ctx = makeCtx();
    paintOps.paintTerrainAt(ctx, 0, 0, 4, 7);
    expect(paintOps.paintTerrainAt(ctx, 0, 0, 4, 7)).toBe(false);
    expect(paintOps.eraseTerrainAt(ctx, 0, 0)).toBe(true);
    expect(ctx.layers.terrain[cellKey(0, 0)]).toBeUndefined();
    expect(ctx.layers.floor[cellKey(0, 0)]?.floor).toBeDefined();
    expect(paintOps.eraseTerrainAt(ctx, 0, 0)).toBe(false);
  });

  it("eraseCell takes the cell's terrain with it", () => {
    const ctx = makeCtx();
    paintOps.paintTerrainAt(ctx, 0, 0, 4, 7);
    expect(paintOps.eraseCell(ctx, 0, 0)).toBe(true);
    expect(ctx.layers.floor[cellKey(0, 0)]).toBeUndefined();
    expect(ctx.layers.terrain[cellKey(0, 0)]).toBeUndefined();
  });
});

describe("wall kinds and decals", () => {
  const edge = { x: 2, y: 3, side: "N" as const };

  it("writes a grate or sluice edge", () => {
    const ctx = makeCtx();
    paintOps.paintWallAtCellEdge(ctx, edge, paintOps.createStrokeState(), 1, "grate");
    expect(ctx.layers.floor[cellKey(2, 3)]?.wallN?.type).toBe("grate");
    paintOps.paintWallAtCellEdge(ctx, { x: 2, y: 3, side: "W" }, paintOps.createStrokeState(), 1, "sluice");
    expect(ctx.layers.floor[cellKey(2, 3)]?.wallW?.type).toBe("sluice");
  });

  it("a grate replaces a plain wall, dropping its decal, and never a door", () => {
    const ctx = makeCtx();
    paintOps.paintWallAtCellEdge(ctx, edge, paintOps.createStrokeState(), 1);
    paintOps.setDecalAtEdge(ctx, edge, 0);
    expect(paintOps.paintWallAtCellEdge(ctx, edge, paintOps.createStrokeState(), 2, "grate")).toBe(true);
    expect(ctx.layers.floor[cellKey(2, 3)]?.wallN).toEqual({
      pack_id: "pack-a", pack_version: 1, type: "grate", variant: 2,
    });

    const doors = makeCtx();
    paintOps.paintDoorAtEdge(doors, edge, paintOps.createStrokeState(), 0);
    expect(paintOps.paintWallAtCellEdge(doors, edge, paintOps.createStrokeState(), 2, "grate")).toBe(false);
    expect(doors.layers.floor[cellKey(2, 3)]?.wallN?.type).toBe("doorClosed");
  });

  it("a plain wall does not overwrite a grate", () => {
    const ctx = makeCtx();
    paintOps.paintWallAtCellEdge(ctx, edge, paintOps.createStrokeState(), 1, "grate");
    expect(paintOps.paintWallAtCellEdge(ctx, edge, paintOps.createStrokeState(), 1)).toBe(false);
  });

  it("sets a decal only on a wall, and removes it again", () => {
    const ctx = makeCtx();
    expect(paintOps.setDecalAtEdge(ctx, edge, 1)).toBe(false); // nothing there
    paintOps.paintWallAtCellEdge(ctx, edge, paintOps.createStrokeState(), 0);
    expect(paintOps.setDecalAtEdge(ctx, edge, 1)).toBe(true);
    expect(ctx.layers.floor[cellKey(2, 3)]?.wallN?.decal).toBe(1);
    expect(paintOps.setDecalAtEdge(ctx, edge, 1)).toBe(false);
    expect(paintOps.setDecalAtEdge(ctx, edge, undefined)).toBe(true);
    expect("decal" in (ctx.layers.floor[cellKey(2, 3)]?.wallN ?? {})).toBe(false);
  });

  it("refuses a decal on a grate, a sluice or a door, and finds the owner from the S side", () => {
    const ctx = makeCtx();
    paintOps.paintWallAtCellEdge(ctx, edge, paintOps.createStrokeState(), 0, "sluice");
    expect(paintOps.setDecalAtEdge(ctx, edge, 0)).toBe(false);

    const walls = makeCtx();
    paintOps.paintWallAtCellEdge(walls, edge, paintOps.createStrokeState(), 0);
    expect(paintOps.setDecalAtEdge(walls, { x: 2, y: 2, side: "S" }, 0)).toBe(true);
    expect(walls.layers.floor[cellKey(2, 3)]?.wallN?.decal).toBe(0);
  });
});
