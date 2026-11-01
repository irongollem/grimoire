import { describe, expect, it } from "vitest";

import { deriveStructure } from "@/cartographer/structure";
import { collectOcclusion } from "@/cartographer/mapOcclusion";
import { latticeWalls, angledWalls } from "@/cartographer/wallGraph";
import type { DungeonMap } from "@/types/dungeonMap.types";
import {
  buildShowcaseLayers,
  SHOWCASE_DOORS,
  SHOWCASE_RIVER,
  SHOWCASE_ROOMS,
} from "./dev-showcase-map";

const layers = buildShowcaseLayers();
const structure = deriveStructure({ layers, metadata: {} } as Pick<
  DungeonMap,
  "layers" | "metadata"
>);

describe("showcase map: what publish will read off the drawing", () => {
  it("derives exactly the eight named rooms, so no stray flood-fill pocket becomes a nameless 'Space 9'", () => {
    // A chamfer or an arch placed one cell off leaves a one-cell pocket; the count catches it.
    expect(structure.spaces.map((s) => s.name).sort()).toEqual(
      SHOWCASE_ROOMS.map((r) => r.name).sort(),
    );
  });

  it("joins the rooms by six ways, the arches as arches and the grate as no way at all", () => {
    const byEdge = new Map(structure.ways.map((w) => [w.edgeKey, w.kind]));
    expect(byEdge.size).toBe(6);
    expect(byEdge.get(SHOWCASE_DOORS.arch.courtyardToHall)).toBe("arch");
    expect(byEdge.get(SHOWCASE_DOORS.arch.vestibuleToChapel)).toBe("arch");
    expect(byEdge.get(SHOWCASE_DOORS.closed.hallToNave)).toBe("door");
    expect(byEdge.get(SHOWCASE_DOORS.closed.naveToVestibule)).toBe("door");
    expect(byEdge.get(SHOWCASE_DOORS.locked)).toBe("door");
    expect(byEdge.get(SHOWCASE_DOORS.secret)).toBe("door");
    expect(byEdge.has(SHOWCASE_DOORS.grate)).toBe(false);
  });

  it("puts floor under the chapel's doorway cell, or the arch would lead nowhere", () => {
    expect(layers.floor["28,12"]?.floor).toBeDefined();
    expect(layers.floor["32,12"]?.floor).toBeDefined();
  });

  it("keeps the river inside the nave's floor", () => {
    for (const k of SHOWCASE_RIVER) {
      expect(
        layers.floor[k as keyof typeof layers.floor]?.floor,
        k,
      ).toBeDefined();
      expect(layers.terrain[k as keyof typeof layers.terrain]?.pack_id).toBe(
        "water",
      );
    }
  });
});

describe("showcase map: the round chapel", () => {
  it("is a smooth wall run of few nodes the Select tool can pick, not a ring of straight pieces", () => {
    const chapel = Object.entries(layers.walls).filter(([k]) => k.startsWith("5a0c0004"));
    expect(chapel.length).toBeGreaterThan(0);
    expect(chapel.length).toBeLessThan(40);
    expect(chapel.every(([, w]) => w.smoothA === true && w.smoothB === true)).toBe(true);
  });

  it("holds no brushed coverage: the layers carry no area at all", () => {
    expect("area" in layers).toBe(false);
  });
});

describe("showcase map: every feature the Map Table plays is present", () => {
  const walls = Object.values(layers.walls);

  it("has lattice walls, an angled run, closed/open doors, a grate and a hidden wall", () => {
    expect(latticeWalls(layers).length).toBeGreaterThan(40);
    // The nave's chamfer is three straight pieces; the round chapel's wall comes on top of them.
    expect(angledWalls(layers).length).toBeGreaterThan(3);
    expect(walls.some((w) => w.type === "doorClosed")).toBe(true);
    expect(walls.some((w) => w.type === "doorOpen")).toBe(true);
    expect(walls.some((w) => w.type === "grate")).toBe(true);
    expect(walls.filter((w) => w.visible === false)).toHaveLength(2);
  });

  it("lights the map with a torch decal, a brazier, a campfire and a placed light", () => {
    expect(walls.some((w) => w.type === "wall" && w.decal === 0)).toBe(true);
    expect(
      Object.values(layers.object).some((o) => o.category === "objectBrazier"),
    ).toBe(true);
    expect(
      Object.values(layers.dressing).some(
        (d) => d.prop_id === "dressing_campfire",
      ),
    ).toBe(true);
    expect(Object.keys(layers.lights)).toHaveLength(1);
  });

  it("stamps chests, barrels and rubble, and plants swaying trees", () => {
    const categories = new Set(
      Object.values(layers.object).map((o) => o.category),
    );
    for (const c of [
      "objectChest",
      "objectBarrel",
      "rubble",
      "objectPillar",
    ] as const)
      expect(categories.has(c)).toBe(true);
    expect(
      Object.values(layers.dressing).some(
        (d) => d.prop_id === "dressing_forest_oak",
      ),
    ).toBe(true);
  });

  it("leaves no floor outside the chamfered corner, where the angled run closes the nave", () => {
    for (const k of ["21,8", "22,8", "23,8", "22,9", "23,9", "23,10"])
      expect(layers.floor[k as keyof typeof layers.floor], k).toBeUndefined();
  });

  it("bounds the nave by the chamfer itself, so the floor clipped to it has no staircase to poke past", () => {
    const nave = structure.spaces.find((sp) => sp.name === "Flooded Nave");
    expect(nave?.outline).toEqual([[13, 8], [21, 8], [24, 11], [24, 18], [13, 18]]);
  });

  it("is deterministic, so a re-run replaces the map with the same map", () => {
    expect(buildShowcaseLayers()).toEqual(layers);
  });

  it("blocks sight along the invisible stub even though it is not drawn", () => {
    const occlusion = collectOcclusion(layers, 0, 0);
    expect(occlusion.walls.some((w) => w.id === "8,10:W")).toBe(true);
  });
});
