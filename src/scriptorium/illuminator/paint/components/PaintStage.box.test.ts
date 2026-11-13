// @vitest-environment happy-dom
import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PaintStage from "./PaintStage.vue";

class FakeResize {
  observe() {}
  disconnect() {}
}

function stage(props: { boxMode: boolean; tool?: "brush" | "eraser" | "picker" }) {
  const session = {
    state: { doc: { width: 400, height: 300, layers: [] } },
    beginStroke: vi.fn(() => null),
    addSamples: vi.fn(() => []),
    endStroke: vi.fn(() => []),
  };
  const compositor = { render: vi.fn(), markDirty: vi.fn(), syncLayers: vi.fn(), readPixel: vi.fn(() => ({ r: 1, g: 2, b: 3 })) };
  const w = mount(PaintStage, { props: { session: session as never, compositor: compositor as never, cursor: null, tool: props.tool ?? "brush", boxMode: props.boxMode } });
  const el = w.element as HTMLElement;
  el.setPointerCapture = vi.fn();
  const fire = (type: string, x: number, y: number, extra: Record<string, unknown> = {}) => {
    const ev = new MouseEvent(type, { clientX: x, clientY: y, bubbles: true, cancelable: true, ...extra });
    Object.defineProperty(ev, "pointerId", { value: 1 });
    Object.defineProperty(ev, "pointerType", { value: (extra.pointerType as string | undefined) ?? "mouse" });
    el.dispatchEvent(ev);
  };
  return { w, session, compositor, fire };
}

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", FakeResize);
  vi.stubGlobal("requestAnimationFrame", () => 1);
  vi.stubGlobal("cancelAnimationFrame", () => undefined);
});

describe("PaintStage in box mode", () => {
  it("reports the dragged rectangle in document pixels and lays no paint", async () => {
    // Fails on: the box mode also starting a stroke (paint under the box), or the rectangle coming out in screen space or flipped.
    const { w, session, fire } = stage({ boxMode: true });
    fire("pointerdown", 80, 60);
    fire("pointermove", 20, 10);
    await w.vm.$nextTick();
    expect(w.find('[data-testid="paint-box"]').exists()).toBe(true);
    fire("pointerup", 20, 10);
    await w.vm.$nextTick();
    expect(w.emitted("box")).toEqual([[{ x: 20, y: 10, w: 60, h: 50 }]]);
    expect(session.beginStroke).not.toHaveBeenCalled();
    expect(w.find('[data-testid="paint-box"]').exists()).toBe(false);
  });

  it("treats a click without a drag as a cancel", () => {
    // Fails on: a stray click making a one-pixel tip, instead of cancelling the box.
    const { w, fire } = stage({ boxMode: true });
    fire("pointerdown", 50, 50);
    fire("pointerup", 51, 51);
    expect(w.emitted("box")).toEqual([[null]]);
  });

  it("keeps every paint tool off, the colour picker included, while the box is on", () => {
    // Fails on: Pick colour or an Alt-pick firing under the box mode.
    const { w, compositor, session, fire } = stage({ boxMode: true, tool: "picker" });
    fire("pointerdown", 10, 10);
    fire("pointerup", 10, 10);
    const alt = stage({ boxMode: true, tool: "brush" });
    alt.fire("pointerdown", 10, 10, { altKey: true });
    alt.fire("pointerup", 10, 10, { altKey: true });
    expect(compositor.readPixel).not.toHaveBeenCalled();
    expect(alt.compositor.readPixel).not.toHaveBeenCalled();
    expect(session.beginStroke).not.toHaveBeenCalled();
    expect(w.emitted("picked")).toBeUndefined();
  });

  it("paints as usual when the box mode is off", () => {
    // Positive control: the same drag with the mode off starts a stroke and reports no box.
    const { w, session, fire } = stage({ boxMode: false });
    fire("pointerdown", 80, 60);
    fire("pointerup", 20, 10);
    expect(session.beginStroke).toHaveBeenCalledTimes(1);
    expect(w.emitted("box")).toBeUndefined();
  });
});
