import { describe, it, expect } from "vitest";
import { reactive } from "vue";
import { buildStyledPlay, snapshotOverPainting, wallsOnlyLayers } from "@/cartographer/styledPlay";
import { buildMapLive } from "@/cartographer/mapLive";
import { cellRectInImageFractions } from "@/lib/locations/gridCalibration";
import { emptyLayers, type DungeonMap, type ObjectCell, type WallEdge } from "@/types/dungeonMap.types";
import type { GridCalibration } from "@/types/location.types";
import type { MapLive } from "@/types/mapLive.types";

const PACK = { pack_id: "p", pack_version: 1, variant: 0 };
const edge = (type: WallEdge["type"], a: [number, number], b: [number, number], extra: Partial<WallEdge> = {}): WallEdge => ({ ...PACK, type, a, b, ...extra });

function sourceMap(): Pick<DungeonMap, "layers" | "darkness" | "default_pack_id" | "campaign_id"> {
  const layers = emptyLayers();
  layers.floor["3,4"] = { floor: PACK };
  layers.object["3,4"] = { ...PACK, category: "walls" as ObjectCell["category"] };
  layers.walls["3,4:N"] = edge("wall", [3, 4], [4, 4]);
  layers.walls["3,4:W"] = edge("doorClosed", [3, 4], [3, 5]);
  layers.walls["4,4:W"] = edge("doorOpen", [4, 4], [4, 5], { visible: true });
  layers.walls["5,4:N"] = edge("window" as WallEdge["type"], [5, 4], [6, 4]);
  layers.lights["l1"] = { x: 4, y: 5, light: { color: "#fff", bright: 20, dim: 20 } };
  return { layers, darkness: "dark", default_pack_id: "p", campaign_id: "c1" };
}

describe("wallsOnlyLayers", () => {
  it("keeps every wall and door unseen under its own key, so door ids and edge keys still match the snapshot", () => {
    const { walls } = wallsOnlyLayers(sourceMap());
    expect(Object.keys(walls).sort()).toEqual(["3,4:N", "3,4:W", "4,4:W"]);
    // Bug: a wall left visible would be baked over the painting on the next publish.
    expect(Object.values(walls).every((w) => w.visible === false)).toBe(true);
    expect(walls["3,4:W"].type).toBe("doorClosed");
    expect(walls["4,4:W"].type).toBe("doorOpen");
  });

  it("drops the edges that block nothing, and everything the painting now draws", () => {
    const layers = wallsOnlyLayers(sourceMap());
    expect(layers.walls["5,4:N"]).toBeUndefined();
    expect(layers.floor).toEqual({});
    expect(layers.object).toEqual({});
  });

  it("keeps the placed lights, as copies", () => {
    const src = sourceMap();
    const layers = wallsOnlyLayers(src);
    expect(layers.lights.l1).toEqual(src.layers.lights.l1);
    expect(layers.lights.l1).not.toBe(src.layers.lights.l1);
  });

  it("copes with the editor's reactive map, which structuredClone refuses", () => {
    // Bug (8 Nov 2026): cloning the lights of a Vue proxy threw after the paid
    // render had come back, so the DM was charged and the render was lost.
    const layers = wallsOnlyLayers(reactive(sourceMap()));
    expect(layers.lights.l1).toEqual({ x: 4, y: 5, light: { color: "#fff", bright: 20, dim: 20 } });
  });
});

describe("snapshotOverPainting", () => {
  const live: MapLive = {
    version: 1 as MapLive["version"],
    darkness: "dim",
    groups: [{ kind: "water", cells: ["0,0"], overlays: [], clip: { outline: [], occluded: [] } }],
    lights: [{ x: 1, y: 1, color: "#fff", bright: 10, dim: 10, phase: 0 }],
    sprites: [{ url: "tree.png", x: 1, y: 1, w: 1, h: 1, rotation: 0, sway: { phase: 0 } as never }],
    walls: [{ id: "w", a: [0, 0], b: [1, 0] }],
    doors: [{ id: "d", a: [0, 0], b: [0, 1], open: true, leaf: { url: "leaf.png" } as never }],
    solid: ["2,2"],
  };

  it("takes out the props and door leaves that would redraw tile art, and nothing else", () => {
    const out = snapshotOverPainting(live);
    expect(out.sprites).toEqual([]);
    expect(out.doors).toEqual([{ id: "d", a: [0, 0], b: [0, 1], open: true, leaf: null }]);
    expect({ ...out, sprites: live.sprites, doors: live.doors }).toEqual(live);
  });
});

describe("buildStyledPlay", () => {
  // A painted picture padded by 2 cells, whose grid starts at 10% across and 20% down, for a map whose cells begin at (3,4).
  const calibration: GridCalibration = { cells_per_image_width: 10, origin_x_pct: 0.1, origin_y_pct: 0.2, origin_cell_x: 3, origin_cell_y: 4 };

  it("names the walls drawing for the site and carries the source's pack, darkness and campaign", () => {
    const play = buildStyledPlay("Keep", sourceMap(), new Map(), new Map(), calibration);
    expect(play.drawing).toMatchObject({ name: "Keep walls", darkness: "dark", default_pack_id: "p", campaign_id: "c1" });
    expect(play.mapLive.darkness).toBe("dark");
  });

  it("puts a wall on the same image-fraction rect as its map cell under the styled calibration", () => {
    const play = buildStyledPlay("Keep", sourceMap(), new Map(), new Map(), calibration);
    // The north wall of map cell (3,4) is in image cells starting at (0,0): the origin cell.
    const wall = play.mapLive.walls.find((w) => w.id === "0,0:N");
    expect(wall).toBeDefined();
    const imgW = 1000;
    const imgH = 500;
    const rect = cellRectInImageFractions("3,4", calibration, imgW, imgH);
    // The play surface puts image cell (cx,cy) at origin_pct + c * cellFraction; the wall's start corner must be the rect's top-left.
    const cellW = 1 / calibration.cells_per_image_width;
    const cellH = cellW * (imgW / imgH);
    expect(calibration.origin_x_pct + wall!.a[0] * cellW).toBeCloseTo(rect.x);
    expect(calibration.origin_y_pct + wall!.a[1] * cellH).toBeCloseTo(rect.y);
    expect(calibration.origin_x_pct + wall!.b[0] * cellW).toBeCloseTo(rect.x + rect.w);
  });

  it("builds the snapshot from the source map's own origin, not a zero one", () => {
    const src = sourceMap();
    const play = buildStyledPlay("Keep", src, new Map(), new Map(), calibration);
    expect(play.mapLive.walls).toEqual(buildMapLive(src, new Map(), new Map(), 3, 4).walls);
    expect(play.mapLive.walls.length).toBe(1);
    expect(play.mapLive.doors.map((d) => d.leaf)).toEqual([null, null]);
  });
});
