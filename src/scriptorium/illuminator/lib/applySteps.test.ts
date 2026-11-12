// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IlluminateSettings } from "./treatment";

const calls = vi.hoisted(() => [] as string[]);
vi.mock("./colourGrading", () => ({ applyColourGrading: () => calls.push("grade") }));
vi.mock("./dofBlur", () => ({ applyDofBlur: (_c: unknown, _w: number, _h: number, o: { enabled: boolean }) => calls.push(`dof:${o.enabled}`) }));
vi.mock("./vignette", () => ({ applyVignette: (_c: unknown, _w: number, _h: number, o: { enabled: boolean }) => calls.push(`vignette:${o.enabled}`) }));
vi.mock("./edgeTreatment", () => ({ applyEdgeTreatmentToCtx: () => calls.push("edges:classic") }));
vi.mock("./tornPaper", () => ({ applyTornPaper: (_c: unknown, _w: number, _h: number, _o: unknown, seed: number) => calls.push(`edges:paper:${seed}`) }));
vi.mock("./paperWash", () => ({
  applyPaperWash: async (_c: unknown, _w: number, _h: number, o: { from: string }, _l: unknown, options: { draft?: boolean }) => {
    await new Promise((resolve) => setTimeout(resolve, 5));
    calls.push(`wash:${o.from}${options.draft ? ":draft" : ""}`);
  },
}));
vi.mock("./textureOverlay", () => ({
  decodedSize: (i: { width: number; height: number }) => ({ width: i.width, height: i.height }),
  applyTextureOverlay: (_c: unknown, _w: number, _h: number, _o: unknown, tex: { id: string }, factor: number) => calls.push(`texture:${tex.id}:${factor}`),
}));

import { applySteps } from "./applySteps";

const classicSide = { enabled: true, roughness: 0.5, fadeWidth: 0.5, tearDepth: 0.4, passes: 5, variation: 0.7 };
const paperSide = { enabled: true, roughness: 0.5, depth: 0.4, fibres: 0.5, shadow: 0.5 };
const mask = { type: "mask", url: "mask.png" } as const;
const texture = { type: "texture", url: "tex.png", blendMode: "overlay", opacity: 0.4, scale: 1 } as const;
const vignette = { type: "vignette", options: { strength: 0.5, softness: 0.5, mode: "transparent", colour: "#000000" } } as const;
const dof = { type: "dof", options: { focalX: 0.5, focalY: 0.5, focusRadius: 0.1, blurStrength: 0.5, desaturation: 0.2, falloff: "linear" } } as const;
const grade = { type: "grade", options: { brightness: 0, contrast: 0, saturation: 0, temperature: 0, hue: 0 } } as const;

function fakeCtx() {
  const ops: string[] = [];
  let op = "source-over";
  const ctx = {
    get globalCompositeOperation() { return op; },
    set globalCompositeOperation(v: string) { op = v; ops.push(`op:${v}`); },
    drawImage: () => ops.push(`draw@${op}`),
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, ops };
}

const load = vi.fn(async (url: string) => ({ id: url, width: 8, height: 8 }) as unknown as HTMLImageElement);
const run = (s: IlluminateSettings, opts?: { sourceWidth?: number; draft?: boolean }) => {
  const { ctx, ops } = fakeCtx();
  return applySteps(ctx, 100, 50, s, load, opts).then(() => ops);
};

beforeEach(() => {
  calls.length = 0;
  load.mockClear();
});

describe("applySteps", () => {
  it("runs the steps in pipeline order whatever order the recipe lists them, with the texture under the vignette and the mask last", async () => {
    await run({
      v: 1,
      seed: 3,
      steps: [mask, { type: "edges", style: "classic", top: classicSide, right: classicSide, bottom: classicSide, left: classicSide }, vignette, texture, dof, grade],
    });
    expect(calls).toEqual(["grade", "dof:true", "texture:tex.png:1", "vignette:true", "edges:classic"]);
  });

  it("erases with the mask last, as destination-out, and puts the compositing back", async () => {
    const ops = await run({ v: 1, seed: 1, steps: [mask] });
    expect(ops).toEqual(["op:destination-out", "draw@destination-out", "op:source-over"]);
    expect(load).toHaveBeenCalledWith("mask.png");
  });

  // Fails on: applySteps trying to draw the crop itself (it only sets the canvas the others run on), or a crop
  // knocking the other steps out of order.
  it("does not draw a crop, and the steps after it still run", async () => {
    const crop = { type: "crop", x: 0.1, y: 0.1, w: 0.5, h: 0.5 } as const;
    const ops = await run({ v: 1, seed: 1, steps: [mask, grade, crop] });
    expect(calls).toEqual(["grade"]);
    expect(ops).toEqual(["op:destination-out", "draw@destination-out", "op:source-over"]);
  });

  // Fails on: the wash being skipped, drawn before the edges, or drawn after the DM's mask.
  // Fails on: the wash not being awaited, so the mask (or the bake's PNG encode) runs before the wash is drawn.
  it("waits for the wash to finish before the next step runs", async () => {
    const wash = { type: "wash", from: "left", reach: 0.5, brush: 0.5, dry: 0.5, seed: 1 } as const;
    const ops = await run({ v: 1, seed: 1, steps: [wash, mask] });
    expect(calls).toEqual(["wash:left"]);
    expect(ops).toContain("op:destination-out");
  });

  // Fails on: the draft flag being dropped, so the live preview paints the full-size wash and freezes.
  it("passes draft through to the wash, and not by default", async () => {
    const wash = { type: "wash", from: "left", reach: 0.5, brush: 0.5, dry: 0.5, seed: 1 } as const;
    await run({ v: 1, seed: 1, steps: [wash] }, { draft: true });
    expect(calls).toEqual(["wash:left:draft"]);
    calls.length = 0;
    await run({ v: 1, seed: 1, steps: [wash] });
    expect(calls).toEqual(["wash:left"]);
  });

  it("draws the wash after the edges and before the mask", async () => {
    const wash = { type: "wash", from: "right", reach: 0.5, brush: 0.5, dry: 0.5, seed: 1 } as const;
    const ops = await run({ v: 1, seed: 1, steps: [mask, wash, { type: "edges", style: "classic", top: classicSide, right: classicSide, bottom: classicSide, left: classicSide }] });
    expect(calls).toEqual(["edges:classic", "wash:right"]);
    expect(ops[0]).toBe("op:destination-out");
  });

  it("dispatches the edge style, handing the paper tear the recipe's seed", async () => {
    await run({ v: 1, seed: 42, steps: [{ type: "edges", style: "paper", top: paperSide, right: paperSide, bottom: paperSide, left: paperSide }] });
    expect(calls).toEqual(["edges:paper:42"]);
  });

  it("loads a texture through the injected loader and scales its grain by canvas width over the original's", async () => {
    await run({ v: 1, seed: 1, steps: [texture] }, { sourceWidth: 400 });
    expect(load).toHaveBeenCalledWith("tex.png");
    expect(calls).toEqual(["texture:tex.png:0.25"]);
  });

  it("applies nothing for an ai step, which is typed but not built yet", async () => {
    await run({ v: 1, seed: 1, steps: [{ type: "ai", action: "cut-out", output: "ai.webp" }] });
    expect(calls).toEqual([]);
    expect(load).not.toHaveBeenCalled();
  });

  describe("the paint step", () => {
    const layer = (id: string, over: Record<string, unknown> = {}) => ({
      id, name: id, blend: "source-over", opacity: 1, visible: true, lockAlpha: false, chunks: {}, ...over,
    });
    const paint = (layers: unknown[], width = 2048, height = 1024) => ({ type: "paint", width, height, paper: null, layers }) as unknown as IlluminateSettings["steps"][number];

    function recordingCtx() {
      const ops: string[] = [];
      let op = "source-over";
      let alpha = 1;
      const ctx = {
        get globalCompositeOperation() { return op; },
        set globalCompositeOperation(v: string) { op = v; },
        get globalAlpha() { return alpha; },
        set globalAlpha(v: number) { alpha = v; },
        drawImage: (img: { id: string }, ...r: number[]) => ops.push(`${img.id}@${op}:${alpha}:${r.join(",")}`),
      };
      return { ctx: ctx as unknown as CanvasRenderingContext2D, ops, state: () => ({ op, alpha }) };
    }

    // Fails on: layers drawn top first, a hidden layer painting, or a chunk landing at the wrong place or scale
    // (the 2048x1024 document is drawn at 1024x512, half size).
    it("draws visible layers bottom first, each chunk at its place scaled to the target", async () => {
      const { ctx, ops } = recordingCtx();
      await applySteps(ctx, 1024, 512, { v: 1, seed: 1, steps: [paint([
        layer("under", { chunks: { "0,0": "a", "1,0": "b" } }),
        layer("hidden", { visible: false, chunks: { "0,0": "h" } }),
        layer("over", { chunks: { "0,0": "c" } }),
      ])] }, load);
      expect(ops).toEqual([
        "a@source-over:1:0,0,512,512",
        "b@source-over:1:512,0,512,512",
        "c@source-over:1:0,0,512,512",
      ]);
      expect(load).not.toHaveBeenCalledWith("h");
    });

    // Fails on: the blend or opacity being ignored, or leaking onto the steps and layers drawn after.
    it("applies a layer's blend and opacity and puts both back", async () => {
      const { ctx, ops, state } = recordingCtx();
      await applySteps(ctx, 100, 50, { v: 1, seed: 1, steps: [paint([
        layer("m", { blend: "multiply", opacity: 0.4, chunks: { "0,0": "a" } }),
        layer("n", { chunks: { "0,0": "b" } }),
        layer("o", { blend: "screen", opacity: 0.3, chunks: { "0,0": "c" } }),
      ])] }, load);
      expect(ops[0]).toMatch(/^a@multiply:0\.4:/);
      expect(ops[1]).toMatch(/^b@source-over:1:/);
      expect(state()).toEqual({ op: "source-over", alpha: 1 });
    });

    // Fails on: paint drawn under the mask (the mask would erase the DM's paint) or before the wash.
    it("draws after the mask", async () => {
      const { ctx } = recordingCtx();
      const order: string[] = [];
      const inner = ctx as unknown as { drawImage: (...a: unknown[]) => void };
      const original = inner.drawImage;
      inner.drawImage = (img: unknown, ...rest: unknown[]) => { order.push((img as { id: string }).id); original(img, ...rest); };
      await applySteps(ctx, 100, 50, { v: 1, seed: 1, steps: [paint([layer("l", { chunks: { "0,0": "p.png" } })]), mask] }, load);
      expect(order).toEqual(["mask.png", "p.png"]);
    });

    // Fails on: a blank sheet (no layers) or a layer with no chunks drawing or loading anything.
    it("draws nothing for a blank sheet", async () => {
      const { ctx, ops } = recordingCtx();
      await applySteps(ctx, 100, 50, { v: 1, seed: 1, steps: [paint([]), paint([layer("e")])] }, load);
      expect(ops).toEqual([]);
      expect(load).not.toHaveBeenCalled();
    });
  });
});
