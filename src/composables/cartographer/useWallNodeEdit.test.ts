import { describe, expect, it } from "vitest";
import { ref } from "vue";
import type { DungeonMapLayers } from "@/types/dungeonMap.types";
import { buildGraph } from "@/cartographer/wallEdit/graph";
import { detectRooms } from "@/cartographer/wallEdit/rooms";
import { angled, counter, lattice, rect } from "@/cartographer/wallEdit/fixtures.test-helpers";
import { cachedWallGeometry, smoothNodeIds } from "@/cartographer/wallGeometry";
import { projectOnSegment } from "@/cartographer/wallEdit/geometry";
import { applyWallCommit, useWallNodeEdit, type WallNodeCommit } from "./useWallNodeEdit";

const PACK = { packId: "p", packVersion: 1, variant: 0 };
const NO = { shift: false, alt: false };
const SHIFT = { shift: true, alt: false };

function setup(walls = rect(0, 0, 4, 4), floor: DungeonMapLayers["floor"] = {}) {
  const layers = ref({ floor, solidBlock: {}, terrain: {}, object: {}, annotation: {}, dressing: {}, walls, lights: {} } as DungeonMapLayers);
  const commits: WallNodeCommit[] = [];
  const edit = useWallNodeEdit({
    layers: () => layers.value,
    commit: (c) => {
      commits.push(c);
      layers.value = applyWallCommit(layers.value, c);
    },
    pack: () => PACK,
    hitTolerance: () => 0.2,
    newKey: counter(),
  });
  const drag = (from: [number, number], to: [number, number], mods = NO) => {
    edit.pointerDown(from, mods);
    edit.pointerMove(to, mods);
    edit.pointerUp();
  };
  return { layers, commits, edit, drag };
}

const endpoints = (l: DungeonMapLayers) => Object.values(l.walls).flatMap((w) => [w.a.join(","), w.b.join(",")]);

describe("selecting a wall run", () => {
  it("counts the bones, nodes and doors of the whole joined run for the slip (frame 17: 4 bones, 4 nodes, 1 door)", () => {
    const walls = rect(0, 0, 4, 4);
    walls["1,0:N"] = { ...walls["1,0:N"], type: "doorClosed" };
    const { edit } = setup(walls);
    expect(edit.select([2, 0.05])).toBe(true);
    expect(edit.selection.value).toMatchObject({ bones: 4, nodeCount: 4, doors: 1 });
  });

  it("a click on empty floor clears the selection", () => {
    const { edit } = setup();
    edit.select([2, 0]);
    expect(edit.select([2, 2])).toBe(false);
    expect(edit.selection.value.bones).toBe(0);
  });
});

describe("dragging a node", () => {
  it("moves every wall meeting at a dragged corner (frame 17: every wall meeting there follows)", () => {
    const { edit, drag, layers } = setup();
    edit.select([2, 0]);
    drag([4, 4], [6, 5]);
    const pts = endpoints(layers.value);
    expect(pts.filter((p) => p === "6,5")).toHaveLength(2);
    expect(pts).not.toContain("4,4");
  });

  it("shows the preview during the drag but stores nothing until release", () => {
    const { edit, layers, commits } = setup();
    edit.select([2, 0]);
    edit.pointerDown([4, 4], NO);
    edit.pointerMove([6, 5], NO);
    expect(edit.preview.value).not.toBeNull();
    expect(Object.values(edit.shownWalls.value).some((w) => w.b.join(",") === "6,5")).toBe(true);
    expect(endpoints(layers.value)).toContain("4,4");
    expect(commits).toHaveLength(0);
    edit.pointerUp();
    expect(commits).toHaveLength(1);
  });

  it("Esc restores the walls: nothing is committed and the preview is gone", () => {
    const { edit, layers, commits } = setup();
    const before = layers.value.walls;
    edit.select([2, 0]);
    edit.pointerDown([4, 4], NO);
    edit.pointerMove([6, 5], NO);
    expect(edit.cancel()).toBe(true);
    edit.pointerUp();
    expect(edit.preview.value).toBeNull();
    expect(commits).toHaveLength(0);
    expect(layers.value.walls).toBe(before);
    expect(edit.selection.value.bones).toBe(4);
  });

  it("Shift holds a dragged node to 45 degrees (frame 17 keys: Shift slide or 45)", () => {
    const { edit, drag, layers } = setup();
    edit.select([2, 0]);
    drag([4, 4], [7.1, 5.0], SHIFT); // nearer the horizontal than the diagonal
    expect(endpoints(layers.value).filter((p) => p.endsWith(",4"))).toContain("7.1,4");
  });

  it("a refused (collapsing) drag keeps the last good shape and never commits a broken graph", () => {
    const walls = rect(0, 0, 4, 4);
    lattice(walls, 2, 0, 2, 4);
    const { edit, layers, commits } = setup(walls);
    edit.select([1, 0]);
    edit.pointerDown([2, 4], NO);
    edit.pointerMove([2, 3], NO); // a good position first
    edit.pointerMove([2, 0], NO); // onto the other end of its own bone: refused
    expect(edit.refusal.value).toBe("collapsed");
    expect(Object.values(edit.shownWalls.value).some((w) => w.b.join(",") === "2,3")).toBe(true);
    edit.pointerUp();
    expect(commits).toHaveLength(1);
    expect(Object.values(layers.value.walls).some((w) => w.a.join(",") === w.b.join(","))).toBe(false);
    expect(endpoints(layers.value)).toContain("2,3");
  });

  it("a drag that is refused from the first move commits nothing", () => {
    const walls = rect(0, 0, 4, 4);
    lattice(walls, 2, 0, 2, 4);
    const { edit, layers, commits } = setup(walls);
    const before = layers.value.walls;
    edit.select([1, 0]);
    edit.pointerDown([2, 4], NO);
    edit.pointerMove([2, 0], NO);
    edit.pointerUp();
    expect(commits).toHaveLength(0);
    expect(layers.value.walls).toBe(before);
  });

  it("a node dropped onto another wall joins it, and the loop it closes gains floor in the active pack", () => {
    // A box open at the right: a dangling arm ends near the top wall of a second, closed box.
    const w = rect(0, 0, 4, 4);
    delete w["3,0:N"]; // gap in the top: not a room
    lattice(w, 3, 0, 3, 2); // a stub down from the gap's right end
    const { edit, drag, layers } = setup(w);
    expect(detectRooms(buildGraph(layers.value.walls))).toHaveLength(0);
    edit.select([1, 0]);
    // Pull the stub's bottom end across to the left wall at (0,2): the loop closes.
    drag([3, 2], [0.05, 2.05]);
    const rooms = detectRooms(buildGraph(layers.value.walls));
    expect(rooms.length).toBeGreaterThan(0);
    const filled = Object.entries(layers.value.floor).filter(([, c]) => c.floor);
    expect(filled.length).toBeGreaterThan(0);
    for (const [, c] of filled) expect(c.floor).toEqual({ pack_id: "p", pack_version: 1, variant: 0 });
  });

  it("shrinking a room removes the floor from squares left outside", () => {
    const floor: DungeonMapLayers["floor"] = {};
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) floor[`${x},${y}`] = { floor: { pack_id: "p", pack_version: 1, variant: 0 } };
    floor["9,9"] = { floor: { pack_id: "p", pack_version: 1, variant: 0 } }; // outside any room: never touched
    const { edit, drag, layers } = setup(rect(0, 0, 4, 4), floor);
    edit.select([2, 0]);
    drag([4, 4], [2, 2]);
    expect(layers.value.floor["3,3"]).toBeUndefined();
    expect(layers.value.floor["0,0"]).toBeDefined();
    expect(layers.value.floor["9,9"]).toBeDefined();
  });

  it("existing floor of another pack stays where the room grows over it", () => {
    const floor: DungeonMapLayers["floor"] = { "4,0": { floor: { pack_id: "other", pack_version: 3, variant: 2 } } };
    const { edit, drag, layers } = setup(rect(0, 0, 4, 4), floor);
    edit.select([2, 0]);
    drag([4, 0], [5, 0]);
    expect(layers.value.floor["4,0"]?.floor?.pack_id).toBe("other");
  });
});

describe("bones", () => {
  it("dragging a bone's middle splits it there and bends it (frame 17)", () => {
    const { edit, drag, layers } = setup();
    edit.select([2, 0]);
    drag([2, 4], [2, 6]);
    const pts = endpoints(layers.value);
    expect(pts).toContain("2,6");
    expect(edit.selection.value.nodeCount).toBe(5);
  });

  it("a press on a bone without moving does not bend it", () => {
    const { edit, commits } = setup();
    edit.select([2, 0]);
    edit.pointerDown([2, 4], NO);
    edit.pointerUp();
    expect(commits).toHaveLength(0);
  });

  it("a tiny wobble on a bone's middle does not bend it, only a real drag does", () => {
    const { edit, commits } = setup();
    edit.select([2, 0]);
    edit.pointerDown([2, 4], NO);
    edit.pointerMove([2, 4.01], NO);
    edit.pointerUp();
    expect(commits).toHaveLength(0);
  });

  it("Alt lets a slid bone land off the grid, otherwise it steps by half cells", () => {
    const grid = setup();
    grid.edit.select([2, 0]);
    grid.drag([2, 4], [2.1, 4.3], SHIFT);
    expect(endpoints(grid.layers.value)).toContain("0,4.5");
    const free = setup();
    free.edit.select([2, 0]);
    free.drag([2, 4], [2.1, 4.3], { shift: true, alt: true });
    expect(endpoints(free.layers.value)).toContain("0,4.3");
  });

  it("Shift-drag slides a bone sideways with both ends and the walls that meet it", () => {
    const { edit, drag, layers } = setup();
    edit.select([2, 0]);
    drag([2, 4], [2.1, 6], SHIFT); // bottom bone: sideways means down
    const pts = endpoints(layers.value);
    expect(pts).toContain("0,6");
    expect(pts).toContain("4,6");
    expect(Object.values(layers.value.walls).some((w) => w.a[1] === 4 && w.b[1] === 4)).toBe(false);
  });
});

describe("double click and delete", () => {
  it("a double-clicked node survives a rebuild while the run is selected", () => {
    const { edit, layers } = setup();
    edit.select([2, 0]);
    expect(edit.doubleClick([2, 0.05])).toBe(true);
    expect(edit.selection.value.nodes.map((n) => n.id)).toContain("2,0");
    // Another gesture rebuilds the graph from the walls; the node must still be there.
    edit.pointerDown([4, 4], NO);
    edit.pointerUp();
    edit.pointerMove([3, 3], NO);
    expect(edit.selection.value.nodes.map((n) => n.id)).toContain("2,0");
    expect(layers.value.walls).toBeDefined();
  });

  it("Del on a middle node merges its two bones into one wall", () => {
    const { edit, layers } = setup();
    edit.select([2, 0]);
    edit.doubleClick([2, 0.05]);
    expect(edit.selection.value.bones).toBe(5);
    expect(edit.deleteSelection()).toBe(true);
    expect(edit.selection.value.bones).toBe(4);
    expect(edit.selection.value.nodes.map((n) => n.id)).not.toContain("2,0");
    expect(Object.keys(layers.value.walls).length).toBeGreaterThan(0);
  });

  it("Del on a bone removes that wall and the floor of the room it closed", () => {
    const floor: DungeonMapLayers["floor"] = {};
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) floor[`${x},${y}`] = { floor: { pack_id: "p", pack_version: 1, variant: 0 } };
    const { edit, layers } = setup(rect(0, 0, 4, 4), floor);
    edit.select([2, 0]); // focus: the top bone
    expect(edit.deleteSelection()).toBe(true);
    expect(Object.keys(layers.value.walls).filter((k) => k.endsWith(":N") && k.endsWith(",0:N"))).toHaveLength(0);
    expect(Object.keys(layers.value.floor)).toHaveLength(0);
  });

  it("Del on a dead-end node is refused and changes nothing", () => {
    const walls: ReturnType<typeof rect> = {};
    lattice(walls, 0, 0, 4, 0);
    const { edit, commits } = setup(walls);
    edit.select([2, 0]);
    edit.pointerDown([0, 0], NO);
    edit.pointerUp();
    expect(edit.deleteSelection()).toBe(false);
    expect(commits).toHaveLength(0);
  });
});

// p runs flat into q, which turns down; the corner at (4,0) is smooth, so q bows away from its chord (4,0)-(4,4).
function bowed() {
  const walls: ReturnType<typeof rect> = {};
  angled(walls, "p", [0, 0], [4, 0], { smoothB: true });
  angled(walls, "q", [4, 0], [4, 4], { smoothA: true });
  return walls;
}

/** The drawn point of q furthest from its chord, checked to be well off it so a chord-only picker cannot pass. */
function bulge(walls: ReturnType<typeof rect>): [number, number] {
  const path = cachedWallGeometry(walls).lines.get("q")!.path;
  const far = path.reduce((best, pt) => (projectOnSegment(pt, [4, 0], [4, 4]).dist > projectOnSegment(best, [4, 0], [4, 4]).dist ? pt : best));
  expect(projectOnSegment(far, [4, 0], [4, 4]).dist).toBeGreaterThan(0.25);
  return far;
}

describe("curved walls", () => {
  it("a click on the drawn curve picks its run, where the chord would have missed", () => {
    const walls = bowed();
    const { edit } = setup(walls);
    expect(edit.select(bulge(walls))).toBe(true);
    expect(edit.selection.value.bones).toBeGreaterThan(0);
  });

  it("double-clicking a node switches it between corner and smooth, one undo step each way", () => {
    const walls: ReturnType<typeof rect> = {};
    angled(walls, "p", [0, 0], [4, 0]);
    angled(walls, "q", [4, 0], [4, 4]);
    const { edit, commits, layers } = setup(walls);
    edit.select([2, 0]);
    expect(edit.doubleClick([4.05, 0.05])).toBe(true);
    expect(commits).toHaveLength(1);
    expect(smoothNodeIds(layers.value.walls).has("4,0")).toBe(true);
    expect(edit.doubleClick([4.05, 0.05])).toBe(true);
    expect(commits).toHaveLength(2);
    expect(smoothNodeIds(layers.value.walls).size).toBe(0);
    // The node stays on screen as a corner, so the next double-click can bring the curve back.
    expect(edit.selection.value.nodes.map((n) => n.id)).toContain("4,0");
  });

  it("double-clicking a node that cannot curve changes nothing and says why", () => {
    const walls = rect(0, 0, 4, 4);
    const { edit, commits } = setup(walls);
    edit.select([2, 0]);
    expect(edit.doubleClick([4, 0])).toBe(false);
    expect(commits).toHaveLength(0);
    expect(edit.refusal.value).toBe("not-smoothable");
  });

  it("double-clicking a smooth wall away from its nodes adds a smooth node on the drawn curve", () => {
    const walls = bowed();
    const { edit, layers } = setup(walls);
    const at = bulge(walls);
    edit.select(at);
    expect(edit.doubleClick(at)).toBe(true);
    const node = [...smoothNodeIds(layers.value.walls)].find((id) => id !== "4,0");
    expect(node).toBe(`${at[0]},${at[1]}`);
  });

  it("dragging a smooth node keeps it smooth, so the curve bends rather than breaking into a corner", () => {
    const walls = bowed();
    const { edit, drag, layers } = setup(walls);
    edit.select(bulge(walls));
    drag([4, 0], [4, 1]);
    expect(smoothNodeIds(layers.value.walls).has("4,1")).toBe(true);
  });
});
