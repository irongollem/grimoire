// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import PathOverlay from "./PathOverlay.vue";
import type { Point } from "@/lib/bookNook/scene";
import type { Projector } from "@/lib/bookNook/stageGeometry";

// Stage pixels equal offsets, and the layer sits at the origin, so a point on the stage is its own offset.
const projector: Projector = { toScreen: (p) => p, toRoom: (p) => p, lengthScale: () => 1 };
const layer = { at: { x: 0, y: 0 }, depth: 1 };
const three: Point[] = [{ x: 100, y: 100 }, { x: 200, y: 100 }, { x: 300, y: 200 }];

beforeAll(() => {
  // jsdom has no pointer capture; the overlay holds the pointer on its svg while a drag runs.
  Object.assign(SVGElement.prototype, { setPointerCapture: () => undefined, releasePointerCapture: () => undefined, hasPointerCapture: () => false });
});

const wrappers: VueWrapper[] = [];
afterEach(() => wrappers.splice(0).forEach((w) => w.unmount()));

function overlay(props: { points?: Point[]; drawing: boolean }) {
  const w = mount(PathOverlay, { props: { points: three, closed: true, layer, projector, size: { width: 800, height: 600 }, ...props } });
  wrappers.push(w);
  return w;
}
const fire = (el: Element | Window | Document, type: string, at?: Point) => el.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX: at?.x ?? 0, clientY: at?.y ?? 0 }));
const lastPoints = (w: VueWrapper) => (w.emitted("points") ?? []).at(-1)?.[0] as Point[];
const escape = () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));

describe("PathOverlay, drawing", () => {
  it("Esc puts the path back as it was when drawing began, then ends drawing", () => {
    // Bug: Esc leaves the half-drawn points in place, or ends drawing without restoring them.
    const w = overlay({ drawing: true });
    const svg = w.find("svg").element;
    fire(svg, "pointerdown", { x: 500, y: 400 });
    fire(svg, "pointerup", { x: 500, y: 400 });
    expect(lastPoints(w)).toHaveLength(4);
    escape();
    expect(lastPoints(w)).toEqual(three);
    expect(w.emitted("done")).toHaveLength(1);
  });

  it("restores the points of when drawing began, not of when the overlay was made", async () => {
    // Bug: the snapshot is taken once at mount, so Esc restores a path older than the one being drawn.
    const w = overlay({ drawing: false });
    const later = [{ x: 1, y: 1 }, { x: 9, y: 9 }];
    await w.setProps({ points: later, drawing: true });
    escape();
    expect(lastPoints(w)).toEqual(later);
  });

  it("answers Esc only while drawing", () => {
    // Bug: Esc anywhere in the studio rewrites a path nobody is drawing.
    const w = overlay({ drawing: false });
    escape();
    expect(w.emitted("points")).toBeUndefined();
    expect(w.emitted("done")).toBeUndefined();
  });

  it("a click adds exactly one point, where it fell", () => {
    // Bug: a click is read as a stroke (no points, or a doubled one), or a small hand tremor drops it.
    const w = overlay({ drawing: true });
    const svg = w.find("svg").element;
    fire(svg, "pointerdown", { x: 500, y: 400 });
    fire(svg, "pointermove", { x: 503, y: 402 });
    fire(svg, "pointerup", { x: 503, y: 402 });
    expect(w.emitted("points")).toHaveLength(1);
    expect(lastPoints(w)).toEqual([...three, { x: 500, y: 400 }]);
  });

  it("a drag past the click slop adds a thinned line, not one point and not every sample", () => {
    // Bug: a drag is read as a click (one point), or every pointer move becomes a point.
    const w = overlay({ drawing: true });
    const svg = w.find("svg").element;
    fire(svg, "pointerdown", { x: 400, y: 300 });
    const samples = 80;
    for (let i = 1; i <= samples; i++) fire(svg, "pointermove", { x: 400 + i * 3, y: 300 - 60 * Math.sin((i / samples) * Math.PI) });
    fire(svg, "pointerup", { x: 640, y: 300 });
    const added = lastPoints(w).length - three.length;
    expect(added).toBeGreaterThan(2);
    expect(added).toBeLessThanOrEqual(12);
    expect(lastPoints(w).slice(0, 3)).toEqual(three);
  });

  it("a press near an existing point moves that point and adds none", () => {
    // Bug: pressing beside a point starts a new stroke, so bending a path while drawing litters it with points.
    const w = overlay({ drawing: true });
    const svg = w.find("svg").element;
    fire(svg, "pointerdown", { x: 203, y: 102 });
    fire(svg, "pointermove", { x: 250, y: 140 });
    fire(svg, "pointerup", { x: 250, y: 140 });
    expect(lastPoints(w)).toHaveLength(3);
    expect(lastPoints(w)[1]).toEqual({ x: 250, y: 140 });
    expect(lastPoints(w)[0]).toEqual(three[0]);
  });

  it("a press far from every point starts a stroke instead", () => {
    // Bug: the hit radius is huge, so every press grabs the nearest point.
    const w = overlay({ drawing: true });
    const svg = w.find("svg").element;
    fire(svg, "pointerdown", { x: 230, y: 100 });
    fire(svg, "pointerup", { x: 230, y: 100 });
    expect(lastPoints(w)).toHaveLength(4);
  });
});

describe("PathOverlay, not drawing", () => {
  it("drags a handle to bend the path, and a press elsewhere on the stage does nothing", () => {
    // Bug: the overlay swallows presses meant for the stage, or a handle will not move.
    const w = overlay({ drawing: false });
    const handle = w.findAll("[data-testid=path-handle] circle")[3].element; // the second handle's dot
    fire(handle, "pointerdown", { x: 200, y: 100 });
    fire(w.find("svg").element, "pointermove", { x: 220, y: 90 });
    fire(w.find("svg").element, "pointerup", { x: 220, y: 90 });
    expect(lastPoints(w)[1]).toEqual({ x: 220, y: 90 });
    const before = w.emitted("points")?.length;
    fire(w.find("svg").element, "pointerdown", { x: 700, y: 500 });
    fire(w.find("svg").element, "pointerup", { x: 700, y: 500 });
    expect(w.emitted("points")?.length).toBe(before);
  });

  it("a double-click on a handle takes that point away, and one on empty stage takes none", () => {
    // Bug: removes the wrong index, or any double-click removes the nearest point however far.
    const w = overlay({ drawing: false });
    const svg = w.find("svg").element;
    fire(svg, "dblclick", { x: 200, y: 101 });
    expect(lastPoints(w)).toEqual([three[0], three[2]]);
    const count = w.emitted("points")?.length;
    fire(svg, "dblclick", { x: 600, y: 500 });
    expect(w.emitted("points")?.length).toBe(count);
  });

  it("draws the path as a curve once it has two points, and none before", async () => {
    // Bug: one point draws a broken path element, or a path of two or more draws as straight segments only.
    const w = overlay({ drawing: false, points: [{ x: 1, y: 1 }] });
    expect(w.find("[data-testid=path-curve]").exists()).toBe(false);
    await w.setProps({ points: three });
    expect(w.find("[data-testid=path-curve]").attributes("d")).toContain("L");
    expect((w.find("[data-testid=path-curve]").attributes("d") ?? "").split("L").length).toBeGreaterThan(50);
  });
});
