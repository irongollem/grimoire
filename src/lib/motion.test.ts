import { describe, it, expect } from "vitest";
import { originTransform, REST_TRANSFORM } from "./motion";

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
