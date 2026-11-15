import { describe, it, expect, vi } from "vitest";
import { ref } from "vue";
import { useFreehandWallTool } from "./useFreehandWallTool";
import { emptyLayers, type DungeonMapLayers, type WallEdge } from "@/types/dungeonMap.types";
import type { WallKind } from "@/cartographer/wallKinds";
import type { CellPoint } from "@/cartographer/wallPick";
import { outlineToWalls, runToWalls } from "@/cartographer/brushWalls";

// Spies that keep the real fit: which of the two a stroke is handed to is the only difference a ring too small to be
// smooth shows (its nodes are all corners either way).
vi.mock("@/cartographer/brushWalls", async (importActual) => {
  const actual = await importActual<typeof import("@/cartographer/brushWalls")>();
  return { ...actual, outlineToWalls: vi.fn(actual.outlineToWalls), runToWalls: vi.fn(actual.runToWalls) };
});

function setup(kind: WallKind = "wall", visible = true) {
  const layers = ref<DungeonMapLayers>(emptyLayers());
  const wallKind = ref<WallKind>(kind);
  const wallVisible = ref(visible);
  const selectedId = ref<string | null>(null);
  const pushCommand = vi.fn();
  const tool = useFreehandWallTool({
    layers, wallKind, selectedId,
    pack: () => ({ packId: "p", packVersion: 1 }),
    visible: () => wallVisible.value,
    snapshotStr: () => JSON.stringify(layers.value),
    pushCommand,
    markDirty: vi.fn(),
  });
  return { layers, tool, pushCommand, wallVisible, wallKind, selectedId };
}

/** Drags through `points`, releasing on the last one. */
function drag(tool: ReturnType<typeof setup>["tool"], points: CellPoint[], alt = false): boolean {
  tool.start(points[0]);
  for (const p of points.slice(1, -1)) tool.move(p);
  return tool.release(points[points.length - 1], alt);
}

const wallsOf = (layers: DungeonMapLayers): WallEdge[] => Object.values(layers.walls);
const arc = (steps: number, radius: number, from: number, to: number, cx = 5, cy = 5): CellPoint[] =>
  Array.from({ length: steps + 1 }, (_, i) => {
    const t = from + ((to - from) * i) / steps;
    return [cx + radius * Math.cos(t), cy + radius * Math.sin(t)] as CellPoint;
  });
const existingWall = (layers: DungeonMapLayers, a: CellPoint, b: CellPoint, key = "old"): void => {
  layers.walls[key] = { pack_id: "p", pack_version: 1, variant: 0, type: "wall", a, b };
};
/** A straight drag along y = 0 from x0 to x1 in 0.5 steps. */
const line = (x0: number, x1: number, y = 0): CellPoint[] => {
  const out: CellPoint[] = [];
  for (let x = x0; x < x1; x += 0.5) out.push([x, y]);
  out.push([x1, y]);
  return out;
};

describe("where the wall ends", () => {
  it("ends on the point of release even when that is nearer the last recorded point than the drag spacing", () => {
    // The last recorded point is (4, 0); the pointer is let go 0.03 cells on, under the 0.05 spacing. Alt: no welds.
    const { layers, tool } = setup();
    tool.start([0, 0]);
    tool.move([2, 0]);
    tool.move([4, 0]);
    expect(tool.release([4.03, 0], true)).toBe(true);
    const ends = wallsOf(layers.value).flatMap((w) => [w.a[0], w.b[0]]);
    expect(Math.max(...ends)).toBe(4.03);
  });
});

describe("fitting a dragged arc", () => {
  it("turns a 61-point semicircle into a short chain of walls with smooth inner nodes and corner ends", () => {
    // Semicircle radius 3 is 9.4 cells long; the fit keeps only the nodes a 0.08 tolerance needs, far below the 60
    // recorded points. Walls chain a->b->a because runToWalls emits them in order. Turn per inner node is well under
    // the 60 degree corner limit, so every inner node is smooth; the two ends are corners.
    const { layers, tool } = setup();
    expect(drag(tool, arc(60, 3, 0, Math.PI))).toBe(true);
    const walls = wallsOf(layers.value);
    expect(walls.length).toBeGreaterThanOrEqual(3);
    expect(walls.length).toBeLessThan(20);
    for (let i = 0; i < walls.length - 1; i++) {
      expect(walls[i].b).toEqual(walls[i + 1].a);
      expect(walls[i].smoothB).toBe(true);
      expect(walls[i + 1].smoothA).toBe(true);
    }
    expect(walls[0].smoothA).toBeUndefined();
    expect(walls[walls.length - 1].smoothB).toBeUndefined();
  });
});

describe("stray strokes", () => {
  it("writes nothing and records no undo step for a click or a drag under half a cell", () => {
    // 0.4 cells total: under MIN_STROKE_LENGTH both end to end and along the path.
    const { layers, tool, pushCommand } = setup();
    expect(drag(tool, [[3, 3], [3.2, 3], [3.4, 3]])).toBe(false);
    expect(drag(tool, [[3, 3], [3, 3]])).toBe(false);
    expect(wallsOf(layers.value)).toHaveLength(0);
    expect(pushCommand).not.toHaveBeenCalled();
  });

  it("writes a wall for a drag of 0.6 cells, just over the stray-click limit", () => {
    const { layers, tool } = setup();
    expect(drag(tool, [[3, 3], [3.3, 3], [3.6, 3]])).toBe(true);
    expect(wallsOf(layers.value)).toHaveLength(1);
  });
});

describe("welding", () => {
  it("moves the start onto a wall end within 0.25 cells and leaves one 0.3 away alone", () => {
    // Wall end at (0,0); a start at (0.2,0) is 0.2 away (welds), at (0.3,0) is 0.3 away (does not).
    const near = setup();
    existingWall(near.layers.value, [0, 0], [0, -3]);
    drag(near.tool, line(0.2, 6));
    expect(wallsOf(near.layers.value).find((w) => w !== near.layers.value.walls.old)?.a).toEqual([0, 0]);

    const far = setup();
    existingWall(far.layers.value, [0, 0], [0, -3]);
    drag(far.tool, line(0.3, 6));
    expect(wallsOf(far.layers.value).find((w) => w !== far.layers.value.walls.old)?.a).toEqual([0.3, 0]);
  });

  it("moves the end onto a wall end within 0.25 cells and leaves one 0.3 away alone", () => {
    // Wall end at (6,0). End (5.8,0.1) is hypot(0.2,0.1)=0.22 away; end (5.7,0) is 0.3 away.
    const near = setup();
    existingWall(near.layers.value, [6, 0], [6, 3]);
    drag(near.tool, [...line(0, 5.5), [5.8, 0.1]]);
    expect(wallsOf(near.layers.value).at(-1)?.b).toEqual([6, 0]);

    const far = setup();
    existingWall(far.layers.value, [6, 0], [6, 3]);
    drag(far.tool, [...line(0, 5.5), [5.7, 0]]);
    expect(wallsOf(far.layers.value).at(-1)?.b).toEqual([5.7, 0]);
  });

  it("Alt at release skips both welds", () => {
    // Same geometry as the welding cases above (start 0.2 from a wall end, end 0.22 from another), but free.
    const { layers, tool } = setup();
    existingWall(layers.value, [0, 0], [0, -3]);
    existingWall(layers.value, [6, 0], [6, 3], "old2");
    drag(tool, [...line(0.2, 5.5), [5.8, 0.1]], true);
    const made = wallsOf(layers.value).filter((w) => w !== layers.value.walls.old && w !== layers.value.walls.old2);
    expect(made[0].a).toEqual([0.2, 0]);
    expect(made.at(-1)?.b).toEqual([5.8, 0.1]);
  });
});

describe("closing a ring", () => {
  const circle = (): CellPoint[] => arc(40, 2, 0, Math.PI * 2, 0, 0);

  it("a stroke ending on its own start becomes a closed ring of smooth nodes", () => {
    // Circle radius 2 (12.6 cells long) ends exactly on its start. The fit of a closed outline keeps every node
    // smooth (turns are about 30 degrees, under the 60 degree corner limit) and the last wall returns to the first.
    const { layers, tool } = setup();
    expect(drag(tool, circle())).toBe(true);
    const walls = wallsOf(layers.value);
    expect(walls.length).toBeGreaterThanOrEqual(6);
    expect(walls[walls.length - 1].b).toEqual(walls[0].a);
    for (let i = 0; i < walls.length - 1; i++) expect(walls[i].b).toEqual(walls[i + 1].a);
    expect(walls.every((w) => w.smoothA === true && w.smoothB === true)).toBe(true);
  });

  it("a stroke under two cells long that ends near its start stays an open run", () => {
    // Circle radius 0.25 is 1.57 cells long: under MIN_RING_LENGTH, so its ends stay corners.
    const { layers, tool } = setup();
    drag(tool, arc(24, 0.25, 0, Math.PI * 2, 0, 0));
    const walls = wallsOf(layers.value);
    expect(walls.length).toBeGreaterThan(0);
    expect(walls[0].smoothA).toBeUndefined();
  });

  it("hands a stroke under two cells to the open fit and one of two cells or more to the closed fit", () => {
    // Circle radius 0.3 is 1.88 cells long (under 2); radius 0.32 is 2.01 (over). Both end exactly on their start.
    vi.mocked(outlineToWalls).mockClear();
    vi.mocked(runToWalls).mockClear();
    drag(setup().tool, arc(24, 0.3, 0, Math.PI * 2, 0, 0));
    expect(outlineToWalls).not.toHaveBeenCalled();
    expect(runToWalls).toHaveBeenCalledOnce();
    vi.mocked(runToWalls).mockClear();
    drag(setup().tool, arc(24, 0.32, 0, Math.PI * 2, 0, 0));
    expect(outlineToWalls).toHaveBeenCalledOnce();
    expect(runToWalls).not.toHaveBeenCalled();
  });

  it("a long stroke ending 0.3 cells from its start does not close", () => {
    // Start (2,0); stop 0.3 cells short of it. Beyond the 0.25 reach, so open: the first node stays a corner.
    const { layers, tool } = setup();
    const pts = circle().slice(0, -1);
    pts[pts.length - 1] = [1.8, -0.2 - 0.1]; // hypot(0.2, 0.3) ~ 0.36 from (2,0)
    drag(tool, pts);
    expect(wallsOf(layers.value)[0].smoothA).toBeUndefined();
  });

  it("Alt at release keeps a ring open", () => {
    const { layers, tool } = setup();
    drag(tool, circle(), true);
    expect(wallsOf(layers.value)[0].smoothA).toBeUndefined();
  });
});

describe("what the walls are", () => {
  it("hidden mode marks every wall hidden and visible mode marks none", () => {
    const hidden = setup("wall", false);
    drag(hidden.tool, arc(60, 3, 0, Math.PI));
    expect(wallsOf(hidden.layers.value).every((w) => w.visible === false)).toBe(true);
    const shown = setup("wall", true);
    drag(shown.tool, arc(60, 3, 0, Math.PI));
    expect(wallsOf(shown.layers.value).every((w) => w.visible === undefined)).toBe(true);
  });

  it("gives every wall the chosen kind, and a decal wall kind paints as a wall", () => {
    const grate = setup("grate");
    drag(grate.tool, arc(60, 3, 0, Math.PI));
    expect(wallsOf(grate.layers.value).every((w) => w.type === "grate")).toBe(true);
    const decal = setup("decal");
    drag(decal.tool, line(0, 6));
    expect(wallsOf(decal.layers.value).every((w) => w.type === "wall")).toBe(true);
  });

  it("records the pack and version on each wall", () => {
    const { layers, tool } = setup();
    drag(tool, line(0, 6));
    expect(wallsOf(layers.value)[0]).toMatchObject({ pack_id: "p", pack_version: 1 });
  });

  it("selects the last wall written, through the shared selection", () => {
    const { layers, tool, selectedId } = setup();
    drag(tool, arc(60, 3, 0, Math.PI));
    expect(selectedId.value).toBe(Object.keys(layers.value.walls).at(-1));
  });
});

describe("undo", () => {
  it("is one step for the whole stroke, from no walls to all of them", () => {
    const { tool, pushCommand } = setup();
    drag(tool, arc(60, 3, 0, Math.PI));
    expect(pushCommand).toHaveBeenCalledTimes(1);
    const [before, after] = pushCommand.mock.calls[0];
    expect(Object.keys(JSON.parse(before).walls)).toHaveLength(0);
    expect(Object.keys(JSON.parse(after).walls).length).toBeGreaterThan(2);
  });
});

describe("the stroke in progress", () => {
  it("abandoning mid-stroke writes nothing, even if a release follows", () => {
    const { layers, tool, pushCommand } = setup();
    tool.start([0, 0]);
    tool.move([3, 0]);
    tool.abandon();
    expect(tool.stroke.value).toEqual([]);
    expect(tool.release([6, 0], false)).toBe(false);
    expect(wallsOf(layers.value)).toHaveLength(0);
    expect(pushCommand).not.toHaveBeenCalled();
  });

  it("does not record a point closer than 0.05 cells to the last recorded one", () => {
    // 0.03 from (0,0) is dropped; 0.06 from (0,0) is kept; 0.08 is only 0.02 from (0.06,0), dropped again.
    const { tool } = setup();
    tool.start([0, 0]);
    tool.move([0.03, 0]);
    expect(tool.stroke.value).toHaveLength(1);
    tool.move([0.06, 0]);
    tool.move([0.08, 0]);
    expect(tool.stroke.value).toEqual([[0, 0], [0.06, 0]]);
  });

  it("ignores movement when no stroke was started", () => {
    const { tool } = setup();
    tool.move([2, 2]);
    expect(tool.stroke.value).toEqual([]);
  });
});
