import { mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import BookNookFullscreen from "./BookNookFullscreen.vue";
import type { Scene } from "@/lib/bookNook/scene";

const deviceTilt = vi.hoisted(() => ({ start: vi.fn(), stop: vi.fn() }));
vi.mock("@/composables/bookNook/useDeviceTilt", async () => {
  const { ref: r } = await import("vue");
  return {
    useDeviceTilt: () => ({ tilt: r({ x: 0.4, y: 0 }), active: r(false), ...deviceTilt }),
    usePointerTilt: () => ({ tilt: r({ x: -0.2, y: 0 }) }),
  };
});

const scene = { id: "r", title: "The Inn at Dawn" } as Scene;
let portrait = false;
let coarse = false;

beforeEach(() => {
  portrait = false;
  coarse = false;
  deviceTilt.start.mockReset();
  deviceTilt.stop.mockReset();
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: q.includes("orientation") ? portrait : q.includes("pointer: coarse") ? coarse : false,
    addEventListener() {},
    removeEventListener() {},
  }));
});
afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

function mountIt() {
  return mount(BookNookFullscreen, {
    props: { scene, still: "s.webp" },
    attachTo: document.body,
    global: { stubs: { transition: false, BookNookPlayer: { props: { screen: String, fullscreen: Boolean, tilt: Object, scene: Object }, template: "<div data-testid='player' :data-screen='screen' :data-fullscreen='String(fullscreen)' :data-tilt='JSON.stringify(tilt)' />" } } },
  });
}
const player = (attr: string) => document.body.querySelector<HTMLElement>("[data-testid=player]")?.getAttribute(`data-${attr}`);
const overlay = () => document.body.querySelector<HTMLElement>("[data-testid=nook-fullscreen]");

describe("BookNookFullscreen", () => {
  it("is closed until open() is called", () => {
    mountIt();
    expect(overlay()).toBeNull();
  });

  it("asks for motion synchronously inside open(), on a touch screen (fails if start() is deferred or skipped)", async () => {
    coarse = true;
    const w = mountIt();
    w.vm.open();
    expect(deviceTilt.start).toHaveBeenCalledTimes(1);
    await nextTick();
    expect(overlay()).not.toBeNull();
  });

  it("does not touch the sensors with a mouse", () => {
    const w = mountIt();
    w.vm.open();
    expect(deviceTilt.start).not.toHaveBeenCalled();
  });

  it("shows the tall window in portrait and the wide one in landscape, with the frame on", async () => {
    portrait = true;
    const w = mountIt();
    w.vm.open();
    await nextTick();
    expect(player("screen")).toBe("tall");
    expect(player("fullscreen")).toBe("true");
    w.unmount();
    document.body.innerHTML = "";
    portrait = false;
    const wide = mountIt();
    wide.vm.open();
    await nextTick();
    expect(player("screen")).toBe("wide");
  });

  it("follows the phone on coarse pointers and the pointer on fine ones", async () => {
    coarse = true;
    const touch = mountIt();
    touch.vm.open();
    await nextTick();
    expect(player("tilt")).toBe('{"x":0.4,"y":0}');
    touch.unmount();
    document.body.innerHTML = "";
    coarse = false;
    const mouse = mountIt();
    mouse.vm.open();
    await nextTick();
    expect(player("tilt")).toBe('{"x":-0.2,"y":0}');
  });

  it("names the nook and how to leave", async () => {
    const w = mountIt();
    w.vm.open();
    await nextTick();
    expect(overlay()?.textContent).toContain("The Inn at Dawn");
    expect(overlay()?.textContent).toContain("Tap to close");
    expect(overlay()?.getAttribute("role")).toBe("dialog");
  });

  it("closes on a tap, stops the sensors and tells the parent (fails if stop() is not called)", async () => {
    coarse = true;
    const w = mountIt();
    w.vm.open();
    await nextTick();
    overlay()!.click();
    await nextTick();
    expect(overlay()).toBeNull();
    expect(deviceTilt.stop).toHaveBeenCalled();
    expect(w.emitted("close")).toHaveLength(1);
  });

  it("closes on Escape", async () => {
    const w = mountIt();
    w.vm.open();
    await nextTick();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await nextTick();
    expect(overlay()).toBeNull();
  });

  it("takes focus on open and gives it back on close", async () => {
    const trigger = document.createElement("button");
    document.body.append(trigger);
    trigger.focus();
    const w = mountIt();
    w.vm.open();
    await nextTick();
    await nextTick();
    expect(document.activeElement).toBe(overlay());
    w.vm.close();
    expect(document.activeElement).toBe(trigger);
  });

  it("is a no-op to open twice (no second prompt)", () => {
    coarse = true;
    const w = mountIt();
    w.vm.open();
    w.vm.open();
    expect(deviceTilt.start).toHaveBeenCalledTimes(1);
  });
});
