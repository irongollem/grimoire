import { describe, expect, it } from "vitest";
import { addMotion, hasStart, removeMotion, replaceMotion, setPathPoints, setStart, sharePath, spreadAlongPath, unsharePath } from "./motions.ts";
import { poseAt, layersOf, type Layer, type Motion, type Scene } from "./scene.ts";
import { describeMotion, motionFor } from "./presets.ts";

const PTS = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }];
const BENT = [{ x: 0, y: 0 }, { x: 50, y: 80 }, { x: 200, y: 0 }];
const apple = (id: string, motions?: Motion[]): Layer => ({
  kind: "layer", id, src: `${id}.png`, depth: 1, anchor: { x: 0.5, y: 0.5 }, at: { x: 500, y: 500 }, width: 100, ...(motions ? { motions } : {}),
});
const sceneOf = (...layers: Layer[]): Scene =>
  ({ id: "s", title: "S", size: { width: 1000, height: 1000 }, loop: 12, camera: { drift: 0, push: 0 }, seed: 1, grade: {}, stack: layers } as Scene);
const layerOf = (scene: Scene, id: string): Layer => {
  const l = layersOf(scene).find((x) => x.id === id);
  if (!l) throw new Error(id);
  return l;
};
const motionsOf = (scene: Scene, id: string): Motion[] => layerOf(scene, id).motions ?? [];
const path = (over: Partial<Extract<Motion, { kind: "path" }>> = {}): Motion => ({ kind: "path", points: PTS, period: 12, ...over });
const spin: Motion = { kind: "spin", period: 12 };

describe("spin in poseAt", () => {
  const poseOf = (m: Motion[], t: number) => {
    const scene = sceneOf(apple("a", m));
    return poseAt(scene, layerOf(scene, "a"), t);
  };

  // Bug: a period not rounded to whole turns per loop leaves the part at a different angle when the loop restarts.
  it("completes whole turns per loop, so the loop closes without a seam", () => {
    const odd: Motion = { kind: "spin", period: 5 }; // 12 / 5 = 2.4 turns: rounds to 2
    expect(poseOf([odd], 12).rotate).toBeCloseTo(poseOf([odd], 0).rotate + 2 * Math.PI * 2, 9);
    expect(Math.sin(poseOf([odd], 12).rotate)).toBeCloseTo(Math.sin(poseOf([odd], 0).rotate), 9);
  });

  // Bug: ignoring `reverse` turns every spin clockwise.
  it("turns anticlockwise when reversed", () => {
    expect(poseOf([spin], 3).rotate).toBeCloseTo(Math.PI / 2, 9);
    expect(poseOf([{ ...spin, reverse: true } as Motion], 3).rotate).toBeCloseTo(-Math.PI / 2, 9);
  });

  // Bug: dropping `phase` starts every spinning part at the same angle.
  it("starts a share of the way round", () => {
    expect(poseOf([{ kind: "spin", period: 12, phase: 0.25 }], 0).rotate).toBeCloseTo(Math.PI / 2, 9);
  });

  // Bug: a stacked motion overwriting the other instead of adding (position from the path, rotation from the spin).
  it("stacks with a path: position from the path, rotation from the spin", () => {
    const both = poseOf([path(), spin], 3);
    expect(both.rotate).toBeCloseTo(Math.PI / 2, 9);
    expect(Math.hypot(both.dx, both.dy)).toBeGreaterThan(1);
    expect(both.dx).toBeCloseTo(poseOf([path()], 3).dx, 9);
    expect(poseOf([path()], 3).rotate).toBe(0);
  });

  // Bug: the spin assigning rotation instead of adding, wiping what an earlier motion (a sway) already turned.
  it("adds to a rotation an earlier motion made", () => {
    const sway: Motion = { kind: "sway", angle: 10, period: 12 };
    expect(poseOf([sway, spin], 3).rotate).toBeCloseTo((10 * Math.PI) / 180 + Math.PI / 2, 9);
  });
});

describe("presets: Spinning and Along a path", () => {
  const layer = { width: 100 };
  // Bug: a saved spin or path reading back as "custom" in the studio.
  it("reads a saved spin and a saved path back as their preset, whatever the strength asked for", () => {
    for (const pace of ["slow", "steady", "quick"] as const) {
      expect(describeMotion(motionFor("Spinning", "lively", pace, layer, 12), layer, 12)).toEqual({ name: "Spinning", strength: "gentle", pace });
      expect(describeMotion(motionFor("Along a path", "faint", pace, layer, 12, PTS), layer, 12)).toEqual({ name: "Along a path", strength: "gentle", pace });
    }
  });

  // Bug: treating a shifted start or a reversed turn as hand-tuned made a spread-out apple read "custom".
  it("still reads as the preset with its own start, direction and group", () => {
    expect(describeMotion({ kind: "spin", period: 6, phase: 0.4, reverse: true }, layer, 12)).toMatchObject({ name: "Spinning", pace: "steady" });
    expect(describeMotion(path({ period: 6, phase: 0.4, group: "g" }), layer, 12)).toMatchObject({ name: "Along a path", pace: "steady" });
  });

  it("calls a spin of an odd rate custom", () => {
    expect(describeMotion({ kind: "spin", period: 12 / 3 }, layer, 12)).toEqual({ custom: true });
  });

  // Bug: the points dropped on the way in, so the stage's path was lost the moment a preset was chosen.
  it("carries the points it is given, and none when it has none (safe: the part stands still)", () => {
    expect(motionFor("Along a path", "gentle", "steady", layer, 12, PTS)).toMatchObject({ kind: "path", points: PTS, period: 6 });
    const none = motionFor("Along a path", "gentle", "slow", layer, 12);
    const scene = sceneOf(apple("a", [none]));
    expect(poseAt(scene, layerOf(scene, "a"), 4)).toMatchObject({ dx: 0, dy: 0 });
  });
});

describe("motion list edits", () => {
  const three = (): Scene => sceneOf(apple("a", [{ kind: "bob", dy: 5, period: 4 }, spin, path()]));

  // Bug: removing by the wrong index (or all of them) drops the wrong motion.
  it("removes only the one at the index", () => {
    expect(motionsOf(removeMotion(three(), "a", 1), "a").map((m) => m.kind)).toEqual(["bob", "path"]);
  });
  it("leaves no empty list behind when the last motion goes", () => {
    expect(layerOf(removeMotion(sceneOf(apple("a", [spin])), "a", 0), "a")).not.toHaveProperty("motions");
  });
  it("refuses an index that is not there instead of silently doing nothing", () => {
    expect(() => removeMotion(three(), "a", 3)).toThrow();
    expect(() => replaceMotion(three(), "a", -1, spin)).toThrow();
  });
  it("replaces only the one at the index", () => {
    const next = replaceMotion(three(), "a", 0, { kind: "bob", dy: 9, period: 4 });
    expect(motionsOf(next, "a").map((m) => m.kind)).toEqual(["bob", "spin", "path"]);
    expect(motionsOf(next, "a")[0]).toMatchObject({ dy: 9 });
  });
  it("adds after the others, and to a part with none", () => {
    expect(motionsOf(addMotion(three(), "a", spin), "a")).toHaveLength(4);
    expect(motionsOf(addMotion(sceneOf(apple("a")), "a", spin), "a")).toEqual([spin]);
  });
  it("does not change the scene it was given", () => {
    const before = three();
    removeMotion(before, "a", 0);
    expect(motionsOf(before, "a")).toHaveLength(3);
  });
  // Bug: a start on a flame would be written where the engine never reads it, and shown as a control that does nothing.
  it("sets a start on a motion that has one, wrapping a whole turn, and refuses one that has none", () => {
    expect(motionsOf(setStart(three(), "a", 1, 1.25), "a")[1]).toMatchObject({ kind: "spin", phase: 0.25 });
    expect(hasStart({ kind: "flicker", amount: 0.1, speed: 2 })).toBe(false);
    expect(hasStart({ kind: "billow", amount: 5, period: 4 })).toBe(false);
    expect(() => setStart(sceneOf(apple("f", [{ kind: "flicker", amount: 0.1, speed: 2 }])), "f", 0, 0.5)).toThrow();
  });
  it("sets the start of the one at the index only", () => {
    const next = setStart(three(), "a", 0, 0.5);
    expect(motionsOf(next, "a")[1]).not.toHaveProperty("phase");
  });
});

describe("shared paths", () => {
  const five = () =>
    sceneOf(apple("a", [path({ group: "g" })]), apple("b", [path({ group: "g" })]), apple("c", [path({ group: "g" })]), apple("d", [path()]), apple("e", [spin]));
  const pointsOf = (scene: Scene, id: string, i = 0) => (motionsOf(scene, id)[i] as Extract<Motion, { kind: "path" }>).points;

  // Bug: editing one shared path moving only that one apple.
  it("bends every path in the group when one is bent, and no path outside it", () => {
    const next = setPathPoints(five(), "a", 0, BENT);
    for (const id of ["a", "b", "c"]) expect(pointsOf(next, id)).toEqual(BENT);
    expect(pointsOf(next, "d")).toEqual(PTS);
  });
  it("bends a path with no group alone", () => {
    const next = setPathPoints(five(), "d", 0, BENT);
    expect(pointsOf(next, "d")).toEqual(BENT);
    expect(pointsOf(next, "a")).toEqual(PTS);
  });
  // Bug: the points shared by reference, so a later in-place edit of one moved them all without a group.
  it("gives each path its own copy of the points", () => {
    const next = setPathPoints(five(), "a", 0, BENT);
    expect(pointsOf(next, "a")).not.toBe(pointsOf(next, "b"));
  });
  it("refuses to bend a motion that is not a path", () => {
    expect(() => setPathPoints(five(), "e", 0, BENT)).toThrow();
  });

  // Bug: spreading counting a path outside the group (spacing by 1/4 instead of 1/3), or in the wrong order.
  it("spreads the group evenly in stack order and leaves other paths alone", () => {
    const next = spreadAlongPath(five(), "g");
    expect(["a", "b", "c"].map((id) => (motionsOf(next, id)[0] as { phase: number }).phase)).toEqual([0, 1 / 3, 2 / 3]);
    expect(motionsOf(next, "d")[0]).not.toHaveProperty("phase");
  });
  it("refuses a group nothing is in", () => {
    expect(() => spreadAlongPath(five(), "nope")).toThrow();
  });

  describe("sharePath", () => {
    it("copies points, period and turn to the targets in a new group, replacing a target's own path and keeping its spin", () => {
      const scene = sceneOf(apple("a", [path({ turn: true, period: 6 })]), apple("b", [spin, path({ points: BENT, period: 3 })]), apple("c"));
      const next = sharePath(scene, "a", 0, ["b", "c"]);
      const group = (motionsOf(next, "a")[0] as { group?: string }).group;
      expect(group).toBeTruthy();
      expect(motionsOf(next, "b").map((m) => m.kind)).toEqual(["spin", "path"]);
      // Bug: sharing the source's own array, so one later in-place edit moves every apple.
      const mine = (id: string) => (motionsOf(next, id).find((m) => m.kind === "path") as { points: unknown }).points;
      expect(mine("b")).not.toBe(mine("a"));
      expect(mine("c")).not.toBe(mine("b"));
      for (const id of ["b", "c"]) {
        const p = motionsOf(next, id).find((m) => m.kind === "path");
        expect(p).toMatchObject({ points: PTS, period: 6, turn: true, group });
      }
    });
    // Bug: a new group id that collides with another group would link two unrelated sets of paths.
    it("makes a group id no other path uses, and keeps the source's own group", () => {
      const used = sceneOf(apple("a", [path()]), apple("x", [path({ group: "path-1" })]), apple("c"));
      expect((motionsOf(sharePath(used, "a", 0, ["c"]), "c")[0] as { group: string }).group).not.toBe("path-1");
      const grouped = sceneOf(apple("a", [path({ group: "mine" })]), apple("c"));
      expect(motionsOf(sharePath(grouped, "a", 0, ["c"]), "c")[0]).toMatchObject({ group: "mine" });
    });
    // Bug: a share that overwrites the target's own Start puts every apple at the same spot on the path.
    it("keeps a target's own start", () => {
      const scene = sceneOf(apple("a", [path()]), apple("b", [path({ phase: 0.4 })]));
      expect(motionsOf(sharePath(scene, "a", 0, ["b"]), "b")[0]).toMatchObject({ phase: 0.4 });
    });
  });

  // Bug: unsharing that drops the points, leaving a path that cannot be drawn, or one that stays in the group.
  it("unshare drops the group but keeps the points; the others stay grouped", () => {
    const next = unsharePath(five(), "a", 0);
    expect(motionsOf(next, "a")[0]).not.toHaveProperty("group");
    expect(pointsOf(next, "a")).toEqual(PTS);
    expect(motionsOf(next, "b")[0]).toMatchObject({ group: "g" });
    expect(pointsOf(setPathPoints(next, "b", 0, BENT), "a")).toEqual(PTS);
  });
});
