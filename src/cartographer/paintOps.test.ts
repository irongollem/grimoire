import { describe, it, expect } from "vitest";
import * as paintOps from "./paintOps";
import { emptyLayers, cellKey } from "@/types/dungeonMap.types";
import type { PaintContext } from "./paintOps";
import { putWall } from "./testWalls";

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

  it("repainting a plain cell with another pack leaves it a plain cell", () => {
    const ctx = makeCtx("ice");
    ctx.layers.floor[cellKey(0, 0)] = { floor: { pack_id: "stone", pack_version: 1, variant: 0 } };
    paintOps.paintCell(ctx, 0, 0, 0);
    expect(ctx.layers.floor[cellKey(0, 0)]?.floor?.pack_id).toBe("ice");
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
    expect(ctx.layers.object[cellKey(3, 4)]).toMatchObject({
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
    const before = JSON.stringify(ctx.layers.walls);
    expect(paintOps.paintWallAtCellEdge(ctx, { x: 1, y: 1, side: "W" }, stroke, 0)).toBe(false);
    expect(JSON.stringify(ctx.layers.walls)).toBe(before);

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
    expect(ctx.layers.walls["2,2:N"]?.variant).toBe(3);
  });
});

describe("paintWallAtCellEdge — door preservation and pack-aware wall skip", () => {
  it("preserves an existing door when a wall is painted over it", () => {
    const ctx = makeCtx();
    putWall(ctx.layers, 0, 0, "N", { pack_id: "pack-a", pack_version: 1, type: "doorClosed", variant: 2 });
    const stroke = paintOps.createStrokeState();

    expect(paintOps.paintWallAtCellEdge(ctx, { x: 0, y: 0, side: "N" }, stroke, 9)).toBe(false);
    expect(ctx.layers.walls["0,0:N"]).toMatchObject({
      pack_id: "pack-a", pack_version: 1, type: "doorClosed", variant: 2,
    });
  });

  it("skips repainting a wall segment already owned by the same pack", () => {
    const ctx = makeCtx();
    putWall(ctx.layers, 0, 0, "N", { pack_id: "pack-a", pack_version: 1, type: "wall", variant: 2 });
    const stroke = paintOps.createStrokeState();

    expect(paintOps.paintWallAtCellEdge(ctx, { x: 0, y: 0, side: "N" }, stroke, 9)).toBe(false);
    expect(ctx.layers.walls["0,0:N"]?.variant).toBe(2);
  });

  it("restyles a wall segment owned by a different pack", () => {
    const ctx = makeCtx("pack-a");
    putWall(ctx.layers, 0, 0, "N", { pack_id: "pack-b", pack_version: 1, type: "wall", variant: 2 });
    const stroke = paintOps.createStrokeState();

    expect(paintOps.paintWallAtCellEdge(ctx, { x: 0, y: 0, side: "N" }, stroke, 9)).toBe(true);
    expect(ctx.layers.walls["0,0:N"]).toMatchObject({
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
    expect(ctx.layers.walls["0,0:N"]?.variant).toBe(1);
  });

  it("preserves an existing door", () => {
    const ctx = makeCtx();
    putWall(ctx.layers, 0, 0, "N", { pack_id: "pack-a", pack_version: 1, type: "doorClosed", variant: 4 });
    expect(paintOps.setWallEdgeIfEmpty(ctx, { x: 0, y: 0, side: "N" }, 9)).toBe(false);
    expect(ctx.layers.walls["0,0:N"]?.type).toBe("doorClosed");
  });
});

describe("paintDoorAtEdge", () => {
  it("places a new closed door using the caller-supplied variant", () => {
    const ctx = makeCtx();
    const stroke = paintOps.createStrokeState();
    expect(paintOps.paintDoorAtEdge(ctx, { x: 0, y: 0, side: "N" }, stroke, 6)).toBe(true);
    expect(ctx.layers.walls["0,0:N"]).toMatchObject({
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
    expect(ctx.layers.walls["0,0:N"]).toMatchObject({
      pack_id: "pack-a", pack_version: 1, type: "doorOpen", variant: 6,
    });

    stroke = paintOps.createStrokeState();
    expect(paintOps.paintDoorAtEdge(ctx, { x: 0, y: 0, side: "N" }, stroke, 999)).toBe(true);
    expect(ctx.layers.walls["0,0:N"]).toMatchObject({
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
    putWall(ctx.layers, 0, 0, "N", { pack_id: "pack-a", pack_version: 1, type: "doorClosed", variant: 3 });
    expect(paintOps.removeDoorAtEdge(ctx, { x: 0, y: 0, side: "N" }, 8)).toBe(true);
    expect(ctx.layers.walls["0,0:N"]).toMatchObject({
      pack_id: "pack-a", pack_version: 1, type: "wall", variant: 8,
    });
  });

  it("is a no-op on a plain wall or an empty edge", () => {
    const wallCtx = makeCtx();
    putWall(wallCtx.layers, 0, 0, "N", { pack_id: "pack-a", pack_version: 1, type: "wall", variant: 1 });
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
    putWall(ctx.layers, 2, 2, "W", wall);
    putWall(ctx.layers, 5, 5, "N", wall);
    expect(paintOps.eraseWallAtCellEdge(ctx, { x: 2, y: 2, side: "N" }, stroke())).toBe(false);
    expect(paintOps.eraseWallAtCellEdge(ctx, { x: 5, y: 5, side: "W" }, stroke())).toBe(false);
    expect(ctx.layers.walls["2,2:W"]).toMatchObject(wall);
    expect(ctx.layers.walls["5,5:N"]).toMatchObject(wall);
  });
});

describe("eraseWallAtCellEdge", () => {
  it("removes a wall segment", () => {
    const ctx = makeCtx();
    ctx.layers.floor[cellKey(0, 0)] = { floor: { pack_id: "pack-a", pack_version: 1, variant: 0 } };
    putWall(ctx.layers, 0, 0, "N", { pack_id: "pack-a", pack_version: 1, type: "wall", variant: 1 });
    const stroke = paintOps.createStrokeState();
    expect(paintOps.eraseWallAtCellEdge(ctx, { x: 0, y: 0, side: "N" }, stroke)).toBe(true);
    expect(ctx.layers.walls["0,0:N"]).toBeUndefined();
    // Cell still has a floor, so it isn't dropped.
    expect(ctx.layers.floor[cellKey(0, 0)]).toBeDefined();
  });

  it("leaves the floor under an erased wall alone, and the wall gone from the layer", () => {
    const ctx = makeCtx();
    ctx.layers.floor[cellKey(0, 0)] = { floor: { pack_id: "pack-a", pack_version: 1, variant: 0 } };
    putWall(ctx.layers, 0, 0, "N", { pack_id: "pack-a", pack_version: 1, type: "wall", variant: 1 });
    expect(paintOps.eraseWallAtCellEdge(ctx, { x: 0, y: 0, side: "N" }, paintOps.createStrokeState())).toBe(true);
    expect(Object.keys(ctx.layers.walls)).toEqual([]);
    expect(ctx.layers.floor[cellKey(0, 0)]?.floor).toBeDefined();
  });

  it("respects the same direction lock as paintWallAtCellEdge", () => {
    const ctx = makeCtx();
    ctx.layers.floor[cellKey(0, 0)] = { floor: { pack_id: "pack-a", pack_version: 1, variant: 0 } };
    putWall(ctx.layers, 0, 0, "N", { pack_id: "pack-a", pack_version: 1, type: "wall", variant: 1 });
    ctx.layers.floor[cellKey(1, 1)] = { floor: { pack_id: "pack-a", pack_version: 1, variant: 0 } };
    putWall(ctx.layers, 1, 1, "W", { pack_id: "pack-a", pack_version: 1, type: "wall", variant: 1 });
    const stroke = paintOps.createStrokeState();
    stroke.active = true;

    expect(paintOps.eraseWallAtCellEdge(ctx, { x: 0, y: 0, side: "N" }, stroke)).toBe(true);
    expect(stroke.direction).toBe("H");
    // Perpendicular edge — ignored under the direction lock, wall untouched.
    expect(paintOps.eraseWallAtCellEdge(ctx, { x: 1, y: 1, side: "W" }, stroke)).toBe(false);
    expect(ctx.layers.walls["1,1:W"]).toBeDefined();
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
    expect(ctx.layers.walls["5,5:N"]).toBeDefined();
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
    expect(ctx.layers.walls["2,3:N"]?.type).toBe("grate");
    paintOps.paintWallAtCellEdge(ctx, { x: 2, y: 3, side: "W" }, paintOps.createStrokeState(), 1, "sluice");
    expect(ctx.layers.walls["2,3:W"]?.type).toBe("sluice");
  });

  it("a grate replaces a plain wall, dropping its decal, and never a door", () => {
    const ctx = makeCtx();
    paintOps.paintWallAtCellEdge(ctx, edge, paintOps.createStrokeState(), 1);
    paintOps.setDecalAtEdge(ctx, edge, 0);
    expect(paintOps.paintWallAtCellEdge(ctx, edge, paintOps.createStrokeState(), 2, "grate")).toBe(true);
    expect(ctx.layers.walls["2,3:N"]).toMatchObject({
      pack_id: "pack-a", pack_version: 1, type: "grate", variant: 2,
    });

    const doors = makeCtx();
    paintOps.paintDoorAtEdge(doors, edge, paintOps.createStrokeState(), 0);
    expect(paintOps.paintWallAtCellEdge(doors, edge, paintOps.createStrokeState(), 2, "grate")).toBe(false);
    expect(doors.layers.walls["2,3:N"]?.type).toBe("doorClosed");
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
    expect(ctx.layers.walls["2,3:N"]?.decal).toBe(1);
    expect(paintOps.setDecalAtEdge(ctx, edge, 1)).toBe(false);
    expect(paintOps.setDecalAtEdge(ctx, edge, undefined)).toBe(true);
    expect("decal" in (ctx.layers.walls["2,3:N"] ?? {})).toBe(false);
  });

  it("refuses a decal on a grate, a sluice or a door, and finds the owner from the S side", () => {
    const ctx = makeCtx();
    paintOps.paintWallAtCellEdge(ctx, edge, paintOps.createStrokeState(), 0, "sluice");
    expect(paintOps.setDecalAtEdge(ctx, edge, 0)).toBe(false);

    const walls = makeCtx();
    paintOps.paintWallAtCellEdge(walls, edge, paintOps.createStrokeState(), 0);
    expect(paintOps.setDecalAtEdge(walls, { x: 2, y: 2, side: "S" }, 0)).toBe(true);
    expect(walls.layers.walls["2,3:N"]?.decal).toBe(0);
  });
});

// #1125 decision 5: a wall is a segment, so the grid tools store its end points too.
describe("a lattice wall carries its end points", () => {
  it("runs a north edge along the cell's top and a west edge down its left (NW ownership)", () => {
    const ctx = makeCtx();
    paintOps.setWallEdgeIfEmpty(ctx, { x: 2, y: 3, side: "N" }, 0);
    paintOps.setWallEdgeIfEmpty(ctx, { x: 2, y: 3, side: "W" }, 0);
    expect(ctx.layers.walls["2,3:N"]).toMatchObject({ a: [2, 3], b: [3, 3] });
    expect(ctx.layers.walls["2,3:W"]).toMatchObject({ a: [2, 3], b: [2, 4] });
  });

  it("files a south edge under the cell below, so both neighbours see the one wall", () => {
    const ctx = makeCtx();
    paintOps.setWallEdgeIfEmpty(ctx, { x: 2, y: 3, side: "S" }, 0);
    expect(Object.keys(ctx.layers.walls)).toEqual(["2,4:N"]);
  });
});

describe("eraseCell takes the walls on the cell's own north and west edges with it", () => {
  it("removes N and W of the erased cell, and not the south or east edge another cell owns", () => {
    const ctx = makeCtx();
    const seg = { pack_id: "pack-a", pack_version: 1, type: "wall" as const, variant: 0 };
    ctx.layers.floor[cellKey(1, 1)] = { floor: { pack_id: "pack-a", pack_version: 1, variant: 0 } };
    putWall(ctx.layers, 1, 1, "N", seg);
    putWall(ctx.layers, 1, 1, "W", seg);
    putWall(ctx.layers, 1, 2, "N", seg); // the erased cell's south edge, owned by the cell below
    putWall(ctx.layers, 2, 1, "W", seg); // its east edge, owned by the cell to the east
    expect(paintOps.eraseCell(ctx, 1, 1)).toBe(true);
    expect(Object.keys(ctx.layers.walls).sort()).toEqual(["1,2:N", "2,1:W"]);
  });

  it("removes the walls of a cell that has no floor of its own", () => {
    const ctx = makeCtx();
    putWall(ctx.layers, 4, 4, "N", { pack_id: "pack-a", pack_version: 1, type: "wall", variant: 0 });
    expect(paintOps.eraseCell(ctx, 4, 4)).toBe(true);
    expect(ctx.layers.walls).toEqual({});
  });
});

describe("angled walls", () => {
  const angled = (type: "wall" | "doorClosed" | "doorOpen" = "wall") => ({
    pack_id: "pack-a", pack_version: 1, type, variant: 0, a: [0.5, 0] as [number, number], b: [2, 1.5] as [number, number],
  });

  it("toggles an angled wall into a door with the given variant, and back to a wall", () => {
    const ctx = makeCtx();
    ctx.layers.walls.w1 = angled();
    expect(paintOps.toggleAngledDoor(ctx, "w1", 5)).toBe(true);
    expect(ctx.layers.walls.w1).toMatchObject({ type: "doorClosed", variant: 5, a: [0.5, 0], b: [2, 1.5] });
    expect(paintOps.toggleAngledDoor(ctx, "w1", 9)).toBe(true);
    expect(ctx.layers.walls.w1).toMatchObject({ type: "wall", a: [0.5, 0], b: [2, 1.5] });
  });

  it("treats an open angled door as a door to turn back into a wall", () => {
    const ctx = makeCtx();
    ctx.layers.walls.w1 = angled("doorOpen");
    paintOps.toggleAngledDoor(ctx, "w1", 5);
    expect(ctx.layers.walls.w1.type).toBe("wall");
  });

  it("refuses to toggle a missing id or a wall on a grid line, which the grid door tool owns", () => {
    const ctx = makeCtx();
    putWall(ctx.layers, 0, 0, "N", { pack_id: "pack-a", pack_version: 1, type: "wall", variant: 0 });
    expect(paintOps.toggleAngledDoor(ctx, "nope", 5)).toBe(false);
    expect(paintOps.toggleAngledDoor(ctx, "0,0:N", 5)).toBe(false);
    expect(ctx.layers.walls["0,0:N"].type).toBe("wall");
  });

  it("removes a wall by id and reports a missing one as no change", () => {
    const ctx = makeCtx();
    ctx.layers.walls.w1 = angled();
    expect(paintOps.removeWallById(ctx, "w1")).toBe(true);
    expect(ctx.layers.walls).toEqual({});
    expect(paintOps.removeWallById(ctx, "w1")).toBe(false);
  });
});

describe("fillRegion", () => {
  const wall = { pack_id: "a", pack_version: 1, type: "wall", variant: 0 } as const;

  it("stops at a lattice wall instead of flooding to the other side", () => {
    const ctx = makeCtx();
    // A wall down the line between column 1 and 2 over rows -3..3, boxing the left part in with the cap as the only other limit.
    for (let y = -3; y <= 3; y++) putWall(ctx.layers, 2, y, "W", wall);
    for (let y = -3; y <= 3; y++) putWall(ctx.layers, -3, y, "W", wall);
    for (let x = -3; x < 2; x++) { putWall(ctx.layers, x, -3, "N", wall); putWall(ctx.layers, x, 4, "N", wall); }
    const region = paintOps.fillRegion(ctx.layers, 0, 0, 2000);
    expect(region.has(cellKey(1, 0))).toBe(true);
    expect(region.has(cellKey(2, 0))).toBe(false);
    expect(region.size).toBe(5 * 7);
  });

  it("stops at an angled wall", () => {
    const ctx = makeCtx();
    ctx.layers.walls["angled-1"] = { pack_id: "a", pack_version: 1, type: "wall", variant: 0, a: [0.2, -50], b: [0.2, 50] };
    const region = paintOps.fillRegion(ctx.layers, 0, 0, 300);
    expect(region.has(cellKey(-1, 0))).toBe(false);
    expect(region.has(cellKey(1, 0))).toBe(true);
  });

  // A ring of four smooth nodes is drawn as a round curve that bulges well past the diamond its chords make. Fill
  // used the chords, so a step from outside into the bulge crossed no wall and the fill leaked into the ring.
  it("does not leak into the bulge of a smooth ring: the wall is the curve, not its chords", () => {
    const ctx = makeCtx();
    const ref = { pack_id: "a", pack_version: 1, variant: 0 };
    const nodes: [number, number][] = [[10, 6], [14, 10], [10, 14], [6, 10]];
    nodes.forEach((a, i) => {
      ctx.layers.walls[`ring-${i}`] = { ...ref, type: "wall", a, b: nodes[(i + 1) % 4], smoothA: true, smoothB: true };
    });
    const region = paintOps.fillRegion(ctx.layers, 10, 2, 300);
    expect(region.has(cellKey(10, 2))).toBe(true);
    // (12,7) lies outside the diamond (|dx|+|dy| = 5 > 4) but inside the curve (3.5 from the centre, radius about 4)
    expect(region.has(cellKey(12, 7))).toBe(false);
    expect(region.has(cellKey(10, 10))).toBe(false);
  });

  it("an unwalled plain-floor edge is not a barrier, so the fill goes on past it", () => {
    const ctx = makeCtx();
    const ref = { pack_id: "a", pack_version: 1, variant: 0 };
    for (let x = 0; x < 5; x++) for (let y = 0; y < 3; y++) ctx.layers.floor[cellKey(x, y)] = { floor: ref };
    expect(paintOps.fillRegion(ctx.layers, 0, 1, 40).has(cellKey(-1, 1))).toBe(true);
  });
});
