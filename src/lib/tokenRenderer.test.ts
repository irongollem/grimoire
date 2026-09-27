import { describe, it, expect, vi, afterEach } from "vitest";
import {
  drawToken,
  type TokenEntity,
  DEFAULT_TOKEN_RING_COLOR,
} from "@/lib/tokenRenderer";

// happy-dom's canvas.getContext("2d") returns null, so every test stubs a
// recording ctx and patches HTMLCanvasElement.prototype.getContext. The stub
// captures fill colours and text draws so we can assert which code paths ran
// without needing real pixel output.

interface DrawImageArgs {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface RecorderCtx {
  calls: string[];
  fills: string[];
  texts: { text: string; x: number; y: number }[];
  drawImageCalls: number;
  drawImageArgs: DrawImageArgs[];
}

function makeRecorder(): { ctx: unknown; rec: RecorderCtx } {
  const rec: RecorderCtx = { calls: [], fills: [], texts: [], drawImageCalls: 0, drawImageArgs: [] };
  let currentFill = "";
  let currentStroke = "";
  const noop = () => {};
  const ctx = {
    set fillStyle(v: string) { currentFill = v; rec.fills.push(v); },
    get fillStyle() { return currentFill; },
    set strokeStyle(v: string) { currentStroke = v; },
    get strokeStyle() { return currentStroke; },
    lineWidth: 0,
    font: "",
    textAlign: "",
    textBaseline: "",
    shadowColor: "",
    shadowBlur: 0,
    clearRect: () => rec.calls.push("clearRect"),
    beginPath: () => rec.calls.push("beginPath"),
    arc: () => rec.calls.push("arc"),
    fill: () => rec.calls.push("fill"),
    stroke: () => rec.calls.push("stroke"),
    save: () => rec.calls.push("save"),
    restore: () => rec.calls.push("restore"),
    clip: () => rec.calls.push("clip"),
    fillRect: () => rec.calls.push("fillRect"),
    fillText: (text: string, x: number, y: number) => {
      rec.calls.push("fillText");
      rec.texts.push({ text, x, y });
    },
    drawImage: (_img: unknown, x: number, y: number, w: number, h: number) => {
      rec.calls.push("drawImage");
      rec.drawImageCalls += 1;
      rec.drawImageArgs.push({ x, y, w, h });
    },
    translate: noop,
    rotate: noop,
    measureText: (s: string) => ({ width: s.length * 8 }),
    createRadialGradient: () => ({ addColorStop: noop }),
  };
  return { ctx, rec };
}

function makeCanvas(size = 512): { canvas: HTMLCanvasElement; rec: RecorderCtx } {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const { ctx, rec } = makeRecorder();
  vi.spyOn(canvas, "getContext").mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
  return { canvas, rec };
}

const baseEntity: TokenEntity = {
  id: "test",
  name: "Goblin Scout",
  subtitle: "Small humanoid",
  imageUrl: null,
  focalPoint: null,
  bgGradient: ["#3b0a0a", "#0a0202"],
};

describe("drawToken — silhouette path (revealState: 'unseen')", () => {
  it("renders a '?' instead of the portrait initial", async () => {
    const { canvas, rec } = makeCanvas();
    await drawToken(canvas, baseEntity, { revealState: "unseen" });

    const drawnTexts = rec.texts.map((t) => t.text);
    expect(drawnTexts).toContain("?");
    expect(drawnTexts).not.toContain("G");
  });

  it("never attempts to load a remote portrait", async () => {
    const { canvas, rec } = makeCanvas();
    await drawToken(
      canvas,
      { ...baseEntity, imageUrl: "https://example.com/portrait.webp" },
      { revealState: "unseen" },
    );
    expect(rec.drawImageCalls).toBe(0);
  });

  it("still draws the faction ring underneath the silhouette", async () => {
    const { canvas, rec } = makeCanvas();
    await drawToken(canvas, baseEntity, {
      revealState: "unseen",
      ringColor: "#dc2626",
    });
    expect(rec.fills).toContain("#dc2626");
  });
});

describe("drawToken — defaults", () => {
  it("uses The Mint's default ring colour when no options are passed", async () => {
    const { canvas, rec } = makeCanvas();
    await drawToken(canvas, baseEntity);
    expect(rec.fills).toContain(DEFAULT_TOKEN_RING_COLOR);
  });

  it("falls back to the name initial when imageUrl is null", async () => {
    const { canvas, rec } = makeCanvas();
    await drawToken(canvas, baseEntity);
    const drawnTexts = rec.texts.map((t) => t.text);
    expect(drawnTexts).toContain("G");
  });
});

describe("drawToken — activeTurn", () => {
  it("draws a gold accent stroke when activeTurn is true", async () => {
    const { canvas, rec } = makeCanvas();
    await drawToken(canvas, baseEntity, { activeTurn: true });
    expect(rec.calls).toContain("stroke");
  });

  it("does not stroke an accent when activeTurn is false", async () => {
    const { canvas, rec } = makeCanvas();
    await drawToken(canvas, baseEntity, { activeTurn: false });
    expect(rec.calls).not.toContain("stroke");
  });
});

describe("drawToken — signal abort", () => {
  it("returns early without throwing if the signal is pre-aborted", async () => {
    const { canvas } = makeCanvas();
    const controller = new AbortController();
    controller.abort();
    await expect(
      drawToken(
        canvas,
        { ...baseEntity, imageUrl: "https://example.com/portrait.webp" },
        { signal: controller.signal },
      ),
    ).resolves.toBeUndefined();
  });
});

// ── Performance regression guards ─────────────────────────────────────────
// These tests pin the perf wins from the /simplify pass so a future refactor
// doesn't silently reintroduce N×duplicate portrait fetches.

describe("drawToken — image cache (regression guard)", () => {
  it("fetches the same imageUrl only once across repeated draws", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(new Blob([new Uint8Array([0])], { type: "image/webp" }), { status: 200 }),
    );
    const urlSpy = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});

    // happy-dom's Image doesn't auto-fire load for blob: URLs, so stub it
    // with a microtask-firing version that mirrors browser semantics.
    class StubImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      naturalWidth = 64;
      naturalHeight = 64;
      private _src = "";
      set src(v: string) {
        this._src = v;
        queueMicrotask(() => this.onload?.());
      }
      get src() {
        return this._src;
      }
    }
    vi.stubGlobal("Image", StubImage);

    const entity: TokenEntity = {
      ...baseEntity,
      imageUrl: "https://example.com/cache-regression.webp",
    };

    const c1 = makeCanvas();
    await drawToken(c1.canvas, entity);
    const c2 = makeCanvas();
    await drawToken(c2.canvas, entity);
    const c3 = makeCanvas();
    await drawToken(c3.canvas, entity);

    expect(fetchSpy).toHaveBeenCalledTimes(1);

    fetchSpy.mockRestore();
    urlSpy.mockRestore();
    vi.unstubAllGlobals();
  });
});

// ── imageFit: "contain" (cutouts) vs "cover" (portraits/pictures) ──────────
// A cutout is the whole figure on a transparent background, so it draws
// scaled-to-fit rather than cropped — see src/lib/battlemap/tokenArt.ts for
// where the "contain" fit comes from.

describe("drawToken — imageFit", () => {
  // happy-dom's Image doesn't auto-fire load for blob: URLs (same issue the
  // cache-regression guard above works around); stub it per test with the
  // natural size needed to exercise the axis under test.
  function stubImageWithSize(width: number, height: number) {
    class StubImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      naturalWidth = width;
      naturalHeight = height;
      private _src = "";
      set src(v: string) {
        this._src = v;
        queueMicrotask(() => this.onload?.());
      }
      get src() {
        return this._src;
      }
    }
    vi.stubGlobal("Image", StubImage);
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fits a tall cutout whole inside the ring: corners on the ring, centred, focal point ignored", async () => {
    stubImageWithSize(100, 200);
    const { canvas, rec } = makeCanvas(512);
    await drawToken(canvas, {
      ...baseEntity,
      imageUrl: "blob:contain-tall",
      imageFit: "contain",
      focalPoint: { x: 90, y: 90 }, // must be ignored in contain mode
    });

    const ir = 512 / 2 - 20; // R - ringWidth
    const draw = rec.drawImageArgs.at(-1)!;
    // Every corner lies on the inner circle, so no part of the figure is clipped.
    expect(Math.hypot(draw.w / 2, draw.h / 2)).toBeCloseTo(ir, 5);
    expect(draw.w / draw.h).toBeCloseTo(0.5, 5);
    expect(draw.x + draw.w / 2).toBeCloseTo(256, 5);
    expect(draw.y + draw.h / 2).toBeCloseTo(256, 5);
  });

  it("fits a wide cutout the same way", async () => {
    stubImageWithSize(200, 100);
    const { canvas, rec } = makeCanvas(512);
    await drawToken(canvas, { ...baseEntity, imageUrl: "blob:contain-wide", imageFit: "contain" });

    const ir = 512 / 2 - 20;
    const draw = rec.drawImageArgs.at(-1)!;
    expect(Math.hypot(draw.w / 2, draw.h / 2)).toBeCloseTo(ir, 5);
    expect(draw.w / draw.h).toBeCloseTo(2, 5);
  });

  it("defaults to 'cover' when imageFit is omitted, filling the full diameter", async () => {
    stubImageWithSize(100, 200); // same tall image as the first contain case
    const { canvas, rec } = makeCanvas(512);
    await drawToken(canvas, { ...baseEntity, imageUrl: "blob:cover-default" });

    const ir = 512 / 2 - 20;
    const diam = ir * 2;
    const draw = rec.drawImageArgs.at(-1)!;
    expect(draw.w).toBeCloseTo(diam, 5);
  });
});
