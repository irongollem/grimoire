import { describe, expect, it } from "vitest";
import { canvasFor, homeView, GLIDE, MAX_ZOOM, MIN_PADDING, planCamera, viewAt, viewFor, zoompanExpressions, type Rect } from "./camera";

const WINDOW = { width: 1000, height: 1440 };
const DESKTOP = { width: 2880, height: 1800 };
const canvas = canvasFor(DESKTOP, WINDOW);
const inside = (r: Rect, c = canvas) =>
  r.x >= -1e-6 && r.y >= -1e-6 && r.x + r.width <= c.width + 1e-6 && r.y + r.height <= c.height + 1e-6;
const contains = (view: Rect, t: Rect) =>
  t.x + canvas.screenX >= view.x && t.y + canvas.screenY >= view.y && t.x + canvas.screenX + t.width <= view.x + view.width && t.y + canvas.screenY + t.height <= view.y + view.height;

describe("canvasFor", () => {
  it("a wide screen gets paper above and below, centred, in the window's shape", () => {
    expect(canvas.width).toBe(2880);
    expect(canvas.height / canvas.width).toBeCloseTo(1440 / 1000, 3);
    expect(canvas.screenY).toBeGreaterThan(0);
    expect(canvas.screenY * 2 + DESKTOP.height).toBe(canvas.height);
  });
  it("a screen already in the window's shape gets no paper (no band that would show on a phone)", () => {
    const c = canvasFor({ width: 1640, height: 2360 }, { width: 900, height: 1295 });
    expect(Math.abs(c.screenX) + Math.abs(c.screenY)).toBeLessThanOrEqual(2);
  });
  it("a screen taller than the window's shape gets paper at the sides, not a crop", () => {
    const c = canvasFor({ width: 1000, height: 3000 }, WINDOW);
    expect(c.height).toBe(3000);
    expect(c.width).toBeGreaterThan(1000);
    expect(c.screenX).toBeGreaterThan(0);
  });
});

describe("viewFor", () => {
  it("no target shows the whole canvas", () => {
    expect(viewFor(null, canvas)).toEqual({ x: 0, y: 0, width: canvas.width, height: canvas.height });
  });
  it("a target near the right edge is framed inside the screen, not past it", () => {
    const target = { x: 2700, y: 400, width: 160, height: 60 };
    const view = viewFor(target, canvas);
    expect(inside(view)).toBe(true);
    expect(contains(view, target)).toBe(true);
  });
  it("a target in the top-left corner is framed inside the screen too", () => {
    const target = { x: 0, y: 0, width: 200, height: 80 };
    const view = viewFor(target, canvas);
    expect(inside(view)).toBe(true);
    expect(contains(view, target)).toBe(true);
  });
  it("a tiny target is not zoomed past the readable limit", () => {
    const view = viewFor({ x: 1400, y: 800, width: 30, height: 10 }, canvas);
    expect(canvas.width / view.width).toBeLessThanOrEqual(MAX_ZOOM + 1e-9);
  });
  it("the view keeps the window's shape so it fills the window without bars", () => {
    const view = viewFor({ x: 900, y: 300, width: 900, height: 200 }, canvas);
    expect(view.width / view.height).toBeCloseTo(canvas.width / canvas.height, 9);
    expect(view.width / view.height).toBeCloseTo(1000 / 1440, 3);
  });
  it("a target wider than the canvas falls back to the whole canvas instead of a view past the edges", () => {
    const view = viewFor({ x: 0, y: 0, width: 2880, height: 1800 }, canvas);
    expect(view.width).toBe(canvas.width);
    expect(inside(view)).toBe(true);
  });
  it("a target is padded by default so its text does not touch the window's edge", () => {
    const target = { x: 400, y: 600, width: 1200, height: 300 };
    const view = viewFor(target, canvas);
    expect(view.width).toBeGreaterThanOrEqual(target.width + 2 * MIN_PADDING);
  });
  it("even a padding of zero keeps a minimum margin, so text is never framed edge to edge", () => {
    const target = { x: 400, y: 600, width: 1500, height: 200 };
    expect(viewFor(target, canvas, 0).width).toBeGreaterThanOrEqual(target.width + 2 * MIN_PADDING);
  });
  it("an explicit padding is used instead of the default", () => {
    const target = { x: 400, y: 600, width: 1200, height: 300 };
    expect(viewFor(target, canvas, 400).width).toBeGreaterThan(viewFor(target, canvas, 30).width);
  });
});

describe("viewAt and planCamera", () => {
  const target = { x: 1500, y: 300, width: 700, height: 300 };
  const glides = planCamera([{ t: 2, rect: target }], canvas);
  const full = viewFor(null, canvas);
  const zoomed = viewFor(target, canvas);

  it("before the first keyframe the camera shows the whole screen", () => {
    expect(viewAt(glides, canvas, 1.9)).toEqual(full);
  });
  it("with no keyframes the camera never moves", () => {
    expect(viewAt(planCamera([], canvas), canvas, 5)).toEqual(full);
  });
  it("between keyframes the camera holds still instead of drifting", () => {
    expect(viewAt(glides, canvas, 2 + GLIDE + 0.5)).toEqual(zoomed);
    expect(viewAt(glides, canvas, 2 + GLIDE + 30)).toEqual(zoomed);
  });
  it("the glide starts and ends at rest, with the middle halfway", () => {
    expect(viewAt(glides, canvas, 2.0).width).toBeCloseTo(full.width, 6);
    expect(viewAt(glides, canvas, 2 + GLIDE).width).toBeCloseTo(zoomed.width, 6);
    expect(viewAt(glides, canvas, 2 + GLIDE / 2).width).toBeCloseTo((full.width + zoomed.width) / 2, 6);
  });
  it("easing is soft at the ends: a tenth of the way in has moved far less than a tenth", () => {
    const moved = full.width - viewAt(glides, canvas, 2 + GLIDE / 10).width;
    expect(moved).toBeLessThan((full.width - zoomed.width) * 0.05);
  });
  it("focus(null) glides back out to the whole screen", () => {
    const back = planCamera([{ t: 2, rect: target }, { t: 5, rect: null }], canvas);
    expect(viewAt(back, canvas, 4.9)).toEqual(zoomed);
    expect(viewAt(back, canvas, 5 + GLIDE + 1)).toEqual(full);
  });
  it("a move that starts mid-glide continues from where the camera is instead of jumping", () => {
    const cut = planCamera([{ t: 2, rect: target }, { t: 2.2, rect: null }], canvas);
    const before = viewAt(cut, canvas, 2.2 - 1e-6);
    const after = viewAt(cut, canvas, 2.2 + 1e-6);
    expect(after.width).toBeCloseTo(before.width, 2);
    expect(after.x).toBeCloseTo(before.x, 2);
  });
  it("keyframes given out of order are played in time order", () => {
    const shuffled = planCamera([{ t: 5, rect: null }, { t: 2, rect: target }], canvas);
    expect(viewAt(shuffled, canvas, 4)).toEqual(zoomed);
  });
});

describe("zoompanExpressions", () => {
  const glides = planCamera([{ t: 1, rect: { x: 1500, y: 300, width: 700, height: 300 } }], canvas);
  const { z, x, y } = zoompanExpressions(glides, canvas);

  it("commas are escaped so the filter graph does not split the expression", () => {
    for (const e of [z, x, y]) expect(e).not.toMatch(/(^|[^\\]),/);
  });
  it("parentheses balance so ffmpeg can parse it", () => {
    for (const e of [z, x, y]) {
      let depth = 0;
      for (const ch of e) {
        depth += ch === "(" ? 1 : ch === ")" ? -1 : 0;
        expect(depth).toBeGreaterThanOrEqual(0);
      }
      expect(depth).toBe(0);
    }
  });
  it("with no keyframes the expressions are constants for the whole canvas", () => {
    const flat = zoompanExpressions([], canvas);
    expect(flat).toEqual({ z: `${canvas.width}/(${canvas.width})`, x: "0", y: "0" });
  });
  it("the zoom is the canvas width over the view's width, so the whole canvas is zoom 1", () => {
    expect(z.startsWith(`${canvas.width}/(`)).toBe(true);
  });
  it("the camera rests on the last view after the last glide", () => {
    const zoomed = viewFor({ x: 1500, y: 300, width: 700, height: 300 }, canvas);
    expect(x.endsWith(`${Math.round(zoomed.x * 1e4) / 1e4}))`)).toBe(true);
  });
});

describe("homeView, the resting view of a wide screen", () => {
  const sidebar = 480;
  const home = homeView(canvas, DESKTOP, sidebar);

  it("the resting desktop view is readable: it fills the window's height instead of shrinking the screen to a strip", () => {
    expect(home.height).toBe(DESKTOP.height);
    expect(home.y).toBe(canvas.screenY);
    // The whole-canvas view shows the screen at 2880 px wide in a 1000 px window; this one shows 1250 px of it.
    expect(canvas.width / home.width).toBeGreaterThan(2);
    expect(home.width / home.height).toBeCloseTo(1000 / 1440, 3);
  });
  it("it shows no paper: the view lies wholly on the screen", () => {
    expect(home.y).toBeGreaterThanOrEqual(canvas.screenY);
    expect(home.y + home.height).toBeLessThanOrEqual(canvas.screenY + DESKTOP.height);
    expect(inside(home)).toBe(true);
  });
  it("it starts beside the sidebar, so the page's own heading is the first thing in frame", () => {
    expect(home.x).toBe(canvas.screenX + sidebar);
  });
  it("it is clamped inside the screen when the sidebar inset would push it off the right edge", () => {
    const far = homeView(canvas, DESKTOP, 2500);
    expect(far.x + far.width).toBeLessThanOrEqual(canvas.width);
  });
  it("a phone or tablet, already the window's shape, rests on the whole canvas", () => {
    const tablet = { width: 1640, height: 2360 };
    const c = canvasFor(tablet, { width: 900, height: 1295 });
    expect(homeView(c, tablet)).toEqual(viewFor(null, c));
  });
  it("focus(null) glides back to the resting view and overview() to the true whole screen", () => {
    const target = { x: 1500, y: 300, width: 700, height: 300 };
    const plan = planCamera([{ t: 2, rect: target }, { t: 5, rect: null }, { t: 9, rect: null, overview: true }], canvas, home);
    expect(viewAt(plan, canvas, 0, home)).toEqual(home);
    expect(viewAt(plan, canvas, 5 + GLIDE + 1, home)).toEqual(home);
    expect(viewAt(plan, canvas, 9 + GLIDE + 1, home)).toEqual(viewFor(null, canvas));
  });
  it("a page with no sidebar (the player portal in preview) can rest on the screen's left edge instead", () => {
    const plan = planCamera([{ t: 1, rect: null, homeInset: 0 }], canvas, home, (inset) => homeView(canvas, DESKTOP, inset));
    expect(viewAt(plan, canvas, 1 + GLIDE + 1, home).x).toBe(canvas.screenX);
  });
  it("a zoom on a target near the top of the screen shows no paper above the screen", () => {
    const view = viewFor({ x: 600, y: 20, width: 600, height: 200 }, canvas);
    expect(view.y).toBeGreaterThanOrEqual(canvas.screenY);
  });
});
