import { describe, expect, it } from "vitest";
import type { UniversalVttMap } from "@/lib/mapImport/universalVtt";
import { darknessFromAmbient, lightFromUvtt, uvttToDrawing } from "./uvttImport";


const file: UniversalVttMap = {
  image: new Blob(),
  cols: 29, // the file may state a size that disagrees with its picture; the picture decides
  rows: 20,
  pixelsPerGrid: 100,
  walls: [{ a: [1, 1], b: [4.5, 1.25] }],
  doors: [
    { a: [4, 2], b: [5, 2], open: false },
    { a: [8, 2], b: [9, 2], open: true },
  ],
  lights: [{ x: 3, y: 3, rangeCells: 6, intensity: 2, color: "#ffaa00" }],
  ambient: "#ffffff",
};

describe("uvttToDrawing", () => {
  const drawing = uvttToDrawing(file, { width: 3000, height: 2000 });

  it("reads the grid from the file: 3000 px at 100 px a square is 30 across, nothing to line up", () => {
    expect(drawing.calibration.cells_per_image_width).toBe(30);
    expect(drawing.calibration.origin_x_pct).toBe(0);
  });

  it("keeps every wall as an angled wall that blocks sight but is not drawn over the picture", () => {
    const walls = Object.values(drawing.layers.walls).filter((w) => w.type === "wall");
    expect(walls).toHaveLength(1);
    expect(walls[0]).toMatchObject({ a: [1, 1], b: [4.5, 1.25], visible: false });
  });

  it("names no tile set on its walls, so a campaign with none published can still import (#1125)", () => {
    expect(Object.values(drawing.layers.walls).every((w) => w.pack_id === "")).toBe(true);
  });

  it("keeps doors in the state the file had them, undrawn", () => {
    const doors = Object.values(drawing.layers.walls).filter((w) => w.type !== "wall");
    expect(doors.map((d) => d.type).sort()).toEqual(["doorClosed", "doorOpen"]);
    expect(doors.every((d) => d.visible === false)).toBe(true);
  });

  it("writes the live snapshot with the same ids as the Drawing, so a door toggled in play names its Drawing door", () => {
    const wallIds = Object.keys(drawing.layers.walls).sort();
    const liveIds = [...drawing.mapLive.walls.map((w) => w.id), ...drawing.mapLive.doors.map((d) => d.id)].sort();
    expect(liveIds).toEqual(wallIds);
    expect(drawing.mapLive.version).toBe(3);
    expect(drawing.mapLive.doors.map((d) => d.open).sort()).toEqual([false, true]);
  });

  it("places the light in the Drawing and the snapshot", () => {
    expect(Object.values(drawing.layers.lights)).toHaveLength(1);
    expect(drawing.mapLive.lights[0]).toMatchObject({ x: 3, y: 3, color: "#ffaa00" });
  });
});

describe("lightFromUvtt", () => {
  it("spreads a 6 square reach over 5 ft squares: 15 ft bright and 15 ft dim, 30 ft in all", () => {
    const light = lightFromUvtt({ x: 0, y: 0, rangeCells: 6, intensity: 1, color: "#fff" });
    expect(light.bright + light.dim).toBe(30);
  });

  it("clamps an intensity above 1, which the app's glow cannot take", () => {
    expect(lightFromUvtt({ x: 0, y: 0, rangeCells: 2, intensity: 3, color: "#fff" }).intensity).toBe(1);
  });

  it("never exceeds the 60 ft a light may have", () => {
    const light = lightFromUvtt({ x: 0, y: 0, rangeCells: 80, intensity: 1, color: "#fff" });
    expect(light.bright).toBeLessThanOrEqual(60);
    expect(light.dim).toBeLessThanOrEqual(60);
  });
});

describe("darknessFromAmbient", () => {
  it("a bright ambient is daylight", () => expect(darknessFromAmbient("#ffffff")).toBe("daylight"));
  it("a dim ambient is dim light", () => expect(darknessFromAmbient("#202040")).toBe("dim"));
  it("a file that says nothing is daylight", () => expect(darknessFromAmbient(undefined)).toBe("daylight"));
});
