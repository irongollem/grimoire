import { describe, it, expect, beforeEach, vi } from "vitest";
import { config, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import MapFrame from "./MapFrame.vue";
import { buildMapStack } from "@/lib/locations/mapStack";

// The AI chip reads provenance through TanStack Query; these tests mount without a query client.
config.global.stubs = { ...config.global.stubs, AiImageBadge: true };

function stackFor(mapUrl: string) {
  return buildMapStack({ map_url: mapUrl, grid_calibration: null, map_layer_url: null, map_layer_stand_url: null, map_layer_calibration: null, plan_size: null });
}

describe("MapFrame", () => {
  // MapFrame reads `ui.siteMapLayers.picture/drawing` (#884) to decide
  // whether each layer paints — a fresh store per test, same as every other
  // component test that touches a Pinia store.
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("renders the slot content once the image loads successfully", async () => {
    const wrapper = mount(MapFrame, {
      props: { stack: stackFor("https://example.test/map.webp") },
      slots: { default: `<div data-testid="overlay">pin</div>` },
    });

    await wrapper.find("img").trigger("load");

    expect(wrapper.find("img").exists()).toBe(true);
    expect(wrapper.find("[data-testid='overlay']").exists()).toBe(true);
    expect(wrapper.text()).not.toContain("Map unavailable");
  });

  it("renders a quiet placeholder and withholds the slot when the image fails to load (#828)", async () => {
    const wrapper = mount(MapFrame, {
      props: { stack: stackFor("https://example.test/broken.webp") },
      slots: { default: `<div data-testid="overlay">pin</div>` },
    });

    await wrapper.find("img").trigger("error");

    // The broken <img> is gone — replaced by the placeholder, not left to
    // show the browser's own broken-image glyph.
    expect(wrapper.find("img").exists()).toBe(false);
    expect(wrapper.text()).toContain("Map unavailable");
    // The overlay slot must not render against unmeasured dimensions — see
    // the comment at MapFrame.vue's slot for why this is load-bearing.
    expect(wrapper.find("[data-testid='overlay']").exists()).toBe(false);
  });

  it("labels a loaded Picture as AI, and drops the label when the Picture fails to load", async () => {
    const wrapper = mount(MapFrame, { props: { stack: stackFor("https://example.test/map.webp") } });
    await wrapper.find("img").trigger("load");
    expect(wrapper.findComponent({ name: "AiImageBadge" }).exists()).toBe(true);

    const broken = mount(MapFrame, { props: { stack: stackFor("https://example.test/broken.webp") } });
    await broken.find("img").trigger("error");
    // An 'AI' chip over "Map unavailable" would label a picture nobody can see.
    expect(broken.text()).toContain("Map unavailable");
    expect(broken.findComponent({ name: "AiImageBadge" }).exists()).toBe(false);
  });

  it("clears the failed state and tries again when the stack's primary layer changes", async () => {
    const wrapper = mount(MapFrame, {
      props: { stack: stackFor("https://example.test/broken.webp") },
      slots: { default: `<div data-testid="overlay">pin</div>` },
    });

    await wrapper.find("img").trigger("error");
    expect(wrapper.find("img").exists()).toBe(false);

    await wrapper.setProps({ stack: stackFor("https://example.test/fixed.webp") });

    // A DM who fixes the URL gets a fresh attempt without reloading the page.
    expect(wrapper.find("img").exists()).toBe(true);
    expect(wrapper.find("img").attributes("src")).toBe("https://example.test/fixed.webp");
    expect(wrapper.text()).not.toContain("Map unavailable");
    expect(wrapper.find("[data-testid='overlay']").exists()).toBe(true);
  });

  it("exposes imageFailed so a consumer with a better fallback can react to it", async () => {
    const wrapper = mount(MapFrame, {
      props: { stack: stackFor("https://example.test/broken.webp") },
    });

    expect(wrapper.vm.imageFailed).toBe(false);
    await wrapper.find("img").trigger("error");
    expect(wrapper.vm.imageFailed).toBe(true);
  });

  it("keeps the point under the cursor fixed when a zoom lands mid-transition", async () => {
    const wrapper = mount(MapFrame, {
      props: { stack: stackFor("https://example.test/map.webp") },
      attachTo: document.body,
    });
    // The template opens with comments, so in a dev build the component is a
    // fragment and `wrapper.element` is the mount point, not the frame.
    const frame = wrapper.find<HTMLElement>("div.select-none").element;
    const container = frame.firstElementChild as HTMLElement;
    const rect = (left: number, top: number, width: number, height: number) =>
      ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) }) as DOMRect;

    frame.getBoundingClientRect = () => rect(0, 0, 400, 300);
    Object.defineProperties(container, {
      offsetWidth: { value: 400 },
      offsetHeight: { value: 300 },
      offsetLeft: { value: 0 },
      offsetTop: { value: 0 },
    });
    // What a trackpad pinch sees on every event after the first: the drawn box
    // is still travelling toward the last target, so its rect disagrees with
    // tx/ty. The zoom must not read its anchor from it.
    container.getBoundingClientRect = () => rect(30, 20, 400, 300);

    // happy-dom's WheelEvent drops the modifier and pointer fields of its init
    // dict, so they are set on the instance.
    const pinch = new WheelEvent("wheel", { deltaY: -Math.log(2) * 100, bubbles: true, cancelable: true }); // exactly 2x
    Object.defineProperties(pinch, { ctrlKey: { value: true }, clientX: { value: 100 }, clientY: { value: 60 } });
    frame.dispatchEvent(pinch);
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.scale).toBeCloseTo(2);
    // The map point under (100, 60) at 1x sits at (200, 120) at 2x, so the
    // container moves by exactly (-100, -60) to hold it under the cursor.
    const [, tx, ty] = /translate3d\((-?[\d.]+)px, (-?[\d.]+)px/.exec(container.style.transform)!;
    expect(Number(tx)).toBeCloseTo(-100);
    expect(Number(ty)).toBeCloseTo(-60);
    wrapper.unmount();
  });
});

describe("MapFrame gestures", () => {
  function mountFrame(props: { placing?: boolean } = {}) {
    const wrapper = mount(MapFrame, {
      props: { stack: stackFor("https://example.test/map.webp"), ...props },
      attachTo: document.body,
    });
    const frame = wrapper.find<HTMLElement>("div.select-none").element;
    const container = frame.firstElementChild as HTMLElement;
    const rect = (width: number, height: number) =>
      ({ left: 0, top: 0, width, height, right: width, bottom: height, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
    frame.getBoundingClientRect = () => rect(400, 300);
    container.getBoundingClientRect = () => rect(400, 300);
    Object.defineProperties(container, {
      offsetWidth: { value: 400 },
      offsetHeight: { value: 300 },
      offsetLeft: { value: 0 },
      offsetTop: { value: 0 },
    });
    return { wrapper, frame, container };
  }
  const pointer = (type: string, id: number, x: number, y: number) => {
    const ev = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperties(ev, { pointerId: { value: id }, clientX: { value: x }, clientY: { value: y } });
    return ev;
  };
  const wheel = (frame: HTMLElement, deltaY: number, ctrl = true) => {
    const ev = new WheelEvent("wheel", { deltaY, bubbles: true, cancelable: true });
    Object.defineProperties(ev, { ctrlKey: { value: ctrl }, clientX: { value: 100 }, clientY: { value: 60 } });
    frame.dispatchEvent(ev);
    return ev;
  };

  beforeEach(() => setActivePinia(createPinia()));

  it("lets a plain wheel scroll the page and zooms only with Ctrl or Cmd", async () => {
    const { wrapper, frame } = mountFrame();
    const plain = wheel(frame, -300, false);
    expect(plain.defaultPrevented).toBe(false);
    expect(wrapper.vm.scale).toBe(1);
    const pinch = wheel(frame, -100, true);
    expect(pinch.defaultPrevented).toBe(true);
    expect(wrapper.vm.scale).toBeGreaterThan(1);
    wrapper.unmount();
  });

  it("never zooms out past the whole map or in past four times", () => {
    const { wrapper, frame } = mountFrame();
    wheel(frame, 5000);
    expect(wrapper.vm.scale).toBe(1);
    wheel(frame, -5000);
    expect(wrapper.vm.scale).toBe(4);
    wrapper.unmount();
  });

  it("zooms with the buttons, and resets", async () => {
    const { wrapper } = mountFrame();
    const btn = (label: string) => wrapper.findAll("button").find((b) => b.text() === label)!;
    expect((btn("−").element as HTMLButtonElement).disabled).toBe(true);
    await btn("+").trigger("click");
    expect(wrapper.vm.scale).toBeCloseTo(1.5);
    expect((btn("−").element as HTMLButtonElement).disabled).toBe(false);
    await btn("↺").trigger("click");
    expect(wrapper.vm.scale).toBe(1);
    expect(wrapper.findAll("button").some((b) => b.text() === "↺")).toBe(false);
    wrapper.unmount();
  });

  it("reports a clean tap with where it landed", async () => {
    const { wrapper, frame } = mountFrame();
    frame.dispatchEvent(pointer("pointerdown", 1, 50, 40));
    frame.dispatchEvent(pointer("pointerup", 1, 50, 40));
    const tap = wrapper.emitted("tap")!;
    expect(tap).toHaveLength(1);
    expect(tap[0]!.slice(1)).toEqual([50, 40]);
    wrapper.unmount();
  });

  it("does not call a drag a tap, once zoomed in, but a jitter under six pixels is still one", async () => {
    const { wrapper, frame } = mountFrame();
    wheel(frame, -100);
    frame.dispatchEvent(pointer("pointerdown", 1, 100, 100));
    frame.dispatchEvent(pointer("pointermove", 1, 103, 102));
    frame.dispatchEvent(pointer("pointerup", 1, 103, 102));
    expect(wrapper.emitted("tap")).toHaveLength(1);

    frame.dispatchEvent(pointer("pointerdown", 2, 100, 100));
    frame.dispatchEvent(pointer("pointermove", 2, 130, 100));
    frame.dispatchEvent(pointer("pointerup", 2, 130, 100));
    expect(wrapper.emitted("tap")).toHaveLength(1);
    wrapper.unmount();
  });

  it("does not drag an unzoomed map, so a tap on empty map still closes what is pinned open", () => {
    const { wrapper, frame, container } = mountFrame();
    frame.dispatchEvent(pointer("pointerdown", 1, 100, 100));
    frame.dispatchEvent(pointer("pointermove", 1, 160, 100));
    frame.dispatchEvent(pointer("pointerup", 1, 160, 100));
    expect(wrapper.emitted("tap")).toHaveLength(1);
    expect(container.style.transform).toContain("translate3d(0px, 0px");
    wrapper.unmount();
  });

  it("pinches two fingers apart to zoom and does not call it a tap", () => {
    const { wrapper, frame } = mountFrame();
    frame.dispatchEvent(pointer("pointerdown", 1, 150, 150));
    frame.dispatchEvent(pointer("pointerdown", 2, 250, 150));
    frame.dispatchEvent(pointer("pointermove", 2, 350, 150));
    expect(wrapper.vm.scale).toBeCloseTo(2);
    frame.dispatchEvent(pointer("pointerup", 2, 350, 150));
    frame.dispatchEvent(pointer("pointerup", 1, 150, 150));
    expect(wrapper.emitted("tap")).toBeUndefined();
    wrapper.unmount();
  });

  it("leaves pointer capture alone while a layer is placing a pin, so its click still arrives", () => {
    const capture = vi.fn();
    const { wrapper, frame } = mountFrame({ placing: true });
    frame.setPointerCapture = capture;
    frame.dispatchEvent(pointer("pointerdown", 1, 10, 10));
    expect(capture).not.toHaveBeenCalled();
    wrapper.unmount();

    const normal = mountFrame();
    normal.frame.setPointerCapture = capture;
    normal.frame.dispatchEvent(pointer("pointerdown", 1, 10, 10));
    expect(capture).toHaveBeenCalledWith(1);
    normal.wrapper.unmount();
  });

  it("turns a click point into a fraction of the image, held inside it", () => {
    const { wrapper } = mountFrame();
    expect(wrapper.vm.toImageFraction(100, 75)).toEqual({ x: 0.25, y: 0.25 });
    expect(wrapper.vm.toImageFraction(-50, 900)).toEqual({ x: 0, y: 1 });
    wrapper.unmount();
  });
});
