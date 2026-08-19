import { describe, it, expect, vi } from "vitest";
import { drawerKeyframes, drawerTransition, originTransform, REST_TRANSFORM } from "./motion";

const PANEL = { top: 100, left: 200, width: 400, height: 300 };

describe("originTransform", () => {
  it("moves the panel onto the origin's centre and shrinks it to the origin's width", () => {
    // Origin centre (60, 40); panel centre (400, 250) → travel (-340, -210).
    const from = originTransform({ top: 20, left: 20, width: 80, height: 40 }, PANEL);
    expect(from).toBe("translate(-340px, -210px) scale(0.2)");
  });

  it("lands where REST_TRANSFORM leaves it when the two rects coincide", () => {
    expect(originTransform(PANEL, PANEL)).toBe("translate(0px, 0px) scale(1)");
    expect(REST_TRANSFORM).toBe("translate(0, 0) scale(1)");
  });

  it("never scales up from an origin wider than the panel", () => {
    // Concentric with the panel, so only the scale is in question.
    const from = originTransform({ top: -50, left: -50, width: 900, height: 600 }, PANEL);
    expect(from).toBe("translate(0px, 0px) scale(1)");
  });

  it("falls back to scale 1 rather than NaN when the panel has not been laid out", () => {
    const from = originTransform({ top: 0, left: 0, width: 0, height: 0 }, { top: 0, left: 0, width: 0, height: 0 });
    expect(from).toBe("translate(0px, 0px) scale(1)");
  });
});

const DRAWER = {
  height: 240,
  paddingTop: "6px",
  paddingBottom: "12px",
  borderTopWidth: "1px",
  borderBottomWidth: "0px",
};

describe("drawerKeyframes", () => {
  it("travels between a zero box and the measured one", () => {
    const [shut, open] = drawerKeyframes(DRAWER);
    expect(shut).toEqual({
      height: "0px",
      paddingTop: "0px",
      paddingBottom: "0px",
      borderTopWidth: "0px",
      borderBottomWidth: "0px",
      opacity: 0,
    });
    expect(open).toEqual({
      height: "240px",
      paddingTop: "6px",
      paddingBottom: "12px",
      borderTopWidth: "1px",
      borderBottomWidth: "0px",
      opacity: 1,
    });
  });

  it("collapses padding and borders too, not just height", () => {
    // Left at rest, a padded drawer shuts onto a stub of empty card and an
    // accordion's header rule is left hanging over nothing.
    const [shut] = drawerKeyframes({ ...DRAWER, paddingTop: "1rem", paddingBottom: "1rem" });
    expect(shut.paddingTop).toBe("0px");
    expect(shut.paddingBottom).toBe("0px");
    expect(shut.borderTopWidth).toBe("0px");
  });
});

describe("drawerTransition", () => {
  it("hands control back immediately where Web Animations is unavailable", () => {
    // jsdom has no `animate`, which is also the reduced-motion path: the drawer
    // opens, it just does not travel. Vue still has to be told the transition ended.
    const hooks = drawerTransition();
    const el = document.createElement("div");
    const entered = vi.fn();
    const left = vi.fn();
    hooks.onEnter(el, entered);
    hooks.onLeave(el, left);
    expect(entered).toHaveBeenCalledOnce();
    expect(left).toHaveBeenCalledOnce();
    expect(hooks.css).toBe(false);
  });
});
