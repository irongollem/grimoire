// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import {
  applyTornPaper,
  DEFAULT_PAPER_SIDE,
  paperGeometry,
  tearOutline,
  tearPixels,
  type PaperEdgeOptions,
  type PaperSideOptions,
} from "./tornPaper";

const side = (over: Partial<PaperSideOptions> = {}): PaperSideOptions => ({ ...DEFAULT_PAPER_SIDE, enabled: true, ...over });
const off = (): PaperSideOptions => ({ ...DEFAULT_PAPER_SIDE });
const sides = (over: Partial<PaperEdgeOptions> = {}): PaperEdgeOptions => ({ top: off(), right: off(), bottom: off(), left: off(), ...over });

function picture(w: number, h: number, rgb: [number, number, number] = [40, 30, 20]): Uint8ClampedArray<ArrayBuffer> {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) data.set([...rgb, 255], i * 4);
  return data;
}

describe("tearOutline", () => {
  it("is the same for the same seed and different for another seed", () => {
    const a = tearOutline(200, 200, side(), 7, "top");
    expect(Array.from(tearOutline(200, 200, side(), 7, "top"))).toEqual(Array.from(a));
    expect(Array.from(tearOutline(200, 200, side(), 8, "top"))).not.toEqual(Array.from(a));
  });

  it("gives each side its own outline from one seed", () => {
    expect(Array.from(tearOutline(200, 200, side(), 7, "top"))).not.toEqual(Array.from(tearOutline(200, 200, side(), 7, "bottom")));
  });

  it("tears a 1000 px and a 2000 px picture the same way, as fractions of the short side", () => {
    const small = tearOutline(1001, 1000, side({ shadow: 0.6 }), 3, "left");
    const big = tearOutline(2001, 2000, side({ shadow: 0.6 }), 3, "left");
    // Same coordinate u along the side: index k of the small one is index 2k of the big one.
    for (const k of [0, 137, 500, 733, 1000]) {
      expect(big[2 * k] / 2000).toBeCloseTo(small[k] / 1000, 2);
    }
  });

  it("never reaches outside the box and keeps the shadow margin on a torn side", () => {
    const g = paperGeometry(500, side({ shadow: 1 }));
    const outline = tearOutline(500, 500, side({ shadow: 1, roughness: 1, depth: 1 }), 5, "bottom");
    expect(Math.min(...outline)).toBeGreaterThanOrEqual(Math.ceil(g.shadowDy + g.shadowBlurPx));
    // The shadow falls down and right, so the top needs no margin.
    expect(Math.min(...tearOutline(500, 500, side({ shadow: 1, depth: 0 }), 5, "top"))).toBe(0);
    expect(Math.min(...tearOutline(500, 500, side({ shadow: 1, depth: 0 }), 5, "bottom"))).toBe(Math.ceil(g.shadowDy + g.shadowBlurPx));
  });

  it("is deeper when the depth is higher", () => {
    const mean = (o: Float32Array) => o.reduce((a, b) => a + b, 0) / o.length;
    expect(mean(tearOutline(400, 400, side({ depth: 0.9, shadow: 0 }), 2, "top"))).toBeGreaterThan(
      mean(tearOutline(400, 400, side({ depth: 0.1, shadow: 0 }), 2, "top")),
    );
  });
});

describe("tearPixels", () => {
  const W = 80;
  const H = 60;

  it("leaves a picture with no torn side exactly as it was", () => {
    const data = picture(W, H);
    const before = Uint8ClampedArray.from(data);
    tearPixels(data, W, H, sides(), 1);
    expect(Array.from(data)).toEqual(Array.from(before));
  });

  it("cuts the torn side to transparent at the box edge, keeps the middle and leaves the other sides alone", () => {
    const data = picture(W, H);
    tearPixels(data, W, H, sides({ top: side({ shadow: 0 }) }), 1);
    const alpha = (x: number, y: number) => data[(y * W + x) * 4 + 3];
    expect(alpha(W / 2, 0)).toBe(0);
    expect(alpha(W / 2, H / 2)).toBe(255);
    expect(alpha(W / 2, H - 1)).toBe(255);
    expect(alpha(0, H / 2)).toBe(255);
  });

  it("is deterministic for a seed", () => {
    const a = picture(W, H);
    const b = picture(W, H);
    const opts = sides({ left: side(), bottom: side() });
    tearPixels(a, W, H, opts, 9);
    tearPixels(b, W, H, opts, 9);
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it("pales the fibre band toward paper white just inside the tear", () => {
    const [BW, BH] = [400, 300];
    const dark = picture(BW, BH, [10, 10, 10]);
    tearPixels(dark, BW, BH, sides({ top: side({ fibres: 1, depth: 0.2, shadow: 0 }) }), 1);
    let paler = 0;
    for (let y = 0; y < BH / 2; y++) {
      const i = (y * BW + BW / 2) * 4;
      if (dark[i + 3] === 255 && dark[i] > 40) paler++;
    }
    expect(paler).toBeGreaterThan(0);
    // Deep inside the picture nothing is touched.
    expect(dark[((BH - 5) * BW + BW / 2) * 4]).toBe(10);
  });

  it("makes a silhouette that is solid where the paper is and clear outside the tear", () => {
    const data = picture(W, H);
    const silhouette = tearPixels(data, W, H, sides({ top: side({ shadow: 0 }) }), 1);
    expect(silhouette[(H / 2) * W + W / 2]).toBe(255);
    expect(silhouette[W / 2]).toBe(0);
  });
});

// A recording stand-in for a canvas: the real one is not available here, so this
// checks what is drawn, in what order, and that the shadow is blurred.
function fakeCanvas(w: number, h: number, log: string[], name: string) {
  const ctx = {
    putImageData: () => log.push(`${name}.put`),
    createImageData: (cw: number, ch: number) => new ImageData(cw, ch),
  };
  return { width: w, height: h, getContext: () => ctx } as unknown as OffscreenCanvas;
}

function fakeTarget(w: number, h: number, log: string[]) {
  const image = new ImageData(picture(w, h), w, h);
  let filter = "none";
  const ctx = {
    getImageData: () => image,
    putImageData: () => log.push("target.put"),
    clearRect: () => log.push("target.clear"),
    drawImage: (_src: unknown, x: number) => log.push(`target.draw(filter=${filter},x=${x})`),
    get filter() {
      return filter;
    },
    set filter(v: string) {
      filter = v;
    },
  };
  return ctx as unknown as CanvasRenderingContext2D;
}

describe("applyTornPaper", () => {
  const W = 40;
  const H = 30;

  it("does nothing when no side is torn", () => {
    const log: string[] = [];
    applyTornPaper(fakeTarget(W, H, log), W, H, sides(), 1, (w, h) => fakeCanvas(w, h, log, "s"));
    expect(log).toEqual([]);
  });

  it("with no shadow puts the torn pixels straight back, with no scratch canvases", () => {
    const log: string[] = [];
    applyTornPaper(fakeTarget(W, H, log), W, H, sides({ top: side({ shadow: 0 }) }), 1, (w, h) => fakeCanvas(w, h, log, "s"));
    expect(log).toEqual(["target.put"]);
  });

  it("with a shadow draws it blurred and offset first, then the sharp picture over it", () => {
    const log: string[] = [];
    applyTornPaper(fakeTarget(W, H, log), W, H, sides({ top: side({ shadow: 1 }) }), 1, (w, h) => fakeCanvas(w, h, log, "s"));
    const draws = log.filter((l) => l.startsWith("target.draw"));
    expect(draws).toHaveLength(2);
    expect(draws[0]).toMatch(/filter=blur\([\d.]+px\),x=/);
    expect(draws[0]).not.toContain("x=0)");
    expect(draws[1]).toBe("target.draw(filter=none,x=0)");
  });

  it("reuses scratch canvases of the picture's own size, so the box does not change", () => {
    const sizes: number[][] = [];
    const log: string[] = [];
    applyTornPaper(fakeTarget(W, H, log), W, H, sides({ left: side() }), 1, (w, h) => {
      sizes.push([w, h]);
      return fakeCanvas(w, h, log, "s");
    });
    expect(sizes).toEqual([[W, H], [W, H]]);
  });
});

