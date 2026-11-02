import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import BattleMapFogLayer from "./BattleMapFogLayer.vue";

// jsdom has no canvas: record what the layer paints. Each entry is [fillStyle, x, y] of a plain fillRect.
function paint(props: { mask: Set<string>; seen?: Set<string> | null }) {
  const fills: [string, number, number][] = [];
  const ctx = {
    fillStyle: "",
    globalCompositeOperation: "source-over",
    clearRect: vi.fn(),
    fillRect(x: number, y: number) {
      fills.push([`${this.globalCompositeOperation}|${String(this.fillStyle)}`, x, y]);
    },
    createLinearGradient: () => ({ addColorStop: vi.fn() }),
  };
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
  mount(BattleMapFogLayer, { props: { hostW: 100, hostH: 100, cellPx: 10, originX: 0, originY: 0, opaque: true, ...props } });
  return fills;
}

afterEach(() => vi.restoreAllMocks());

describe("BattleMapFogLayer remembered squares", () => {
  const veil = (x: number, y: number, fills: [string, number, number][]) =>
    fills.filter(([style, fx, fy]) => style.startsWith("source-over|rgba(0, 0, 0, 0.5)") && fx === x && fy === y);

  it("keeps a half fog on a remembered square that is not in sight, and none on one in sight", () => {
    const fills = paint({ mask: new Set(["1,1", "2,1"]), seen: new Set(["2,1"]) });
    expect(veil(10, 10, fills)).toHaveLength(1);
    expect(veil(20, 10, fills)).toHaveLength(0);
  });

  it("without a sight set a revealed square is simply clear, as before", () => {
    const fills = paint({ mask: new Set(["1,1"]) });
    expect(veil(10, 10, fills)).toHaveLength(0);
  });
});
