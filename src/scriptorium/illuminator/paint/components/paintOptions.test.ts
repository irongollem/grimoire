import { describe, expect, it } from "vitest";
import { STOCK_BRUSHES } from "../brushes/stockBrushes";
import { TiledLayer } from "../engine/tiledLayer";
import { cursorOf, effectiveValues } from "./paintOptions";
import { sampleThumbnail } from "./layerThumbnail";

const brush = STOCK_BRUSHES[0]!;

describe("effective option values", () => {
  // Fails if the bar shows the brush's own size while an override is set, so the slider and the stroke disagree.
  it("an override wins over the brush, and unset ones show the brush's", () => {
    const v = effectiveValues(brush, { size: 77 });
    expect(v.size).toBe(77);
    expect(v.opacity).toBe(brush.transfer.opacity);
    expect(v.flow).toBe(brush.transfer.flow);
    expect(v.smoothing).toBe(brush.smoothing);
  });

  // Fails if an override of zero is treated as unset (a falsy check), so opacity could never be dragged to nothing.
  it("an override of zero still wins", () => {
    expect(effectiveValues(brush, { opacity: 0 }).opacity).toBe(0);
  });

  // Fails if the picker draws a brush outline, which would suggest it paints.
  it("the picker has no cursor outline", () => {
    expect(cursorOf(brush, {}, "picker")).toBeNull();
    expect(cursorOf(brush, { size: 12 }, "brush")?.size).toBe(12);
  });
});

describe("layer thumbnails", () => {
  // Fails if an empty layer yields pixels (it would draw a transparent square instead of staying blank) or the aspect is lost.
  it("is null for an empty layer, and keeps the layer's aspect", () => {
    const l = new TiledLayer(400, 200, 64);
    expect(sampleThumbnail(l, 32)).toBeNull();
    l.ensureTile(0).fill(255);
    const t = sampleThumbnail(l, 32);
    expect([t?.width, t?.height]).toEqual([32, 16]);
    expect(t?.data[3]).toBe(255);
  });
});
