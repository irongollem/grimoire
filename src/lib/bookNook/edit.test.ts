import { describe, expect, it } from "vitest";
import {
  addCutout, addTouch, applyOp, breathingOf, depthBand, gentler, moveEffect, moveLayer, newScene, removeItem,
  reorderWithinDepth, resizeLayer, setAnchor, setBreathing, setDepth, setLoop, setMood, effectPoint,
  reorderTo, newLayerId, layerName, withHidden, layerKey, effectKey, pictureOf, PICTURE_ID,
  renameItem, effectLabel, holdOf, setHold, setMotion, setShadowOn, setThrowsLight, lightOf, setCast, surfaceOf, setPlane,
  setTouchAmount, amountOf, setGlowFollows, depthSentence, glowIdOf, setFrame,
} from "./edit.ts";
import { windowFor } from "./framing.ts";
import { layersOf, uncovered, type Layer, type Scene } from "./scene.ts";
import { DEPTH, describeMotion, motionFor } from "./presets.ts";

const room = { url: "room.webp", width: 2400, height: 1350 };
const base = (): Scene => newScene({ id: "n1", title: "Cellar", room });
const cut = (id: string) => ({ id, src: `${id}.webp`, width: 600, height: 900 });
const layer = (scene: Scene, id: string): Layer => {
  const l = layersOf(scene).find((x) => x.id === id);
  if (!l) throw new Error(`no ${id}`);
  return l;
};
const order = (scene: Scene) => layersOf(scene).map((l) => l.id);

describe("newScene", () => {
  it("insets both windows so the plate covers them through the whole loop", () => {
    // Bug: a window the full size of the room lets the breathing drift show a black strip at the plate's edge.
    for (const room2 of [room, { url: "r", width: 1800, height: 1800 }, { url: "r", width: 1200, height: 2400 }]) {
      const scene = newScene({ id: "x", title: "X", room: room2 });
      const plate = layer(scene, "plate");
      for (const screen of ["wide", "tall"] as const) {
        const window = windowFor(scene, screen);
        expect(uncovered(scene, plate, { width: room2.width, height: room2.height }, 240, { window })).toBe(0);
      }
    }
  });

  it("without the inset the same windows would show an edge (the inset is what holds them in)", () => {
    const scene = base();
    const wide = scene.windows?.wide;
    if (!wide) throw new Error("no wide window");
    const full = { x: 0, y: 0, w: room.width, h: room.height };
    expect(uncovered(scene, layer(scene, "plate"), room, 240, { window: full })).toBeGreaterThan(0);
    expect(wide.w).toBeLessThan(room.width);
  });

  it("starts with one plate filling the room, centred, and no mood", () => {
    const scene = base();
    expect(order(scene)).toEqual(["plate"]);
    expect(layer(scene, "plate")).toMatchObject({ width: room.width, at: { x: 1200, y: 675 }, depth: 1 });
    expect(scene.grade.tint.amount).toBe(0);
    expect(scene.loop).toBe(12);
  });
});

describe("the picture is the room", () => {
  it("cannot be moved, resized, re-pinned, re-ordered, given another depth or removed", () => {
    // Bug: dragging the plate off its place shows black behind it, for every screen at once.
    const s = base();
    expect(() => moveLayer(s, "plate", { x: 0, y: 0 })).toThrow(/picture/);
    expect(() => resizeLayer(s, "plate", 100)).toThrow(/picture/);
    expect(() => setAnchor(s, "plate", { x: 0, y: 0 }, 0.5)).toThrow(/picture/);
    expect(() => reorderWithinDepth(s, "plate", 1)).toThrow(/picture/);
    expect(() => setDepth(s, { kind: "layer", id: "plate" }, 0.5)).toThrow(/picture/);
    expect(() => removeItem(s, { kind: "layer", id: "plate" })).toThrow(/picture/);
  });
});

describe("setAnchor", () => {
  it("keeps the drawn picture exactly where it was", () => {
    // Bug: moving the pin by only changing `anchor` slides the picture by the difference.
    const s = addCutout(base(), cut("chair"), { x: 1000, y: 900 });
    const before = layer(s, "chair");
    const aspect = 900 / 600;
    const rect = (l: Layer) => ({ left: l.at.x - l.anchor.x * l.width, top: l.at.y - l.anchor.y * l.width * aspect });
    const after = layer(setAnchor(s, "chair", { x: 0.2, y: 0.3 }, aspect), "chair");
    expect(after.anchor).toEqual({ x: 0.2, y: 0.3 });
    expect(rect(after).left).toBeCloseTo(rect(before).left);
    expect(rect(after).top).toBeCloseTo(rect(before).top);
  });
});

describe("resizeLayer", () => {
  it("scales a standing shadow with the part and never shrinks below a few pixels", () => {
    const s = addCutout(base(), cut("chair"), { x: 1000, y: 900 });
    const w = layer(s, "chair").width;
    const bigger = layer(resizeLayer(s, "chair", w * 2), "chair");
    expect(bigger.width).toBe(w * 2);
    expect(bigger.shadow?.rx).toBeCloseTo((layer(s, "chair").shadow?.rx ?? 0) * 2);
    expect(layer(resizeLayer(s, "chair", -50), "chair").width).toBeGreaterThan(0);
  });

  it("keeps a preset motion the same preset when the part is resized", () => {
    // Bug: Wandering is sized from the part's width, so shrinking a butterfly left it wandering as far as the
    // big one did and the inspector called its motion "Custom: tuned by hand".
    const s = addCutout(base(), cut("moth"), { x: 1000, y: 500 });
    const w = layer(s, "moth").width;
    const wander = motionFor("Wandering", "gentle", "steady", { width: w }, s.loop);
    const flame = motionFor("Flame", "lively", "quick", { width: w }, s.loop);
    const moving = { ...s, stack: s.stack.map((i) => (i.kind === "layer" && i.id === "moth" ? { ...i, motions: [wander, flame] } : i)) };
    const small = layer(resizeLayer(moving, "moth", w / 4), "moth");
    expect(describeMotion(small.motions![0], small, s.loop)).toEqual({ name: "Wandering", strength: "gentle", pace: "steady" });
    expect(small.motions![1]).toEqual(flame);
  });
});

describe("setDepth", () => {
  it("clamps to the engine's bounds", () => {
    // Bug: a typed 9 sends a part far past the camera and out of the window.
    const s = addCutout(base(), cut("chair"), { x: 1, y: 1 });
    expect(layer(setDepth(s, { kind: "layer", id: "chair" }, 9), "chair").depth).toBe(DEPTH.max);
    expect(layer(setDepth(s, { kind: "layer", id: "chair" }, -1), "chair").depth).toBe(DEPTH.min);
  });

  it("sorts a Far part before the picture and a Near one after it", () => {
    // Bug: the picture forced to stack index 0 draws a Far part over the plate, so a view through a window is impossible.
    let s = base();
    s = addCutout(s, cut("vista"), { x: 1, y: 1 });
    s = addCutout(s, cut("lamp"), { x: 1, y: 1 });
    s = setDepth(s, { kind: "layer", id: "vista" }, 0.3);
    s = setDepth(s, { kind: "layer", id: "lamp" }, 1.4);
    expect(order(s)).toEqual(["vista", "plate", "lamp"]);
    expect(pictureOf(s).id).toBe(PICTURE_ID);
    expect(() => moveLayer(s, "plate", { x: 0, y: 0 })).toThrow(/picture/);
    expect(() => setDepth(s, { kind: "layer", id: "plate" }, 0.5)).toThrow(/picture/);
  });

  it("keeps layers in depth order, so back to front follows depth", () => {
    let s = base();
    s = addCutout(s, cut("a"), { x: 1, y: 1 });
    s = addCutout(s, cut("b"), { x: 1, y: 1 });
    s = setDepth(s, { kind: "layer", id: "a" }, DEPTH.near);
    s = setDepth(s, { kind: "layer", id: "b" }, DEPTH.far);
    expect(order(s)).toEqual(["b", "plate", "a"]);
  });

  it("sets a touch's depth in place so a selection by stack position stays valid", () => {
    let s = addTouch(base(), "dust", { x: 1200, y: 600 });
    s = addCutout(s, cut("a"), { x: 1, y: 1 });
    const index = s.stack.findIndex((i) => i.kind === "motes");
    const next = setDepth(s, { kind: "effect", index }, 0.5);
    expect(next.stack[index]).toMatchObject({ kind: "motes", depth: 0.5 });
  });
});

describe("reorderWithinDepth", () => {
  const three = () => addCutout(addCutout(base(), cut("a"), { x: 1, y: 1 }), cut("b"), { x: 1, y: 1 });

  it("swaps with the neighbour of the same depth", () => {
    expect(order(reorderWithinDepth(three(), "a", 1))).toEqual(["plate", "b", "a"]);
    expect(order(reorderWithinDepth(three(), "b", -1))).toEqual(["plate", "b", "a"]);
  });

  it("will not pass a layer of another depth, which would break the depth order", () => {
    // Bug: reordering across depths puts a near part behind a far one while it still moves like the near one.
    let s = three();
    s = setDepth(s, { kind: "layer", id: "b" }, DEPTH.near);
    expect(order(reorderWithinDepth(s, "b", -1))).toEqual(order(s));
    expect(order(reorderWithinDepth(s, "a", 1))).toEqual(order(s));
  });

  it("never lets a part slip behind the picture", () => {
    expect(order(reorderWithinDepth(three(), "a", -1))).toEqual(["plate", "a", "b"]);
  });
});

describe("addCutout / addTouch", () => {
  it("stands a new cut-out at the point, on its feet, with a shadow, no wider than a quarter of the room", () => {
    const s = addCutout(base(), { id: "big", src: "b", width: 5000, height: 5000 }, { x: 700, y: 800 });
    expect(layer(s, "big")).toMatchObject({ at: { x: 700, y: 800 }, anchor: { x: 0.5, y: 1 }, depth: 1, width: 600 });
    expect(layer(s, "big").shadow).toBeDefined();
  });

  it("refuses a layer id that is already used, so a selection is never ambiguous", () => {
    expect(() => addCutout(addCutout(base(), cut("a"), { x: 1, y: 1 }), cut("a"), { x: 1, y: 1 })).toThrow(/already/);
  });

  it("puts a box over a quarter of the room around the point for an area touch, and a point for a glow", () => {
    const dust = addTouch(base(), "dust", { x: 1200, y: 675 }).stack[1];
    if (dust.kind !== "motes") throw new Error("expected motes");
    expect(dust.area.w).toBe(600);
    expect(effectPoint(dust)).toEqual({ x: 1200, y: 675 });
    expect(addTouch(base(), "glow", { x: 5, y: 6 }).stack[1]).toMatchObject({ kind: "light", at: { x: 5, y: 6 } });
  });
});

describe("moveEffect", () => {
  it("shifts a box by moving its middle, and a point to the point", () => {
    const s = addTouch(addTouch(base(), "dust", { x: 1200, y: 675 }), "glow", { x: 10, y: 10 });
    const moved = moveEffect(s, 1, { x: 1000, y: 600 });
    expect(effectPoint(moved.stack[1] as never)).toEqual({ x: 1000, y: 600 });
    expect(effectPoint(moveEffect(s, 2, { x: 50, y: 60 }).stack[2] as never)).toEqual({ x: 50, y: 60 });
  });

  it("refuses a stack position that is a layer", () => {
    expect(() => moveEffect(base(), 0, { x: 1, y: 1 })).toThrow(/touch/);
  });
});

describe("removeItem", () => {
  it("lets go of a light's follow and a layer's cast when what they named is removed", () => {
    // Bug: a light following a deleted flame throws at render time; a cast from a deleted light too.
    let s = addCutout(base(), cut("flame"), { x: 1, y: 1 });
    s = addTouch(s, "glow", { x: 1, y: 1 });
    const light = s.stack.findIndex((i) => i.kind === "light");
    s = { ...s, stack: s.stack.map((i) => (i.kind === "light" ? { ...i, follows: "flame", id: "L" } : i.kind === "layer" && i.id === "flame" ? { ...i, cast: { light: "L", depth: 1, opacity: 0.3 } } : i)) };
    const noFlame = removeItem(s, { kind: "layer", id: "flame" });
    expect(noFlame.stack.find((i) => i.kind === "light")).toMatchObject({ follows: undefined });
    const noLight = removeItem(s, { kind: "effect", index: light });
    expect(layer(noLight, "flame").cast).toBeUndefined();
  });

  it("refuses an id the scene does not have", () => {
    expect(() => removeItem(base(), { kind: "layer", id: "ghost" })).toThrow(/ghost/);
  });
});

describe("picture-wide settings", () => {
  it("names the breathing a camera is and steps one gentler, none below Still", () => {
    const s = setBreathing(base(), "deep");
    expect(breathingOf(s.camera)).toBe("deep");
    expect(gentler(s.camera)).toBe("gentle");
    expect(gentler(setBreathing(s, "still").camera)).toBeNull();
    expect(gentler({ drift: 0.5, push: 0.5 })).toBe("gentle");
  });

  it("keeps a wisp's life under the loop when the loop gets shorter", () => {
    const s = setLoop(addTouch(base(), "smoke", { x: 1, y: 1 }), 8);
    const steam = s.stack.find((i) => i.kind === "steam");
    if (steam?.kind !== "steam") throw new Error("no steam");
    expect(steam.life).toBeLessThan(8);
    expect(() => setLoop(s, 0)).toThrow();
  });

  it("applies a mood as a grade copy and words depths", () => {
    expect(setMood(base(), "ember").grade.tint.amount).toBeGreaterThan(0);
    expect(depthBand(0.3)).toBe("Far");
    expect(depthBand(1)).toBe("Picture");
    expect(depthBand(1.45)).toBe("Near");
  });
});

describe("applyOp", () => {
  it("routes an operation to its function and does not mutate the scene it was given", () => {
    const s = addCutout(base(), cut("a"), { x: 5, y: 5 });
    const frozen = JSON.stringify(s);
    const next = applyOp(s, { op: "move", target: { kind: "layer", id: "a" }, to: { x: 9, y: 9 } });
    expect(layer(next, "a").at).toEqual({ x: 9, y: 9 });
    expect(JSON.stringify(s)).toBe(frozen);
  });
});


describe("reorderTo", () => {
  it("moves a row onto another of its depth, and ignores a row of another depth", () => {
    let s = base();
    for (const id of ["a", "b", "c"]) s = addCutout(s, cut(id), { x: 1, y: 1 });
    expect(order(reorderTo(s, "a", "c"))).toEqual(["plate", "b", "c", "a"]);
    expect(order(reorderTo(s, "c", "a"))).toEqual(["plate", "c", "a", "b"]);
    const far = setDepth(s, { kind: "layer", id: "b" }, DEPTH.far);
    expect(order(reorderTo(far, "a", "b"))).toEqual(order(far));
  });
});

describe("names and hiding", () => {
  it("makes unique ids from file names and reads a name back from them", () => {
    const id = newLayerId("Old Chair (2).PNG", () => 0.5);
    expect(id).toMatch(/^old-chair-2-[a-z0-9]{6}$/);
    expect(layerName(id)).toBe("Old chair 2");
    expect(newLayerId("???.png", () => 0)).toMatch(/^cutout-/);
    expect(layerName("plate")).toBe("The picture");
  });

  it("hides items for the stage without moving anything in the stack", () => {
    // Bug: filtering a hidden item out would shift the next touch's index, and with it its seeded look.
    let s = addCutout(base(), cut("chair"), { x: 1, y: 1 });
    s = addTouch(s, "dust", { x: 5, y: 5 });
    const shown = withHidden(s, new Set([layerKey("chair"), effectKey(s.stack.findIndex((i) => i.kind === "motes"))]));
    expect(shown.stack).toHaveLength(s.stack.length);
    expect(layer(shown, "chair").opacity).toBe(0);
    expect(shown.stack.find((i) => i.kind === "motes")).toMatchObject({ count: 0 });
    expect(layer(s, "chair").opacity).toBeUndefined();
    expect(withHidden(s, new Set())).toBe(s);
  });
});

describe("names", () => {
  it("renames a cut-out and a touch, and an empty name takes the derived one back", () => {
    // Bug: a rename that is kept when emptied leaves a blank row in the list.
    let s = addTouch(addCutout(base(), cut("chair-abc123"), { x: 1, y: 1 }), "steam", { x: 5, y: 5 });
    s = renameItem(s, { kind: "layer", id: "chair-abc123" }, "  Old chair ");
    expect(layer(s, "chair-abc123").name).toBe("Old chair");
    expect(layerName("chair-abc123", layer(s, "chair-abc123").name)).toBe("Old chair");
    s = renameItem(s, { kind: "layer", id: "chair-abc123" }, "   ");
    expect(layer(s, "chair-abc123").name).toBeUndefined();
    const steam = s.stack.findIndex((i) => i.kind === "steam");
    s = renameItem(s, { kind: "effect", index: steam }, "Kettle");
    expect(effectLabel(s.stack[steam] as never)).toBe("Kettle");
    expect(() => renameItem(s, { kind: "layer", id: "plate" }, "Room")).toThrow(/picture/);
  });
});

describe("hold", () => {
  const stood = () => addCutout(base(), cut("lamb"), { x: 1000, y: 800 });
  it("moves the pin without moving the picture, and gives or takes the contact shadow", () => {
    // Bug: re-pinning without moving `at` makes the part jump.
    const s = stood();
    const before = layer(s, "lamb");
    expect(holdOf(before)).toBe("stands");
    const floated = layer(setHold(s, "lamb", "floats", 1.5), "lamb");
    expect(holdOf(floated)).toBe("floats");
    expect(floated.at.y - floated.anchor.y * floated.width * 1.5).toBeCloseTo(before.at.y - before.anchor.y * before.width * 1.5);
    expect(floated.shadow).toBeUndefined();
    expect(layer(setHold(setHold(s, "lamb", "hangs", 1.5), "lamb", "stands", 1.5), "lamb").shadow).toBeDefined();
  });
  it("drops a cast shadow when the part stops standing", () => {
    let s = setThrowsLight(stood(), "lamb", true, 1.5);
    s = setCast(s, "lamb", { light: glowIdOf("lamb"), surface: "floor" });
    expect(layer(setHold(s, "lamb", "hangs", 1.5), "lamb").cast).toBeUndefined();
  });
});

describe("motion", () => {
  const lit = () => setMotion(addCutout(base(), cut("torch"), { x: 1000, y: 800 }), "torch", { name: "Flame", strength: "gentle", pace: "steady" });
  it("sets one named motion and none removes it", () => {
    expect(layer(lit(), "torch").motions).toEqual([expect.objectContaining({ kind: "flicker" })]);
    expect(layer(setMotion(lit(), "torch", null), "torch").motions).toBeUndefined();
  });
  it("stops a light following a part that no longer flickers, which the engine would refuse", () => {
    // Bug: lightAt throws for a light that follows a layer with no flicker.
    const s = setThrowsLight(lit(), "torch", true, 1.5);
    expect(lightOf(s, "torch")?.follows).toBe("torch");
    expect(lightOf(setMotion(s, "torch", { name: "Cloth", strength: "faint", pace: "slow" }), "torch")?.follows).toBeUndefined();
    expect(lightOf(setMotion(s, "torch", { name: "Flame", strength: "lively", pace: "quick" }), "torch")?.follows).toBe("torch");
  });
});

describe("shadow under it", () => {
  it("is only for a part that stands", () => {
    // Bug: a floating lantern given a floor shadow.
    const s = addCutout(base(), cut("a"), { x: 1, y: 1 });
    expect(layer(setShadowOn(s, "a", false), "a").shadow).toBeUndefined();
    expect(layer(setShadowOn(setShadowOn(s, "a", false), "a", true), "a").shadow).toBeDefined();
    expect(() => setShadowOn(setHold(s, "a", "floats", 1.5), "a", true)).toThrow(/stands/);
  });
});

describe("throws light", () => {
  it("adds a light that follows a flame, a steady one otherwise, and removes it with its cast shadows", () => {
    const plain = addCutout(base(), cut("pot"), { x: 1000, y: 800 });
    const steady = setThrowsLight(plain, "pot", true, 1);
    expect(lightOf(steady, "pot")).toMatchObject({ id: "pot-glow", depth: 1 });
    expect(lightOf(steady, "pot")?.follows).toBeUndefined();
    expect(setThrowsLight(steady, "pot", true, 1)).toBe(steady);
    const cast = setCast(steady, "pot", { light: "pot-glow", surface: "wall" });
    const off = setThrowsLight(cast, "pot", false, 1);
    expect(lightOf(off, "pot")).toBeUndefined();
    expect(layer(off, "pot").cast).toBeUndefined();
    expect(() => setThrowsLight(base(), "plate", true, 1)).toThrow(/picture/);
  });
  it("gives every glow touch an id a shadow can name", () => {
    const s = addTouch(addTouch(base(), "glow", { x: 1, y: 1 }), "glow", { x: 2, y: 2 });
    const ids = s.stack.flatMap((i) => (i.kind === "light" ? [i.id] : []));
    expect(ids).toEqual(["glow-2", "glow"]);
  });
});

describe("cast", () => {
  const withLight = () => setThrowsLight(addCutout(base(), cut("pot"), { x: 1000, y: 800 }), "pot", true, 1);
  it("falls on the wall behind a little further back, or on the floor at the part's own depth", () => {
    const wall = layer(setCast(withLight(), "pot", { light: "pot-glow", surface: "wall" }), "pot");
    expect(wall.cast?.depth).toBeCloseTo(0.95);
    expect(surfaceOf(wall)).toBe("wall");
    const floor = layer(setCast(withLight(), "pot", { light: "pot-glow", surface: "floor" }), "pot");
    expect(floor.cast?.depth).toBe(1);
    expect(surfaceOf(floor)).toBe("floor");
    expect(surfaceOf(layer(withLight(), "pot"))).toBeNull();
  });
  it("needs a light that exists and a part that stands", () => {
    // Bug: a cast shadow naming a missing light throws at every frame in the renderer.
    expect(() => setCast(withLight(), "pot", { light: "nope", surface: "wall" })).toThrow(/no light/);
    expect(() => setCast(setHold(withLight(), "pot", "floats", 1), "pot", { light: "pot-glow", surface: "wall" })).toThrow(/stands/);
  });
  it("keeps to its surface when the part moves in depth", () => {
    // Bug: the shadow stays at the old depth and slides off the wall.
    const s = setCast(withLight(), "pot", { light: "pot-glow", surface: "wall" });
    const deeper = layer(setDepth(s, { kind: "layer", id: "pot" }, 1.3), "pot");
    expect(deeper.cast?.depth).toBeCloseTo(1.25);
  });
});

describe("plane", () => {
  it("lays a part on a wall and takes it off, and refuses a wall that does not recede", () => {
    const s = addCutout(base(), cut("a"), { x: 1, y: 1 });
    const on = setPlane(s, "a", { horizon: 600, far: 0.6 });
    expect(layer(on, "a").plane).toEqual({ horizon: 600, far: 0.6 });
    expect(layer(setPlane(on, "a", null), "a").plane).toBeUndefined();
    expect(() => setPlane(s, "a", { horizon: 600, far: 0 })).toThrow(/recedes/);
  });
});

describe("amount", () => {
  it("sets a count by the preset's own number and reads the nearest amount back", () => {
    let s = addTouch(addTouch(base(), "steam", { x: 1, y: 1 }), "glow", { x: 2, y: 2 });
    const steam = s.stack.findIndex((i) => i.kind === "steam");
    const glow = s.stack.findIndex((i) => i.kind === "light");
    expect(amountOf(s.stack[steam] as never)).toBe("some");
    s = setTouchAmount(s, steam, "lots");
    expect((s.stack[steam] as { count: number }).count).toBeGreaterThan(7);
    expect(amountOf(s.stack[steam] as never)).toBe("lots");
    s = setTouchAmount(s, glow, "little");
    expect(amountOf(s.stack[glow] as never)).toBe("little");
    expect(() => setTouchAmount(s, 0, "lots")).toThrow(/not a touch/);
  });
  it("counts whole things", () => {
    const s = addTouch(base(), "rain", { x: 100, y: 100 });
    const i = s.stack.findIndex((x) => x.kind === "particles");
    expect(Number.isInteger((setTouchAmount(s, i, "little").stack[i] as { count: number }).count)).toBe(true);
  });
});

describe("glow follows", () => {
  it("follows only a part with a flame", () => {
    // Bug: a light following a part without a flicker makes the engine throw on every frame.
    let s = addCutout(addCutout(base(), cut("torch"), { x: 1, y: 1 }), cut("rock"), { x: 1, y: 1 });
    s = setMotion(s, "torch", { name: "Flame", strength: "gentle", pace: "steady" });
    s = addTouch(s, "glow", { x: 5, y: 5 });
    const glow = s.stack.findIndex((i) => i.kind === "light");
    expect((setGlowFollows(s, glow, "torch").stack[glow] as { follows?: string }).follows).toBe("torch");
    expect((setGlowFollows(setGlowFollows(s, glow, "torch"), glow, null).stack[glow] as { follows?: string }).follows).toBeUndefined();
    expect(() => setGlowFollows(s, glow, "rock")).toThrow(/flame/);
    expect(() => setGlowFollows(s, glow, "ghost")).toThrow(/no layer/);
    const other = s.stack.findIndex((i) => i.kind === "layer" && i.id === "torch");
    expect(() => setGlowFollows(s, other, "torch")).toThrow(/not a touch/);
  });
});

describe("depth sentence", () => {
  it("says what the depth means for the part", () => {
    const s = addCutout(base(), cut("a"), { x: 1, y: 1 });
    expect(depthSentence(layer(s, "a"))).toMatch(/keeps the picture's depth/);
    expect(depthSentence(layer(setDepth(s, { kind: "layer", id: "a" }, 0.3), "a"))).toMatch(/Behind the picture/);
    expect(depthSentence(layer(setDepth(s, { kind: "layer", id: "a" }, 1.5), "a"))).toMatch(/In front/);
  });
});

describe("applyOp new ops", () => {
  it("routes each inspector op", () => {
    const s = addCutout(base(), cut("a"), { x: 1, y: 1 });
    expect(layer(applyOp(s, { op: "rename", target: { kind: "layer", id: "a" }, name: "Z" }), "a").name).toBe("Z");
    expect(holdOf(layer(applyOp(s, { op: "hold", id: "a", hold: "hangs", aspect: 1 }), "a"))).toBe("hangs");
    expect(layer(applyOp(s, { op: "motion", id: "a", choice: { name: "Hanging", strength: "faint", pace: "slow" } }), "a").motions).toHaveLength(1);
    expect(layer(applyOp(s, { op: "shadowOn", id: "a", on: false }), "a").shadow).toBeUndefined();
    expect(lightOf(applyOp(s, { op: "light", id: "a", on: true, aspect: 1 }), "a")).toBeDefined();
    expect(layer(applyOp(s, { op: "plane", id: "a", plane: { horizon: 1, far: 0.5 } }), "a").plane).toBeDefined();
  });
});

describe("setFrame", () => {
  const base = newScene({ id: "n", title: "N", room: { url: "r", width: 1600, height: 900 } });
  // Bug: choosing None left the old frame drawn in full screen.
  it("removes the frame for None", () => {
    expect(setFrame(setFrame(base, { style: "frame-arch", tall: "t", wide: "w" }), null).frame).toBeUndefined();
  });
  // Bug: an own frame lost its name on the way into the scene, so the picker listed it as "My frame".
  it("keeps the name of an own frame", () => {
    expect(setFrame(base, { style: "own-1", name: "Ivy", wide: "w" }).frame?.name).toBe("Ivy");
  });
  // Bug: a frame with neither shape saved, which shows nothing and reads as chosen.
  it("refuses a frame with no picture", () => {
    expect(() => setFrame(base, { style: "frame-arch" })).toThrow(/no picture/);
  });
});
