import { describe, it, expect } from "vitest";
import {
  applyTextureOverlay,
  BLEND_MODES,
  BLEND_MODE_LABELS,
  DEFAULT_TEXTURE_OVERLAY,
  type TextureOverlayOptions,
} from "@/lib/illuminate/textureOverlay";

// happy-dom's canvas.getContext("2d") returns null, so tests supply a
// recording fake context. applyTextureOverlay only calls drawImage / reads
// and writes globalAlpha + globalCompositeOperation, so that's all the fake
// needs to support.

function makeCtx(): {
  ctx: CanvasRenderingContext2D;
  drawImageCalls: Array<{ alpha: number; compositeOperation: string }>;
} {
  const drawImageCalls: Array<{ alpha: number; compositeOperation: string }> = [];
  let alpha = 1;
  let compositeOperation = "source-over";
  const ctx = {
    get globalAlpha() {
      return alpha;
    },
    set globalAlpha(v: number) {
      alpha = v;
    },
    get globalCompositeOperation() {
      return compositeOperation;
    },
    set globalCompositeOperation(v: string) {
      compositeOperation = v;
    },
    drawImage: () => {
      drawImageCalls.push({ alpha, compositeOperation });
    },
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, drawImageCalls };
}

function image(naturalWidth: number, naturalHeight: number): HTMLImageElement {
  return { naturalWidth, naturalHeight } as unknown as HTMLImageElement;
}

function overlay(over: Partial<TextureOverlayOptions>): TextureOverlayOptions {
  return { ...DEFAULT_TEXTURE_OVERLAY, ...over };
}

describe("applyTextureOverlay — early exits", () => {
  it("draws nothing when disabled", () => {
    const { ctx, drawImageCalls } = makeCtx();
    applyTextureOverlay(ctx, 100, 100, overlay({ enabled: false, opacity: 1 }), image(40, 40));
    expect(drawImageCalls).toHaveLength(0);
  });

  it("draws nothing when opacity is 0", () => {
    const { ctx, drawImageCalls } = makeCtx();
    applyTextureOverlay(ctx, 100, 100, overlay({ enabled: true, opacity: 0 }), image(40, 40));
    expect(drawImageCalls).toHaveLength(0);
  });

  it("draws nothing when opacity is negative", () => {
    const { ctx, drawImageCalls } = makeCtx();
    applyTextureOverlay(ctx, 100, 100, overlay({ enabled: true, opacity: -0.5 }), image(40, 40));
    expect(drawImageCalls).toHaveLength(0);
  });

  it("draws nothing when the scaled tile has zero width", () => {
    const { ctx, drawImageCalls } = makeCtx();
    applyTextureOverlay(ctx, 100, 100, overlay({ enabled: true, opacity: 1, scale: 0 }), image(40, 40));
    expect(drawImageCalls).toHaveLength(0);
  });

  it("draws nothing when the source image reports zero natural size", () => {
    const { ctx, drawImageCalls } = makeCtx();
    applyTextureOverlay(ctx, 100, 100, overlay({ enabled: true, opacity: 1 }), image(0, 0));
    expect(drawImageCalls).toHaveLength(0);
  });
});

describe("applyTextureOverlay — tiling", () => {
  it("tiles the texture exactly enough times to cover the canvas", () => {
    const { ctx, drawImageCalls } = makeCtx();
    // canvas 100x50, tile 40x40 (scale 1) -> x steps 0,40,80 (3), y steps 0,40 (2)
    applyTextureOverlay(ctx, 100, 50, overlay({ enabled: true, opacity: 1, scale: 1 }), image(40, 40));
    expect(drawImageCalls).toHaveLength(6);
  });

  it("uses fewer, larger tiles as scale increases", () => {
    const { ctx, drawImageCalls } = makeCtx();
    // tile becomes 80x80 at scale 2 -> a single tile covers the whole 50x50 canvas
    applyTextureOverlay(ctx, 50, 50, overlay({ enabled: true, opacity: 1, scale: 2 }), image(40, 40));
    expect(drawImageCalls).toHaveLength(1);
  });
});

describe("applyTextureOverlay — blend state applied while drawing", () => {
  it("draws with the requested opacity and blend mode", () => {
    const { ctx, drawImageCalls } = makeCtx();
    applyTextureOverlay(
      ctx,
      40,
      40,
      overlay({ enabled: true, opacity: 0.4, scale: 1, blendMode: "screen" }),
      image(40, 40),
    );
    expect(drawImageCalls).toEqual([{ alpha: 0.4, compositeOperation: "screen" }]);
  });

  it("restores the caller's globalAlpha and globalCompositeOperation afterwards", () => {
    const { ctx } = makeCtx();
    ctx.globalAlpha = 0.7;
    ctx.globalCompositeOperation = "multiply";
    applyTextureOverlay(
      ctx,
      40,
      40,
      overlay({ enabled: true, opacity: 0.9, scale: 1, blendMode: "overlay" }),
      image(40, 40),
    );
    expect(ctx.globalAlpha).toBe(0.7);
    expect(ctx.globalCompositeOperation).toBe("multiply");
  });
});

describe("BLEND_MODES / BLEND_MODE_LABELS", () => {
  it("has exactly one label for every blend mode, and vice versa", () => {
    expect(Object.keys(BLEND_MODE_LABELS).sort()).toEqual([...BLEND_MODES].sort());
  });

  it("gives every blend mode a non-empty human-readable label", () => {
    for (const mode of BLEND_MODES) {
      expect(BLEND_MODE_LABELS[mode].length).toBeGreaterThan(0);
    }
  });
});
