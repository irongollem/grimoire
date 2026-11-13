// @vitest-environment happy-dom
import { mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent } from "vue";
import type { Dressing } from "./dressing";
import { buildDressingLayer } from "./dressingLayer";
import { usePageDressing } from "./usePageDressing";

vi.mock("./dressingLayer", () => ({
  buildDressingLayer: vi.fn(() => document.createElement("div")),
}));

const DRESSING = { v: 1, seed: 1 } as unknown as Dressing;
let resize: (() => void) | null = null;
let disconnected = 0;

class FakeObserver {
  constructor(cb: () => void) {
    resize = cb;
  }
  observe() {}
  disconnect() {
    disconnected += 1;
  }
}

function size(el: HTMLElement, w: number, h: number) {
  Object.defineProperty(el, "offsetWidth", { value: w, configurable: true });
  Object.defineProperty(el, "offsetHeight", { value: h, configurable: true });
}

beforeEach(() => {
  resize = null;
  disconnected = 0;
  vi.mocked(buildDressingLayer).mockClear();
  vi.stubGlobal("ResizeObserver", FakeObserver);
});
afterEach(() => vi.unstubAllGlobals());

function mountIt() {
  const el = document.createElement("div");
  size(el, 100, 100);
  const Comp = defineComponent({
    setup() {
      usePageDressing(() => el, { dressing: () => DRESSING, handout: () => false });
      return () => null;
    },
  });
  return { el, wrapper: mount(Comp) };
}

describe("usePageDressing", () => {
  it("redraws at the new aspect when its host resizes", async () => {
    // Fails on: reading the host's size once, so a handout that grows as content loads (or a phone that turns) keeps marks stretched to the first shape.
    const { el } = mountIt();
    await Promise.resolve();
    expect(vi.mocked(buildDressingLayer).mock.lastCall?.[3]).toMatchObject({ aspect: 1 });
    size(el, 100, 300);
    resize?.();
    expect(vi.mocked(buildDressingLayer).mock.lastCall?.[3]).toMatchObject({ aspect: 3 });
    expect(el.children).toHaveLength(1);
  });

  it("stops observing when unmounted", () => {
    // Fails on: leaking the observer, which keeps redrawing a layer into a surface that is gone.
    const { wrapper } = mountIt();
    wrapper.unmount();
    expect(disconnected).toBeGreaterThan(0);
  });
});
